import { HotkeyProvider } from 'tabby-core';
import type { HotkeyDescription } from 'tabby-core';
/** @hidden */
export declare class McpHotkeyProvider extends HotkeyProvider {
    provide(): Promise<HotkeyDescription[]>;
}
