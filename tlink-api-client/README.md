# Tlink API Client

A built-in HTTP + realtime API client for Tlink. Postman-equivalent
features without leaving the terminal.

Open via the toolbar globe icon, or press the API-client toolbar
button. Each request lives in its own tab.

---

## Quick reference

| What you want | How |
|---|---|
| Send the request | `Ctrl+Enter` (or click **Send**) |
| Cancel a slow request | Click the red **Cancel** button (replaces Send while in flight) |
| Focus the URL bar | `Ctrl+L` |
| Save current request to a collection | `Ctrl+S` (jumps to Coll tab) |
| Find inside the response | `Ctrl+F` |
| Open the help dialog | `?` (or ⋮ overflow → **Help**) |
| Import cURL / Postman / OpenAPI | ⋮ overflow → **Import …** |
| Copy as cURL / fetch / axios / Python / Go | ⋮ overflow → **Copy as …** |
| Toggle WebSocket / SSE realtime mode | ⋮ overflow → **Enable realtime** |

---

## Tabs

The request panel has 12 tabs. Most do what you'd expect; the less
obvious ones are documented here.

### Headers · Body · Auth
Standard Postman-style fields. Body type picker covers `none`, `json`,
`text`, `urlencoded`, `form-data`, `graphql`, `binary`. Auth covers
**No Auth**, **Bearer**, **Basic**, **API Key** (header or query),
**OAuth 2.0** (auth-code+PKCE / client-credentials / password grants),
**AWS SigV4**.

### Tests
Quick assertions on the response — `status eq 200`, `header X-Foo
exists`, `body-contains "ok"`, `json-path data.id eq 42`. Pass/fail
pills render above the response body.

### Pre · Post (scripts)
JavaScript that runs around the request. The `tlink` API mirrors
Postman's `pm.*`:

```js
// Pre-script — mutate the outgoing request
tlink.req.headers.set('X-Trace-Id', crypto.randomUUID())
tlink.env.set('startedAt', String(Date.now()))

// Post-script — read the response, save to env
const json = tlink.res.json()
tlink.env.set('token', json.access_token)
tlink.log('Got token:', json.access_token.slice(0, 8) + '…')
```

Available API:
- `tlink.env.get(name)` / `tlink.env.set(name, value)` — environment vars
- `tlink.req.url`, `tlink.req.body`, `tlink.req.headers.{get,set,remove}` (pre only)
- `tlink.res.{status, statusText, headers, body, size, time}`, `tlink.res.json()` (post only)
- `tlink.log(...)` — appears in DevTools console

Scripts run in a Function-constructor sandbox with a 2 s budget. Long
scripts emit a warning toast.

### Extract
Auto-extract a value from the response into an env var. Pick a source
(body / header / status), a JSON path (`data.user.id`,
`items[0].token`), and a target var name. The next request can
reference it as `{{name}}`.

This is the **chaining workflow** without writing a script — login →
extract `data.access_token` to `token` → next request uses
`Authorization: Bearer {{token}}`.

### Net
Per-request network overrides:
- **Send + receive cookies** toggle (cookies are persisted in the jar
  by default)
- **HTTP proxy URL** — `http://corp:3128` or
  `http://user:pass@corp:3128`
- **Ignore TLS errors** — for self-signed dev targets (red-flagged)
- **Client cert / private key / CA** PEM file paths for mTLS

Plain HTTP/HTTPS without these knobs uses the browser's `fetch`. Any
of these activated routes the request through Node's `https`/`http`
modules so we can plumb the underlying TLS / proxy layers.

### Coll (Collections)
Saved requests grouped into collections, optionally with folders.

- **Add folder** (folder-plus icon on the collection title)
- **Move to folder** dropdown on each saved request row
- **↑ / ↓** buttons to reorder within the same group

Collections imported from Postman or OpenAPI get a `postman` /
`openapi` source label.

### Cookies
Domain-suffix-matched cookie jar. On send, matching cookies are
attached as a `Cookie:` header. On receive, `Set-Cookie` is parsed
and merged. View / edit / delete entries directly. Per-request
opt-out lives on the **Net** tab.

### Hist (History)
Every send is auto-logged (capped at 100 entries; bodies trimmed to
2 KB previews). Click any row to reload the request and re-send.
Trash icon per row, "clear all" on the header.

### Env (Environments)
Named bags of variables (`dev`, `staging`, `prod`) plus an implicit
`global` env that always layers underneath the active one. Variables
are key=value pairs with `enabled` and `secret` toggles.

`{{var}}` substitution runs over URL, headers, body, and auth at
send-time. Active environment wins; falls through to global. Unknown
tokens stay literal so the user sees `{{thing}}` and can fix it. The
URL bar shows an "**N unresolved**" chip when tokens don't resolve.

The active environment switcher lives in the **URL bar** (layer-group
icon) — quick switch without leaving the request.

---

## Imports

Open the ⋮ overflow menu → **Import …**.

