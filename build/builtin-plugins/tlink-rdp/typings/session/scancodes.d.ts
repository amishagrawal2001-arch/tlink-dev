/**
 * Complete KeyboardEvent.code → XT scancode mapping for RDP.
 * Extended scancodes (0xE0 prefix) are encoded as 0xE0xx.
 */
export declare const SCANCODE_MAP: Record<string, number>;
/**
 * Check if a scancode is an extended scancode (0xE0 prefix).
 */
export declare function isExtendedScancode(scancode: number): boolean;
/**
 * Get the raw scancode value (strip 0xE0 prefix for extended codes).
 */
export declare function getRawScancode(scancode: number): number;
