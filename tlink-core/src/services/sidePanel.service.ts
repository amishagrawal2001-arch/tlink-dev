import { Injectable, Type } from '@angular/core'
import { BehaviorSubject } from 'rxjs'

export interface SidePanelState {
    id: string
    component: Type<any> | null
    visible: boolean
    width: number
    label: string
    mode: string | null
}

export interface SidePanelRegistration {
    id: string
    component: Type<any>
    label: string
    width?: number
    mode?: string | null
}

const DEFAULT_WIDTH = 240

@Injectable({ providedIn: 'root' })
export class SidePanelService {
    private state = new BehaviorSubject<SidePanelState>({
        id: '',
        component: null,
        visible: false,
        width: DEFAULT_WIDTH,
        label: '',
        mode: null,
    })
    private panels = new BehaviorSubject<SidePanelRegistration[]>([])
    private widths = new Map<string, number>()

    readonly state$ = this.state.asObservable()
    readonly panels$ = this.panels.asObservable()

    register (panel: SidePanelRegistration): void {
        const next = this.panels.value.filter(item => item.id !== panel.id)
        next.push(panel)
        this.panels.next(next)
    }

    show (panel: SidePanelRegistration): void {
        const current = this.state.value
        const width = this.widths.get(panel.id) ?? panel.width ?? DEFAULT_WIDTH
        const mode = panel.mode ?? null
        if (current.visible && current.id === panel.id && current.width === width && current.label === panel.label && current.mode === mode) {
            return
        }
        this.state.next({
            id: panel.id,
            component: panel.component,
            visible: true,
            width,
            label: panel.label,
            mode,
        })
    }

    hide (): void {
        const current = this.state.value
        if (!current.visible) {
            return
        }
        this.state.next({
            ...current,
            visible: false,
        })
    }

    toggle (panel: SidePanelRegistration): void {
        const current = this.state.value
        if (current.visible && current.id === panel.id) {
            this.hide()
            return
        }
        this.show(panel)
    }

    getState (): SidePanelState {
        return this.state.value
    }

    setWidth (width: number): void {
        const current = this.state.value
        if (!current.visible) {
            return
        }
        if (current.width === width) {
            return
        }
        if (current.id) {
            this.widths.set(current.id, width)
        }
        this.state.next({
            ...current,
            width,
        })
    }

    isShowing (component: Type<any>): boolean {
        const current = this.state.value
        return current.visible && current.component === component
    }
}
