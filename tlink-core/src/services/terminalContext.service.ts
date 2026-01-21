import { Injectable } from '@angular/core'
import { Observable, BehaviorSubject } from 'rxjs'
import { distinctUntilChanged, debounceTime } from 'rxjs/operators'
import { AppService } from './app.service'
import { LogService, Logger, Platform, HostAppService } from '../api'
import { BaseTabComponent } from '../components/baseTab.component'
// BaseTerminalTabComponent from tlink-terminal - using runtime check to avoid circular dependency
// We'll check for terminal-specific properties at runtime

/**
 * Terminal context information for AI integration
 */
export interface TerminalContext {
    /** Current working directory */
    currentDirectory?: string
    /** Git repository status */
    gitStatus?: GitStatus
    /** Environment variables (filtered for security) */
    environment: Record<string, string>
    /** Recent terminal output (last N lines) */
    recentOutput: string[]
    /** Recent command history (last N commands) */
    recentCommands: string[]
    /** File system context (current directory contents) */
    fileSystem?: FileSystemContext
    /** Terminal type (local, SSH, etc.) */
    terminalType: string
    /** Terminal profile name */
    profileName?: string
}

/**
 * Git repository status
 */
export interface GitStatus {
    /** Current branch name */
    branch?: string
    /** Whether the working directory is clean */
    clean: boolean
    /** Modified files */
    modified: string[]
    /** Untracked files */
    untracked: string[]
    /** Staged files */
    staged: string[]
    /** Current commit hash (short) */
    commit?: string
    /** Remote tracking info */
    remote?: {
        name: string
        url: string
    }
}

/**
 * File system context for current directory
 */
export interface FileSystemContext {
    /** Current directory path */
    path: string
    /** Files and directories in current directory */
    entries: Array<{
        name: string
        type: 'file' | 'directory' | 'symlink'
        size?: number
    }>
    /** Modified files in the directory */
    modifiedFiles?: string[]
}

@Injectable({ providedIn: 'root' })
export class TerminalContextService {
    private logger: Logger
    private contexts = new Map<BaseTabComponent, BehaviorSubject<TerminalContext>>()
    private activeTerminalContext$ = new BehaviorSubject<TerminalContext | null>(null)

    constructor (
        private app: AppService,
        private hostApp: HostAppService,
        log: LogService,
    ) {
        this.logger = log.create('terminalContext')
        
        // Track active terminal changes (for reference, but ChatTabComponent uses selected terminal)
        this.app.activeTabChange$.subscribe(tab => {
            if (tab && this.isTerminalTab(tab)) {
                this.setActiveTerminal(tab)
            } else {
                this.activeTerminalContext$.next(null)
            }
        })
    }

    /**
     * Check if a tab is a terminal tab (runtime check to avoid circular dependency)
     */
    private isTerminalTab (tab: BaseTabComponent | null): boolean {
        if (!tab) return false
        // Check for terminal-specific properties
        return !!(tab as any).session && !!(tab as any).sessionChanged$ && !!(tab as any).profile
    }

    /**
     * Get context for a specific terminal tab
     */
    getContext (terminal: BaseTabComponent): Observable<TerminalContext> {
        if (!this.contexts.has(terminal)) {
            this.initializeContext(terminal)
        }
        return this.contexts.get(terminal)!.asObservable()
    }

    /**
     * Get context for the currently active terminal
     */
    getActiveContext (): Observable<TerminalContext | null> {
        return this.activeTerminalContext$.asObservable()
    }

    /**
     * Get current context snapshot for active terminal
     */
    getActiveContextSnapshot (): TerminalContext | null {
        return this.activeTerminalContext$.value
    }

    /**
     * Initialize context tracking for a terminal
     */
    private initializeContext (terminal: BaseTabComponent): void {
        const terminalTab = terminal as any
        const initialContext: TerminalContext = {
            currentDirectory: undefined,
            gitStatus: undefined,
            environment: this.getSafeEnvironment(),
            recentOutput: [],
            recentCommands: [],
            terminalType: this.getTerminalType(terminal),
            profileName: terminalTab.profile?.name,
        }

        const context$ = new BehaviorSubject<TerminalContext>(initialContext)
        this.contexts.set(terminal, context$)

        // Track terminal session changes
        if (terminalTab.sessionChanged$) {
            terminalTab.sessionChanged$.subscribe((session: any) => {
                if (session) {
                    this.setupTerminalTracking(terminal, session, context$)
                }
            })
        }

        // Setup tracking for current session
        if (terminalTab.session) {
            this.setupTerminalTracking(terminal, terminalTab.session, context$)
        }

        // Clean up when terminal is destroyed
        if (terminalTab.destroyed$) {
            terminalTab.destroyed$.subscribe(() => {
                this.contexts.delete(terminal)
                context$.complete()
            })
        }
    }

