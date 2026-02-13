declare const ConfigProvider: any;
/** @hidden */
export declare class TerminalConfigProvider extends ConfigProvider {
    defaults: {
        hotkeys: {
            'copy-current-path': never[];
        };
        terminal: {
            frontend: string;
            fontSize: number;
            font: string;
            fontWeight: number;
            fontWeightBold: number;
            fallbackFont: null;
            linePadding: number;
            bell: string;
            bracketedPaste: boolean;
            background: string;
            ligatures: boolean;
            cursor: string;
            cursorBlink: boolean;
            hideTabIndex: boolean;
            showTabProfileIcon: boolean;
            hideCloseButton: boolean;
            hideTabOptionsButton: boolean;
            rightClick: string;
            pasteOnMiddleClick: boolean;
            copyOnSelect: boolean;
            copyAsHTML: boolean;
            scrollOnInput: boolean;
            altIsMeta: boolean;
            wordSeparator: string;
            colorScheme: {
                name: string;
                foreground: string;
                background: string;
                cursor: string;
                colors: string[];
                selection?: string | undefined;
                selectionForeground?: string | undefined;
                cursorAccent?: string | undefined;
                __nonStructural: boolean;
            };
            lightColorScheme: {
                name: string;
                foreground: string;
                background: string;
                cursor: string;
                colors: string[];
                selection?: string | undefined;
                selectionForeground?: string | undefined;
                cursorAccent?: string | undefined;
                __nonStructural: boolean;
            };
            customColorSchemes: never[];
            warnOnMultilinePaste: boolean;
            searchRegexAlwaysEnabled: boolean;
            searchOptions: {
                regex: boolean;
                wholeWord: boolean;
                caseSensitive: boolean;
            };
            detectProgress: boolean;
            scrollbackLines: number;
            disableAlternateScreen: boolean;
            drawBoldTextInBrightColors: boolean;
            outputHighlighting: {
                enabled: boolean;
                skipIfAnsiPresent: boolean;
                rules: (import(".").TerminalOutputHighlightRule & {
                    prefixGroup?: number | undefined;
                    captureGroup?: number | undefined;
                    suffixGroup?: number | undefined;
                })[];
            };
            buttonBar: {
                enabled: boolean;
                buttons: never[];
            };
            sixel: boolean;
            minimumContrastRatio: number;
            trimWhitespaceOnPaste: boolean;
            commandWindowBottomVisible: boolean;
        };
    };
    platformDefaults: {
        macOS: {
            terminal: {
                font: string;
            };
            hotkeys: {
                'ctrl-c': string[];
                copy: string[];
                paste: string[];
                clear: string[];
                'select-all': string[];
                'zoom-in': string[];
                'zoom-out': string[];
                'reset-zoom': string[];
                home: string[];
                end: string[];
                'previous-word': string[];
                'next-word': string[];
                'delete-previous-word': string[];
                'delete-line': string[];
                'delete-next-word': string[];
                search: string[];
                'split-right': string[];
                'pane-focus-all': string[];
                'focus-all-tabs': string[];
                'scroll-to-top': string[];
                'scroll-page-up': string[];
                'scroll-up': string[];
                'scroll-down': string[];
                'scroll-page-down': string[];
                'scroll-to-bottom': string[];
            };
        };
        Windows: {
            terminal: {
                font: string;
                rightClick: string;
                pasteOnMiddleClick: boolean;
                copyOnSelect: boolean;
            };
            hotkeys: {
                'ctrl-c': string[];
                copy: string[];
                paste: string[];
                'select-all': string[];
                clear: never[];
                'zoom-in': string[];
                'zoom-out': string[];
                'reset-zoom': string[];
                home: string[];
                end: string[];
                'previous-word': string[];
                'next-word': string[];
                'delete-previous-word': string[];
                'delete-line': string[];
                'delete-next-word': string[];
                search: string[];
                'split-right': string[];
                'pane-focus-all': string[];
                'focus-all-tabs': string[];
                'scroll-to-top': string[];
                'scroll-page-up': string[];
                'scroll-up': string[];
                'scroll-down': string[];
                'scroll-page-down': string[];
                'scroll-to-bottom': string[];
            };
        };
        Linux: {
            terminal: {
                font: string;
                pasteOnMiddleClick: boolean;
            };
            hotkeys: {
                'ctrl-c': string[];
                copy: string[];
                paste: string[];
                'select-all': string[];
                clear: never[];
                'zoom-in': string[];
                'zoom-out': string[];
                'reset-zoom': string[];
                home: string[];
                end: string[];
                'previous-word': string[];
                'next-word': string[];
                'delete-previous-word': string[];
                'delete-line': string[];
                'delete-next-word': string[];
                search: string[];
                'split-right': string[];
                'pane-focus-all': string[];
                'focus-all-tabs': string[];
                'scroll-to-top': string[];
                'scroll-page-up': string[];
                'scroll-up': string[];
                'scroll-down': string[];
                'scroll-page-down': string[];
                'scroll-to-bottom': string[];
            };
        };
    };
}
export {};