### cURL
Paste a cURL command. The tokenizer handles quoted args, line
continuations, and the common flags:
`-X / --request`, `-H / --header`, `-d / --data / --data-raw /
--data-binary / --data-urlencode`, `-F / --form`, `-u / --user`,
`-A / --user-agent`, `-e / --referer`, `-b / --cookie`, `-G`,
`-I / --head`, `-k / --insecure`, `-L / --location`, etc.

A standalone `Authorization: Bearer …` header gets promoted to the
auth tab automatically.

### Postman v2.1
Paste a Postman collection JSON. Folders + variables come along. Items
that use Postman features we don't implement (auth helpers, runtime
events, runs) are collected as `warnings[]` and shown in DevTools
console; the rest still imports cleanly.

### OpenAPI 3.x
Paste an OpenAPI JSON document. Generates one example request per
`(path, method)`, baking default values from `parameters`,
`requestBody.examples`, or schema-shaped synthesized objects. Servers
fold into a base URL.

---

## OAuth 2.0

Three grants supported:

| Grant | Use case |
|---|---|
| `authorization_code` (with optional PKCE) | Most user-facing OAuth flows. Opens an Electron BrowserWindow for the consent screen, captures `?code=` from the redirect, exchanges for tokens at the token endpoint. |
| `client_credentials` | Machine-to-machine. No browser prompt. |
| `password` | Resource-owner credentials — discouraged but supported for legacy APIs. |

Tokens are cached on the request's `auth.oauth2` block. Refresh runs
silently when `expires_in` is set + a refresh token came back. Click
**Clear** in the auth panel to drop the cache and force a new prompt.

---

## AWS SigV4

Pure-TS implementation against the canonical recipe — sign the
request body's SHA-256, derive `kSigning` via the
`kDate → kRegion → kService → aws4_request` chain, HMAC the
string-to-sign.

Fill in:
- **Access Key ID** + **Secret Access Key**
- **Region** (`us-east-1`, etc.)
- **Service** (`execute-api`, `s3`, `lambda`, …)
- Optional **Session token** (for STS / role-assumption credentials)

The `Authorization`, `X-Amz-Date`, and `X-Amz-Content-Sha256` headers
are added at send-time. Multipart/blob bodies aren't signable — use
`json` or `text` body type instead.

---

## Realtime mode (WebSocket + SSE)

⋮ overflow → **Enable realtime**. The response area becomes a
bidirectional frame timeline.

- **WebSocket**: enter `wss://...` URL → **Connect** → type a message
  + Send. Frames in/out/system render with direction icons.
- **SSE**: enter `https://...` URL → **Connect** → server-sent events
  stream into the timeline.

URL-bar env substitution + the cookie jar both still apply. Frame
log capped at 500 entries to bound memory for chatty endpoints.

---

## Code generation

⋮ overflow → **Copy as …** writes the current request as standalone
code. Targets:

- **fetch** (browser/Node `fetch`)
- **axios**
- **Python requests**
- **Go net/http**

Useful when you've prototyped the request in the API client and want
to drop it into your codebase.

---

## On-disk persistence

Everything lives in tlink's main config file under the `apiClient` key:

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/tlink/config.yaml` |
| Linux | `~/.config/tlink/config.yaml` |
| Windows | `%APPDATA%\tlink\config.yaml` |

Persisted state:
- `apiClient.collections[]` — saved request groups
- `apiClient.environments[]` + `apiClient.activeEnvironmentId`
- `apiClient.history[]` — last 100 sends
- `apiClient.cookies[]` — the jar

Importing a Postman collection appends to `collections[]` rather
than replacing.

---

## Troubleshooting

### URL bar / tabs missing or unclickable
Pull the latest, fully **quit** the app (`Cmd+Q` / `Ctrl+Q`), relaunch.
A reload-only doesn't always clear stuck modal backdrops, which can
sit on top of the tab eating clicks.

### `{{var}}` shows up literally in the response
Means the env didn't resolve the token. Check the **Env** tab that
the variable is enabled in either the active or global environment.
The URL bar chip ("N unresolved") tells you in advance.

### OAuth code-flow window won't open
Requires Electron's BrowserWindow — this won't work in the web build.
Switch to client-credentials or password grant if your API supports
them.

### "AWS SigV4 cannot sign multipart / blob bodies"
Use `json` or `text` body type. The signature requires a deterministic
SHA-256 of the body, which the renderer can't compute reliably for
FormData.

### Pre/post script runs forever
Hard-killed by the 2 s budget. Trim the loop or move heavy logic
out of the script.

---

## Hotkey reference

All hotkeys are also registered as global ids you can rebind in
**Settings → Hotkeys**:

- `api-client.send` — Send the request
- `api-client.save` — Save to collection
- `api-client.focus-url` — Focus the URL bar
- `api-client.toggle-history` — Toggle the History tab
- `api-client.find` — Find in response
- `api-client.cancel` — Cancel in-flight request
- `api-client.import-curl` — Open cURL import modal
- `api-client.help` — Open this help dialog
