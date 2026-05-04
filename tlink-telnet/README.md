# Tlink Telnet

The built-in Telnet transport for Tlink. Plain `net.Socket` underneath
with a small inline implementation of the Telnet option negotiation
protocol (RFC 854/855) — IAC commands, terminal-type, window-size,
echo, suppress-go-ahead, etc.

Most common use cases:

- **Network gear** with telnet management ports (legacy, console
  servers, lab equipment)
- **Quick socket testing** against arbitrary text protocols (paste a
  `host:port` and pretend it's telnet — usually works)
- **Console servers** that front serial-attached devices over IP

Open via Profiles list → Telnet, Quick connect, or `tlink telnet host`.

---

## Quick reference

| What you want | How |
|---|---|
| Open the help dialog | Toolbar `?` icon, or hotkey **Open Telnet tab help** |
| Reconnect | Toolbar ↻ icon, or hotkey **Restart current Telnet session** |
| Open the network-vendor snippet picker | Toolbar bolt icon, or hotkey **telnet-snippets** |

---

## Toolbar overview

```
●  host:port    [↻]  [⚡]  [?]
```

- **Status dot** — green = open, red = closed
- **Connection identity** — `host:port`
- **↻ Reconnect** — drop the socket + redial
- **⚡ Network snippets** — vendor-aware snippet picker (shared with SSH; see below)
- **? Help** — opens the help dialog

---

## Network-vendor awareness

Reuses the SSH plugin's vendor catalog + snippet packs verbatim — see
[tlink-ssh/README.md](../tlink-ssh/README.md#network-vendor-awareness)
for the full list. Detection runs on the first ~8 KB of session output
and matches against signature regexes for ~14 platforms (JUNOS, Cisco
IOS-XR/XE, NX-OS, Arista EOS, Nokia SR OS, FortiOS, PAN-OS, MikroTik,
macOS, *BSD, Linux).

The picker (bolt icon) shows curated commands for the detected
platform, with a dropdown to override. Chosen template is staged at
the prompt **without auto-newline** — you press Enter when ready.

This is especially useful for telnet because most telnet targets are
network gear that benefits from vendor-specific commands.

---

## Telnet protocol behavior

A few quirks to know about:

- **Terminal type** — we advertise `XTERM-256COLOR` when the server
  asks via `IAC SB TERMINAL-TYPE`
- **Window size** — sent on connect + on resize via `NEGO_WINDOW_SIZE`
  suboption
- **Echo** — server-side echo handled per RFC; if the server requests
  echo, we suppress local echo automatically
- **0xFF unescape** — when telnet protocol is detected, lone `0xFF`
  bytes in the data stream are treated as `IAC` and interpreted; back-
  to-back `0xFF 0xFF` is the literal byte. We splice in a middleware
  to handle this transparently.

If the server never sends any IAC bytes, we treat the stream as raw
TCP and skip the protocol layer.

---

## Hotkey reference

All rebindable in **Settings → Hotkeys**:

- `restart-telnet-session` — Reconnect this tab
- `telnet-snippets` — Open the network-vendor snippet picker
- `telnet-help` — Open the help dialog

---

## Profile settings

Per-profile, in **Settings → Profiles → Telnet**:

- **Host** + **Port** (default 23)
- **Input processing** — line endings, character delay (slow-send
  mode), CRLF translation
- **Login scripts** — text to send on connect (after the protocol
  negotiation settles)

---

## Troubleshooting

### Garbled characters on connect
Server isn't speaking telnet protocol — it's a raw byte stream. Telnet
detects on the first IAC byte; if it never arrives, we treat the
stream as raw TCP. Most "telnet to a custom service on port N"
scenarios fall here, and they Just Work.

### "Connection refused"
Standard TCP failure. Check the host/port + that the server is up.

### Connection drops without warning
Telnet has no keepalive. If your network NAT or firewall idles out
TCP connections, the session dies silently. Use SSH for anything
production.

### Snippet picker shows wrong platform
Auto-detect missed. Use the platform dropdown in the picker to
override; the chosen platform applies for that one pick.
