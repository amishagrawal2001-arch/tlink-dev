import { Injectable, NgZone, Injector } from '@angular/core'
import { isWindowsBuild, WIN_BUILD_FLUENT_BG_SUPPORTED, HostAppService, Platform, CLIHandler } from 'tlink-core'
import { ElectronService } from '../services/electron.service'

interface HostCLIEvent {
    argv: any
    cwd: string
    secondInstance: boolean
}

@Injectable({ providedIn: 'root' })
export class ElectronHostAppService extends HostAppService {
    get platform (): Platform {
        return this.configPlatform
    }

    get configPlatform (): Platform {
        return {
            win32: Platform.Windows,
            darwin: Platform.macOS,
            linux: Platform.Linux,
        }[process.platform]
    }

    constructor (
        private zone: NgZone,
        private electron: ElectronService,
        injector: Injector,
    ) {
        super(injector)

        electron.ipcRenderer.on('host:preferences-menu', () => this.zone.run(() => this.settingsUIRequest.next()))
        electron.ipcRenderer.on('host:command-window', () => this.zone.run(() => this.commandWindowRequest.next()))
        electron.ipcRenderer.on('host:command-window-bottom', () => this.zone.run(() => this.commandWindowBottomRequest.next()))
        electron.ipcRenderer.on('host:button-bar', () => this.zone.run(() => this.buttonBarToggleRequest.next()))
        electron.ipcRenderer.on('host:session-manager', () => this.zone.run(() => this.sessionManagerRequest.next()))
        electron.ipcRenderer.on('host:set-session-log-file', () => this.zone.run(() => this.sessionLogFileRequest.next()))
        electron.ipcRenderer.on('host:workspace-save', () => this.zone.run(() => this.workspaceSaveRequest.next()))
        electron.ipcRenderer.on('host:workspace-load', () => this.zone.run(() => this.workspaceLoadRequest.next()))
        electron.ipcRenderer.on('host:workspace-export', () => this.zone.run(() => this.workspaceExportRequest.next()))
        electron.ipcRenderer.on('host:workspace-import', () => this.zone.run(() => this.workspaceImportRequest.next()))
        electron.ipcRenderer.on('host:open-ai-assistant', (_$event, fullWindowMode?: boolean) => this.zone.run(() => {
            // Store the full window mode flag
            ;(window as any).__aiAssistantFullWindowMode = !!fullWindowMode
            ;(this as any)._aiAssistantFullWindowMode = fullWindowMode
            this.aiAssistantRequest.next()
        }))
        electron.ipcRenderer.on('host:open-code-editor', (_$event, fullWindowMode?: boolean) => this.zone.run(() => {
            ;(window as any).__codeEditorFullWindowMode = !!fullWindowMode
            this.openCodeEditorRequest.next()
        }))

        electron.ipcRenderer.on('cli', (_$event, argv: any, cwd: string, secondInstance: boolean) => this.zone.run(async () => {
            await this.dispatchCLIEvent(injector, { argv, cwd, secondInstance }, 'CLI arguments received')
        }))

        electron.ipcRenderer.on('host:open-shared-session-url', (_$event, url: string) => this.zone.run(async () => {
            const link = String(url ?? '').trim()
            if (!link) {
                return
            }
            await this.dispatchCLIEvent(injector, {
                argv: { _: [link] },
                cwd: process.cwd(),
                secondInstance: true,
            }, 'Protocol URL received')
        }))

        electron.ipcRenderer.on('host:config-change', () => this.zone.run(() => {
            this.configChangeBroadcast.next()
        }))

        if (isWindowsBuild(WIN_BUILD_FLUENT_BG_SUPPORTED)) {
            electron.ipcRenderer.send('window-set-disable-vibrancy-while-dragging', true)
        }
    }

    newWindow (): void {
        this.electron.ipcRenderer.send('app:new-window')
    }

    openCodeEditorWindow (): boolean {
        this.electron.ipcRenderer.send('app:open-code-editor-window')
        return true
    }

    async saveConfig (data: string): Promise<void> {
        await this.electron.ipcRenderer.invoke('app:save-config', data)
    }

    emitReady (): void {
        this.electron.ipcRenderer.send('app:ready')
    }

    relaunch (): void {
        const isPortable = !!process.env.PORTABLE_EXECUTABLE_FILE
        if (isPortable) {
            this.electron.app.relaunch({ execPath: process.env.PORTABLE_EXECUTABLE_FILE })
        } else {
            let args: string[] = []
            if (this.platform === Platform.Linux) {
                args = ['--no-sandbox']
            }
            this.electron.app.relaunch({ args })
        }
        this.electron.app.exit()
    }

    quit (): void {
        this.logger.info('Quitting')
        this.electron.app.quit()
    }

    private async dispatchCLIEvent (injector: Injector, event: HostCLIEvent, logPrefix: string): Promise<void> {
        this.logger.info(`${logPrefix}:`, event)

        const cliHandlers = injector.get(CLIHandler) as unknown as CLIHandler[]
        cliHandlers.sort((a, b) => b.priority - a.priority)

        let handled = false
        for (const handler of cliHandlers) {
            if (handled && handler.firstMatchOnly) {
                continue
            }
            if (await handler.handle(event)) {
                this.logger.info('CLI handler matched:', handler.constructor.name)
                handled = true
            }
        }
    }
}
