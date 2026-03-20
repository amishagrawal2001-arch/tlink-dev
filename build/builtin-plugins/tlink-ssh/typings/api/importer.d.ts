/// <reference types="node" />
import { PartialProfile } from 'tlink-core';
import { Subject } from 'rxjs';
import { SSHProfile } from './interfaces';
export declare abstract class SSHProfileImporter {
    /** Emits when the underlying source changes and profiles should be re-imported. */
    onChange$: Subject<void>;
    abstract getProfiles(): Promise<PartialProfile<SSHProfile>[]>;
}
export declare abstract class AutoPrivateKeyLocator {
    abstract getKeys(): Promise<[string, Buffer][]>;
}
