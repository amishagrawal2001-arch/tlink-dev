import { Component, OnInit, OnDestroy } from '@angular/core'
import { Subscription } from 'rxjs'
import { UpdaterService } from 'tlink-core'
import { ElectronUpdaterService } from '../services/updater.service'

@Component({
    selector: 'update-banner',
    template: `
        <div class="update-banner" *ngIf="showBanner">
            <div class="update-banner-content">
                <i class="fas fa-arrow-circle-up"></i>
                <span class="update-text">
                    Update {{ updateVersion }} is available
                </span>
                <div class="update-progress" *ngIf="downloadProgress >= 0 && downloadProgress < 100">
                    <div class="progress-bar" [style.width.%]="downloadProgress"></div>
                </div>
                <span class="download-complete" *ngIf="downloadProgress >= 100">
                    Ready to install
                </span>
            </div>
            <div class="update-banner-actions">
                <button class="btn btn-sm btn-primary" (click)="installUpdate()">
                    {{ downloadProgress >= 100 ? 'Install & Restart' : 'Update' }}
                </button>
                <button class="btn btn-sm btn-link" (click)="dismiss()">Later</button>
            </div>
        </div>
    `,
    styles: [`
        .update-banner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 16px;
            background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
            color: white;
            font-size: 13px;
            z-index: 100;
        }
        .update-banner-content {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
        }
        .update-banner-content i { font-size: 16px; }
        .update-progress {
            width: 120px;
            height: 4px;
            background: rgba(255,255,255,0.3);
            border-radius: 2px;
            overflow: hidden;
        }
        .progress-bar {
            height: 100%;
            background: white;
            transition: width 0.3s;
        }
        .download-complete { font-weight: 600; }
        .update-banner-actions {
            display: flex;
            gap: 4px;
        }
        .update-banner-actions .btn-link {
            color: rgba(255,255,255,0.8);
            text-decoration: none;
            font-size: 12px;
        }
    `],
})
export class UpdateBannerComponent implements OnInit, OnDestroy {
    showBanner = false
    updateVersion = ''
    downloadProgress = -1
    private subs: Subscription[] = []

    constructor (private updater: UpdaterService) {}

    ngOnInit (): void {
        if (this.updater instanceof ElectronUpdaterService) {
            const eu = this.updater as ElectronUpdaterService
            this.subs.push(eu.updateAvailable$.subscribe(available => {
                this.showBanner = available
            }))
            this.subs.push(eu.updateVersion$.subscribe(version => {
                this.updateVersion = version
            }))
            this.subs.push(eu.downloadProgress$.subscribe(progress => {
                this.downloadProgress = progress
            }))
        }
    }

    ngOnDestroy (): void {
        this.subs.forEach(s => s.unsubscribe())
    }

    async installUpdate (): Promise<void> {
        await this.updater.update()
    }

    dismiss (): void {
        this.showBanner = false
    }
}
