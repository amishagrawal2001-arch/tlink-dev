import { Injectable } from '@angular/core'
import { BaseTerminalTabComponent } from '../api/baseTerminalTab.component'
import { TerminalDecorator } from '../api/decorator'
import { ConfigService, LogService, Logger, NotificationsService, Platform, HostAppService } from 'tlink-core'
import { OutputAnalyzerPattern } from './outputAnalyzerPatterns'

const ANSI_SEQUENCE_REGEX = /(?:\x1b\[[0-?]*[ -/]*[@-~])|(?:\x1b\][^\x07\x1b]*(?:\x07|\x1b\\))|(?:\x9b[0-?]*[ -/]*[@-~])/g

@Injectable()
export class OutputAnalyzerDecorator extends TerminalDecorator {
    private logger: Logger
    private lastNotificationTime = new Map<string, number>()
    private lineBuffer = new Map<BaseTerminalTabComponent<any>, string>()

    constructor (
        log: LogService,
        private config: ConfigService,
        private notifications: NotificationsService,
        private hostApp: HostAppService,
    ) {
        super()
        this.logger = log.create('outputAnalyzer')
    }

    attach (terminal: BaseTerminalTabComponent<any>): void {
        if (this.hostApp.platform === Platform.Web) {
            return
        }

        const startAnalyzing = (session: BaseTerminalTabComponent<any>['session']) => {
            if (!session) {
                return
            }

            this.lineBuffer.set(terminal, '')

            this.subscribeUntilDetached(terminal, session.binaryOutput$.subscribe(data => {
                this.analyzeOutput(terminal, data)
            }))

            this.subscribeUntilDetached(terminal, session.closed$.subscribe(() => {
                this.lineBuffer.delete(terminal)
            }))
        }

        this.subscribeUntilDetached(terminal, terminal.sessionChanged$.subscribe(session => {
            startAnalyzing(session)
        }))

        if (terminal.session) {
            startAnalyzing(terminal.session)
        }
    }

    detach (terminal: BaseTerminalTabComponent<any>): void {
        this.lineBuffer.delete(terminal)
        super.detach(terminal)
    }

    private analyzeOutput (terminal: BaseTerminalTabComponent<any>, data: Buffer): void {
        const analyzerConfig = this.config.store.terminal?.outputAnalyzer
        if (!analyzerConfig?.enabled) {
            return
        }

        let text = data.toString('utf8')
        if (text.includes('\x1b') || text.includes('\x9b')) {
            text = text.replace(ANSI_SEQUENCE_REGEX, '')
        }

        // Accumulate text and process complete lines
        const current = (this.lineBuffer.get(terminal) || '') + text
        const lines = current.split('\n')

        // Keep the last incomplete line in the buffer
        this.lineBuffer.set(terminal, lines.pop() || '')

        const patterns: OutputAnalyzerPattern[] = analyzerConfig.patterns ?? []
        const throttleMs: number = analyzerConfig.throttleMs ?? 5000

        for (const line of lines) {
            const trimmed = line.replace(/\r/g, '').trim()
            if (!trimmed) {
                continue
            }

            for (const pattern of patterns) {
                try {
                    const regex = new RegExp(pattern.regex, 'i')
                    if (regex.test(trimmed)) {
                        this.showSuggestion(pattern, throttleMs)
                        break // one notification per line
                    }
                } catch {
                    // Invalid regex, skip
                }
            }
        }
    }

    private showSuggestion (pattern: OutputAnalyzerPattern, throttleMs: number): void {
        const now = Date.now()
        const lastTime = this.lastNotificationTime.get(pattern.regex) ?? 0

        if (now - lastTime < throttleMs) {
            return
        }

        this.lastNotificationTime.set(pattern.regex, now)
        this.logger.debug(`Pattern matched: ${pattern.regex}`)

        switch (pattern.severity) {
            case 'error':
                this.notifications.error(pattern.suggestion)
                break
            case 'warning':
                this.notifications.info(pattern.suggestion)
                break
            default:
                this.notifications.notice(pattern.suggestion)
                break
        }
    }
}
