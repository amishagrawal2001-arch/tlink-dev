import { Injectable, Type } from '@angular/core'
import { BehaviorSubject } from 'rxjs'

export interface BottomPanelState {
    id: string
    component: Type<any> | null
    visible: boolean
    height: number
    label: string
    mode: string | null
    inputs: Record<string, any>
}

export interface BottomPanelRegistration {
    id: string
    component: Type<any>
    label: string
    height?: number
    mode?: string | null
    inputs?: Record<string, any>
}

const DEFAULT_HEIGHT = 280

@Injectable({ providedIn: 'root' })
export class BottomPanelService {
    private state = new BehaviorSubject<BottomPanelState>({
        id: '',
        component: null,
        visible: false,
        height: DEFAULT_HEIGHT,
        label: '',
        mode: null,
        inputs: {},
    })
    private panels = new BehaviorSubject<BottomPanelRegistration[]>([])

    readonly state$ = this.state.asObservable()
    readonly panels$ = this.panels.asObservable()

    register (panel: BottomPanelRegistration): void {
        const next = this.panels.value.filter(item => item.id !== panel.id)
        next.push(panel)
        this.panels.next(next)
    }

    setHeight (height: number): void {
        const current = this.state.value
        if (!current.visible) {
            return
        }
        if (current.height === height) {
            return
        }
        this.state.next({
            ...current,
            height,
        })
    }

    show (panel: BottomPanelRegistration, inputs?: Record<string, any>): void {
        const current = this.state.value
        const height = panel.height ?? DEFAULT_HEIGHT
        const mode = panel.mode ?? null
        const mergedInputs = { ...(panel.inputs ?? {}), ...(inputs ?? {}) }
        if (
            current.visible &&
            current.id === panel.id &&
            current.height === height &&
            current.label === panel.label &&
            current.mode === mode
        ) {
            this.state.next({ ...current, inputs: mergedInputs })
            return
        }
        this.state.next({
            id: panel.id,
            component: panel.component,
            visible: true,
            height,
            label: panel.label,
            mode,
            inputs: mergedInputs,
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

    toggle (panel: BottomPanelRegistration, inputs?: Record<string, any>): void {
        const current = this.state.value
        if (current.visible && current.id === panel.id) {
            this.hide()
            return
        }
        this.show(panel, inputs)
    }

    getState (): BottomPanelState {
        return this.state.value
    }

    isShowing (component: Type<any>): boolean {
        const current = this.state.value
        return current.visible && current.component === component
    }
}
