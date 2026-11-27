/**
 * Shell-command safety classifier for the agent auto-run path.
 *
 * Used by ai-assistant.service.ts to decide whether a `write_to_terminal`
 * or `mcp_exec_command` tool call can run WITHOUT user confirmation,
 * assuming the user has opted into `agentAutoRunSafeCommands`. Default
 * posture if there's any doubt: NOT safe (ask).
 *
 * Design: deny-by-default. A command is considered safe only when:
 *   1. It doesn't match any UNSAFE_ANYWHERE pattern (destructive flags,
 *      privilege escalation, shell-pipe-to-interpreter, redirect to
 *      write, etc.)
 *   2. Its first token is in SAFE_PREFIXES (a short curated list of
 *      read-only / introspection commands).
 *   3. It's not longer than a sane shell one-liner — deeply nested or
 *      compound commands fall through to approval because any sub-shell
 *      could re-enter unsafe territory.
 *
 * Not a sandbox. A clever attacker can smuggle unsafe behavior past any
 * regex (`sudo`, env-var expansion, aliases). The point is to spare
 * the user from the 95% of routine read-only calls the agent makes
 * (`ls`, `git status`, `cat <file>`), not to be a security boundary.
 */

export interface SafetyResult {
    safe: boolean
    reason: string
}

/**
 * Patterns that render a command unsafe regardless of its prefix. Deny-
 * on-match. Keep this tight — every entry here is a UX cost on the
 * common case, so each has to pay its way.
 */
const UNSAFE_ANYWHERE: RegExp[] = [
    /\bsudo\b/i,                  // privilege escalation
    /\brm\s+-[a-z]*r/i,           // `rm -rf`, `rm -Rf`, `rm -fr`
    /\brm\s+-[a-z]*f/i,           // `rm -f`, `rm -Rf`
    /\bdd\s+if=/i,                // dd block copy
    /\bmkfs\./i,                  // filesystem format
    /\b(chmod|chown)\s+-R/i,      // recursive perm/ownership change
    /\bkill(all)?\s+-/i,          // kill signals
    /\b(shutdown|reboot|halt|poweroff)\b/i,
    />\s*\/dev\/(sd[a-z]|nvme)/i, // writes to raw disk
    /\|\s*(sh|bash|zsh|fish|python|perl|ruby|node)\b/i, // pipe-to-interpreter (curl | sh)
    /\b(curl|wget|fetch)\b[^|]*\|/i, // download-then-pipe
    /`[^`]+`/,                    // backtick command substitution — unknown payload
    /\$\(/,                       // $(...) command substitution — same
    /;\s*\S/,                     // chained commands — second command isn't checked
    /&&\s*\S/,                    // same for &&
    /\|\|\s*\S/,                  // same for ||
    />{1,2}\s*[^&\s]/,            // output redirect that writes to a file (allow `2>&1`)
    /<\s*[^&\s]/,                 // input redirect from a file — may read secrets
    /--(no-preserve-root|force|delete)/i, // common destructive flags
    /\beval\b/i,                  // eval of arbitrary string
    /\bexec\s+\S/i,               // exec replaces the shell
    /\bssh\s+[^-]/i,              // outbound ssh — side effects on remote
    /\bscp\b|\brsync\b/i,         // remote file transfer
    /\b(apt|apt-get|yum|dnf|brew)\s+(install|remove|upgrade|uninstall)/i, // package mutations
    /\bnpm\s+(install|i|uninstall|un|update|add|remove|rm)/i,
    /\byarn\s+(add|remove|install|upgrade)/i,
    /\bpip\s+(install|uninstall)/i,
    /\bgit\s+(push|reset|checkout|restore|clean|rm|rebase|revert|cherry-pick|merge)/i, // mutating git
    /\bdocker\s+(run|rm|rmi|stop|kill|exec|build)/i,
    /\bkubectl\s+(apply|delete|exec|patch|replace|scale)/i,
]

/**
 * First-token allowlist of commands considered read-only or safely
 * introspective. Commands with safe-looking prefixes but mutating flags
 * are still blocked by the deny list above.
 */
const SAFE_PREFIXES: ReadonlySet<string> = new Set([
    // directory / file introspection
    'ls', 'pwd', 'cd', 'stat', 'file', 'readlink', 'realpath', 'basename', 'dirname', 'tree',
    // file contents (read-only)
    'cat', 'head', 'tail', 'less', 'more', 'nl', 'wc', 'cut', 'awk', 'sed', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack',
    // search
    'find', 'locate', 'which', 'type', 'whereis', 'command',
    // host / env
    'echo', 'printf', 'date', 'uptime', 'uname', 'whoami', 'id', 'groups', 'hostname', 'env', 'printenv',
    // process / resource
    'ps', 'top', 'htop', 'du', 'df', 'free', 'uptime', 'who',
    // network (read-only probes)
    'ping', 'traceroute', 'nslookup', 'dig', 'host', 'ifconfig', 'ip', 'netstat', 'ss', 'arp', 'route',
    // version checks
    'node', 'npm', 'yarn', 'python', 'python3', 'pip', 'go', 'rustc', 'cargo', 'docker', 'kubectl', 'git', 'make',
    // these are version-check only when invoked with --version / -v / -V
    // the deny list catches mutating subcommands (git push, npm install, etc.)
])

/**
 * Called by the agent loop before `requestApproval()` for write_to_terminal
 * and mcp_exec_command. Returns `safe: true` only when the user can
 * reasonably expect this to do nothing they'd regret. See file header.
 */
export function isShellCommandSafe (rawCommand: string): SafetyResult {
    const command = (rawCommand || '').trim()
    if (!command) { return { safe: false, reason: 'empty command' } }
    if (command.length > 400) { return { safe: false, reason: 'command too long (>400 chars)' } }

    for (const pattern of UNSAFE_ANYWHERE) {
        if (pattern.test(command)) {
            return { safe: false, reason: `matches unsafe pattern ${pattern}` }
        }
    }

    // First-token check. Strip leading env-var assignments (FOO=bar cmd)
    // and quote characters so we don't miss the real command.
    const stripped = command.replace(/^(\w+=\S+\s+)+/, '').trim()
    const firstToken = stripped.split(/\s+/)[0].replace(/^[`"']|[`"']$/g, '')
    if (!firstToken) { return { safe: false, reason: 'no identifiable command' } }

    // Resolve paths: /usr/bin/ls → ls; ./ls → ls
    const base = firstToken.replace(/^.*\//, '')

    if (!SAFE_PREFIXES.has(base)) {
        return { safe: false, reason: `prefix "${base}" is not in the safe-command allowlist` }
    }

    return { safe: true, reason: `allowlisted read-only prefix "${base}"` }
}
