import { Inject, Injectable, Optional } from '@angular/core'
import { AppService, Command, CommandProvider, SplitTabComponent, TranslateService } from 'tlink-core'
import { TerminalDecorator } from './api/decorator'
import { SessionRecorderDecorator } from './features/sessionRecorder'
import { SessionReplayTabComponent } from './components/sessionReplayTab.component'
import { BaseTerminalTabComponent } from './api/baseTerminalTab.component'
import { promises as fs } from 'fs'
import * as path from 'path'

@Injectable()
export class SessionRecordingCommandProvider extends CommandProvider {
    private recorder: SessionRecorderDecorator | null = null

    constructor (
        private app: AppService,
        private translate: TranslateService,
        @Optional() @Inject(TerminalDecorator) decorators: TerminalDecorator[],
    ) {
        super()
        this.recorder = decorators?.find(d => d instanceof SessionRecorderDecorator) as SessionRecorderDecorator ?? null
    }

    async provide (): Promise<Command[]> {
        return [
            {
                id: 'terminal:toggle-recording',
                label: this.translate.instant('Toggle session recording'),
                icon: 'fas fa-circle',
                run: async () => {
                    const terminal = this.getActiveTerminal()
                    if (!terminal || !this.recorder) {
                        return
                    }
                    if (this.recorder.isRecording(terminal)) {
                        await this.recorder.stopRecording(terminal)
                    } else {
                        await this.recorder.startRecording(terminal)
                    }
                },
            },
            {
                id: 'terminal:open-recording',
                label: this.translate.instant('Open session recording'),
                icon: 'fas fa-film',
                run: async () => {
                    await this.openRecordingPicker()
                },
            },
        ]
    }

    private getActiveTerminal (): BaseTerminalTabComponent<any> | null {
        const tab = this.app.activeTab
        if (!tab) {
            return null
        }
        if (tab instanceof SplitTabComponent) {
            const focused = tab.getFocusedTab()
            if (focused instanceof BaseTerminalTabComponent) {
                return focused
            }
            return null
        }
        if (tab instanceof BaseTerminalTabComponent) {
            return tab
        }
        return null
    }

    private async openRecordingPicker (): Promise<void> {
        const home = process.env.HOME || process.env.USERPROFILE || ''
        const dirs = [
            path.join(home, '.config', 'tlink', 'recordings'),
            path.join(home, '.tlink', 'recordings'),
        ]

        const files: string[] = []
        for (const dir of dirs) {
            try {
                const entries = await fs.readdir(dir)
                for (const entry of entries) {
                    if (entry.endsWith('.tlink-recording')) {
                        files.push(path.join(dir, entry))
                    }
                }
            } catch {
                // Directory doesn't exist
            }
        }

        if (files.length === 0) {
            return
        }

        // Sort by modification time (newest first)
        const statsFiles = await Promise.all(
            files.map(async f => {
                try {
                    const stat = await fs.stat(f)
                    return { path: f, mtime: stat.mtime.getTime() }
                } catch {
                    return { path: f, mtime: 0 }
                }
            }),
        )
        statsFiles.sort((a, b) => b.mtime - a.mtime)

        // Open the most recent recording (could be enhanced with a selector)
        const filePath = statsFiles[0].path
        this.openReplayTab(filePath)
    }

    private openReplayTab (filePath: string): void {
        this.app.openNewTabRaw({
            type: SessionReplayTabComponent,
            inputs: { filePath },
        })
    }
}
