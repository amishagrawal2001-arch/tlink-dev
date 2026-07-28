# tlink-gnmi

**gNMI (gRPC Network Management Interface) client for tlink.**

Subscribe to streaming telemetry from network devices — Arista, Cisco IOS-XR, Juniper Junos, Nokia SR OS, or anything speaking [gNMI](https://github.com/openconfig/gnmi). View live counters, rates, and current state without leaving the app.

## Quickstart

1. **Add a target.** Settings → Profiles → **+ New profile** → **gNMI target**.
   Fill in host, port (`6030` Arista · `57400` Cisco/Nokia · `32767` or `50051` Junos), username, password. Pick a security mode:
   - **TLS** — default. Uses system trust store.
   - **TLS · skip cert verification** — for self-signed labs.
   - **mTLS** — supply client cert + key paths.
   - **Insecure** — plaintext gRPC. Lab only.
2. **Test Connection.** Green strip → success (gNMI version + supported model count). Any error surfaces verbatim from `gnmic` so you know exactly what to fix.
3. **Connect** → new "gNMI Session" tab opens.
4. **Add a path.** Either type a gNMI path directly (`/interfaces/interface/state/counters`) or click the 📖 icon next to *Add path* to browse the built-in catalog — CPU, Memory, Interfaces, System, BGP, LLDP, Routing, Junos-native.
5. **Subscribe.** Notifications stream into the center pane.

## View modes

Toggle in the center-pane toolbar: **Wire log** · **Latest** · **Graphical**.

- **Wire log** (default) — every notification as a row, timestamp / path / value / kind. Filter, pause, or export as JSONL / CSV.
- **Latest** — one row per unique path with the current value, a sparkline of the last N samples, delta from previous, and age. Grouped by list-key so 8 CPUs' worth of leaves render as 8 groups, not 56 flat rows.
- **Graphical** — chart-card grid. One card per component sharing a common leaf. Windowable (1m / 5m / 15m / 30m / 1h / All), auto-scales byte counters (GiB / MiB / K B/s / …), rate mode auto-detects counter leaves and plots per-second delta instead of the raw counter.

**Click a chart card** to expand into a full-pane view with x/y axis labels, hover crosshair, and exact-value tooltip.

**Click a subscription row** in the left pane to scope Latest + Graphical to just that subscribe's leaves. Click again to unscope.

## Save & recover

- **Star ★** an active subscription to save it to the profile.
- Toggle **⚡ Auto** on a saved row → subscribe fires automatically next tab open.
- **📑 Save all** — one click stars every active sub with autoStart=true.
- **Session recovery** — closing the app and reopening restores the tab with its subscriptions (union of last-running state + auto-start saved).

## Reports

**⬇ Report** button downloads a self-contained HTML file with the full session state — target metadata, subscription list, Latest values with sparklines, Graphical charts. Inline CSS + inline SVG, no external dependencies, opens standalone in any browser. Sticky top nav for jumping between sections.

## On-disk retention (optional)

By default the session buffer is in-memory only — ~500 samples per path, dies with the tab. To keep history longer, edit the profile → **Security** tab → set **On-disk history retention (days)** to a positive number (e.g. `7`).

- JSONL per profile per day: `~/Library/Application Support/tlink/gnmi-history/<profile-id>/YYYY-MM-DD.jsonl` (macOS) · `~/.config/tlink/gnmi-history/…` (Linux) · `%APPDATA%\tlink\gnmi-history\…` (Windows).
- Loaded back on tab open so charts start populated instead of empty.
- Files older than the retention window pruned automatically.
- Manual **Clear all history** button + size display in the Security tab.

## Troubleshooting

**"gnmic binary not found"** — plugin ships with the bundled binary in `<app-bundle>/Resources/extras/gnmic/<platform>/gnmic`. If Test Connection reports this, the binary didn't land during install. Workaround: `brew install gnmic` (macOS) / `apt install gnmic` (Debian/Ubuntu) — the plugin's discovery service falls back to `$PATH`.

**Test Connection succeeds but Subscribe returns nothing** — the device accepts the connection but isn't emitting on the path. Most common causes:
- **Encoding rejected** — device advertises `JSON_IETF` in Capabilities but silently drops it on Subscribe (observed on Junos). The plugin already omits `-e` on subscribe to sidestep this, but some vendors have similar quirks with other paths.
- **State branch not populated** — YANG model is loaded (visible in Capabilities) but no sensor is configured to emit data for it. Check the device config for `services analytics` / `services extension-service` stanzas.
- **Auth scoped per-RPC** — some Junos setups permit Capabilities/Get but restrict Subscribe by user role. Watch the amber `⚠ N` error counter on the sub row.

**Transient error counter growing** — sub row shows `⚠ 12` amber chip → gnmic is reconnecting repeatedly. Hover the chip for the current error count; open DevTools console for the actual stderr. Common: wrong credentials (silent reconnect), device offline, cert path mismatch.

**Chart shows empty box under "1 sample · waiting for change"** — normal in Rate mode; needs at least 2 raw samples (~2× sample interval) to compute a first rate. First chart line appears on the third sample.

**Y-axis shows raw bytes like `14810345472`** — you're likely on an older build; update to v1.2.1+ where all axis labels flow through the formatter and render as `13.8 GiB`.

## Configuration reference

Per-profile options (Settings → Profiles → your gNMI target):

| Field | Notes |
|---|---|
| Host | Required. Hostname or IP. |
| Port | Vendor-standard when field empty (Arista 6030 · Cisco/Nokia 57400 · Junos 32767). |
| Username / Password | Password saved via keychain (macOS Keychain / Windows Cred Mgr / libsecret). |
| Security | `tls` · `mtls` · `skip-verify` · `insecure`. |
| CA cert path | PEM. Optional; falls back to system trust store. |
| Client cert / key path | PEM. Required for `mtls`. |
| TLS server name | SNI override. |
| Encoding | `JSON_IETF` recommended. Applied on Capabilities + Get only — Subscribe negotiates the device default. |
| Vendor | Preselects standard port + helps you spot native-only paths in the catalog. |
| gRPC dial timeout | Milliseconds. Default 10 000. |
| On-disk history retention | Days. Default 0 (in-memory only). |

## Under the hood

The plugin spawns [`gnmic`](https://github.com/openconfig/gnmic) (Apache-2.0) as a child process rather than talking gRPC directly. Trade-off: an extra process per sub, in exchange for gnmic handling TLS/mTLS, encoding quirks per vendor, reconnect + backoff, and target management. Binary is bundled per-platform under `<app>/Resources/extras/gnmic/<platform>/gnmic`.

- **Subscribe** uses `--format json` — one JSON document per notification; a brace-depth accumulator handles multi-line output.
- **Rate mode** computes `(v[i] − v[i-1]) / (t[i] − t[i-1])` between consecutive samples; skips negative deltas (counter reset on interface flap) rather than plotting a downward spike.
- **Change detection** runs OnPush at 10 Hz max regardless of notification rate (throttled `detectChanges()`) — a 51-way subscribe emitting 5-10 notif/sec was previously running 250-500 CD passes per second and hanging the tab. Now capped at 10.

## Not yet supported

- **Get** and **Set** RPCs (planned for v1.3.0).
- **Persistent background subscriptions** across tabs / dashboards (planned for v2.0.0).
- **Cross-session queries** on retained history (a real time-series store; not on the roadmap).

## Source

- Plugin: [`tlink-gnmi/src`](./src)
- Bundled binary fetch: [`scripts/fetch-gnmic.mjs`](../scripts/fetch-gnmic.mjs)
- Path catalog: [`src/services/pathCatalog.service.ts`](./src/services/pathCatalog.service.ts)
