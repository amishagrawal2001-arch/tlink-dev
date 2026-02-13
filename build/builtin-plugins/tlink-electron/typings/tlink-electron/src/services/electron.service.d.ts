import { App, IpcRenderer, Shell, Dialog, Clipboard, GlobalShortcut, Screen, AutoUpdater, TouchBar, BrowserWindow, Menu, MenuItem, PowerSaveBlocker, NativeTheme } from 'electron';
export interface MessageBoxResponse {
    response: number;
    checkboxChecked?: boolean;
}
export declare class ElectronService {
    app: App;
    ipcRenderer: IpcRenderer;
    shell: Shell;
    dialog: Dialog;
    clipboard: Clipboard;
    globalShortcut: GlobalShortcut;
    screen: Screen;
    process: any;
    autoUpdater: AutoUpdater;
    powerSaveBlocker: PowerSaveBlocker;
    nativeTheme: NativeTheme;
    TouchBar: typeof TouchBar;
    BrowserWindow: typeof BrowserWindow;
    Menu: typeof Menu;
    MenuItem: typeof MenuItem;
    /** @hidden */
    private constructor();
}
