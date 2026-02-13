import { Type } from '@angular/core';
export interface BottomPanelState {
    id: string;
    component: Type<any> | null;
    visible: boolean;
    height: number;
    label: string;
    mode: string | null;
    inputs: Record<string, any>;
}
export interface BottomPanelRegistration {
    id: string;
    component: Type<any>;
    label: string;
    height?: number;
    mode?: string | null;
    inputs?: Record<string, any>;
}
export declare class BottomPanelService {
    private state;
    private panels;
    readonly state$: import("rxjs").Observable<BottomPanelState>;
    readonly panels$: import("rxjs").Observable<BottomPanelRegistration[]>;
    register(panel: BottomPanelRegistration): void;
    setHeight(height: number): void;
    show(panel: BottomPanelRegistration, inputs?: Record<string, any>): void;
    hide(): void;
    toggle(panel: BottomPanelRegistration, inputs?: Record<string, any>): void;
    getState(): BottomPanelState;
    isShowing(component: Type<any>): boolean;
}
