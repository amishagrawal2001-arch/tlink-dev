import { Injectable } from '@angular/core';
import { LoggerService } from '../core/logger.service';
import { ConfigProviderService } from '../core/config-provider.service';

/**
 * Git operations exposed to the AI agent. All tools operate against the
 * configured `agentWorkingDir` (falling back to `process.cwd()` when unset),
 * and shell out to the `git` binary via `child_process.execFile` — no shell
 * interpolation, so user / AI input can't inject flags or chain commands.
 *
 * READ-family tools (status, diff, log, show, branch list) are considered
 * low-risk and auto-approved by the risk assessor.
 * WRITE-family tools (commit, add) are medium-risk and gated by the
 * existing approval flow. Destructive operations (reset --hard, push
 * --force, branch -D) are NOT exposed — the agent must ask the user to
 * run those in a terminal.
 */
@Injectable({ providedIn: 'root' })
export class GitToolsService {
    constructor (
        private logger: LoggerService,
        private config: ConfigProviderService,
    ) {}

    canHandleTool (name: string): boolean {
        return name.startsWith('git_');
    }

    getToolDefinitions (): any[] {
        return [
            {
                name: 'git_status',
                description:
                    'Show the working tree status: staged, unstaged, and untracked files. '
                    + 'Call this BEFORE proposing a commit so you know what changed.',
                input_schema: {
                    type: 'object',
                    properties: {
                        short: {
                            type: 'boolean',
                            description: 'Use short-format output (default: true).',
                        },
                    },
                },
            },
            {
                name: 'git_diff',
                description:
                    'Show a unified diff. Without args, shows all unstaged changes. '
                    + 'Pass `staged: true` to see the staged diff instead, or `ref` to '
                    + 'diff against a specific commit / branch / tag.',
                input_schema: {
                    type: 'object',
                    properties: {
                        staged: { type: 'boolean', description: 'Show staged changes only.' },
                        ref: { type: 'string', description: 'Diff against this ref (e.g. HEAD, main, a commit sha).' },
                        path: { type: 'string', description: 'Restrict the diff to this path.' },
                    },
                },
            },
            {
                name: 'git_log',
                description:
                    'Show recent commit history. Returns one line per commit: '
                    + '`<short-sha> <date> <author> <subject>`.',
                input_schema: {
                    type: 'object',
                    properties: {
                        limit: { type: 'number', description: 'Max commits to return (default 20, max 100).' },
                        path: { type: 'string', description: 'Restrict log to commits touching this path.' },
                        ref: { type: 'string', description: 'Starting ref (default HEAD).' },
                    },
                },
            },
            {
                name: 'git_show',
                description:
                    'Show the contents of a single commit: message + diff. Use this to '
                    + 'inspect what a prior commit actually changed before referencing it.',
                input_schema: {
                    type: 'object',
                    properties: {
                        ref: { type: 'string', description: 'Commit sha / ref to show (required).' },
                    },
                    required: ['ref'],
                },
            },
            {
                name: 'git_branch_list',
                description: 'List local branches. The current branch is marked with a leading `*`.',
                input_schema: { type: 'object', properties: {} },
            },
            {
                name: 'git_add',
                description:
                    'Stage changes for commit. Accepts a list of paths (relative to the '
                    + 'repo root). Required before `git_commit`. Refuses `.` or wildcards — '
                    + 'pass explicit paths so the user can see what\'s being staged.',
                input_schema: {
                    type: 'object',
                    properties: {
                        paths: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Paths to stage. Must be explicit (no ".", "*", or empty).',
                        },
                    },
                    required: ['paths'],
                },
            },
            {
                name: 'git_commit',
                description:
                    'Create a commit from currently-staged changes. Stage first with '
                    + '`git_add`. The message should describe WHY, not just what. '
                    + 'This tool is medium-risk and will prompt for user approval.',
                input_schema: {
                    type: 'object',
                    properties: {
                        message: { type: 'string', description: 'Commit message (required).' },
                    },
                    required: ['message'],
                },
            },
        ];
    }

    async executeTool (name: string, input: Record<string, any>): Promise<string> {
        if (!this.canHandleTool(name)) {
            throw new Error(`git-tools: not my tool: ${name}`);
        }
        switch (name) {
            case 'git_status':    return this.gitStatus(input);
            case 'git_diff':      return this.gitDiff(input);
            case 'git_log':       return this.gitLog(input);
            case 'git_show':      return this.gitShow(input);
            case 'git_branch_list': return this.gitBranchList();
            case 'git_add':       return this.gitAdd(input);
            case 'git_commit':    return this.gitCommit(input);
            default:              throw new Error(`git-tools: unknown tool ${name}`);
        }
    }

    // ─── individual handlers ───────────────────────────────────────────

    private async gitStatus (input: Record<string, any>): Promise<string> {
        const short = input.short !== false;
        const args = ['status'];
        if (short) args.push('--short', '--branch');
        return this.runGit(args);
    }

    private async gitDiff (input: Record<string, any>): Promise<string> {
        const args = ['diff', '--no-color'];
        if (input.staged) args.push('--cached');
        if (input.ref) args.push(String(input.ref));
        if (input.path) args.push('--', String(input.path));
        const out = await this.runGit(args);
        // Truncate very large diffs — the model doesn't need 200KB of churn.
        return out.length > 60000 ? out.slice(0, 60000) + '\n… [diff truncated]' : out;
    }

    private async gitLog (input: Record<string, any>): Promise<string> {
        const limit = Math.min(Math.max(1, Number(input.limit) || 20), 100);
        const args = [
            'log',
            `-n${limit}`,
            '--no-color',
            '--pretty=format:%h %cs %an — %s',
        ];
        if (input.ref) args.push(String(input.ref));
        if (input.path) args.push('--', String(input.path));
        return this.runGit(args);
    }

    private async gitShow (input: Record<string, any>): Promise<string> {
        const ref = String(input.ref || '').trim();
        if (!ref) throw new Error('git_show requires `ref`');
        const out = await this.runGit(['show', '--no-color', ref]);
        return out.length > 60000 ? out.slice(0, 60000) + '\n… [output truncated]' : out;
    }

    private async gitBranchList (): Promise<string> {
        return this.runGit(['branch', '--list']);
    }

    private async gitAdd (input: Record<string, any>): Promise<string> {
        const paths = Array.isArray(input.paths) ? input.paths.map(String).map(s => s.trim()).filter(Boolean) : [];
        if (paths.length === 0) throw new Error('git_add requires non-empty `paths`');
        // Reject wildcards / "." — force the agent to be explicit so the user
        // always knows what's about to be staged. We also reject ANY arg that
        // starts with "-" (flag-shaped) and any arg containing pathspec magic
        // (:, **). The `--` separator in runGit shields the positional paths
        // but a pathspec-magic string like `:(glob)**/*` would still be
        // interpreted by git and act as a broad stage.
        const forbidden = new Set(['.', '*', '-A', '-a', '--all', '-u', '--update']);
        for (const p of paths) {
            if (forbidden.has(p) || p.includes('*') || p.startsWith('-') || p.startsWith(':')) {
                throw new Error(`git_add: path "${p}" is too broad or flag-shaped; list files explicitly`);
            }
        }
        await this.runGit(['add', '--', ...paths]);
        return `Staged ${paths.length} path(s): ${paths.join(', ')}`;
    }

    private async gitCommit (input: Record<string, any>): Promise<string> {
        const message = String(input.message || '').trim();
        if (!message) throw new Error('git_commit requires a non-empty `message`');
        // Cap message length so a runaway model can't wedge `git commit` with
        // a 100KB message. 4000 chars is generous for a single commit body.
        if (message.length > 4000) {
            throw new Error(`git_commit: message too long (${message.length} chars, limit 4000)`);
        }
        // Reject ASCII control chars (except \t and \n) so nothing in the
        // message manipulates a terminal when git's output is displayed.
        // eslint-disable-next-line no-control-regex
        if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(message)) {
            throw new Error('git_commit: message contains control characters');
        }
        // No --amend, no --no-verify from the agent. Straight commit.
        return this.runGit(['commit', '-m', message]);
    }

    // ─── helpers ────────────────────────────────────────────────────────

    /**
     * Run `git <args>` via execFile (no shell). Captures stdout+stderr,
     * rejects on non-zero exit with the combined text.
     */
    private runGit (args: string[]): Promise<string> {
        const cp = (window as any).require?.('child_process') ?? require('child_process');
        const cwd = this.getWorkingDir();
        this.logger.debug('Running git command', { cwd, args });
        return new Promise((resolve, reject) => {
            cp.execFile(
                'git',
                args,
                { cwd, maxBuffer: 10 * 1024 * 1024, timeout: 30_000 },
                (err: any, stdout: string, stderr: string) => {
                    if (err) {
                        const combined = (stderr || stdout || err.message || '').trim();
                        reject(new Error(`git ${args[0] ?? ''} failed: ${combined.slice(0, 1000)}`));
                        return;
                    }
                    resolve((stdout || '').trim());
                },
            );
        });
    }

    private getWorkingDir (): string {
        const configured = (this.config.get<string>('agentWorkingDir', '') || '').trim();
        if (configured) return configured;
        return (window as any).process?.cwd?.() ?? '.';
    }
}
