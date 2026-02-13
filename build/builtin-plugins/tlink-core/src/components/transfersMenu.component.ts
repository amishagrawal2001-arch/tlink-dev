import { Component, Input, Output, EventEmitter, HostBinding, OnInit, OnDestroy, ElementRef, NgZone } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { FileDownload, FileTransfer, PlatformService } from '../api/platform'

/** @hidden */
@Component({
    selector: 'transfers-menu',
    templateUrl: './transfersMenu.component.pug',
    styleUrls: ['./transfersMenu.component.scss'],
})
export class TransfersMenuComponent implements OnInit, OnDestroy {
    @HostBinding('class.transfers-floating') floating = false
    @HostBinding('class.transfers-floating-positioned') get hasCustomPosition (): boolean {
        return this.floating && this.left !== null && this.top !== null
    }
    @HostBinding('style.left.px') left: number|null = null
    @HostBinding('style.top.px') top: number|null = null
    @Input() transfers: FileTransfer[]
    @Output() transfersChange = new EventEmitter<FileTransfer[]>()
    @Output() floatingChange = new EventEmitter<boolean>()
    private dragOffsetX = 0
    private dragOffsetY = 0
    private dragging = false
    private dragMoveHandler: ((event: MouseEvent) => void)|null = null
    private dragUpHandler: (() => void)|null = null

    constructor (
        private platform: PlatformService,
        private translate: TranslateService,
        private element: ElementRef<HTMLElement>,
        private zone: NgZone,
    ) { }

    ngOnInit (): void {
        this.floating = window.localStorage['transfersFloating'] === '1'
        const saved = window.localStorage['transfersFloatingPos']
        if (this.floating && saved) {
            try {
                const parsed = JSON.parse(saved)
                if (typeof parsed?.left === 'number' && typeof parsed?.top === 'number') {
                    this.left = parsed.left
                    this.top = parsed.top
                }
            } catch {
                // ignore invalid persisted position
            }
        }
        this.floatingChange.emit(this.floating)
    }

    ngOnDestroy (): void {
        this.stopDrag()
    }

    isDownload (transfer: FileTransfer): boolean {
        return transfer instanceof FileDownload
    }

    getProgress (transfer: FileTransfer): number {
        const total = transfer.getSize()
        if (!total) {
            return 0
        }
        return Math.round(100 * transfer.getCompletedBytes() / total)
    }

    getProgressLabel (transfer: FileTransfer): string {
        const total = transfer.getSize()
        const completed = transfer.getCompletedBytes()
        if (!total) {
            return `${this.translate.instant('Downloaded')} ${this.formatBytes(completed)}`
        }
        return `${this.formatBytes(completed)} / ${this.formatBytes(total)}`
    }

    private formatBytes (bytes: number): string {
        if (!bytes) {
            return this.translate.instant('0 B')
        }
        const units = ['B', 'KB', 'MB', 'GB', 'TB']
        let value = bytes
        let unitIndex = 0
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024
            unitIndex++
        }
        const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2
        return `${value.toFixed(precision)} ${units[unitIndex]}`
    }

    showTransfer (transfer: FileTransfer): void {
        const fp = transfer['filePath']
        if (fp) {
            this.platform.showItemInFolder(fp)
        }
    }

    removeTransfer (transfer: FileTransfer): void {
        if (!transfer.isComplete()) {
            transfer.cancel()
        }
        this.transfers = this.transfers.filter(x => x !== transfer)
        this.transfersChange.emit(this.transfers)
    }

    async removeAll (): Promise<void> {
        if (this.transfers.some(x => !x.isComplete())) {
            if ((await this.platform.showMessageBox({
                type: 'warning',
                message: this.translate.instant('There are active file transfers'),
                buttons: [
                    this.translate.instant('Abort all'),
                    this.translate.instant('Do not abort'),
                ],
                defaultId: 1,
                cancelId: 1,
            })).response === 1) {
                return
            }
        }
        for (const t of this.transfers) {
            this.removeTransfer(t)
        }
    }

    toggleFloating (): void {
        this.floating = !this.floating
        window.localStorage['transfersFloating'] = this.floating ? '1' : '0'
        if (!this.floating) {
            this.left = null
            this.top = null
            window.localStorage.removeItem('transfersFloatingPos')
        }
        this.floatingChange.emit(this.floating)
    }

    startDrag (event: MouseEvent): void {
        if (!this.floating || event.button !== 0) {
            return
        }
        const target = event.target as HTMLElement | null
        if (target?.closest('button')) {
            return
        }
        event.preventDefault()
        event.stopPropagation()

        const rect = this.element.nativeElement.getBoundingClientRect()
        if (this.left === null || this.top === null) {
            this.left = rect.left
            this.top = rect.top
        }
        this.dragOffsetX = event.clientX - (this.left ?? rect.left)
        this.dragOffsetY = event.clientY - (this.top ?? rect.top)
        this.dragging = true

        this.dragMoveHandler = moveEvent => this.onDrag(moveEvent)
        this.dragUpHandler = () => this.stopDrag()
        document.addEventListener('mousemove', this.dragMoveHandler)
        document.addEventListener('mouseup', this.dragUpHandler)
    }

    private onDrag (event: MouseEvent): void {
        if (!this.dragging) {
            return
        }
        const rect = this.element.nativeElement.getBoundingClientRect()
        const maxLeft = Math.max(8, window.innerWidth - rect.width - 8)
        const maxTop = Math.max(8, window.innerHeight - rect.height - 8)
        const nextLeft = Math.min(maxLeft, Math.max(8, event.clientX - this.dragOffsetX))
        const nextTop = Math.min(maxTop, Math.max(8, event.clientY - this.dragOffsetY))
        this.zone.run(() => {
            this.left = nextLeft
            this.top = nextTop
        })
    }

    private stopDrag (): void {
        if (this.dragMoveHandler) {
            document.removeEventListener('mousemove', this.dragMoveHandler)
        }
        if (this.dragUpHandler) {
            document.removeEventListener('mouseup', this.dragUpHandler)
        }
        this.dragMoveHandler = null
        this.dragUpHandler = null
        if (this.dragging && this.left !== null && this.top !== null) {
            window.localStorage['transfersFloatingPos'] = JSON.stringify({ left: this.left, top: this.top })
        }
        this.dragging = false
    }
}
