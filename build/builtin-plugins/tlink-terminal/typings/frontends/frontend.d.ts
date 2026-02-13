/// <reference types="node" />
import { Injector } from '@angular/core';
import { Observable, Subject, AsyncSubject, ReplaySubject, BehaviorSubject } from 'rxjs';
import { BaseTerminalProfile, ResizeEvent } from '../api/interfaces';
export interface SearchOptions {
    regex?: boolean;
    wholeWord?: boolean;
    caseSensitive?: boolean;
    incremental?: true;
}
export interface SearchState {
    resultIndex?: number;
    resultCount: number;
}
/**
 * Extend to add support for a different VT frontend implementation
 */
export declare abstract class Frontend {
    protected injector: Injector;
    enableResizing: boolean;
    protected ready: AsyncSubject<void>;
    protected title: ReplaySubject<string>;
    protected alternateScreenActive: BehaviorSubject<boolean>;
    protected mouseEvent: Subject<MouseEvent>;
    protected bell: Subject<void>;
    protected contentUpdated: Subject<void>;
    protected input: Subject<Buffer>;
    protected resize: ReplaySubject<ResizeEvent>;
    protected dragOver: Subject<DragEvent>;
    protected drop: Subject<DragEvent>;
    protected destroyed: Subject<void>;
    get ready$(): Observable<void>;
    get title$(): Observable<string>;
    get alternateScreenActive$(): Observable<boolean>;
    get mouseEvent$(): Observable<MouseEvent>;
    get bell$(): Observable<void>;
    get contentUpdated$(): Observable<void>;
    get input$(): Observable<Buffer>;
    get resize$(): Observable<ResizeEvent>;
    get dragOver$(): Observable<DragEvent>;
    get drop$(): Observable<DragEvent>;
    get destroyed$(): Observable<void>;
    constructor(injector: Injector);
    destroy(): void;
    abstract attach(host: HTMLElement, profile: BaseTerminalProfile): Promise<void>;
    detach(host: HTMLElement): void;
    abstract getSelection(): string;
    abstract copySelection(): void;
    abstract selectAll(): void;
    abstract clearSelection(): void;
    abstract focus(): void;
    abstract write(data: string): Promise<void>;
    abstract clear(): void;
    abstract visualBell(): void;
    abstract scrollToTop(): void;
    abstract scrollLines(amount: number): void;
    abstract scrollPages(pages: number): void;
    abstract scrollToBottom(): void;
    abstract configure(profile: BaseTerminalProfile): void;
    abstract setZoom(zoom: number): void;
    abstract findNext(term: string, searchOptions?: SearchOptions): SearchState;
    abstract findPrevious(term: string, searchOptions?: SearchOptions): SearchState;
    abstract cancelSearch(): void;
    abstract saveState(): any;
    abstract restoreState(state: string): void;
    abstract supportsBracketedPaste(): boolean;
    abstract isAlternateScreenActive(): boolean;
}
