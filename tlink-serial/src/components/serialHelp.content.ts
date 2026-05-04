import { HelpContent } from 'tlink-ssh'

/** In-app quick-reference for the Serial tab. Full guide in README. */
export const SERIAL_HELP_CONTENT: HelpContent = {
    title: 'Serial — quick reference',
    tagline: 'Vendor-detection + snippet packs reused from the SSH plugin.',
    sections: [
        {
            title: 'Connect + baud rate',
            icon: 'plug',
            items: [
                { label: 'Reconnect (re-open the port)', howto: 'Toolbar ↻ icon, or hotkey "Restart current serial session"', detail: 'Visible only while disconnected.', keywords: 'reconnect restart redo' },
                { label: 'Change baud rate live', howto: 'Toolbar "Change baud rate" → pick from the list', detail: 'Swaps the live port without reconnecting.', keywords: 'baud rate change live' },
                { label: 'Common console rates', howto: 'Cisco / Juniper / Arista / HP-Aruba: 9600 · MikroTik: 115200', keywords: 'baud cisco juniper console' },
                { label: 'Garbled output?', howto: 'Wrong baud rate', detail: 'Try 9600 → 19200 → 38400 → 57600 → 115200.', keywords: 'garbled baud rate wrong' },
            ],
        },
        {
            title: 'Network-vendor snippets',
            icon: 'bolt',
            items: [
                { label: 'Open the snippet picker', howto: 'Toolbar ⚡ icon, or hotkey "serial-snippets"', keywords: 'snippet picker bolt' },
                { label: 'Auto-detected vendor', howto: 'Pre-selected with a "(detected)" hint', detail: '14 platforms watched: JUNOS, IOS-XR/XE, NX-OS, EOS, SR OS, FortiOS, PAN-OS, MikroTik, macOS, *BSD, Linux.', keywords: 'detect vendor platform' },
                { label: 'Override the platform', howto: 'Use the dropdown at the top of the picker', detail: 'Useful when detection sees the BIOS / U-Boot banner before the OS prompt.', keywords: 'override platform' },
                { label: 'Why does the snippet not auto-run?', howto: 'It\'s staged at the prompt without a newline', detail: 'You review/tweak then press Enter. Surprise-execute on a router is hostile.', keywords: 'safety newline auto-run' },
            ],
        },
        {
            title: 'Port discovery',
            icon: 'search',
            items: [
                { label: 'Find available ports', howto: 'Profile → Port dropdown lists all detected serial ports', keywords: 'port discover list usb' },
                { label: 'Linux — port not visible', howto: 'Add yourself to dialout: sudo usermod -aG dialout $USER', detail: 'Log out and back in for the group change to take effect.', keywords: 'linux dialout permission' },
                { label: 'macOS — driver missing', howto: 'Install the chipset driver (CP210x / PL2303); FTDI works out of the box', keywords: 'macos driver chipset' },
                { label: 'Windows — port number', howto: 'Format is COM3 / COM7 / etc. — see Device Manager', keywords: 'windows com port' },
            ],
        },
        {
            title: 'Tuning',
            icon: 'sliders-h',
            items: [
                { label: 'Slow-send mode', howto: 'Profile → Slow send → enable', detail: 'One byte per write packet. Helps with devices that drop characters when pasted-in commands arrive too fast.', keywords: 'slow send paste drop' },
                { label: 'Hardware flow control', howto: 'Profile → RTS/CTS → enable', detail: 'Some Cisco/Juniper console scenarios need this.', keywords: 'rts cts hardware flow' },
                { label: 'Software flow control', howto: 'Profile → XON / XOFF', keywords: 'xon xoff software flow' },
                { label: 'Run text on connect', howto: 'Profile → Login scripts', keywords: 'login script auto send' },
            ],
        },
        {
            title: 'Hotkeys',
            icon: 'keyboard',
            items: [
                { label: 'restart-serial-session', howto: 'Reopen the port', keywords: 'hotkey reconnect' },
                { label: 'serial-snippets', howto: 'Open the network-vendor snippet picker', keywords: 'hotkey snippets' },
                { label: 'serial-help', howto: 'Open this help dialog', keywords: 'hotkey help ?' },
                { label: 'Rebind a hotkey', howto: 'Settings → Hotkeys → search for the id', keywords: 'rebind change hotkey' },
            ],
        },
    ],
}
