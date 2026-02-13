import { ViewContainerRef, ComponentFactoryResolver, ComponentRef } from '@angular/core';
import { SettingsTabProvider } from '../api';
/** @hidden */
export declare class SettingsTabBodyComponent {
    private componentFactoryResolver;
    provider: SettingsTabProvider;
    placeholder: ViewContainerRef;
    component: ComponentRef<unknown>;
    constructor(componentFactoryResolver: ComponentFactoryResolver);
    ngAfterViewInit(): void;
}
