import { HostAppService } from 'tlink-core';
import { SettingsTabProvider } from 'tlink-settings';
/** @hidden */
export declare class ShellSettingsTabProvider extends SettingsTabProvider {
    private hostApp;
    id: string;
    icon: string;
    title: string;
    constructor(hostApp: HostAppService);
    getComponentType(): any;
}
