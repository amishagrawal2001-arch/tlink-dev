import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewInit } from '@angular/core'
import { KeyboardInteractivePrompt } from '../session/ssh'
import { SSHProfile } from '../api'
import { PasswordStorageService } from '../services/passwordStorage.service'

@Component({
    selector: 'keyboard-interactive-auth-panel',
    templateUrl: './keyboardInteractiveAuthPanel.component.pug',
    styleUrls: ['./keyboardInteractiveAuthPanel.component.scss'],
})
export class KeyboardInteractiveAuthComponent implements AfterViewInit {
    @Input() profile: SSHProfile
    @Input() prompt: KeyboardInteractivePrompt
    @Input() username?: string
    @Input() step = 0
    @Output() done = new EventEmitter()
    @ViewChild('input') input: ElementRef
    remember = false

    constructor (private passwordStorage: PasswordStorageService) {}

    ngAfterViewInit (): void {
        setTimeout(() => {
            this.input?.nativeElement?.focus()
        }, 100)
    }

    onInputClick (): void {
        // Ensure input receives focus when clicked
        if (this.input?.nativeElement) {
            this.input.nativeElement.focus()
        }
    }

    isPassword (): boolean {
        return this.prompt.isAPasswordPrompt(this.step)
    }

    previous (): void {
        if (this.step > 0) {
            this.step--
        }
        this.input.nativeElement.focus()
    }

    async next (): Promise<void> {
        if (this.isPassword() && this.remember) {
            const username = this.username?.trim() || undefined
            await this.passwordStorage.savePassword(this.profile, this.prompt.responses[this.step], username)
        }

        if (this.step === this.prompt.prompts.length - 1) {
            this.prompt.respond()
            this.done.emit()
            return
        }
        this.step++
        this.input.nativeElement.focus()
    }
}
