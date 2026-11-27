import { Component, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { SecretMatch } from '../../utils/secret-scrubber';

/**
 * Three-outcome confirmation shown before a prompt containing possible
 * secrets is sent to a cloud/custom provider:
 *   - redact : replace secrets with [REDACTED:...] placeholders, then send
 *   - keep   : send as-is (user opts into the risk, message flagged)
 *   - cancel : abort the send entirely
 */
export type SecretScrubChoice = 'redact' | 'keep' | 'cancel';

@Component({
    selector: 'app-secret-scrub-confirm-dialog',
    templateUrl: './secret-scrub-confirm-dialog.component.html',
    styleUrls: ['./secret-scrub-confirm-dialog.component.scss'],
})
export class SecretScrubConfirmDialogComponent {
    @Input() providerLabel = '';
    @Input() host = '';
    @Input() matches: SecretMatch[] = [];

    constructor(public activeModal: NgbActiveModal) {}

    get previewMatches(): SecretMatch[] {
        return this.matches.slice(0, 5);
    }

    get overflowCount(): number {
        return Math.max(0, this.matches.length - this.previewMatches.length);
    }

    get summary(): string {
        const counts = new Map<string, number>();
        for (const m of this.matches) {
            counts.set(m.label, (counts.get(m.label) || 0) + 1);
        }
        const parts: string[] = [];
        for (const [label, n] of counts) {
            parts.push(n === 1 ? `1 ${label}` : `${n} ${label}s`);
        }
        return parts.join(', ');
    }

    redact(): void {
        this.activeModal.close('redact' as SecretScrubChoice);
    }

    keep(): void {
        this.activeModal.close('keep' as SecretScrubChoice);
    }

    cancel(): void {
        this.activeModal.dismiss('cancel');
    }
}
