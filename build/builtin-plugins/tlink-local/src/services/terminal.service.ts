import * as fsSync from 'fs'
import * as path from 'path'
import { Injectable } from '@angular/core'
import { Logger, LogService, ConfigService, ProfilesService, PartialProfile } from 'tlink-core'
import { TerminalTabComponent } from '../components/terminalTab.component'
import { LocalProfile } from '../api'

@Injectable({ providedIn: 'root' })
export class TerminalService {
    private logger: Logger

    /** @hidden */
    private constructor (
        private profilesService: ProfilesService,
        private config: ConfigService,
        log: LogService,
    ) {
        this.logger = log.create('terminal')
    }

    async getDefaultProfile (): Promise<PartialProfile<LocalProfile>> {
        const profiles = await this.profilesService.getProfiles()
        const configuredId = this.config.store.terminal.profile
        const configured = profiles.find(x => x.id === configuredId)

        const builtinLocals = profiles.filter(x => x.type === 'local' && x.isBuiltin)
        const fish = builtinLocals.find(p => p.id === 'local:fish-bundled')
            ?? builtinLocals.find(p => {
                const cmd = (p as any)?.options?.command ?? ''
                const base = path.basename(cmd)
                return base === 'fish' || cmd === 'fish'
            })

        // If the user explicitly chose a profile, respect it.
        // But if it's the default "OS default" profile, prefer fish when available.
        if (configured) {
            if (configured.id === 'local:default' && fish) {
                return fish
            }
            return configured as PartialProfile<LocalProfile>
        }

        return (fish ?? builtinLocals[0]) as PartialProfile<LocalProfile>
    }

    /**
     * Launches a new terminal with a specific shell and CWD
     * @param pause Wait for a keypress when the shell exits
     */
    async openTab (profile?: PartialProfile<LocalProfile>|null, cwd?: string|null, pause?: boolean): Promise<TerminalTabComponent|null> {
        if (!profile) {
            profile = await this.getDefaultProfile()
        }

        const fullProfile = this.profilesService.getConfigProxyForProfile(profile)

        cwd = cwd ?? fullProfile.options.cwd

        if (cwd && !fsSync.existsSync(cwd)) {
            console.warn('Ignoring non-existent CWD:', cwd)
            cwd = null
        }

        this.logger.info(`Starting profile ${fullProfile.name}`, fullProfile)
        const options = {
            ...fullProfile.options,
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            pauseAfterExit: fullProfile.options.pauseAfterExit || pause,
            cwd: cwd ?? undefined,
        }

        return (await this.profilesService.openNewTabForProfile({
            ...fullProfile,
            options,
        })) as TerminalTabComponent|null
    }
}
