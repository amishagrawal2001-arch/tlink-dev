import { Workspace } from '../api/workspace';
import { Logger } from './log.service';
export declare class WorkspaceService {
    private config;
    private tabRecovery;
    private app;
    private platform;
    logger: Logger;
    private constructor();
    /**
     * Ensure workspaces array exists in config
     */
    private ensureWorkspacesConfig;
    /**
     * Get all saved workspaces
     */
    getWorkspaces(): Workspace[];
    /**
     * Get a workspace by ID
     */
    getWorkspace(id: string): Workspace | null;
    /**
     * Save current workspace state
     */
    saveWorkspace(name: string, description?: string, shared?: boolean, teamId?: string): Promise<Workspace>;
    /**
     * Update an existing workspace
     */
    updateWorkspace(id: string, updates: Partial<Workspace>): Promise<Workspace | null>;
    /**
     * Delete a workspace
     */
    deleteWorkspace(id: string): Promise<boolean>;
    /**
     * Load a workspace (restore tabs and state)
     */
    loadWorkspace(id: string): Promise<boolean>;
    /**
     * Generate a shareable URL for a workspace
     */
    generateShareableUrl(workspaceId: string): string | null;
    /**
     * Import workspace from a shareable URL or base64 data
     */
    importFromUrl(urlOrData: string): Promise<Workspace | null>;
    /**
     * Export workspace to JSON string
     */
    exportWorkspace(workspaceId: string): string | null;
    /**
     * Import workspace from JSON string
     */
    importFromJson(json: string): Promise<Workspace | null>;
    /**
     * Copy workspace shareable URL to clipboard
     */
    copyShareableUrl(workspaceId: string): Promise<boolean>;
    /**
     * Capture the current layout structure
     */
    private captureLayout;
}
