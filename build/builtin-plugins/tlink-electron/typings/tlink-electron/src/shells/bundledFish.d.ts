import { HostAppService } from 'tlink-core';
import { ShellProvider, Shell } from 'tlink-local';
import { ElectronService } from '../services/electron.service';
/**
 * Provides a Fish shell backed by a binary shipped inside the app bundle:
 * - Packaged:   <resources>/extras/fish/<platform>/fish
 * - Dev mode:   <repo>/extras/fish/<platform>/fish
 *
 * Note: The actual fish binary is not part of the repo. See `extras/fish/README.txt`.
 */
export declare class BundledFishShellProvider extends ShellProvider {
    private hostApp;
    private electron;
    constructor(hostApp: HostAppService, electron: ElectronService);
    provide(): Promise<Shell[]>;
    private findBundledFishBinary;
}
