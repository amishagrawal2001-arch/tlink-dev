import { Observable } from 'rxjs';
import { AppService } from './app.service';
import { LogService, HostAppService } from '../api';
import { BaseTabComponent } from '../components/baseTab.component';
/**
 * Terminal context information for AI integration
 */
export interface TerminalContext {
    /** Current working directory */
    currentDirectory?: string;
    /** Git repository status */
    gitStatus?: GitStatus;
    /** Environment variables (filtered for security) */
    environment: Record<string, string>;
    /** Recent terminal output (last N lines) */
    recentOutput: string[];
    /** Recent command history (last N commands) */
    recentCommands: string[];
    /** File system context (current directory contents) */
    fileSystem?: FileSystemContext;
    /** Terminal type (local, SSH, etc.) */
    terminalType: string;
    /** Terminal profile name */
    profileName?: string;
}
/**
 * Git repository status
 */
export interface GitStatus {
    /** Current branch name */
    branch?: string;
    /** Whether the working directory is clean */
    clean: boolean;
    /** Modified files */
    modified: string[];
    /** Untracked files */
    untracked: string[];
    /** Staged files */
    staged: string[];
    /** Current commit hash (short) */
    commit?: string;
    /** Remote tracking info */
    remote?: {
        name: string;
        url: string;
    };
}
/**
 * File system context for current directory
 */
export interface FileSystemContext {
    /** Current directory path */
    path: string;
    /** Files and directories in current directory */
    entries: Array<{
        name: string;
        type: 'file' | 'directory' | 'symlink';
        size?: number;
    }>;
    /** Modified files in the directory */
    modifiedFiles?: string[];
}
export declare class TerminalContextService {
    private app;
    private hostApp;
    private logger;
    private contexts;
    private activeTerminalContext$;
    constructor(app: AppService, hostApp: HostAppService, log: LogService);
    /**
     * Check if a tab is a terminal tab (runtime check to avoid circular dependency)
     */
    private isTerminalTab;
    /**
     * Get context for a specific terminal tab
     */
    getContext(terminal: BaseTabComponent): Observable<TerminalContext>;
    /**
     * Get context for the currently active terminal
     */
    getActiveContext(): Observable<TerminalContext | null>;
    /**
     * Get current context snapshot for active terminal
     */
    getActiveContextSnapshot(): TerminalContext | null;
    /**
     * Initialize context tracking for a terminal
     */
    private initializeContext;
    /**
     * Setup tracking for a terminal session
     */
    private setupTerminalTracking;
    /**
     * Set active terminal and update active context
     */
    private setActiveTerminal;
    /**
     * Get git status for a directory (async, non-blocking)
     */
    private getGitStatus;
    /**
     * Get file system context for a directory
     */
    private getFileSystemContext;
    /**
     * Get safe environment variables (filter sensitive data)
     */
    private getSafeEnvironment;
    /**
     * Get terminal type identifier
     */
    private getTerminalType;
    /**
     * Format context as a string for AI prompts
     */
    formatContextForPrompt(context: TerminalContext | null): string;
}
