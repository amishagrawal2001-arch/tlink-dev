import { AfterViewInit, Component, ElementRef, Injector, OnDestroy, ViewChild } from '@angular/core'
import { AppService, CommandLocation, CommandProvider, ConfigProvider, HotkeyDescription, HotkeyProvider, HotkeysService, ProfilesService, SelectorService, SidePanelRegistration, SidePanelService } from 'tlink-core'
import { Session, LocalProfile } from 'tlink-local'
import { Terminal } from 'xterm'
import 'xterm/css/xterm.css'

@Component({
    selector: 'termcc-lite-panel',
    templateUrl: './termccLitePanel.component.pug',
    styleUrls: ['./termccLitePanel.component.scss'],
})
export class TermccLitePanelComponent implements AfterViewInit, OnDestroy {
    @ViewChild('termHost', { static: true }) termHost?: ElementRef<HTMLDivElement>
    selectedProfileName: string | null = null
    status = 'Idle'
    private term: Terminal | null = null
    private session: Session | null = null
    private resizeObserver: ResizeObserver | null = null
    private lastLocalProfile: LocalProfile | null = null

    constructor (
        private profiles: ProfilesService,
        private selector: SelectorService,
        private app: AppService,
        private injector: Injector,
    ) { }

    ngAfterViewInit (): void {
        this.initTerminal()
    }

    ngOnDestroy (): void {
        this.disposeSession()
        this.term?.dispose()
        this.resizeObserver?.disconnect()
    }

    private initTerminal (): void {
        if (this.term || !this.termHost?.nativeElement) {
            return
        }
        this.term = new Terminal({
            fontFamily: 'SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
            fontSize: 13,
            disableStdin: false,
            convertEol: true,
            cursorBlink: true,
        })
        this.term.open(this.termHost.nativeElement)
        this.term.focus()

        this.term.onData(data => {
            this.session?.feedFromTerminal(Buffer.from(data))
        })

        this.resizeObserver = new ResizeObserver(() => {
            this.term?.resize(100, 30) // simple static size; keeps panel predictable
        })
        this.resizeObserver.observe(this.termHost.nativeElement)
    }

    private disposeSession (): void {
        this.session?.destroy().catch(() => null)
        this.session = null
    }

    async attachProfile (): Promise<void> {
        const allProfiles = await this.profiles.getProfiles({ includeBuiltin: true })
        if (!allProfiles.length) {
            this.status = 'No profiles available'
            return
        }

        const options = allProfiles.map(p => {
            const option = this.profiles.selectorOptionForProfile(p)
            return {
                name: option.name ?? p.name,
                description: option.description,
                icon: option.icon,
                callback: async () => {
                    if (p.type !== 'local') {
                        const params = await this.profiles.newTabParametersForProfile(p)
                        if (params) {
                            await this.app.openNewTab(params)
                            this.status = `Opened ${p.name} in tab`
                            this.selectedProfileName = p.name
                        } else {
                            this.status = 'Unable to launch profile'
                        }
                        return
                    }
                    await this.startLocalProfile(p as LocalProfile)
                },
            }
        })

        await this.selector.show<void>('Select profile', options).catch(() => null)
    }

    async openLocalShell (): Promise<void> {
        this.status = 'Launching local shell...'
        const shells = (await this.profiles.getProfiles({ includeBuiltin: true })).filter(p => p.type === 'local')
        const shell = shells[0] as LocalProfile | undefined
        if (!shell) {
            this.status = 'No local shell found'
            return
        }
        await this.startLocalProfile(shell)
    }

    private async startLocalProfile (profile: LocalProfile): Promise<void> {
        this.disposeSession()
        this.initTerminal()
        if (!this.term) {
            this.status = 'Terminal not ready'
            return
        }
        this.session = new Session(this.injector)

        this.selectedProfileName = profile.name
        this.lastLocalProfile = profile
        this.status = `Connecting to ${profile.name}...`

        try {
            await this.session.start(profile.options)
            this.session.releaseInitialDataBuffer()
            this.session.binaryOutput$.subscribe(data => this.term!.write(data))
            this.session.output$.subscribe(data => this.term!.write(data))
            this.status = `Attached to ${profile.name}`
        } catch (e: any) {
            this.status = e?.message ?? 'Failed to start session'
            this.disposeSession()
        }
    }

    copySelection (): void {
        const text = this.term?.getSelection()
        if (!text) return
        navigator.clipboard?.writeText(text).catch(() => null)
    }

    clear (): void {
        this.term?.reset()
    }

    async openInFullTab (): Promise<void> {
        if (this.lastLocalProfile) {
            const params = await this.profiles.newTabParametersForProfile(this.lastLocalProfile)
            if (params) {
                await this.app.openNewTab(params)
            }
        }
    }
}

const PANEL: SidePanelRegistration = {
    id: 'termcc-lite',
    component: TermccLitePanelComponent,
    label: 'Termcc Lite',
    width: 360,
}

export class TermccLiteCommandProvider extends CommandProvider {
    constructor (
        private sidePanel: SidePanelService,
        hotkeys: HotkeysService,
    ) {
        super()
        this.sidePanel.register(PANEL)
        hotkeys.hotkey$.subscribe(id => {
            if (id === 'termcc-lite:toggle') {
                this.sidePanel.toggle(PANEL)
            }
        })
    }

    async provide () {
        return [{
            id: 'termcc-lite:toggle',
            label: 'Toggle Termcc Lite',
            locations: [CommandLocation.LeftToolbar, CommandLocation.StartPage],
            run: async () => this.sidePanel.toggle(PANEL),
        }]
    }
}

export class TermccLiteHotkeyProvider extends HotkeyProvider {
    async provide (): Promise<HotkeyDescription[]> {
        return [{
            id: 'termcc-lite:toggle',
            name: 'Termcc Lite: Toggle',
        }]
    }
}

export class TermccLiteConfigProvider extends ConfigProvider {
    defaults = {
        hotkeys: {
            'termcc-lite:toggle': ['Ctrl-Shift-L'],
        },
    }
}
