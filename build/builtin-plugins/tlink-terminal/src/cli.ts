import shellQuote from 'shell-quote'
import { Injectable } from '@angular/core'
import {
    CLIHandler as CoreCLIHandler,
    CLIEvent,
    AppService,
    HostWindowService,
    ParsedShareSessionBundleLink,
    ParsedShareSessionLink,
    SessionSharingService,
    SplitTabComponent,
} from 'tlink-core'
import { BaseTerminalTabComponent } from './api/baseTerminalTab.component'
import { SharedSessionTabComponent } from './components/sharedSessionTab.component'

// Fallback base class to avoid runtime crashes if the core export is undefined
const CLIHandlerRuntime = (CoreCLIHandler ?? class {}) as typeof CoreCLIHandler

@Injectable()
export class TerminalCLIHandler extends CLIHandlerRuntime {
    firstMatchOnly = true
    priority = 0

    private readonly shareOpenDedupeWindowMs = 3000
    private recentlyOpenedShares = new Map<string, number>()

    constructor (
        private app: AppService,
        private hostWindow: HostWindowService,
        private sessionSharing: SessionSharingService,
    ) {
        super()
    }

    async handle (event: CLIEvent): Promise<boolean> {
        const op = event.argv._[0]

        if (op === 'paste') {
            let text = event.argv.text
            if (event.argv.escape) {
                text = shellQuote.quote([text])
            }
            this.handlePaste(text)
            return true
        }

        const shareUrl = this.extractShareUrl(event)
        if (shareUrl) {
            return this.handleJoinSharedSession(shareUrl)
        }

        return false
    }

    private handlePaste (text: string) {
        if (this.app.activeTab instanceof BaseTerminalTabComponent && this.app.activeTab.session) {
            this.app.activeTab.sendInput(text)
            this.hostWindow.bringToFront()
        }
    }

    private extractShareUrl (event: CLIEvent): string | null {
        const args = event.argv?._ ?? []
        const first = String(args[0] ?? '')

        if (first.startsWith('tlink://share/')) {
            return first
        }

        for (const arg of args) {
            const value = String(arg ?? '')
            if (value.startsWith('tlink://share/')) {
                return value
            }
        }

        if (first === 'share' || first === 'join-shared-session') {
            const maybeUrl = String(args[1] ?? '')
            if (maybeUrl.startsWith('tlink://share/')) {
                return maybeUrl
            }
        }

        return null
    }

    private handleJoinSharedSession (shareUrl: string): boolean {
        const normalizedShareUrl = String(shareUrl ?? '').trim()
        const parsedBundle = this.sessionSharing.parseShareBundleUrl(normalizedShareUrl)
        if (parsedBundle) {
            return this.handleJoinSharedSessionBundle(parsedBundle)
        }

        const parsedLink = this.sessionSharing.parseShareUrl(normalizedShareUrl)
        if (!parsedLink) {
            return false
        }
        return this.openSharedSessionTab(normalizedShareUrl, parsedLink, true)
    }

    private handleJoinSharedSessionBundle (bundle: ParsedShareSessionBundleLink): boolean {
        let handled = false
        for (const session of bundle.sessions) {
            if (this.openSharedSessionTab(session.shareUrl, session, false)) {
                handled = true
            }
        }
        if (handled) {
            this.hostWindow.bringToFront()
        }
        return handled
    }

    private openSharedSessionTab (shareUrl: string, parsedLink: ParsedShareSessionLink, focusWindow: boolean): boolean {
        const existing = this.findOpenSharedSessionTab(parsedLink)
        if (existing) {
            this.app.selectTab(existing)
            if (!existing.session?.open) {
                void existing.reconnectSharedSession()
            }
            if (focusWindow) {
                this.hostWindow.bringToFront()
            }
            return true
        }

        const dedupeKey = this.getShareDedupeKey(parsedLink)
        if (this.wasShareRecentlyOpened(dedupeKey)) {
            if (focusWindow) {
                this.hostWindow.bringToFront()
            }
            return true
        }
        this.markShareOpened(dedupeKey)

        const tab = this.app.openNewTabRaw({
            type: SharedSessionTabComponent,
            inputs: {
                shareUrl,
                parsedLink,
            },
        })
        this.app.selectTab(tab)
        if (focusWindow) {
            this.hostWindow.bringToFront()
        }
        return true
    }

    private findOpenSharedSessionTab (parsedLink: ParsedShareSessionLink): SharedSessionTabComponent | null {
        for (const tab of this.getAllTabs()) {
            if (!(tab instanceof SharedSessionTabComponent)) {
                continue
            }
            const openLink = tab.parsedLink ?? this.sessionSharing.parseShareUrl(tab.shareUrl)
            if (!openLink) {
                continue
            }
            if (openLink.sessionId === parsedLink.sessionId && openLink.wsUrl === parsedLink.wsUrl) {
                return tab
            }
        }
        return null
    }

    private getAllTabs (): any[] {
        const allTabs: any[] = []
        for (const topLevelTab of this.app.tabs) {
            if (topLevelTab instanceof SplitTabComponent) {
                allTabs.push(...topLevelTab.getAllTabs())
            } else {
                allTabs.push(topLevelTab)
            }
        }
        return allTabs
    }

    private getShareDedupeKey (parsedLink: ParsedShareSessionLink): string {
        return `${parsedLink.wsUrl}|${parsedLink.sessionId}|${parsedLink.token}`
    }

    private wasShareRecentlyOpened (key: string): boolean {
        this.pruneRecentlyOpenedShares()
        const timestamp = this.recentlyOpenedShares.get(key)
        if (!timestamp) {
            return false
        }
        return Date.now() - timestamp < this.shareOpenDedupeWindowMs
    }

    private markShareOpened (key: string): void {
        this.pruneRecentlyOpenedShares()
        this.recentlyOpenedShares.set(key, Date.now())
    }

    private pruneRecentlyOpenedShares (): void {
        const cutoff = Date.now() - this.shareOpenDedupeWindowMs
        for (const [key, timestamp] of this.recentlyOpenedShares.entries()) {
            if (timestamp < cutoff) {
                this.recentlyOpenedShares.delete(key)
            }
        }
    }
}
