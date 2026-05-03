import { Component, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { BaseComponent } from 'tlink-core'
import { NetworkPlatformService, NETWORK_PLATFORMS, NetworkPlatform } from '../services/networkPlatform.service'
import { NetworkSnippet, getSnippetsForPlatform } from '../services/networkSnippets'

/**
 * Vendor-aware command-snippet picker.
 *
 * Opens via:
 *   - the SSH tab toolbar (network icon)
 *   - the global hotkey "ssh-snippets" registered in hotkeys.ts
 *
 * Resolves the active SSH session's detected platform, scopes snippets
 * to that platform by default, and offers an override dropdown to
 * show snippets for any other vendor (useful when auto-detect missed
 * or when the user wants to copy a command across platforms).
 *
 * Returns the chosen snippet's template via the modal close. The caller
 * paste it into the active terminal — the modal itself doesn't touch
 * the session, keeping it reusable in non-SSH contexts (snippet copy,
 * future config-store integration).
 */
@Component({
    templateUrl: './networkSnippetsModal.component.pug',
    styleUrls: ['./networkSnippetsModal.component.scss'],
})
export class NetworkSnippetsModalComponent extends BaseComponent implements OnInit {
    /** Stable id of the SSH session we were opened from. Used to read
     *  the auto-detected platform. Caller sets this before showing. */
    sessionId: string | null = null

    /** Currently-selected platform for snippet scoping. Initialized
     *  from the detected platform; user can switch via the dropdown. */
    selectedPlatformId = 'generic'

    /** All known platforms — populates the override dropdown. */
    readonly allPlatforms: NetworkPlatform[] = NETWORK_PLATFORMS

    /** Search filter, case-insensitive substring on label/description. */
    searchQuery = ''

    /** Currently-visible snippets — recomputed when platform / search
     *  changes. Captured into a field so the template doesn't run the
     *  filter on every CD pass. */
    visibleSnippets: NetworkSnippet[] = []

    /** Highlighted row for keyboard navigation. */
    highlightIndex = 0

    constructor (
        private modalInstance: NgbActiveModal,
        private platformService: NetworkPlatformService,
    ) {
        super()
    }

    ngOnInit (): void {
        // Initialize the platform from auto-detection (or fall back
        // to 'generic'). The user can switch via the dropdown.
        if (this.sessionId) {
            const detected = this.platformService.getPlatform(this.sessionId)
            if (detected) {
                this.selectedPlatformId = detected.id
            }
        }
        this.refresh()
    }

    refresh (): void {
        const all = getSnippetsForPlatform(this.selectedPlatformId)
        const q = this.searchQuery.trim().toLowerCase()
        this.visibleSnippets = q
            ? all.filter(s =>
                s.label.toLowerCase().includes(q) ||
                s.description.toLowerCase().includes(q) ||
                (s.tags ?? []).some(t => t.toLowerCase().includes(q)),
            )
            : all
        this.highlightIndex = 0
    }

    onPlatformChange (): void {
        this.refresh()
    }

    onSearchInput (): void {
        this.refresh()
    }

    onKeydown (event: KeyboardEvent): void {
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            if (!this.visibleSnippets.length) {return}
            this.highlightIndex = (this.highlightIndex + 1) % this.visibleSnippets.length
        } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            if (!this.visibleSnippets.length) {return}
            this.highlightIndex = (this.highlightIndex - 1 + this.visibleSnippets.length) % this.visibleSnippets.length
        } else if (event.key === 'Enter') {
            event.preventDefault()
            const pick = this.visibleSnippets[this.highlightIndex] as NetworkSnippet | undefined
            if (pick) {
                this.choose(pick)
            }
        } else if (event.key === 'Escape') {
            event.preventDefault()
            this.cancel()
        }
    }

    /** Returns the platform metadata for the currently-selected id. */
    get selectedPlatform (): NetworkPlatform | null {
        return this.allPlatforms.find(p => p.id === this.selectedPlatformId) ?? null
    }

    /** True when auto-detect matched something — the dropdown shows
     *  a small "(detected)" hint next to that platform. */
    isDetectedPlatform (platformId: string): boolean {
        if (!this.sessionId) {return false}
        const detected = this.platformService.getPlatform(this.sessionId)
        return detected?.id === platformId
    }

    choose (snippet: NetworkSnippet): void {
        this.modalInstance.close({ snippet })
    }

    cancel (): void {
        this.modalInstance.close(null)
    }
}
