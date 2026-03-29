import { Injectable } from '@angular/core'
import { ToastrService } from 'ngx-toastr'

@Injectable({ providedIn: 'root' })
export class NotificationsService {
    private constructor (
        private toastr: ToastrService,
    ) { }

    notice (text: string): void {
        this.toastr.info(text, undefined, {
            timeOut: 1000,
        })
    }

    info (text: string, details?: string): void {
        this.toastr.info(text, details)
    }

    error (text: string, details?: string): void {
        this.toastr.error(text, details)
    }

    /** Show a toast that triggers a callback when clicked. */
    actionable (text: string, actionHint: string, callback: () => void, timeOut = 15000): void {
        const toast = this.toastr.info(text, actionHint, {
            timeOut,
            closeButton: true,
            tapToDismiss: true,
        })
        toast.onTap.subscribe(() => callback())
    }
}
