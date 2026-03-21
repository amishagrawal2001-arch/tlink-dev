import { Component, AfterViewInit, OnDestroy, ViewChild, ElementRef, Injector } from '@angular/core'
import { BaseTabComponent } from 'tlink-core'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { promises as fs } from 'fs'

interface RecordingHeader {
    type: 'header'
    version: number
    startTime: number
    profile: string
    cols: number
    rows: number
}

interface RecordingEntry {
    type: 'output'
    ts: number
    data: string
}

type RecordingEvent = RecordingHeader | RecordingEntry

@Component({
    selector: 'session-replay-tab',
    templateUrl: './sessionReplayTab.component.pug',
    styleUrls: ['./sessionReplayTab.component.scss'],
})
export class SessionReplayTabComponent extends BaseTabComponent implements AfterViewInit, OnDestroy {
    @ViewChild('replayTerminal', { static: false }) terminalRef: ElementRef

    filePath = ''
    profileName = 'Recording'
    isPlaying = false
    playbackSpeed: number = 1
    currentTime = 0
    totalDuration = 0
    progressPercent = 0

    private terminal: Terminal
    private fitAddon: FitAddon
    private events: RecordingEntry[] = []
    private currentEventIndex = 0
    private playbackTimer: any = null
    private resizeObserver: ResizeObserver

    constructor (injector: Injector) {
        super(injector)
        this.setTitle('Session Replay')
    }

    ngAfterViewInit (): void {
        this.terminal = new Terminal({
            disableStdin: true,
            cursorBlink: false,
            fontSize: 13,
            theme: {
                background: '#1e1e1e',
                foreground: '#d4d4d4',
            },
        })

        this.fitAddon = new FitAddon()
        this.terminal.loadAddon(this.fitAddon)
        this.terminal.open(this.terminalRef.nativeElement)

        this.resizeObserver = new ResizeObserver(() => {
            try {
                this.fitAddon.fit()
            } catch {
                // ignore
            }
        })
        this.resizeObserver.observe(this.terminalRef.nativeElement)

        if (this.filePath) {
            void this.loadRecording(this.filePath)
        }
    }

    ngOnDestroy (): void {
        this.stopPlayback()
        if (this.resizeObserver) {
            this.resizeObserver.disconnect()
        }
        if (this.terminal) {
            this.terminal.dispose()
        }
        super.ngOnDestroy()
    }

    async loadRecording (filePath: string): Promise<void> {
        try {
            const content = await fs.readFile(filePath, 'utf8')
            const lines = content.trim().split('\n')

            this.events = []
            let header: RecordingHeader | null = null

            for (const line of lines) {
                try {
                    const event: RecordingEvent = JSON.parse(line)
                    if (event.type === 'header') {
                        header = event as RecordingHeader
                    } else if (event.type === 'output') {
                        this.events.push(event as RecordingEntry)
                    }
                } catch {
                    // Skip malformed lines
                }
            }

            if (header) {
                this.profileName = header.profile
                this.setTitle(`Replay: ${header.profile}`)
                if (this.terminal) {
                    this.terminal.resize(header.cols, header.rows)
                }
            }

            if (this.events.length > 0) {
                this.totalDuration = this.events[this.events.length - 1].ts
            }

            this.currentEventIndex = 0
            this.currentTime = 0
            this.updateProgress()

            // Auto-play
            this.startPlayback()
        } catch (error) {
            console.error('Failed to load recording', error)
        }
    }

    togglePlayback (): void {
        if (this.isPlaying) {
            this.stopPlayback()
        } else {
            if (this.currentEventIndex >= this.events.length) {
                this.restart()
            }
            this.startPlayback()
        }
    }

    restart (): void {
        this.stopPlayback()
        this.currentEventIndex = 0
        this.currentTime = 0
        this.updateProgress()
        if (this.terminal) {
            this.terminal.reset()
        }
    }

    onSpeedChange (): void {
        this.playbackSpeed = Number(this.playbackSpeed)
        if (this.isPlaying) {
            this.stopPlayback()
            this.startPlayback()
        }
    }

    seekTo (event: MouseEvent): void {
        const container = event.currentTarget as HTMLElement
        const rect = container.getBoundingClientRect()
        const percent = (event.clientX - rect.left) / rect.width
        const targetTime = percent * this.totalDuration

        // Reset and replay up to target time
        this.stopPlayback()
        if (this.terminal) {
            this.terminal.reset()
        }
        this.currentEventIndex = 0
        this.currentTime = 0

        // Fast-forward: write all events up to target time
        while (this.currentEventIndex < this.events.length && this.events[this.currentEventIndex].ts <= targetTime) {
            const entry = this.events[this.currentEventIndex]
            this.terminal.write(Buffer.from(entry.data, 'base64'))
            this.currentEventIndex++
        }

        this.currentTime = targetTime
        this.updateProgress()
    }

    formatTime (ms: number): string {
        const totalSeconds = Math.floor(ms / 1000)
        const minutes = Math.floor(totalSeconds / 60)
        const seconds = totalSeconds % 60
        return `${minutes}:${seconds.toString().padStart(2, '0')}`
    }

    private startPlayback (): void {
        if (this.isPlaying || this.currentEventIndex >= this.events.length) {
            return
        }

        this.isPlaying = true
        this.scheduleNextEvent()
    }

    private stopPlayback (): void {
        this.isPlaying = false
        if (this.playbackTimer) {
            clearTimeout(this.playbackTimer)
            this.playbackTimer = null
        }
    }

    private scheduleNextEvent (): void {
        if (!this.isPlaying || this.currentEventIndex >= this.events.length) {
            this.isPlaying = false
            return
        }

        const entry = this.events[this.currentEventIndex]
        const delay = Math.max(0, (entry.ts - this.currentTime) / this.playbackSpeed)

        this.playbackTimer = setTimeout(() => {
            if (!this.isPlaying) {
                return
            }

            this.terminal.write(Buffer.from(entry.data, 'base64'))
            this.currentTime = entry.ts
            this.currentEventIndex++
            this.updateProgress()
            this.scheduleNextEvent()
        }, Math.min(delay, 2000)) // Cap individual delays at 2 seconds
    }

    private updateProgress (): void {
        if (this.totalDuration > 0) {
            this.progressPercent = (this.currentTime / this.totalDuration) * 100
        } else {
            this.progressPercent = 0
        }
    }
}
