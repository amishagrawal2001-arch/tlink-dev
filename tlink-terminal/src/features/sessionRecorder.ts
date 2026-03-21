import { Injectable } from '@angular/core'
import { promises as fs } from 'fs'
import * as path from 'path'
import { BaseTerminalTabComponent } from '../api/baseTerminalTab.component'
import { TerminalDecorator } from '../api/decorator'
import { ConfigService, HostAppService, LogService, Logger, NotificationsService, Platform, PlatformService } from 'tlink-core'

interface RecordingState {
    file: fs.FileHandle
    filePath: string
    startTime: number
    closed: boolean
    writeQueue: Promise<void>
}

@Injectable()
export class SessionRecorderDecorator extends TerminalDecorator {
    private logger: Logger
    private states = new Map<BaseTerminalTabComponent<any>, RecordingState>()
    private recordingActive = new Map<BaseTerminalTabComponent<any>, boolean>()

    constructor (
        log: LogService,
        private config: ConfigService,
        private hostApp: HostAppService,
        private platform: PlatformService,
        private notifications: NotificationsService,
    ) {
        super()
        this.logger = log.create('sessionRecorder')
    }

    attach (terminal: BaseTerminalTabComponent<any>): void {
        if (this.hostApp.platform === Platform.Web) {
            return
        }
        // Recorder is manually toggled, not auto-started
    }

    detach (terminal: BaseTerminalTabComponent<any>): void {
        void this.stopRecording(terminal)
        this.recordingActive.delete(terminal)
        super.detach(terminal)
    }

    isRecording (terminal: BaseTerminalTabComponent<any>): boolean {
        return this.recordingActive.get(terminal) ?? false
    }

    async startRecording (terminal: BaseTerminalTabComponent<any>): Promise<string | null> {
        if (this.isRecording(terminal)) {
            return null
        }

        const session = terminal.session
        if (!session) {
            this.notifications.error('No active session to record')
            return null
        }

        try {
            const dir = this.getRecordingDirectory()
            await fs.mkdir(dir, { recursive: true })

            const now = new Date()
            const timestamp = `${now.getFullYear()}-${this.pad2(now.getMonth() + 1)}-${this.pad2(now.getDate())}_${this.pad2(now.getHours())}-${this.pad2(now.getMinutes())}-${this.pad2(now.getSeconds())}`
            const profileName = (terminal.profile?.name ?? 'session').replace(/[<>:"/\\|?*]/g, '_')
            const fileName = `${profileName}-${timestamp}.tlink-recording`
            const filePath = path.join(dir, fileName)

            const file = await fs.open(filePath, 'w')
            const startTime = Date.now()

            const state: RecordingState = {
                file,
                filePath,
                startTime,
                closed: false,
                writeQueue: Promise.resolve(),
            }

            // Write header
            const header = JSON.stringify({
                type: 'header',
                version: 1,
                startTime,
                profile: terminal.profile?.name ?? 'Unknown',
                cols: (terminal as any).size?.columns ?? 80,
                rows: (terminal as any).size?.rows ?? 24,
            })
            this.enqueueWrite(state, header + '\n')

            this.states.set(terminal, state)
            this.recordingActive.set(terminal, true)

            // Subscribe to output
            this.subscribeUntilDetached(terminal, session.binaryOutput$.subscribe(data => {
                if (!this.isRecording(terminal)) {
                    return
                }
                const entry = JSON.stringify({
                    type: 'output',
                    ts: Date.now() - startTime,
                    data: data.toString('base64'),
                })
                this.enqueueWrite(state, entry + '\n')
            }))

            this.notifications.notice(`Recording started: ${fileName}`)
            this.logger.info(`Recording started: ${filePath}`)
            return filePath
        } catch (error) {
            this.logger.error('Failed to start recording', error)
            this.notifications.error('Failed to start recording')
            return null
        }
    }

    async stopRecording (terminal: BaseTerminalTabComponent<any>): Promise<string | null> {
        const state = this.states.get(terminal)
        if (!state) {
            return null
        }

        this.recordingActive.set(terminal, false)
        this.states.delete(terminal)

        if (state.closed) {
            return null
        }

        state.closed = true
        try {
            await state.writeQueue
        } finally {
            await state.file.close()
        }

        this.notifications.notice(`Recording saved: ${path.basename(state.filePath)}`)
        this.logger.info(`Recording saved: ${state.filePath}`)
        return state.filePath
    }

    private enqueueWrite (state: RecordingState, data: string): void {
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
                this.logger.error('Recording write failed', error)
            })
    }

    private getRecordingDirectory (): string {
        const configured = this.config.store.terminal?.sessionRecording?.directory
        if (configured) {
            return configured
        }
        const configPath = this.platform.getConfigPath()
        if (configPath) {
            return path.join(path.dirname(configPath), 'recordings')
        }
        const home = process.env.HOME || process.env.USERPROFILE
        return path.join(home || process.cwd(), '.tlink', 'recordings')
    }

    private pad2 (value: number): string {
        return value.toString().padStart(2, '0')
    }
}
