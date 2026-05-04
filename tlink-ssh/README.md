# Tlink SSH

The built-in SSH transport for Tlink. Backed by [russh](https://github.com/Eugeny/russh)
(pure-Rust SSH implementation), so connections work without OpenSSH
installed on the host.

Open via the Profiles list (Start page → SSH → choose profile), via
the Quick connect bar, or via `tlink ssh user@host` from the command
line.

---

## Quick reference

| What you want | How |
|---|---|
| Open the help dialog | `?` (or any time the SSH tab is focused) |
| Reconnect | Hotkey **Restart current SSH session**, or the redo icon on the toolbar |
| Open SFTP for this session | Folder-tree icon on the toolbar |
| Configure port forwards | Plug icon on the toolbar |
| Open the network-vendor snippet picker | Bolt icon, or hotkey **Open network-vendor snippet picker** |
| Send Home/End | Hotkeys `home` / `end` (often need rebinding on macOS) |
| Launch WinSCP for this session | Hotkey **Launch WinSCP** (Windows only) |
| Ask the AI about selected output | Robot icon (visible only when AI Assistant plugin is loaded) |

---

## Toolbar overview

Each open SSH tab carries the same toolbar row:

```
● user@host:port  [12m45s]  [↑1.2KB ↓456B]   [📂] [📄]  [↻]  [📁]  [🔌]  [⚡]  [🤖]  [?]
```

- **Status dot** — green = open + healthy, yellow = open but stale (no data >3× keepalive), red = closed
- **Connection identity** — `user@host:port`, copy-selectable
- **Duration** — `Nh Nm` for the current session (after first 10 s)
- **Bandwidth** — Rx / Tx since session start
- **📂 Session log directory** — open the folder where session logs live
- **📄 Session log file** — open this session's log (or the settings modal if not configured)
- **↻ Reconnect** — drop the current shell + re-establish
- **📁 SFTP** — open the remote file tree alongside the terminal
- **🔌 Ports** — manage forwarded ports for this session
- **⚡ Network snippets** — vendor-aware snippet picker (see below)
- **🤖 Ask AI** — analyze selected output via the AI Assistant
- **? Help** — opens this dialog

---

## Network-vendor awareness

Every SSH session quietly watches its first ~8 KB of post-auth output
and matches it against signature regexes for 14 platforms:

> JUNOS · IOS-XR · IOS-XE · Cisco IOS · NX-OS · Arista EOS ·
> Nokia SR OS · FortiOS · PAN-OS · MikroTik RouterOS · macOS ·
> FreeBSD · OpenBSD · Linux

Detection is self-bounded: stops scanning after match, after 8 KB,
or after 30 s — whichever comes first. The matched platform pre-
selects in the snippet picker with a `(detected)` hint; the user can
override via the dropdown.

The snippet picker (bolt icon) ships ~150 curated commands across
the network platforms — common-case `show interfaces terse`,
`commit confirmed 5`, `rollback 1`, `show ip route` etc. The chosen
template is staged at the prompt **without a trailing newline** so
you can review/tweak before pressing Enter — surprise-execute on a
router would be hostile.

Filter / search inside the modal, ↑↓/Enter/Esc nav, `(detected)`
chip on the matched platform.

---

## SFTP browser

Click the folder-tree icon on the toolbar (visible while the session
is open). A panel slides in with a remote file tree:

- Browse + double-click to open / preview
- Drag-drop to upload from local
- Right-click for rename / delete / new directory / new file
- Path bar at top is editable for fast `cd`
- Closes via the X in the panel header (the SSH session keeps running)

---

## Port forwarding

Click the plug icon (Linux/macOS/Windows only — not in the web build).
Modal opens with three tabs:

- **Local** — `localhost:N → remote-host:N` (default SSH port-forward)
- **Remote** — `remote-host:N → localhost:N` (reverse tunnel)
- **Dynamic** — SOCKS proxy on a local port

Each row has enable/disable + delete. Forwards persist with the
profile.

---

## Connection multiplexing + reuse

When `Reuse session` is on (per-profile setting), opening a second
tab to the same host attaches a new shell to the **same authenticated
SSH session** — no re-auth. Closing all tabs shuts the underlying
connection down.

Useful when bouncing between several files via SFTP + a shell, or
when 2FA makes re-auth painful.

---

## Jump hosts

Profile setting **Jump host** lets you nominate another SSH profile
to dial through. The jump session opens first, then a TCP-forward
channel to the destination, then the destination shell. If the jump
goes down, the destination dies with it (and reconnects when the
jump comes back).

Auth happens against each hop independently — the jump can use a
key, the destination can use password, etc.

---

## Health monitoring

Every 5 s we check the time since the last byte arrived. Once that
exceeds **3× keepalive interval**, the status dot flips to yellow
("connection stale"). At 6× we trigger an explicit `keepalive@openssh.com`
probe. If the probe fails, the session is declared dead and the
connection-end behavior kicks in (auto-reconnect / keep / disconnect
per the profile).

To raise the threshold, bump `keepaliveInterval` on the profile or in
SSH settings.

---

## Banner handling

Many corporate / government SSH banners are hundreds of lines of
ASCII-art borders. Rendered raw they:

- Overflow notification toasts (and break the layout)
- Push real terminal output below the fold

So we **summarize the banner** for the toast (drop decoration-only
lines, collapse runs of `#` / `=` / `-` to ellipses, cap at 3 lines /
240 chars). The full banner still writes to the terminal scroll-back
where SSH banners belong + the user can copy from.

---

## Session logging

Per-profile `Session log` setting. When enabled:

- Output is appended to a file under `~/.tlink/session-logs/` (or
  the directory you chose)
- Filename includes `host`, `user`, ISO timestamp
- ANSI escapes optionally stripped (toggle in settings)
- `📂` / `📄` toolbar buttons open the directory / file directly

---

## Ask AI

Visible when the AI Assistant plugin is installed + has at least
one provider configured.

1. Select some terminal output
2. Click the robot icon
3. AI Assistant sidebar opens with the selection wrapped in a
   "Analyze this SSH terminal output from {host}" prompt

If nothing is selected, the AI sidebar just toggles open with a
hint to select first.

There's also **automatic error detection**: when the session output
matches one of these patterns:

- `command not found`
- `permission denied`
- `no such file or directory`
- `connection refused`
- `traceback (most recent…)`
- `fatal:`
- `segmentation fault`

…a notification appears with "Click to ask AI". Throttled to one
prompt per 10 s so a runaway error log doesn't spam.

---

## Hotkey reference

All hotkeys are rebindable in **Settings → Hotkeys**:

- `restart-ssh-session` — Reconnect this tab
- `launch-winscp` — Launch WinSCP for this session (Windows only)
- `ssh-snippets` — Open the network-vendor snippet picker
- `ssh-help` — Open the help dialog (this one)
- `home` / `end` — Send the Home/End key sequences (useful where
  the OS rebinds them)

---

## Profile settings (highlights)

Per-profile, in **Settings → Profiles → SSH → {profile} → Edit**:

- **Connection** — host, port, user, family
- **Auth** — password, private key, agent, keyboard-interactive
- **Forwarded ports** — see above
- **X11 forwarding** — `X11Forwarding yes` on the remote side; xauth
  must be installed there
- **Reuse session** — connection multiplexing
- **Jump host** — see above
- **Login scripts** — run on session open (after auth)
- **Session log** — see above
- **Behavior on session end** — `auto` / `reconnect` / `keep` /
  `close`
- **Warn on close** — confirm dialog when closing an open session
- **Keepalive interval** — health-check tuning

---

## On-disk

Profiles + per-host data live in tlink's main config:

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/tlink/config.yaml` |
| Linux | `~/.config/tlink/config.yaml` |
| Windows | `%APPDATA%\tlink\config.yaml` |

Other touched paths:
- Known-hosts: `~/.ssh/known_hosts` (interoperates with OpenSSH)
- Session logs: `~/.tlink/session-logs/` by default

---

## Troubleshooting

### "SSH session initialization failed: this.size.columns"
You're on a build older than v1.0.16. Pull main + rebuild — the
fix is in `3b3212e6`.

### Shell opens but no prompt
The remote refused PTY allocation. Check the server logs; most
common cause is `disable-required-pty` set in the user's
`~/.ssh/authorized_keys` for that key.

### Authorization keeps prompting on every connect
Either `Reuse session` is off (each tab re-auths), or the
agent isn't forwarding. Toggle `Reuse session` on the profile.

### Banner notification is truncated
Intentional — toast can't host 200+ lines. Full banner is in the
terminal scroll-back.

### Snippet picker shows wrong platform
Auto-detect missed. Use the platform dropdown at the top of the
picker to override; the chosen platform applies for that pick only
(detection state isn't overwritten).
