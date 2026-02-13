import { EventEmitter, ElementRef, AfterViewInit } from '@angular/core';
import { KeyboardInteractivePrompt } from '../session/ssh';
import { SSHProfile } from '../api';
import { PasswordStorageService } from '../services/passwordStorage.service';
export declare class KeyboardInteractiveAuthComponent implements AfterViewInit {
    private passwordStorage;
    profile: SSHProfile;
    prompt: KeyboardInteractivePrompt;
    username?: string;
    step: number;
    done: EventEmitter<any>;
    input: ElementRef;
    remember: boolean;
    constructor(passwordStorage: PasswordStorageService);
    ngAfterViewInit(): void;
    onInputClick(): void;
    isPassword(): boolean;
    previous(): void;
    next(): Promise<void>;
}
