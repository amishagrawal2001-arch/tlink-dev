import { Component } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { importCurl } from '../services/curl'
import { importPostman, importOpenAPI, FullImportResult } from '../services/importers'
import { APIClientOptions } from '../api/interfaces'

/**
 * One modal, three import flavors. We let the user pick the type
 * (cURL / Postman / OpenAPI) and paste the source — single textarea
 * keeps the UI simple, and parsers reject mismatched payloads with a
 * useful message.
 *
 * Result shape (returned via close):
 *   - cURL    →  { kind: 'curl', options }
 *   - Postman →  { kind: 'collection', result }
 *   - OpenAPI →  { kind: 'collection', result }
 */
export type ImportKind = 'curl' | 'postman' | 'openapi'

export interface ImportModalResult {
    kind: 'curl'
    options: APIClientOptions
}
export interface ImportCollectionResult {
    kind: 'collection'
    result: FullImportResult
    source: 'postman' | 'openapi'
}

@Component({
    templateUrl: './importModal.component.pug',
    styleUrls: ['./importModal.component.scss'],
})
export class ImportModalComponent {
    /** Defaults to cURL since it's the most common paste-target. The
     *  caller can pre-select via setPreferred() before showing. */
    selected: ImportKind = 'curl'
    text = ''
    error: string | null = null
    busy = false

    constructor (private modalInstance: NgbActiveModal) {}

    setPreferred (kind: ImportKind): void {
        this.selected = kind
    }

    submit (): void {
        this.error = null
        this.busy = true
        try {
            if (this.selected === 'curl') {
                const options = importCurl(this.text)
                this.modalInstance.close({ kind: 'curl', options } as ImportModalResult)
                return
            }
            const json = JSON.parse(this.text)
            if (this.selected === 'postman') {
                const result = importPostman(json)
                this.modalInstance.close({ kind: 'collection', result, source: 'postman' } as ImportCollectionResult)
            } else {
                const result = importOpenAPI(json)
                this.modalInstance.close({ kind: 'collection', result, source: 'openapi' } as ImportCollectionResult)
            }
        } catch (e: any) {
            this.error = e?.message ?? String(e)
        } finally {
            this.busy = false
        }
    }

    cancel (): void {
        this.modalInstance.close(null)
    }
}
