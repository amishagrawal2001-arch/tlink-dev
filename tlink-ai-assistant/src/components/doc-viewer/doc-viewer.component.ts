import { Component, Input, OnInit, SecurityContext } from '@angular/core'
import { DomSanitizer, SafeHtml } from '@angular/platform-browser'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { marked } from 'marked'

/**
 * Renders a markdown string inside an ng-bootstrap modal. Used for bundled
 * docs (e.g. README-vllm.md) so the app doesn't depend on filesystem paths
 * that exist in the source tree but not in the packaged .app bundle.
 *
 * Callers import the markdown at build time via webpack's `asset/source`
 * rule and pass it in as the `markdown` input when opening the modal:
 *
 *     import vllmGuide from '../../../README-vllm.md'
 *     const ref = this.modal.open(DocViewerComponent, { size: 'lg', scrollable: true })
 *     ref.componentInstance.title = 'vLLM setup guide'
 *     ref.componentInstance.markdown = vllmGuide
 */
@Component({
    selector: 'app-doc-viewer',
    templateUrl: './doc-viewer.component.html',
    styleUrls: ['./doc-viewer.component.scss'],
})
export class DocViewerComponent implements OnInit {
    @Input() title = 'Documentation'
    @Input() markdown = ''

    rendered: SafeHtml = ''

    constructor (
        public activeModal: NgbActiveModal,
        private sanitizer: DomSanitizer,
    ) {}

    ngOnInit (): void {
        // marked v4 is sync when called with a plain string (no async extensions).
        // First line of defence: tell marked to NOT pass raw HTML through.
        // The `html` renderer override replaces any inline HTML block in the
        // source markdown with its escaped text form, so even if a doc gets
        // a <script> sneaked in during a future edit it never reaches the DOM.
        // Second line of defence: DomSanitizer strips anything marked missed
        // (event handlers, javascript: URIs, <iframe>, <object>, <embed>).
        const renderer = new marked.Renderer()
        // marked ≥ v5 passes a token object with { text } — earlier v4 passed
        // the raw string. Our installed runtime is v17; type the parameter
        // loosely with `any` to stay compatible across both shapes.
        renderer.html = (token: any) => this.escapeHtml((token?.text ?? token ?? '') as string)
        const parsed = marked.parse(this.markdown ?? '', {
            renderer,
            breaks: true,
            gfm: true,
        }) as string
        this.rendered = this.sanitizer.sanitize(SecurityContext.HTML, parsed) ?? ''
    }

    private escapeHtml (s: string): string {
        return (s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
    }

    close (): void {
        this.activeModal.dismiss('close')
    }
}
