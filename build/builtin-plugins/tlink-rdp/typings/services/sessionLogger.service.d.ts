/// <reference types="node" />
import * as fs from 'fs';
import { RDPProfile } from '../api';
export interface SessionLogHandle {
    filePath: string;
    stream: fs.WriteStream;
}
export declare class RDPSessionLoggerService {
    startLogging(profile: RDPProfile): SessionLogHandle | null;
    logEvent(handle: SessionLogHandle | null, type: string, data?: any): void;
    stopLogging(handle: SessionLogHandle | null): void;
}
