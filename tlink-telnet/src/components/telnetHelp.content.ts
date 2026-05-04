import { HelpContent } from 'tlink-ssh'

/** In-app quick-reference for the Telnet tab. Full guide in README. */
export const TELNET_HELP_CONTENT: HelpContent = {
    title: 'Telnet — quick reference',
    tagline: 'Reuses the SSH plugin\'s vendor-detection + snippet packs.',
    sections: [
        {
            title: 'Connect + reconnect',
            icon: 'plug',
            items: [
                { label: 'Reconnect this session', howto: 'Toolbar ↻ icon, or hotkey "Restart current Telnet session"', keywords: 'reconnect restart redo' },
                { label: 'Adjust line endings / CRLF', howto: 'Profile → Input processing', keywords: 'crlf line ending input' },
                { label: 'Login scripts', howto: 'Profile → Login scripts → text to send on connect', detail: 'Sent after the telnet protocol negotiation settles.', keywords: 'login script auto send' },
            ],
        },
        {
            title: 'Network-vendor snippets',
            icon: 'bolt',
            items: [
                { label: 'Open the snippet picker', howto: 'Toolbar ⚡ icon, or hotkey "telnet-snippets"', keywords: 'snippet picker bolt' },
                { label: 'Auto-detected vendor', howto: 'Pre-selected with a "(detected)" hint', detail: '14 platforms watched: JUNOS, IOS-XR/XE, NX-OS, EOS, SR OS, FortiOS, PAN-OS, MikroTik, macOS, *BSD, Linux.', keywords: 'detect vendor platform' },
                { label: 'Override the platform', howto: 'Use the dropdown at the top of the picker', keywords: 'override platform' },
                { label: 'Why does the snippet not auto-run?', howto: 'It\'s staged at the prompt without a newline', detail: 'You review/tweak then press Enter. Surprise-execute on a router is hostile.', keywords: 'safety newline auto-run' },
            ],
        },
        {
            title: 'Telnet protocol details',
            icon: 'cog',
            items: [
                { label: 'What terminal type do we advertise?', howto: 'XTERM-256COLOR', detail: 'Sent when the server asks via IAC SB TERMINAL-TYPE.', keywords: 'terminal type xterm' },
                { label: 'Resize behavior', howto: 'Window size negotiated on connect + on every resize', keywords: 'resize window size' },
                { label: 'When does the protocol layer activate?', howto: 'On the first IAC byte from the server', detail: 'Servers that send raw bytes (no IAC) are treated as plain TCP — useful for testing custom services.', keywords: 'iac protocol raw tcp' },
            ],
        },
        {
            title: 'Hotkeys',
            icon: 'keyboard',
            items: [
                { label: 'restart-telnet-session', howto: 'Reconnect this tab', keywords: 'hotkey reconnect' },
                { label: 'telnet-snippets', howto: 'Open the network-vendor snippet picker', keywords: 'hotkey snippets' },
                { label: 'telnet-help', howto: 'Open this help dialog', keywords: 'hotkey help ?' },
                { label: 'Rebind a hotkey', howto: 'Settings → Hotkeys → search for the id', keywords: 'rebind change hotkey' },
            ],
        },
        {
            title: 'Limitations',
            icon: 'exclamation-triangle',
            items: [
                { label: 'No keepalive', howto: 'Telnet doesn\'t have one', detail: 'NAT/firewall idle-timeouts will silently kill long-lived sessions. Use SSH for anything production.', keywords: 'keepalive idle disconnect' },
                { label: 'No encryption', howto: 'Plaintext on the wire', detail: 'Anyone on the path sees credentials + commands. Local lab use only.', keywords: 'encryption plaintext security' },
            ],
        },
    ],
}
