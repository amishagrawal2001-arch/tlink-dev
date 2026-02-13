import { Injector } from '@angular/core';
import { TranslateService } from 'tlink-core';
declare const BaseTabComponent: any;
export interface Release {
    name: string;
    version: string;
    content: string;
    date: Date;
}
/** @hidden */
export declare class ReleaseNotesComponent extends BaseTabComponent {
    releases: Release[];
    lastPage: number;
    constructor(translate: TranslateService, injector: Injector);
    loadReleases(page: any): Promise<void>;
    onScrolled(): void;
}
export {};
