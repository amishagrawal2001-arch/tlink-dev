import { SessionOptions, UACService } from 'tlink-local';
import { ElectronService } from './electron.service';
/** @hidden */
export declare class ElectronUACService extends UACService {
    private electron;
    constructor(electron: ElectronService);
    patchSessionOptionsForUAC(sessionOptions: SessionOptions): SessionOptions;
}
