import { Component, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

/**
 * Generic searchable in-app help / quick-reference modal.
 *
 * Lives in tlink-ssh because SSH is already a peerDep of the
 * transport plugins (telnet, serial) that reuse the network-vendor
 * snippet picker — adding the help dialog here lets all three share
 * one component without inventing a new common module. Each plugin
 * defines its own content (sections / items) and passes it in via
 * the modal-instance fields before showing.
 *
 * The shape mirrors the api-client's help: items grouped into
 * sections, search filters across labels / how-tos / details / hidden
 * keywords, sections with no matching items hide entirely so the
 * visible list stays tight.
 */

export interface HelpItem {
    /** Short label — what the user is trying to do. */
    label: string
    /** How to do it (hotkey, click path, or short prose). */
    howto: string
    /** Optional one-line clarification. */
    detail?: string
    /** Lowercased keywords for the search filter. Match here even
     *  if label / howto / detail don't mention the term — useful for
     *  vocabulary the user might know by another name. */
    keywords?: string
}

export interface HelpSection {
    title: string
    /** FontAwesome icon class (without the `fa-` prefix). */
    icon: string
    items: HelpItem[]
}

export interface HelpContent {
    /** Title shown in the modal header — usually "<plugin> — quick reference". */
    title: string
    /** Short tagline shown under the search box. Optional. */
    tagline?: string
    sections: HelpSection[]
}

@Component({
    templateUrl: './helpModal.component.pug',
    styleUrls: ['./helpModal.component.scss'],
})
export class HelpModalComponent implements OnInit {
    /** Set by the caller before showing the modal. */
    content: HelpContent = { title: 'Help', sections: [] }
    query = ''

    constructor (private modalInstance: NgbActiveModal) {}

    ngOnInit (): void {
        // No-op — input fields are set on the modalRef.componentInstance
        // before the modal renders, so we don't need to defer anything.
    }

    visibleSections (): HelpSection[] {
        const q = this.query.trim().toLowerCase()
        if (!q) {
            return this.content.sections
        }
        const out: HelpSection[] = []
        for (const sec of this.content.sections) {
            const items = sec.items.filter(it => this.matches(it, sec.title, q))
            if (items.length) {
                out.push({ ...sec, items })
            }
        }
        return out
    }

    private matches (it: HelpItem, sectionTitle: string, q: string): boolean {
        return it.label.toLowerCase().includes(q)
            || it.howto.toLowerCase().includes(q)
            || (it.detail?.toLowerCase().includes(q) ?? false)
            || (it.keywords?.toLowerCase().includes(q) ?? false)
            || sectionTitle.toLowerCase().includes(q)
    }

    close (): void {
        this.modalInstance.close(null)
    }
}
