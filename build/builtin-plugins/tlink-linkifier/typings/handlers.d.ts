import { ToastrService } from 'ngx-toastr';
import { PlatformService } from 'tlink-core';
import { BaseTerminalTabComponent } from 'tlink-terminal';
import { LinkHandler } from './api';
export declare class URLHandler extends LinkHandler {
    private platform;
    regex: RegExp;
    priority: number;
    constructor(platform: PlatformService);
    handle(uri: string): void;
}
export declare class IPHandler extends LinkHandler {
    private platform;
    regex: RegExp;
    priority: number;
    constructor(platform: PlatformService);
    handle(uri: string): void;
}
export declare class BaseFileHandler extends LinkHandler {
    protected toastr: ToastrService;
    protected platform: PlatformService;
    constructor(toastr: ToastrService, platform: PlatformService);
    handle(uri: string): Promise<void>;
    verify(uri: string): Promise<boolean>;
    convert(uri: string, tab?: BaseTerminalTabComponent<any>): Promise<string>;
}
export declare class UnixFileHandler extends BaseFileHandler {
    protected toastr: ToastrService;
    protected platform: PlatformService;
    regex: RegExp;
    constructor(toastr: ToastrService, platform: PlatformService);
}
export declare class WindowsFileHandler extends BaseFileHandler {
    protected toastr: ToastrService;
    protected platform: PlatformService;
    regex: RegExp;
    constructor(toastr: ToastrService, platform: PlatformService);
    convert(uri: string, tab?: BaseTerminalTabComponent<any>): Promise<string>;
}
