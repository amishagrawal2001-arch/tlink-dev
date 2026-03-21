import { Component } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
    selector: 'whats-new-modal',
    template: `
        <div class="modal-header">
            <h5 class="modal-title">
                <i class="fas fa-sparkles"></i>
                What's New in {{ version }}
            </h5>
            <button class="close" type="button" (click)="close()">
                <span>&times;</span>
            </button>
        </div>
        <div class="modal-body">
            <div class="release-notes" *ngIf="releaseNotes">
                <pre class="notes-content">{{ releaseNotes }}</pre>
            </div>
            <div class="no-notes" *ngIf="!releaseNotes">
                <p>Tlink has been updated to version {{ version }}.</p>
                <p>Check the release notes on GitHub for details.</p>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-primary" (click)="close()">Got it</button>
        </div>
    `,
    styles: [`
        .modal-header { border-bottom: 1px solid rgba(128,128,128,0.2); }
        .modal-title i { margin-right: 8px; color: #f59e0b; }
        .release-notes { max-height: 400px; overflow-y: auto; }
        .notes-content {
            white-space: pre-wrap;
            word-wrap: break-word;
            font-size: 13px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: transparent;
            border: none;
            padding: 0;
            margin: 0;
        }
        .no-notes p { margin-bottom: 8px; font-size: 14px; }
    `],
})
export class WhatsNewModalComponent {
    version = ''
    releaseNotes = ''

    constructor (private activeModal: NgbActiveModal) {}

    close (): void {
        this.activeModal.close()
    }
}
