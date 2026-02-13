/// <reference types="node" />
import { FileProvider } from 'tlink-core';
import { ElectronService } from '../services/electron.service';
import { ElectronHostWindow } from './hostWindow.service';
export declare class ElectronFileProvider extends FileProvider {
    private electron;
    private hostWindow;
    name: string;
    constructor(electron: ElectronService, hostWindow: ElectronHostWindow);
    selectAndStoreFile(description: string): Promise<string>;
    retrieveFile(key: string): Promise<Buffer>;
}
