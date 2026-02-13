import { PartialProfile } from 'tlink-core';
import { TerminalTabComponent } from '../components/terminalTab.component';
import { LocalProfile } from '../api';
export declare class TerminalService {
    private profilesService;
    private config;
    private logger;
    /** @hidden */
    private constructor();
    getDefaultProfile(): Promise<PartialProfile<LocalProfile>>;
    /**
     * Launches a new terminal with a specific shell and CWD
     * @param pause Wait for a keypress when the shell exits
     */
    openTab(profile?: PartialProfile<LocalProfile> | null, cwd?: string | null, pause?: boolean): Promise<TerminalTabComponent | null>;
}
