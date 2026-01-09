import { Component, Input } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

/** @hidden */
@Component({
    templateUrl: './colorPickerModal.component.pug',
})
export class ColorPickerModalComponent {
    @Input() title = ''
    @Input() value = '#3b82f6'
    @Input() canReset = false

    constructor (
        private modalInstance: NgbActiveModal,
    ) { }

    apply (): void {
        this.modalInstance.close({
            value: this.value,
            cleared: false,
        })
    }

    reset (): void {
        this.modalInstance.close({
            value: null,
            cleared: true,
        })
    }

    cancel (): void {
        this.modalInstance.dismiss()
    }
}
