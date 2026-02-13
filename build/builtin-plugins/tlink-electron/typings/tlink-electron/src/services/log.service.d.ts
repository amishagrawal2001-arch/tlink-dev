import { ConsoleLogger, Logger } from 'tlink-core';
import { ElectronService } from '../services/electron.service';
type WinstonLogger = {
    error: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    info: (...args: any[]) => void;
    debug: (...args: any[]) => void;
    log?: (...args: any[]) => void;
};
export declare class WinstonAndConsoleLogger extends ConsoleLogger {
    private winstonLogger;
    constructor(winstonLogger: WinstonLogger, name: string);
    protected doLog(level: string, ...args: any[]): void;
}
export declare class ElectronLogService {
    private log;
    /** @hidden */
    constructor(electron: ElectronService);
    create(name: string): Logger;
}
export {};
