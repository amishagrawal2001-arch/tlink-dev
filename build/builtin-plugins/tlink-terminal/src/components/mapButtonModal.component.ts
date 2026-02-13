import { Component, Input, ViewChild, ElementRef } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import type { TerminalButtonBarAction, TerminalButtonBarButton } from '../api/interfaces'

interface ButtonOption {
    value: string
    label: string
}

@Component({
    templateUrl: './mapButtonModal.component.pug',
    styleUrls: ['./mapButtonModal.component.scss'],
})
export class MapButtonModalComponent {
    @Input() button: TerminalButtonBarButton | null = null
    @ViewChild('fileInput') fileInput: ElementRef<HTMLInputElement>

    model: TerminalButtonBarButton = this.defaultModel()
    actionOptions: ButtonOption[] = [
        { value: 'send-string', label: 'Send String' },
        { value: 'run-script', label: 'Push Script (Device)' },
        { value: 'run-local', label: 'Run Script (Local)' },
    ]
    colorOptions: ButtonOption[] = [
        { value: 'default', label: 'Default' },
        { value: 'primary', label: 'Blue' },
        { value: 'success', label: 'Green' },
        { value: 'warning', label: 'Yellow' },
        { value: 'danger', label: 'Red' },
        { value: 'info', label: 'Teal' },
    ]

    constructor (public modalInstance: NgbActiveModal) { }

    ngOnInit (): void {
        if (this.button) {
            this.model = {
                ...this.defaultModel(),
                ...this.button,
            }
        }
    }

    get isSendString (): boolean {
        return this.model.action === 'send-string'
    }

    get isRunScript (): boolean {
        return this.model.action === 'run-script'
    }

    get isRunLocal (): boolean {
        return this.model.action === 'run-local'
    }

    onActionChange (value: TerminalButtonBarAction): void {
        this.model.action = value
    }

    ok (): void {
        this.model.label = (this.model.label ?? '').trim()
        this.model.command = this.model.command ?? ''
        this.model.description = (this.model.description ?? '').trim()
        this.model.scriptArgs = (this.model.scriptArgs ?? '').trim()
        this.modalInstance.close(this.model)
    }

    cancel (): void {
        this.modalInstance.dismiss()
    }

    onScriptKeydown (event: KeyboardEvent): void {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
            event.stopPropagation()
        }
    }

    browseFile (): void {
        this.fileInput?.nativeElement?.click()
    }

    onFileSelected (event: Event): void {
        const input = event.target as HTMLInputElement
        const file = input.files?.[0]
        if (!file) {
            return
        }
        const loweredName = file.name.toLowerCase()
        if (this.model.action === 'send-string') {
            if (loweredName.endsWith('.py') || loweredName.endsWith('.sh') || loweredName.endsWith('.script')) {
                this.model.action = 'run-script'
            }
        }
        const reader = new FileReader()
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : ''
            this.model.command = result
            this.model.sourceFileName = file.name
            if (!this.model.label.trim()) {
                this.model.label = file.name.replace(/\.[^/.]+$/, '')
            }
        }
        reader.readAsText(file)
        input.value = ''
    }

    private defaultModel (): TerminalButtonBarButton {
        return {
            label: '',
            command: '',
            color: 'default',
            appendEnter: true,
            action: 'send-string',
            description: '',
            disableTooltip: false,
            sourceFileName: '',
            scriptArgs: '',
        }
    }
}
