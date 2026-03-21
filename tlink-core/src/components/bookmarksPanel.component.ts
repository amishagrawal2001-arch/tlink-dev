import { Component } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { BookmarksService, Bookmark } from '../services/bookmarks.service'
import { AppService } from '../services/app.service'
import { NotificationsService } from '../services/notifications.service'
import { BookmarkEditModalComponent } from './bookmarkEditModal.component'
import { SplitTabComponent, BaseTabComponent } from '../api'

@Component({
    selector: 'bookmarks-panel',
    templateUrl: './bookmarksPanel.component.pug',
    styleUrls: ['./bookmarksPanel.component.scss'],
})
export class BookmarksPanelComponent {
    bookmarks: Bookmark[] = []
    searchQuery = ''

    constructor (
        private bookmarksService: BookmarksService,
        private app: AppService,
        private notifications: NotificationsService,
        private ngbModal: NgbModal,
    ) {
        this.refresh()
    }

    get filteredBookmarks (): Bookmark[] {
        if (!this.searchQuery) {
            return this.bookmarks
        }
        const q = this.searchQuery.toLowerCase()
        return this.bookmarks.filter(b =>
            b.label.toLowerCase().includes(q) ||
            b.command.toLowerCase().includes(q) ||
            b.category.toLowerCase().includes(q),
        )
    }

    get categories (): string[] {
        const cats = new Set<string>()
        for (const b of this.filteredBookmarks) {
            cats.add(b.category || '')
        }
        return Array.from(cats).sort()
    }

    getBookmarksByCategory (category: string): Bookmark[] {
        return this.filteredBookmarks.filter(b => (b.category || '') === category)
    }

    refresh (): void {
        this.bookmarks = this.bookmarksService.getAll()
    }

    executeBookmark (bookmark: Bookmark): void {
        const terminal = this.getActiveTerminal()
        if (!terminal) {
            this.notifications.error('No active terminal to execute command')
            return
        }
        const session = (terminal as any).session
        if (session?.write) {
            session.write(bookmark.command + '\n')
        }
    }

    async addBookmark (): Promise<void> {
        const modal = this.ngbModal.open(BookmarkEditModalComponent)
        const instance: BookmarkEditModalComponent = modal.componentInstance
        instance.existingCategories = this.bookmarksService.getCategories()
        try {
            const result = await modal.result
            if (result) {
                this.bookmarksService.add(result)
                this.refresh()
            }
        } catch {
            // Modal dismissed
        }
    }

    async editBookmark (bookmark: Bookmark, event: Event): Promise<void> {
        event.stopPropagation()
        const modal = this.ngbModal.open(BookmarkEditModalComponent)
        const instance: BookmarkEditModalComponent = modal.componentInstance
        instance.label = bookmark.label
        instance.command = bookmark.command
        instance.category = bookmark.category
        instance.existingCategories = this.bookmarksService.getCategories()
        instance.isEditing = true
        try {
            const result = await modal.result
            if (result) {
                this.bookmarksService.update(bookmark.id, result)
                this.refresh()
            }
        } catch {
            // Modal dismissed
        }
    }

    removeBookmark (bookmark: Bookmark, event: Event): void {
        event.stopPropagation()
        this.bookmarksService.remove(bookmark.id)
        this.refresh()
    }

    private getActiveTerminal (): BaseTabComponent | null {
        const tab = this.app.activeTab
        if (!tab) {
            return null
        }
        if (tab instanceof SplitTabComponent) {
            return tab.getFocusedTab()
        }
        return tab
    }
}
