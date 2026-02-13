/// <reference types="node" />
import { LogService } from './log.service';
import { PlatformService } from '../api/platform';
export interface SharedSession {
    id: string;
    terminal: any;
    token: string;
    mode: 'read-only' | 'interactive';
    createdAt: Date;
    expiresAt?: Date;
    password?: string;
    viewers: number;
}
export interface SessionSharingOptions {
    mode: 'read-only' | 'interactive';
    expiresIn?: number;
    password?: string;
}
export declare class SessionSharingService {
    private platform;
    private logger;
    private sharedSessions;
    private terminalToSessionId;
    private sessionIdToTerminal;
    private ws;
    private wsUrl;
    constructor(log: LogService, platform: PlatformService);
    /**
     * Prompt user to start WebSocket server
     */
    private promptToStartServer;
    /**
     * Generate a shareable link for a terminal session
     */
    shareSession(terminal: any, options: SessionSharingOptions): Promise<string | null>;
    /**
     * Stop sharing a session
     */
    stopSharing(terminal: any): Promise<void>;
    /**
     * Check if a session is currently shared
     */
    isSessionShared(terminal: any): boolean;
    /**
     * Get the shared session for a terminal
     */
    getSharedSession(terminal: any): SharedSession | null;
    /**
     * Copy shareable link to clipboard
     */
    copyShareableLink(terminal: any): Promise<boolean>;
    /**
     * Join a shared session
     */
    joinSession(sessionId: string, token: string, password?: string): Promise<boolean>;
    /**
     * Broadcast terminal output to viewers
     */
    broadcastOutput(sessionId: string, data: Buffer): void;
    /**
     * Forward input from viewer to terminal (for interactive mode)
     */
    forwardInput(sessionId: string, data: Buffer): void;
    /**
     * Connect to WebSocket server
     */
    private connectWebSocket;
    /**
     * Handle incoming WebSocket messages
     */
    private handleWebSocketMessage;
    private handleViewerJoined;
    private handleViewerLeft;
    private handleViewerInput;
    /**
     * Get base URL for shareable links
     */
    private getBaseUrl;
    /**
     * Get shareable URL with network access information
     */
    getShareableUrlWithInfo(terminal: any): Promise<{
        url: string;
        networkUrl?: string;
        publicUrl?: string;
    } | null>;
    /**
     * Get IPC renderer if available (in Electron)
     */
    private getIpcRenderer;
}
