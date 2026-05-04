import { HelpContent } from './helpModal.component'

/**
 * Curated quick-reference content for the SSH tab's help dialog.
 *
 * The full guide lives in tlink-ssh/README.md (GitHub-rendered);
 * this is the in-app surface — searchable, organized for "how do I
 * do X" rather than novel-length explanation. Keep entries short:
 * each item should answer one question.
 */
export const SSH_HELP_CONTENT: HelpContent = {
    title: 'SSH — quick reference',
    tagline: 'Press ? to reopen this any time the SSH tab is focused.',
    sections: [
        {
            title: 'Connect + reconnect',
            icon: 'plug',
            items: [
                { label: 'Reconnect this session', howto: 'Toolbar ↻ icon, or hotkey "Restart current SSH session"', keywords: 'reconnect restart redo' },
                { label: 'Auto-reconnect on drop', howto: 'Profile → Behavior on session end → reconnect', detail: 'Throttled to 5 reconnects in a 10 s window before giving up.', keywords: 'auto reconnect retry' },
                { label: 'Connect through a jump host', howto: 'Profile → Jump host → pick another SSH profile', detail: 'Each hop authenticates independently.', keywords: 'jump bastion proxy' },
                { label: 'Reuse an authenticated session', howto: 'Profile → Reuse session = on', detail: 'New tabs to the same host attach to the existing connection — no re-auth.', keywords: 'multiplex reuse' },
            ],
        },
        {
            title: 'Status + health',
            icon: 'heartbeat',
            items: [
                { label: 'What the status dot means', howto: 'Green = open + healthy · Yellow = stale (no data) · Red = closed', keywords: 'status dot color health' },
                { label: 'When does "stale" trigger', howto: '3× keepaliveInterval since the last byte', detail: 'At 6× we send an explicit keepalive probe; failure declares the session dead.', keywords: 'stale keepalive timeout' },
                { label: 'Tune the keepalive interval', howto: 'Profile → Keepalive interval (ms)', detail: 'Lower = quicker detection but more network. Default 5000.', keywords: 'keepalive timeout tuning' },
                { label: 'See session duration / bandwidth', howto: 'Toolbar shows clock + Rx/Tx after the first 10 s', keywords: 'duration bandwidth bytes' },
            ],
        },
        {
            title: 'Network-vendor snippets',
            icon: 'bolt',
            items: [
                { label: 'Open the snippet picker', howto: 'Toolbar ⚡ icon, or hotkey "ssh-snippets"', keywords: 'snippet picker bolt' },
                { label: 'Auto-detected vendor', howto: 'Pre-selected with a "(detected)" hint', detail: '14 platforms watched: JUNOS, IOS-XR/XE, NX-OS, EOS, SR OS, FortiOS, PAN-OS, MikroTik, macOS, *BSD, Linux.', keywords: 'detect vendor platform' },
                { label: 'Override the platform', howto: 'Use the dropdown at the top of the picker', keywords: 'override platform' },
                { label: 'Why does the snippet not auto-run?', howto: 'It\'s staged at the prompt without a newline', detail: 'You review/tweak then press Enter. Surprise-execute on a router is hostile.', keywords: 'safety newline auto-run' },
                { label: 'Search inside the picker', howto: 'Type in the search box; ↑↓ Enter Esc nav', keywords: 'search filter find' },
            ],
        },
        {
            title: 'SFTP browser',
            icon: 'folder-tree',
            items: [
                { label: 'Open the SFTP panel', howto: 'Toolbar 📁 icon (folder-tree)', keywords: 'sftp file browser' },
                { label: 'Upload from local', howto: 'Drag-drop a file or folder into the panel', keywords: 'sftp upload drag drop' },
                { label: 'Rename / delete / new dir', howto: 'Right-click any entry', keywords: 'sftp rename delete create' },
                { label: 'Jump to a path', howto: 'Edit the path bar at the top of the panel', keywords: 'sftp cd path navigate' },
                { label: 'Close SFTP without disconnecting', howto: 'X icon in the SFTP panel header', detail: 'The SSH session keeps running.', keywords: 'sftp close' },
            ],
        },
        {
            title: 'Port forwarding',
            icon: 'plug',
            items: [
                { label: 'Open the forwarding manager', howto: 'Toolbar 🔌 icon', detail: 'Available on desktop builds only.', keywords: 'port forward tunnel' },
                { label: 'Local forward (localhost:N → remote:N)', howto: 'Forwarding modal → Local tab', keywords: 'local forward' },
                { label: 'Remote forward (reverse tunnel)', howto: 'Forwarding modal → Remote tab', keywords: 'remote reverse forward' },
                { label: 'Dynamic / SOCKS proxy', howto: 'Forwarding modal → Dynamic tab', keywords: 'socks dynamic proxy' },
            ],
        },
        {
            title: 'Session log',
            icon: 'file-alt',
            items: [
                { label: 'Enable session logging', howto: 'Profile → Session log → enable', detail: 'Output appended to a per-session file with timestamps in the filename.', keywords: 'log session record' },
                { label: 'Open the log directory', howto: 'Toolbar 📂 icon (folder-open)', keywords: 'log directory open' },
                { label: 'Open this session\'s log file', howto: 'Toolbar 📄 icon', detail: 'If logging isn\'t configured yet, this opens the settings modal directly.', keywords: 'log file open' },
                { label: 'Strip ANSI escapes', howto: 'Profile → Session log → strip ANSI', detail: 'Useful when grep-ing the log later.', keywords: 'log ansi escape strip' },
            ],
        },
        {
            title: 'AI integration',
            icon: 'robot',
            items: [
                { label: 'Ask AI about selected output', howto: 'Select text in the terminal → toolbar 🤖', detail: 'Visible only when the AI Assistant plugin is loaded.', keywords: 'ai assistant analyze ask' },
                { label: 'Auto-prompt on errors', howto: 'Automatic — toast appears with "Click to ask AI"', detail: 'Triggered by patterns like "permission denied" / "command not found" / "Traceback" / etc. Throttled to one toast per 10 s.', keywords: 'ai error detect notify' },
            ],
        },
        {
            title: 'Banner handling',
            icon: 'flag',
            items: [
                { label: 'Why is the banner toast truncated?', howto: 'Long banners are summarized for the toast', detail: 'Decorative-only lines are dropped, runs of #/=/- collapse to ellipses, capped at 3 lines / 240 chars. Full banner is in the terminal scroll-back.', keywords: 'banner truncate summary toast' },
            ],
        },
        {
            title: 'Hotkeys',
            icon: 'keyboard',
            items: [
                { label: 'restart-ssh-session', howto: 'Reconnect this tab', keywords: 'hotkey reconnect' },
                { label: 'launch-winscp', howto: 'Launch WinSCP for this session (Windows only)', keywords: 'hotkey winscp' },
                { label: 'ssh-snippets', howto: 'Open the network-vendor snippet picker', keywords: 'hotkey snippets' },
                { label: 'ssh-help', howto: 'Open this help dialog', keywords: 'hotkey help ?' },
                { label: 'home / end', howto: 'Send the Home/End key sequences', detail: 'Useful where the OS rebinds these.', keywords: 'hotkey home end' },
                { label: 'Rebind a hotkey', howto: 'Settings → Hotkeys → search for the id', keywords: 'rebind change hotkey' },
            ],
        },
    ],
}
