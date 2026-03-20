/**
 * Complete KeyboardEvent.code → XT scancode mapping for RDP.
 * Extended scancodes (0xE0 prefix) are encoded as 0xE0xx.
 */
export const SCANCODE_MAP: Record<string, number> = {
    // Row 1: Escape + Function keys
    'Escape': 0x01,
    'F1': 0x3B,
    'F2': 0x3C,
    'F3': 0x3D,
    'F4': 0x3E,
    'F5': 0x3F,
    'F6': 0x40,
    'F7': 0x41,
    'F8': 0x42,
    'F9': 0x43,
    'F10': 0x44,
    'F11': 0x57,
    'F12': 0x58,

    // Row 2: Number row
    'Backquote': 0x29,
    'Digit1': 0x02,
    'Digit2': 0x03,
    'Digit3': 0x04,
    'Digit4': 0x05,
    'Digit5': 0x06,
    'Digit6': 0x07,
    'Digit7': 0x08,
    'Digit8': 0x09,
    'Digit9': 0x0A,
    'Digit0': 0x0B,
    'Minus': 0x0C,
    'Equal': 0x0D,
    'Backspace': 0x0E,

    // Row 3: QWERTY
    'Tab': 0x0F,
    'KeyQ': 0x10,
    'KeyW': 0x11,
    'KeyE': 0x12,
    'KeyR': 0x13,
    'KeyT': 0x14,
    'KeyY': 0x15,
    'KeyU': 0x16,
    'KeyI': 0x17,
    'KeyO': 0x18,
    'KeyP': 0x19,
    'BracketLeft': 0x1A,
    'BracketRight': 0x1B,
    'Backslash': 0x2B,

    // Row 4: ASDF
    'CapsLock': 0x3A,
    'KeyA': 0x1E,
    'KeyS': 0x1F,
    'KeyD': 0x20,
    'KeyF': 0x21,
    'KeyG': 0x22,
    'KeyH': 0x23,
    'KeyJ': 0x24,
    'KeyK': 0x25,
    'KeyL': 0x26,
    'Semicolon': 0x27,
    'Quote': 0x28,
    'Enter': 0x1C,

    // Row 5: ZXCV
    'ShiftLeft': 0x2A,
    'KeyZ': 0x2C,
    'KeyX': 0x2D,
    'KeyC': 0x2E,
    'KeyV': 0x2F,
    'KeyB': 0x30,
    'KeyN': 0x31,
    'KeyM': 0x32,
    'Comma': 0x33,
    'Period': 0x34,
    'Slash': 0x35,
    'ShiftRight': 0x36,

    // Row 6: Bottom row
    'ControlLeft': 0x1D,
    'MetaLeft': 0xE05B,
    'AltLeft': 0x38,
    'Space': 0x39,
    'AltRight': 0xE038,
    'MetaRight': 0xE05C,
    'ContextMenu': 0xE05D,
    'ControlRight': 0xE01D,

    // Navigation cluster
    'PrintScreen': 0xE037,
    'ScrollLock': 0x46,
    'Pause': 0xE11D, // special: Pause/Break
    'Insert': 0xE052,
    'Home': 0xE047,
    'PageUp': 0xE049,
    'Delete': 0xE053,
    'End': 0xE04F,
    'PageDown': 0xE051,

    // Arrow keys
    'ArrowUp': 0xE048,
    'ArrowDown': 0xE050,
    'ArrowLeft': 0xE04B,
    'ArrowRight': 0xE04D,

    // Numpad
    'NumLock': 0x45,
    'NumpadDivide': 0xE035,
    'NumpadMultiply': 0x37,
    'NumpadSubtract': 0x4A,
    'NumpadAdd': 0x4E,
    'NumpadEnter': 0xE01C,
    'NumpadDecimal': 0x53,
    'Numpad0': 0x52,
    'Numpad1': 0x4F,
    'Numpad2': 0x50,
    'Numpad3': 0x51,
    'Numpad4': 0x4B,
    'Numpad5': 0x4C,
    'Numpad6': 0x4D,
    'Numpad7': 0x47,
    'Numpad8': 0x48,
    'Numpad9': 0x49,

    // International / extra keys
    'IntlBackslash': 0x56,
    'IntlRo': 0x73,
    'IntlYen': 0x7D,
}

/**
 * Check if a scancode is an extended scancode (0xE0 prefix).
 */
export function isExtendedScancode (scancode: number): boolean {
    return scancode > 0xFF
}

/**
 * Get the raw scancode value (strip 0xE0 prefix for extended codes).
 */
export function getRawScancode (scancode: number): number {
    if (scancode > 0xFF) {
        return scancode & 0xFF
    }
    return scancode
}
