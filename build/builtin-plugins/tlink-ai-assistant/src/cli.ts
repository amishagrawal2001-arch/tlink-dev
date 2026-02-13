import shellQuote from 'shell-quote'
import { Injectable } from '@angular/core'
import { CLIHandler, CLIEvent, HostWindowService } from 'tlink-core'
import { TerminalManagerService } from './services/terminal/terminal-manager.service'
import { ConfigProviderService } from './services/core/config-provider.service'
import { LoggerService } from './services/core/logger.service'

@Injectable()
export class AiAssistantCLIHandler extends CLIHandler {
    firstMatchOnly = true
    priority = 50

    constructor (
        private terminalManager: TerminalManagerService,
        private config: ConfigProviderService,
        private hostWindow: HostWindowService,
        private logger: LoggerService,
    ) {
        super()
    }

    async handle (event: CLIEvent): Promise<boolean> {
        const argv = event.argv ?? {}
        const positional = (argv._ ?? []) as string[]
        const op = positional[0]
        const area = positional[1]

        if (op !== 'ai' || area !== 'agent') {
            return false
        }

        const action = positional[2] || 'run'
        switch (action) {
            case 'run':
                return this.runAgent(event)
            default:
                this.printUsage()
                return true
        }
    }

    private runAgent (event: CLIEvent): boolean {
        const argv = event.argv ?? {}
        const positional = (argv._ ?? []) as string[]
        const agentName = positional[3] || argv.name || argv.agent

        if (!agentName) {
            this.printUsage()
            return true
        }

        const workdir = (argv.workdir || argv.cwd || this.config.get<string>('agentWorkingDir', '') || event.cwd || '') as string
        const headless = !!(argv.headless || argv.h)
        const prompt = this.extractPrompt(argv, positional)
        const extraArgs = this.normalizeExtraArgs(argv)
        const embedded = this.resolveEmbeddedCli(argv, event.cwd)
        const preferEmbedded = !argv.cn && !argv.npx

        if (preferEmbedded && embedded.root && embedded.missingDist) {
            this.printEmbeddedBuildHint(embedded.root)
            return true
        }

        const commandTokens = this.buildContinueCommandTokens(argv, event.cwd, embedded)

        const resolvedAgent = this.resolveAgentPath(String(agentName), workdir)
        const cnArgs = ['--agent', resolvedAgent]
        if (headless) {
            if (!prompt) {
                this.printHeadlessPromptHint()
                return true
            }
            cnArgs.push('--print')
        }

        const command = shellQuote.quote([
            ...commandTokens,
            ...cnArgs,
            ...extraArgs,
            ...(prompt ? [prompt] : []),
        ])
        const fullCommand = workdir
            ? `cd ${shellQuote.quote([workdir])} && ${command}`
            : command

        const sent = this.terminalManager.sendCommand(fullCommand, true)
        if (!sent) {
            this.logger.warn('No active terminal available to run agent command')
            console.error('No active terminal available to run agent command')
            return true
        }

        this.hostWindow.bringToFront()
        return true
    }

    private buildContinueCommandTokens (
        argv: any,
        cwd?: string,
        embedded?: { path: string | null },
    ): string[] {
        if (argv.cn) {
            return [String(argv.cn)]
        }
        if (argv.npx) {
            return ['npx', '@continuedev/cli']
        }

        const embeddedPath = embedded?.path ?? null
        if (embeddedPath) {
            const nodePath = argv.node ? String(argv.node) : 'node'
            return [nodePath, embeddedPath]
        }

        return ['cn']
    }

    private normalizeExtraArgs (argv: any): string[] {
        const extra = argv.args ?? argv.extra
        if (!extra) {
            return []
        }
        if (Array.isArray(extra)) {
            return extra.map((item: any) => String(item))
        }
        return [String(extra)]
    }

    private printUsage (): void {
        const message = 'Usage: tlink ai agent run <name> [--headless] [--prompt "text"] [--workdir <path>] [--continue-root <path>] [--node <bin>] [--cn <bin>] [--npx] [--args <arg>]'
        const cmd = `echo ${shellQuote.quote([message])}`
        this.terminalManager.sendCommand(cmd, true)
    }

    private printHeadlessPromptHint (): void {
        const message = [
            'Headless mode requires a prompt.',
            'Example:',
            'tlink ai agent run <name> --headless --prompt "check my code"',
            'or',
            'tlink ai agent run <name> --headless "check my code"',
        ].join('\n')
        const cmd = `echo ${shellQuote.quote([message])}`
        this.terminalManager.sendCommand(cmd, true)
    }

    private extractPrompt (argv: any, positional: string[]): string | null {
        if (argv.prompt) {
            return String(argv.prompt)
        }
        if (argv.message) {
            return String(argv.message)
        }
        if (positional.length > 4) {
            return positional.slice(4).join(' ')
        }
        return null
    }

    private resolveAgentPath (agentName: string, workdir: string): string {
        const fs = this.getFs()
        const path = this.getPath()
        if (!fs || !path || !workdir) {
            return agentName
        }

        const looksLikePath = agentName.includes('/') ||
            agentName.includes('\\') ||
            agentName.startsWith('.') ||
            agentName.startsWith('~') ||
            agentName.endsWith('.md') ||
            agentName.endsWith('.markdown')

        if (looksLikePath) {
            return agentName
        }

        const candidate = path.resolve(workdir, '.continue', 'agents', `${agentName}.md`)
        if (fs.existsSync(candidate)) {
            return candidate
        }

        return agentName
    }

    private resolveEmbeddedCli (
        argv: any,
        cwd?: string,
    ): { path: string | null; root: string | null; missingDist: boolean } {
        const fs = this.getFs()
        const path = this.getPath()
        if (!fs || !path) {
            return { path: null, root: null, missingDist: false }
        }

        const override = argv.continueRoot || argv.continue_root || argv.continue
        if (override) {
            const root = String(override)
            const candidate = path.resolve(root, 'extensions', 'cli', 'dist', 'cn.js')
            if (fs.existsSync(candidate)) {
                return { path: candidate, root, missingDist: false }
            }
            if (fs.existsSync(path.resolve(root, 'extensions', 'cli'))) {
                return { path: null, root, missingDist: true }
            }
        }

        const start = cwd || this.config.get<string>('agentWorkingDir', '') || ''
        if (!start) {
            return { path: null, root: null, missingDist: false }
        }

        let current = path.resolve(start)
        for (let i = 0; i < 8; i++) {
            const root = path.resolve(current, 'third_party', 'continue')
            const candidate = path.resolve(root, 'extensions', 'cli', 'dist', 'cn.js')
            if (fs.existsSync(candidate)) {
                return { path: candidate, root, missingDist: false }
            }
            if (fs.existsSync(path.resolve(root, 'extensions', 'cli'))) {
                return { path: null, root, missingDist: true }
            }
            const parent = path.dirname(current)
            if (parent === current) {
                break
            }
            current = parent
        }

        return { path: null, root: null, missingDist: false }
    }

    private printEmbeddedBuildHint (root: string): void {
        const message = [
            'Embedded Continue source found but CLI is not built.',
            'Run these commands:',
            `cd ${root}/extensions/cli`,
            'npm install',
            'npm run build',
        ].join('\n')
        const cmd = `echo ${shellQuote.quote([message])}`
        this.terminalManager.sendCommand(cmd, true)
    }

    private getFs (): any {
        return (window as any)?.require?.('fs')
    }

    private getPath (): any {
        return (window as any)?.require?.('path')
    }
}
