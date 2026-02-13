import { OnDestroy, OnInit } from '@angular/core';
import { ExecToolCategory } from '../tools/terminal';
export declare class ExecCommandButtonComponent implements OnInit, OnDestroy {
    private execToolCategory;
    isCommandRunning: boolean;
    commandName: string;
    private subscription;
    constructor(execToolCategory: ExecToolCategory);
    ngOnInit(): void;
    ngOnDestroy(): void;
    onAbortClick(): void;
}
