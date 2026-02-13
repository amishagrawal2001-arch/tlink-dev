import { Component, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
    selector: 'app-password-prompt',
    templateUrl: './password-prompt.component.html',
    styleUrls: ['./password-prompt.component.scss']
})
export class PasswordPromptComponent {
    @Input() title: string = 'Password verification';
    password = '';
    errorMessage = '';

    constructor(public activeModal: NgbActiveModal) {}

    submit(): void {
        if (this.password) {
            this.activeModal.close(this.password);
        } else {
            this.errorMessage = 'Please enter a password';
        }
    }

    cancel(): void {
        this.activeModal.dismiss('cancel');
    }
}
