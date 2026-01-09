import { Injectable } from '@angular/core'
import { promises as fs } from 'fs'
import * as path from 'path'
import { BaseTerminalTabComponent } from '../api/baseTerminalTab.component'
import { TerminalDecorator } from '../api/decorator'
import { HostAppService, LogService, Logger, NotificationsService, Platform, PlatformService, Profile, TranslateService } from 'tlink-core'

type SessionLogState = {
    file: fs.FileHandle
    filePath: string
    closed: boolean
    writeQueue: Promise<void>
    settingsKey: string
}

@Injectable()
export class SessionLoggerDecorator extends TerminalDecorator {
    private logger: Logger
    private states = new Map<BaseTerminalTabComponent<any>, SessionLogState>()

    constructor (
        log: LogService,
        private hostApp: HostAppService,
        private platform: PlatformService,
        private notifications: NotificationsService,
        private translate: TranslateService,
    ) {
        super()
        this.logger = log.create('sessionLogger')
    }

    attach (terminal: BaseTerminalTabComponent<any>): void {
        if (this.hostApp.platform === Platform.Web) {
            return
        }

        const startLogging = async (session: BaseTerminalTabComponent<any>['session']) => {
            await this.stopLogging(terminal)
            if (!session) {
                return
            }
            this.subscribeUntilDetached(terminal, session.binaryOutput$.subscribe(data => {
                this.handleOutput(terminal, data)
            }))
            this.subscribeUntilDetached(terminal, session.closed$.subscribe(() => {
                this.stopLogging(terminal)
            }))
            this.subscribeUntilDetached(terminal, session.destroyed$.subscribe(() => {
                this.stopLogging(terminal)
            }))

            const settings = terminal.profile.sessionLog
            const state = await this.openLogFile(terminal.profile, settings)
            if (state) {
                this.states.set(terminal, state)
                ;(terminal as any).sessionLogPath = state.filePath
            }
        }

        this.subscribeUntilDetached(terminal, terminal.sessionChanged$.subscribe(session => {
            void startLogging(session)
        }))
        void startLogging(terminal.session)
    }

    detach (terminal: BaseTerminalTabComponent<any>): void {
        void this.stopLogging(terminal)
        super.detach(terminal)
    }

    private async openLogFile (profile: Profile, settings: Profile['sessionLog']): Promise<SessionLogState|null> {
        if (!settings?.enabled) {
            return null
        }
        try {
            const filePath = await this.resolveLogPath(profile, settings)
            await fs.mkdir(path.dirname(filePath), { recursive: true })
            const file = await fs.open(filePath, settings.append ? 'a' : 'w')
            return {
                file,
                filePath,
                closed: false,
                writeQueue: Promise.resolve(),
                settingsKey: this.getSettingsKey(settings),
            }
        } catch (error) {
            this.logger.error('Session log setup failed', error)
            this.notifications.error(this.translate.instant('Failed to start session logging'))
            return null
        }
    }

    private enqueueWrite (state: SessionLogState, data: Buffer): void {
        if (state.closed) {
            return
        }
        state.writeQueue = state.writeQueue
            .then(async () => {
                await state.file.write(data)
            })
            .catch(error => {
                if (!state.closed) {
                    state.closed = true
                    state.file.close()
                }
                this.logger.error('Session log write failed', error)
                this.notifications.error(this.translate.instant('Session logging failed'))
            })
    }

    private async stopLogging (terminal: BaseTerminalTabComponent<any>): Promise<void> {
        const state = this.states.get(terminal)
        if (!state) {
            return
        }
        this.states.delete(terminal)
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (terminal as any).sessionLogPath
        if (state.closed) {
            return
        }
        state.closed = true
        try {
            await state.writeQueue
        } finally {
            await state.file.close()
        }
    }

    private handleOutput (terminal: BaseTerminalTabComponent<any>, data: Buffer): void {
        const settings = terminal.profile.sessionLog
        if (!settings?.enabled) {
            void this.stopLogging(terminal)
            return
        }

        const settingsKey = this.getSettingsKey(settings)
        const state = this.states.get(terminal)
        if (!state || state.closed || state.settingsKey !== settingsKey) {
            void this.stopLogging(terminal).then(async () => {
                const nextState = await this.openLogFile(terminal.profile, settings)
                if (nextState) {
                    this.states.set(terminal, nextState)
                    ;(terminal as any).sessionLogPath = nextState.filePath
                    this.enqueueWrite(nextState, data)
                }
            })
            return
        }

        this.enqueueWrite(state, data)
    }

    private getSettingsKey (settings: NonNullable<Profile['sessionLog']>): string {
        return [
            settings.enabled ? '1' : '0',
            settings.append ? '1' : '0',
            settings.directory ?? '',
            settings.filenameTemplate ?? '',
        ].join('|')
    }

    private async resolveLogPath (profile: Profile, settings: NonNullable<Profile['sessionLog']>): Promise<string> {
        const baseDir = this.getBaseDirectory()
        const directory = this.resolveDirectory(settings.directory, baseDir)
        const filename = this.resolveFilename(profile, settings.filenameTemplate)
        return path.join(directory, filename)
    }

    private resolveDirectory (directory: string|undefined, baseDir: string): string {
        let resolved = directory?.trim() || path.join(baseDir, 'session-logs')
        resolved = this.expandPathVars(resolved)
        if (!path.isAbsolute(resolved)) {
            resolved = path.join(baseDir, resolved)
        }
        return resolved
    }

    private resolveFilename (profile: Profile, template: string|undefined): string {
        const now = new Date()
        const date = `${now.getFullYear()}-${this.pad2(now.getMonth() + 1)}-${this.pad2(now.getDate())}`
        const time = `${this.pad2(now.getHours())}-${this.pad2(now.getMinutes())}-${this.pad2(now.getSeconds())}`
        const timestamp = `${date}_${time}`
        const context: Record<string, string> = {
            profile: profile.name ?? 'session',
            type: profile.type ?? 'session',
            host: profile.options?.host ?? '',
            user: profile.options?.user ?? '',
            date,
            time,
            timestamp,
        }
        const raw = (template?.trim() || '{profile}-{timestamp}.log')
            .replace(/\{(\w+)\}/g, (_match, key) => this.sanitizePathSegment(context[key] ?? ''))
        let filename = this.sanitizeFilename(raw)
        if (!path.extname(filename)) {
            filename += '.log'
        }
        return filename
    }

    private sanitizeFilename (value: string): string {
        const cleaned = value
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .replace(/[. ]+$/g, '')
            .trim()
        return cleaned || 'session.log'
    }

    private sanitizePathSegment (value: string): string {
        return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim()
    }

    private expandPathVars (value: string): string {
        let result = value
        const home = process.env.HOME || process.env.USERPROFILE
        if (home && result.startsWith('~')) {
            result = path.join(home, result.slice(1))
        }
        result = result.replace(/\$([A-Z0-9_]+)/gi, (_match, key) => process.env[key] ?? `$${key}`)
        result = result.replace(/%([^%]+)%/g, (_match, key) => process.env[key] ?? `%${key}%`)
        return result
    }

    private getBaseDirectory (): string {
        const configPath = this.platform.getConfigPath()
        if (configPath) {
            return path.dirname(configPath)
        }
        const home = process.env.HOME || process.env.USERPROFILE
        if (home) {
            return path.join(home, '.tlink')
        }
        return process.cwd()
    }

    private pad2 (value: number): string {
        return value.toString().padStart(2, '0')
    }
}
