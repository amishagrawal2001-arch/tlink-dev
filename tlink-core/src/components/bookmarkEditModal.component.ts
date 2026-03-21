import { Component } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { Observable, of } from 'rxjs'
import { map, distinctUntilChanged, debounceTime, switchMap } from 'rxjs/operators'

@Component({
    selector: 'bookmark-edit-modal',
    templateUrl: './bookmarkEditModal.component.pug',
})
export class BookmarkEditModalComponent {
    label = ''
    command = ''
    category = ''
    isEditing = false
    existingCategories: string[] = []

    constructor (private activeModal: NgbActiveModal) {}

    categorySearch = (text$: Observable<string>): Observable<string[]> =>
        text$.pipe(
            debounceTime(100),
            distinctUntilChanged(),
            switchMap(term => {
                if (!term) {
                    return of(this.existingCategories)
                }
                const lower = term.toLowerCase()
                return of(this.existingCategories.filter(c => c.toLowerCase().includes(lower)))
            }),
        )

    save (): void {
        if (this.label && this.command) {
            this.activeModal.close({
                label: this.label.trim(),
                command: this.command.trim(),
                category: this.category.trim(),
            })
        }
    }

    dismiss (): void {
        this.activeModal.dismiss()
    }
}
