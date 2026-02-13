import { HostAppService } from 'tlink-core';
import { RDPProfile } from '../api';
export declare class RDPService {
    private hostApp;
    private exec;
    constructor(hostApp: HostAppService);
    /**
     * Best-effort check/start XQuartz and return a DISPLAY value (macOS only)
     */
    private ensureXQuartzDisplay;
    /**
     * Get the path to bundled xfreerdp executable
     * Returns null if not found
     */
    private getBundledXFreeRDPPath;
    /**
     * Get the path to xfreerdp executable
     * Checks bundled version first, then system-installed
     * Returns null if not found
     */
    getFreeRDPPath(): Promise<string | null>;
    /**
     * Execute a command with custom environment variables (fallback if platform doesn't support it)
     * For GUI applications like xfreerdp, we use spawn with detached:true so it runs independently
     */
    private execWithEnv;
    /**
     * Launch FreeRDP (xfreerdp) as external executable
     */
    launchFreeRDP(profile: RDPProfile, parentWindow?: string | null): Promise<void>;
}
