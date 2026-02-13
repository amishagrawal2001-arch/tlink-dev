/**
 * Terminal-related type definitions
 */

// Terminal session information
export interface TerminalSession {
    sessionId: string;
    pid?: number;
    cwd: string;
    shell: string;
    user?: string;
    hostname?: string;
    environment: Record<string, string>;
    startTime: Date;
    lastActivity: Date;
}

// Terminal context
export interface TerminalContext {
    session: TerminalSession;
    currentCommand?: string;
    lastCommand?: string;
    lastOutput?: string;
    lastError?: string;
    exitCode?: number;
    isRunning: boolean;
    runningProcess?: ProcessInfo;
    recentCommands: string[];
    systemInfo: SystemInfo;
    projectInfo?: ProjectInfo;
}

// Process information
export interface ProcessInfo {
    pid: number;
    name: string;
    status: 'running' | 'sleeping' | 'stopped' | 'zombie';
    cpu?: number;
    memory?: number;
    startTime?: Date;
    command: string;
}

// System information
export interface SystemInfo {
    platform: 'win32' | 'linux' | 'darwin' | 'freebsd' | 'sunos' | 'browser';
    arch: string;
    type: string;
    release: string;
    version?: string;
    cpus: number;
    totalMemory: number;
    availableMemory?: number;
    nodeVersion?: string;
}

// Project information (if detected)
export interface ProjectInfo {
    type?: 'git' | 'npm' | 'yarn' | 'maven' | 'gradle' | 'pip' | 'cargo' | 'go' | 'rust';
    root: string;
    name?: string;
    version?: string;
    dependencies?: string[];
    scripts?: Record<string, string>;
    description?: string;
    language?: string;
    framework?: string;
}

// Error message
export interface TerminalError {
    type: 'command_not_found' | 'permission_denied' | 'file_not_found' | 'syntax_error' | 'runtime_error' | 'network_error' | 'unknown';
    message: string;
    command?: string;
    exitCode?: number;
    stack?: string;
    suggestions?: string[];
    timestamp: Date;
}

// Buffer content
export interface BufferContent {
    content: string;
    cursorPosition: number;
    selectionStart?: number;
    selectionEnd?: number;
}

// Command execution result
export interface CommandResult {
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    duration: number;
    timestamp: Date;
    success: boolean;
}

// History entry
export interface HistoryEntry {
    command: string;
    timestamp: Date;
    exitCode?: number;
    duration?: number;
    cwd?: string;
}

// Environment variable change
export interface EnvironmentChange {
    key: string;
    oldValue?: string;
    newValue: string;
    timestamp: Date;
}

// Terminal theme
export interface TerminalTheme {
    name: string;
    foreground: string;
    background: string;
    colors: string[];
    cursor: string;
}

// File system status
export interface FileSystemState {
    currentPath: string;
    files: FileInfo[];
    permissions: Record<string, string>;
}

// File information
export interface FileInfo {
    name: string;
    path: string;
    type: 'file' | 'directory' | 'symlink' | 'device' | 'pipe' | 'socket';
    size: number;
    modified: Date;
    permissions: string;
    owner?: string;
    group?: string;
}

// Hotkey definition
export interface Hotkey {
    key: string;
    description: string;
    action: string;
    scope?: 'global' | 'terminal' | 'chat';
}

// Terminal capability
export interface TerminalCapability {
    name: string;
    supported: boolean;
    version?: string;
}

// Clipboard content
export interface ClipboardContent {
    text: string;
    type: 'plain' | 'rich' | 'image' | 'file';
    timestamp: Date;
}

// Autocomplete candidate
export interface AutoCompleteCandidate {
    value: string;
    description?: string;
    type: 'command' | 'file' | 'directory' | 'variable' | 'function';
    icon?: string;
}

// Terminal warning/notification
export interface TerminalNotification {
    type: 'warning' | 'info' | 'error' | 'success';
    title: string;
    message: string;
    timestamp: Date;
    persistent?: boolean;
    actions?: {
        label: string;
        action: () => void;
    }[];
}
