import { Component, Input, ViewChild, ElementRef } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

/** @hidden */
@Component({
    templateUrl: './promptModal.component.pug',
    styleUrls: ['./promptModal.component.scss'],
})
export class PromptModalComponent {
    @Input() value: string
    @Input() prompt: string|undefined
    @Input() password: boolean
    @Input() remember: boolean
    @Input() showRememberCheckbox: boolean
    @Input() secondaryValue: string
    @Input() secondaryPrompt: string|undefined
    @Input() secondaryPassword: boolean
    @Input() secondaryPlaceholder: string|undefined
    @Input() focusSecondary: boolean
    showPassword = false
    showSecondaryPassword = false
    @ViewChild('primaryInput') primaryInput: ElementRef
    @ViewChild('secondaryInput') secondaryInput?: ElementRef

    constructor (
        private modalInstance: NgbActiveModal,
    ) { }

    ngOnInit (): void {
        this.showPassword = !this.password
        this.showSecondaryPassword = !this.secondaryPassword
        setTimeout(() => {
            const target = this.focusSecondary && this.secondaryInput ? this.secondaryInput : this.primaryInput
            target?.nativeElement?.focus()
        })
    }

    ok (): void {
        this.modalInstance.close({
            value: this.value,
            remember: this.remember,
            secondaryValue: this.secondaryValue,
        })
    }

    cancel (): void {
        this.modalInstance.close(null)
    }
}
