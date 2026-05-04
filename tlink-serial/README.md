# Tlink Serial

The built-in serial transport for Tlink. Backed by `@serialport/stream`,
so it works with USB-serial adapters, FTDI / CP2102 / CH340 chipsets,
and native serial ports on platforms that have them.

Most common use cases:

- **Console-port access to network gear** (Cisco/Juniper/Arista
  routers and switches with their RJ45 / mini-USB console ports)
- **Embedded development** — flashing + monitoring microcontrollers
- **Lab and bench equipment** — power supplies, signal generators,
  any device that exposes a serial command interface

Open via Profiles list → Serial, or `tlink serial /dev/ttyUSB0`.

---

## Quick reference

| What you want | How |
|---|---|
| Open the help dialog | Toolbar `?` icon, or hotkey **Open Serial tab help** |
| Reconnect (re-open the port) | Toolbar ↻ icon (visible while disconnected), or hotkey **Restart current serial session** |
| Change the baud rate live | Toolbar **Change baud rate** (visible while connected) |
| Open the network-vendor snippet picker | Toolbar bolt icon, or hotkey **serial-snippets** |

---

## Toolbar overview

```
●  /dev/ttyUSB0 (115200)             [⚡] [Change baud rate]  [↻]  [?]
```

- **Status dot** — green = port open, red = closed
- **Port + baud** — `path (baudrate)` of the current connection
- **⚡ Network snippets** — vendor-aware snippet picker (shared with SSH)
- **Change baud rate** — picker that swaps the live port to a new
  rate without disconnecting (visible while connected)
- **↻ Reconnect** — reopen the port (visible while disconnected)
- **? Help** — opens the help dialog

---

## Network-vendor awareness

Console-port access to routers/switches is the original motivating
case for vendor-aware snippets. The Serial plugin reuses the SSH
plugin's catalog + snippet packs verbatim — same 14-platform
detection list (JUNOS, Cisco IOS-XR/XE, NX-OS, EOS, SR OS, FortiOS,
PAN-OS, MikroTik, macOS, *BSD, Linux), same picker UI.

The picker (bolt icon) shows curated commands for the detected
platform with a dropdown to override. Chosen template is staged at
the prompt **without auto-newline** — you press Enter when ready.

Default baud rates for common console ports:

- **Cisco** — 9600 (8N1, no flow control)
- **Juniper** — 9600 (8N1)
- **Arista** — 9600 (8N1)
- **Mikrotik** — 115200 (8N1)
- **HP/Aruba** — 9600 (8N1)

If the device just spits garbage, try the most common rates: 9600,
19200, 38400, 57600, 115200.

---

## Port discovery

The port dropdown lists serial ports discoverable by
`@serialport/list` plus any virtual ports the OS reports. On first
open, if no port is set in the profile, the first available port is
auto-selected.

If your USB-serial adapter doesn't appear:

- **Linux** — needs the `dialout` group: `sudo usermod -aG dialout $USER`
  (then log out / back in)
- **macOS** — drivers may need installing for non-Apple chipsets
  (Silicon Labs CP210x, Prolific PL2303). FTDI works out of the box
  via the kernel kext.
- **Windows** — usually plug-and-play via Windows Update; manual
  driver install for some chipsets.

---

## Slow-send mode

Some devices (older microcontrollers, anything with a 6-byte input
buffer) drop characters when bytes arrive faster than they can
process. Profile setting **Slow send** prefixes a middleware that
splits outbound writes into one byte per packet, giving the device
time to consume each one.

Off by default. Turn on if you see characters dropping when you
paste long commands.

---

## Hotkey reference

All rebindable in **Settings → Hotkeys**:

- `serial` — Show the Serial connections list
- `restart-serial-session` — Reopen the port for this tab
- `serial-snippets` — Open the network-vendor snippet picker
- `serial-help` — Open the help dialog

---

## Profile settings

Per-profile, in **Settings → Profiles → Serial**:

- **Port** (`/dev/ttyUSB0`, `/dev/cu.usbserial-…`, `COM3`, …)
- **Baud rate** — default 115200; common choices: 9600 / 19200 /
  38400 / 57600 / 115200 / 230400 / 460800 / 921600 / 1500000
- **Data bits** — usually 8
- **Stop bits** — usually 1
- **Parity** — `none` / `even` / `odd` / `mark` / `space`
- **Hardware flow control (RTS/CTS)** — usually off; on for some
  Cisco/Juniper console scenarios
- **XON/XOFF / XANY** — software flow control toggles
- **Slow send** — see above
- **Login scripts** — text to send on connect

---

## Troubleshooting

### Garbled characters after connect
Wrong baud rate. Use **Change baud rate** on the toolbar to swap
without reconnecting; try 9600 → 115200.

### Permission denied on `/dev/ttyUSB0`
Linux: add yourself to the `dialout` group. macOS: try `cu` instead
of `tty` if both exist.

### Port shows in the list but won't open
Another process has it (screen / minicom / Arduino IDE / VS Code
serial monitor). Close the other tool first.

### USB-serial adapter disconnects randomly
Power-saving on the USB hub kicking in. On macOS, plug into the host
USB-C ports rather than a hub. On Linux, check `dmesg` for `usb …
disconnect`.

### Snippet picker shows wrong platform
Auto-detect runs on the first 8 KB of output — for a freshly-powered
device, that may be the BIOS / U-Boot banner before the OS prompt.
Use the platform dropdown in the picker to override.
