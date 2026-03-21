import { Injectable } from '@angular/core'
import { ConfigService } from './config.service'

export interface Bookmark {
    id: string
    label: string
    command: string
    category: string
    createdAt: number
}

@Injectable({ providedIn: 'root' })
export class BookmarksService {
    constructor (private config: ConfigService) {}

    getAll (): Bookmark[] {
        return this.config.store.bookmarks ?? []
    }

    getCategories (): string[] {
        const cats = new Set<string>()
        for (const b of this.getAll()) {
            if (b.category) {
                cats.add(b.category)
            }
        }
        return Array.from(cats).sort()
    }

    add (bookmark: Omit<Bookmark, 'id' | 'createdAt'>): Bookmark {
        const entry: Bookmark = {
            ...bookmark,
            id: this.generateId(),
            createdAt: Date.now(),
        }
        const bookmarks = [...this.getAll(), entry]
        this.config.store.bookmarks = bookmarks
        this.config.save()
        return entry
    }

    update (id: string, changes: Partial<Omit<Bookmark, 'id' | 'createdAt'>>): void {
        const bookmarks = this.getAll().map(b =>
            b.id === id ? { ...b, ...changes } : b,
        )
        this.config.store.bookmarks = bookmarks
        this.config.save()
    }

    remove (id: string): void {
        const bookmarks = this.getAll().filter(b => b.id !== id)
        this.config.store.bookmarks = bookmarks
        this.config.save()
    }

    private generateId (): string {
        return `bm-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    }
}
