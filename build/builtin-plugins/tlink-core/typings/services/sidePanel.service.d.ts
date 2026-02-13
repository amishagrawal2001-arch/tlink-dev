import { Type } from '@angular/core';
export interface SidePanelState {
    id: string;
    component: Type<any> | null;
    visible: boolean;
    width: number;
    label: string;
    mode: string | null;
}
export interface SidePanelRegistration {
    id: string;
    component: Type<any>;
    label: string;
    width?: number;
    mode?: string | null;
}
export declare class SidePanelService {
    private state;
    private panels;
    private widths;
    readonly state$: import("rxjs").Observable<SidePanelState>;
    readonly panels$: import("rxjs").Observable<SidePanelRegistration[]>;
    register(panel: SidePanelRegistration): void;
    show(panel: SidePanelRegistration): void;
    hide(): void;
    toggle(panel: SidePanelRegistration): void;
    getState(): SidePanelState;
    setWidth(width: number): void;
    isShowing(component: Type<any>): boolean;
}