    /**
     * Setup tracking for a terminal session
     */
    private setupTerminalTracking (
        terminal: BaseTabComponent,
        session: any,
        context$: BehaviorSubject<TerminalContext>,
    ): void {
        // Track CWD changes via OSC processor
        if (session.oscProcessor?.cwdReported$) {
            session.oscProcessor.cwdReported$.pipe(
                distinctUntilChanged(),
                debounceTime(500),
            ).subscribe(async cwd => {
                const context = context$.value
                context$.next({
                    ...context,
                    currentDirectory: cwd,
                    gitStatus: await this.getGitStatus(cwd),
                    fileSystem: await this.getFileSystemContext(cwd),
                })
                this.logger.debug(`Terminal CWD changed: ${cwd}`)
            })
        }

        // Track terminal output for recent output
        const outputBuffer: string[] = []
        const maxOutputLines = 50

        session.output$.pipe(
            debounceTime(1000),
        ).subscribe(output => {
            const lines = output.split('\n').filter(l => l.trim().length > 0)
            outputBuffer.push(...lines)
            if (outputBuffer.length > maxOutputLines) {
                outputBuffer.shift()
            }
            const context = context$.value
            context$.next({
                ...context,
                recentOutput: [...outputBuffer.slice(-20)], // Keep last 20 lines
            })
        })
    }

    /**
     * Set active terminal and update active context
     */
    private setActiveTerminal (terminal: BaseTabComponent): void {
        const context$ = this.contexts.get(terminal)
        if (context$) {
            this.activeTerminalContext$.next(context$.value)
            context$.subscribe(context => {
                this.activeTerminalContext$.next(context)
            })
        } else {
            this.initializeContext(terminal)
            const newContext$ = this.contexts.get(terminal)!
            this.activeTerminalContext$.next(newContext$.value)
            newContext$.subscribe(context => {
                this.activeTerminalContext$.next(context)
            })
        }
    }

    /**
     * Get git status for a directory (async, non-blocking)
     */
    private async getGitStatus (directory?: string): Promise<GitStatus | undefined> {
        if (!directory || this.hostApp.platform === Platform.Web) {
            return undefined
        }

        try {
            // Use IPC to call main process for git status
            const ipcRenderer = (window as any).require?.('electron')?.ipcRenderer
            if (!ipcRenderer) {
                // Not in Electron, return undefined
                return undefined
            }

            const result = await ipcRenderer.invoke('terminal-context:get-git-status', directory)
            return result || undefined
        } catch (error) {
            this.logger.debug('Failed to get git status:', error)
            return undefined
        }
    }

    /**
     * Get file system context for a directory
     */
    private async getFileSystemContext (directory?: string): Promise<FileSystemContext | undefined> {
        if (!directory || this.hostApp.platform === Platform.Web) {
            return undefined
        }

        try {
            // Use IPC to call main process for file system context
            const ipcRenderer = (window as any).require?.('electron')?.ipcRenderer
            if (!ipcRenderer) {
                // Not in Electron, return undefined
                return undefined
            }

            const result = await ipcRenderer.invoke('terminal-context:get-file-system-context', directory)
            return result || undefined
        } catch (error) {
            this.logger.debug('Failed to get file system context:', error)
            return undefined
        }
    }

    /**
     * Get safe environment variables (filter sensitive data)
     */
    private getSafeEnvironment (): Record<string, string> {
        const env: Record<string, string> = {}
        const safeVars = ['HOME', 'USER', 'SHELL', 'PATH', 'PWD', 'LANG', 'TERM', 'EDITOR']
        const sensitivePatterns = ['PASS', 'SECRET', 'KEY', 'TOKEN', 'PRIVATE', 'CREDENTIAL']

        for (const key in process.env) {
            const isSafe = safeVars.includes(key) || !sensitivePatterns.some(pattern => 
                key.toUpperCase().includes(pattern)
            )
            if (isSafe && process.env[key]) {
                env[key] = process.env[key]!
            }
        }

        return env
    }

    /**
     * Get terminal type identifier
     */
    private getTerminalType (terminal: BaseTabComponent): string {
        const terminalTab = terminal as any
        if (terminalTab.profile?.options?.host) {
            return 'ssh'
        }
        return 'local'
    }

    /**
     * Format context as a string for AI prompts
     */
    formatContextForPrompt (context: TerminalContext | null): string {
        if (!context) {
            return ''
        }

        const parts: string[] = []

        // Terminal information
        parts.push(`Terminal Type: ${context.terminalType}`)
        if (context.profileName) {
            parts.push(`Profile: ${context.profileName}`)
        }

        // Current directory
        if (context.currentDirectory) {
            parts.push(`Current Directory: ${context.currentDirectory}`)
        }

        // Git status
        if (context.gitStatus) {
            parts.push(`Git Branch: ${context.gitStatus.branch || 'unknown'}`)
            if (!context.gitStatus.clean) {
                if (context.gitStatus.modified.length > 0) {
                    parts.push(`Modified Files: ${context.gitStatus.modified.join(', ')}`)
                }
                if (context.gitStatus.untracked.length > 0) {
                    parts.push(`Untracked Files: ${context.gitStatus.untracked.join(', ')}`)
                }
            }
        }

        // Environment variables (limited)
        const envKeys = Object.keys(context.environment).slice(0, 10)
        if (envKeys.length > 0) {
            parts.push(`Environment: ${envKeys.map(k => `${k}=${context.environment[k]}`).join(', ')}`)
        }

        // Recent output (last 5 lines)
        if (context.recentOutput.length > 0) {
            parts.push(`Recent Output:\n${context.recentOutput.slice(-5).join('\n')}`)
        }

        // Recent commands (last 5)
        if (context.recentCommands.length > 0) {
            parts.push(`Recent Commands: ${context.recentCommands.slice(-5).join('; ')}`)
        }

        return parts.join('\n')
    }
}

