import { PartialProfile } from 'tlink-core'
import { Subject } from 'rxjs'
import { SSHProfile } from './interfaces'

export abstract class SSHProfileImporter {
    /** Emits when the underlying source changes and profiles should be re-imported. */
    onChange$ = new Subject<void>()

    abstract getProfiles (): Promise<PartialProfile<SSHProfile>[]>
}

export abstract class AutoPrivateKeyLocator {
    abstract getKeys (): Promise<[string, Buffer][]>
}
