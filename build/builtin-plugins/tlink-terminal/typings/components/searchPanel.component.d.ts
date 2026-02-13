import { EventEmitter } from '@angular/core';
import { Frontend, SearchOptions, SearchState } from '../frontends/frontend';
import { ConfigService, NotificationsService, TranslateService } from 'tlink-core';
export declare class SearchPanelComponent {
    private notifications;
    private translate;
    config: ConfigService;
    query: string;
    frontend: Frontend;
    state: SearchState;
    options: SearchOptions;
    close: EventEmitter<any>;
    private queryChanged;
    icons: {
        case: any;
        regexp: any;
        wholeWord: any;
        arrowUp: any;
        arrowDown: any;
        close: any;
    };
    constructor(notifications: NotificationsService, translate: TranslateService, config: ConfigService);
    onQueryChange(): void;
    findNext(incremental?: boolean): void;
    findPrevious(incremental?: boolean): void;
    saveSearchOptions(): void;
    ngOnDestroy(): void;
}
