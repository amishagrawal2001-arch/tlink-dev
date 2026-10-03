# tlink-collector

**Pull-based metrics client for tlink.**

Scrape Prometheus-format `/metrics` endpoints — Prometheus server itself, Telegraf's `prometheus_client` output, Node Exporter, Blackbox Exporter, your app's `/metrics` route, anything speaking the [Prometheus text-exposition format](https://prometheus.io/docs/instrumenting/exposition_formats/). View live gauges, counters, rates, and current state alongside your SSH / RDP / gNMI tabs. Ships with a Mock source for demos and offline development.

## Quickstart

**From the Tools menu** (bottom-left shortcut bar → wrench icon):

- **Mock metrics source** — no setup; a synthetic exporter with 5 hosts × 4 metrics starts streaming immediately.
- **Prometheus** — defaults to `http://localhost:9090/metrics` (Prometheus server's own self-scrape).
- **Telegraf endpoint** — defaults to `http://localhost:9273/metrics` (Telegraf's `prometheus_client` output default port).

Each entry opens the profile edit modal pre-filled with the right template; fill in URL / auth / scrape interval and hit **Save** to open the session tab.

**From Settings → Profiles**: **+ New profile** → **Collector target** → pick source → fill fields → **Connect**.

## View modes

Toggle in the center-pane toolbar: **Wire log** · **Latest** · **Graphical**.

- **Wire log** (default) — every scraped sample as a row: timestamp, path, value, kind. Filter, pause, or copy as JSONL.
- **Latest** — one row per unique path with the current value, a sparkline of the last N samples, delta from previous, and age. Grouped by metric name + list key, so `node_cpu_seconds_total` with 8 CPUs renders as a single group with 8 rows.
- **Graphical** — chart-card grid. One card per label combination sharing a common metric name. Windowable (1m / 5m / 15m / 30m / 1h / All), auto-scales byte counters (GiB / MiB / K B/s), rate mode auto-detects `_total` / `-octets` / `-pkts` counters and plots per-second delta instead of the raw monotonic value.

**Click a chart card** to expand into a full-pane view with x/y axis labels, hover crosshair, and exact-value tooltip.

## Data sources

### Mock

Zero config — picks a scenario and fans out across N synthetic hosts, emits four metrics each (`cpu_percent`, `memory_bytes`, `requests_total`, `errors_total`) on your chosen scrape interval. Scenarios shape how values move:

| Scenario | What it looks like |
|---|---|
| `idle` | Low CPU (5-30 %), gentle memory jitter, small counter growth. Good for calm-dashboard testing. |
| `busy` | High CPU (60-95 %), climbing memory, steady request counter growth, occasional errors. |
| `flapping` | CPU spikes to 90+ % every 6 ticks then recovers. Exercises rate detection + alerting UIs. |
| `growing` | Deliberate memory leak (+1 MiB/tick), high request rate, slow error accrual. |

Host count is configurable 1-N — set to 50+ to pressure-test the throttled change-detection path.

### Prometheus / Telegraf

Point `url` at any Prometheus-text-format endpoint. The adapter:

- Scrapes on the profile's `scrapeIntervalSec` cadence (first scrape at +50 ms so the UI has data on first render).
- Parses the full text-exposition spec — labels with escaped `\"`, `\\`, `\n` sequences; scientific notation; optional per-sample timestamp (ms since epoch); `+Inf` / `-Inf` / `NaN`.
- Encodes each series as `/prometheus/<name>[k1=v1][k2=v2]…` with sorted-key labels for stable paths across scrapes.
- Keeps parsing on a bad line — a malformed metric doesn't drop the whole scrape.
- Transient failures (HTTP 500, dropped socket, 15 s timeout) emit on the tab's error strip but keep the timer running — a flapping endpoint shouldn't force a reconnect.

Auth: **Bearer token** wins over **basic (username/password)** when both are set, matching how most exporters document their options. `insecureTls` flips `rejectUnauthorized: false` on HTTPS requests for self-signed lab certs.

**Metric filter** is a regex compiled once per start; invalid regex falls back to escaped-substring match rather than silently dropping everything. Example: `^(node_cpu|node_memory)` scopes to just those families.

## Troubleshooting

**"Prometheus source needs a URL"** — the URL field is empty on the profile. Fill in the full URL including `http://` or `https://` and the `/metrics` path.

**"Invalid Prometheus URL"** — malformed URL (missing scheme, bad host). Validation runs on **Save** so you see this immediately, not after a full scrape interval.

**"HTTP 404 Not Found"** on first scrape — endpoint responded but the path isn't `/metrics`. Check the exporter's docs; some use `/metrics/`, `/-/metrics`, or a custom route.

**"Scrape timed out after 15s"** — the exporter is slow to respond. Raise `scrapeIntervalSec` if the delay is normal; otherwise investigate exporter health.

**TLS handshake refused on HTTPS** — set `insecureTls: true` for self-signed labs, or supply a correct CA via your OS trust store (the adapter uses system trust by default).

**Chart shows empty box under "1 sample · waiting for change"** — normal in Rate mode; needs ≥2 raw samples (~2× scrape interval) to compute a first rate. First chart line appears on the third sample.

**Latest view shows raw `5368709120` instead of `5.0 GiB`** — the leaf name isn't matching the formatter's byte heuristic. Standard conventions (`*_bytes`, `*-bytes`, `/memory/`, `/storage/`, `/filesystem/`) are recognized out of the box; other naming (`*_mem_mb`) will render raw.

## Configuration reference

Per-profile options (Settings → Profiles → your Collector target):

| Field | Notes |
|---|---|
| Source | `mock` or `prometheus`. Telegraf uses `prometheus` with its `prometheus_client` output URL. |
| Scrape interval | Seconds. Default 10 (5 for Mock). Minimum 1. |
| URL | Required for `prometheus`. Must be `http://` or `https://`. |
| Username / Password | Basic auth. Password saved via keychain. |
| Bearer token | Takes precedence over basic auth when both set. |
| Insecure TLS | Skip server cert verification. HTTPS only; `http://` ignores this field. |
| Metric filter | Optional regex applied to metric names after scraping. Invalid regex falls back to substring. |
| Mock host count | Mock only. Default 5; raise to pressure-test throttled CD. |
| Mock scenario | Mock only. `idle` · `busy` · `flapping` · `growing`. |

## Under the hood

Native `node:http` / `node:https` — no undici workaround needed for `rejectUnauthorized: false`, and the request shape is simple enough that pulling in `axios` or `undici` would be overkill.

- **Timer** runs outside Angular's zone. First scrape at +50 ms, then `setInterval(scrapeIntervalSec * 1000)`. Session tab wraps emitted samples in a throttled `detectChanges()` (10 Hz max) so a chatty endpoint doesn't drop frames.
- **Path convention** mirrors gNMI's list-key syntax (`/prometheus/<name>[k1=v1][k2=v2]…`) so the Latest + Graphical view code — including the formatter's `leafName` / `parentPath` / `lastListKey` helpers — works unmodified against Prometheus series.
- **Rate mode** uses the gNMI plugin's heuristic plus `*_total` (Prometheus counter convention): any leaf ending in `_total`, `-octets`, `-pkts`, `-packets`, `-count`, `-frames`, `-errors`, `-discards`, or sitting under `/counters/` plots as per-second rate.
- **Formatter** recognizes Prometheus naming on top of the OpenConfig conventions: `*_percent` → `%` unit, `*_bytes` → GiB/MiB auto-scale, `*_total` → thousands separator in Value mode.
- **Mock** is a first-class source (not test-only) because it doubles as a demo target and a UI regression harness. Every new source type lands behind the same `start(profile) → CollectorHandle` contract so the session tab stays source-agnostic.

## Not yet supported

- **Protobuf exposition format** — rarely used by exporters today; text format covers ~100 % of what you'll hit.
- **OpenMetrics-specific features** (exemplars, suffix stripping conventions) — parsed as plain text; no semantic handling yet.
- **Pushgateway**, **ServiceMonitor-style discovery**, or **relabeling** — bring the final URL yourself.
- **InfluxDB / OTLP** — separate source types; not on the roadmap.
- **On-disk retention** of scraped history — tab-lifetime only. (Planned, matches the gNMI plugin's optional retention.)

## Source

- Plugin: [`tlink-collector/src`](./src)
- Prometheus adapter + parser: [`src/services/prometheus.service.ts`](./src/services/prometheus.service.ts)
- Mock source: [`src/services/mock.service.ts`](./src/services/mock.service.ts)
- Formatter: [`src/services/valueFormatter.service.ts`](./src/services/valueFormatter.service.ts)
