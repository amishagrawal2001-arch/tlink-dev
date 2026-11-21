# Dashboards

Dashboards let you watch live telemetry from gNMI devices and Prometheus /
Telegraf endpoints side by side on a single page, with threshold alerts and
shareable JSON exports.

## Quickstart

1. Open the **Dashboards** side panel from the left rail.
2. Click **Add dashboard**. Give it a name, then add one or more tiles.
3. Each tile needs:
   - a **type** (value / sparkline / chart),
   - a **source** — a `gnmi` or `collector` profile you've already created,
   - a **path** — e.g. `/cpu/utilization` for Prometheus or
     `/interfaces/interface[name=eth0]/state/counters/in-octets` for gNMI,
   - an optional **title**.

Save. The dashboard opens as a tab; tiles light up as data flows.

If a tile stays grey, the source profile has likely never been opened in a
session tab — open it once so Tlink can authenticate and the broker can
spin up the underlying subscription.

## Tile types

- **Value** — a single big number plus a delta chip. Best for a current state
  reading you want to glance at — CPU %, active sessions, latency.
- **Sparkline** — a small line chart over the last ~60 samples. Best for "is
  this trending up or down" at a glance alongside the current number.
- **Chart** — a larger area + line chart with a current-value caption. Best
  when the *shape* of the series matters — spikes, plateaus, ramp rates.

All three tiles update from the same shared telemetry runner, so pouring more
tiles onto a dashboard doesn't add polling load for paths that are already
being watched elsewhere.

## Threshold alerts

Each tile can carry an optional threshold:

| field       | meaning                                                      |
|-------------|--------------------------------------------------------------|
| `op`        | `>`, `>=`, `<`, `<=`, or `==`.                               |
| `value`     | The number to compare against.                               |
| `severity`  | `info`, `warning`, or `critical` — controls badge color.     |
| `notify`    | Fire an OS notification on crossing (default true).          |
| `cooldownSec` | Minimum seconds between repeat notifications (default 60).  |

Behavior:

- **Edge-triggered**: the notification fires once when the condition goes from
  *not met* → *met*. A value that stays over threshold doesn't re-notify.
- **Cooldown**: if a value flaps rapidly across the threshold, notifications
  still fire at most once per `cooldownSec`. The tile badge stays accurate
  per sample.
- **Focus-aware**: when the Tlink window has focus, the alert shows as an
  in-app toast. When Tlink is in the background or hidden, a native OS
  notification fires instead (so you see it in Notification Center / the
  taskbar).
- **Ephemeral**: badge and alert state do not persist across closing the
  dashboard. The next sample re-evaluates.
- **Non-numeric values** (string-valued gNMI paths, for example) are silently
  skipped — no spurious alerts.

Compound expressions (`AND` / `OR` of multiple conditions) are not supported
yet; one op per tile.

## Import / export

Dashboards export to and import from JSON files with a `.tlink-dashboard.json`
extension.

### What's in the file

```jsonc
{
  "tlinkDashboardFormat": 1,       // schema version — forward-compatible
  "exportedAt": "2026-11-20T…Z",
  "exportedBy": "optional email",  // omitted unless the exporter set it
  "dashboard": {
    "id": "…",
    "name": "…",
    "tiles": [ /* layout, source refs, thresholds */ ]
  }
}
```

The payload includes **only** dashboard structure, tile configs, and profile
ID references. Credentials, keychain refs, host identity, and SSH keys are
*not* exported.

### Importing

1. In the Dashboards side panel header, click **Import**.
2. Pick a `.tlink-dashboard.json` file.
3. The preview modal lists each tile's source profile with a ✓ (profile
   exists locally) or ✗ (missing).
4. Click **Import** to save.

If any tile references a profile ID that doesn't exist in this workspace, the
imported dashboard loads anyway and those tiles render an error state. To fix,
either create / rename a profile with the expected ID, or edit the tile and
point it at a local profile.

If the dashboard's `id` already exists in your config, the imported copy
lands as `<id>-imported-<rand>` so the original is preserved.

### Compatibility

`tlinkDashboardFormat: 1` is the current version. Future format changes will
ship a migration step so older files keep importing. A dashboard exported
with an unknown higher format version will refuse to import with a clear
message pointing to the version mismatch.

## How polling works

Dashboards and session tabs share one underlying subscription per
`(profile, path, …)` tuple. Opening a dashboard that watches `/cpu/utilization`
on a Prometheus endpoint already open in a session tab reuses the same scrape
loop — the endpoint is not polled twice.

Reference counting is per subscription key. The last observer leaving drops
the subscription (with a short teardown grace to absorb rapid remount).

This changes one piece of session-tab behavior: **Pause** on a gNMI session
tab subscription previously stopped polling the device. With the shared
runner, it now stops showing samples *to that row*; if a dashboard tile is
watching the same path, the subscription stays open for the tile. To fully
stop polling, close every tab/tile observing that path.

## Troubleshooting

### Tile shows no data / stays grey

- Open the source profile in a session tab at least once so Tlink can
  authenticate and the underlying subscription can spin up.
- Verify the `path` exists on the source. For gNMI, use the **Add path**
  catalog in a session tab to confirm. For collector, open a session tab
  and check that the path appears in Latest.
- Non-numeric paths render in value tiles but are skipped for threshold
  evaluation and don't render in sparkline / chart tiles.

### Threshold alert never fires

- Confirm the value is numeric. Open the source's session tab and check the
  Latest view — string values (textual state, enums) don't trigger alerts.
- Check the cooldown: if the condition already fired, you'll wait up to
  `cooldownSec` before the next notification even if the value crossed again.
- Native notifications only appear when Tlink is in the background. If Tlink
  is focused, look for a toast instead.
- On macOS / Windows, confirm the OS allows notifications from Tlink in
  system Settings → Notifications.

### Import fails

- Check the error toast — it names the first offending field.
- Confirm `tlinkDashboardFormat` matches a version this build understands.
- A profile reference that doesn't exist locally **does not** block import —
  the dashboard loads with error-state tiles. If import still refuses, the
  issue is with the schema itself (malformed JSON, missing required field,
  unknown threshold operator).
