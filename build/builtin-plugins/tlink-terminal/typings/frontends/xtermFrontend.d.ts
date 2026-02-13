import { Injector } from '@angular/core';
import { Frontend, SearchOptions, SearchState } from './frontend';
import { Terminal } from '@xterm/xterm';
import { BaseTerminalProfile } from '../api/interfaces';
import './xterm.css';
/** @hidden */
export declare class XTermFrontend extends Frontend {
    enableResizing: boolean;
    xterm: Terminal;
    protected xtermCore: any;
    protected enableWebGL: boolean;
    private element?;
    private configuredFontSize;
    private configuredLinePadding;
    private zoom;
    private resizeHandler;
    private configuredTheme;
    private copyOnSelect;
    private preventNextOnSelectionChangeEvent;
    private search;
    private searchState;
    private fitAddon;
    private serializeAddon;
    private ligaturesAddon?;
    private webGLAddon?;
    private canvasAddon?;
    private opened;
    private resizeObserver?;
    private flowControl;
    private configService;
    private hotkeysService;
    private platformService;
    private hostApp;
    private themes;
    constructor(injector: Injector);
    attach(host: HTMLElement, profile: BaseTerminalProfile): Promise<void>;
    detach(_host: HTMLElement): void;
    destroy(): void;
    getSelection(): string;
    copySelection(): void;
    selectAll(): void;
    clearSelection(): void;
    focus(): void;
    write(data: string): Promise<void>;
    clear(): void;
    visualBell(): void;
    scrollToTop(): void;
    scrollPages(pages: number): void;
    scrollLines(amount: number): void;
    scrollToBottom(): void;
    private configureColors;
    configure(profile: BaseTerminalProfile): void;
    setZoom(zoom: number): void;
    private getSearchOptions;
    private wrapSearchResult;
    findNext(term: string, searchOptions?: SearchOptions): SearchState;
    findPrevious(term: string, searchOptions?: SearchOptions): SearchState;
    cancelSearch(): void;
    saveState(): any;
    restoreState(state: string): void;
    supportsBracketedPaste(): boolean;
    isAlternateScreenActive(): boolean;
    private setFontSize;
    private getSelectionAsHTML;
}
/** @hidden */
export declare class XTermWebGLFrontend extends XTermFrontend {
    protected enableWebGL: boolean;
}
