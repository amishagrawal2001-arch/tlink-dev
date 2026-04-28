# Changelog — @tlink/license-client

## [1.1.0] - 2026-04-27 — Cloud server compatibility

Adds first-class support for cloud-hosted license servers (AWS API
Gateway shape) alongside the existing local Express-based server.
A user-editable Settings UI now exposes the server URL, product code,
and email pre-fill so a tenant whose deployment differs from the
build-time defaults doesn't have to rebuild the app.

### Added

- **Configurable server URL with smart shape detection.** `serverUrl`
  now accepts three forms and routes endpoints correctly for each:
  1. Bare host / legacy (`http://localhost:4000`) →
     `${base}/api/licenses/<action>` and `${base}/api/health`.
  2. API root (`https://…/dev/api/v1`) →
     `${base}/licenses/<action>` and `${base}/health`.
  3. Licenses-rooted (`https://…/dev/api/v1/licenses/`) →
     `${base}/<action>` and `${apiRoot}/health` (the `/licenses`
     suffix is stripped to derive the API root).
  All three forms collapse to a single `apiRoot` anchor in
  `apiRootFromBase()`, so the rest of the URL builders stay simple.
- **Action-name translation for cloud bases.** `licenseEndpoint()`
  maps both `activate` and `refresh` → `validate` when the base is
  not bare-host. AWS exposes a single `/validate` endpoint that
  handles both flows; the request body distinguishes them
  (credentials vs `refresh_token`).
- **Envelope normalization.** `normalizeEnvelope(raw)` +
  `normalizeHeartbeat(raw)` map AWS-shape responses where
  `license_type` carries the BILLING flavor (`'PAID'` / `'TRIAL'`)
  and `billing_type` is absent. Auto-detects the swap, defaults the
  missing seat tier to `'INDIVIDUAL'`, coerces `reason_code: null` →
  `'OK'` on VALID. No-op for the local server's responses, which
  already split the two semantics.
- **Editable product code.** New `productCode` getter/setter on
  `TlinkLicenseService` reading from / writing to localStorage
  (`tlink-license-product-code`). Falls back to the build-time
  config default when unset. The activate request body now reads
  `this.productCode` so the override flows through end-to-end.
- **Last-signed-in email persistence.** `lastSignInEmail` getter
  exposes the email of the most recent successful activate, saved
  to localStorage (`tlink-license-last-email`) — NOT the keychain
  bundle. Survives token wipes (offline grace expiry, sign-out).
  Passwords are deliberately never persisted.
- **Settings UI for all of the above.** Three new fields in
  Settings → License Server: server URL (with placeholder examples
  for all three shapes), product code (with description steering
  users away from changing it unless they have a real
  PRODUCT_NOT_ENTITLED reason), and email pre-fill on the sign-in
  form (uses live `userEmail` first, falls back to `lastSignInEmail`).

### Fixed

- **Health endpoint location for cloud servers.** Earlier in this
  release I had health going to `${base}/licenses/health` for the
  versioned-API-root case, but AWS exposes `/health` at the API
  root (not under `/licenses`). Now derives a unified `apiRoot` and
  hangs `health` off it directly.
- **Layout regression in Settings.** The verbose initial description
  copy on the License Server form expanded `.header` enough that the
  sibling `.license-input-row` was squeezed to zero width in
  `.form-line`'s flex layout — the input field disappeared. Fixed by
  shortening the copy AND adding defensive CSS (`min-width: 320px`
  on the row, `flex: 1` on the inner input).
- **Template parser crash.** A `${apiRoot}` literal in the
  description text triggered Angular's ICU parser to look for a
  matching `}` and crash bootstrap with "Invalid ICU message".
  Removed the literal.

### Notes

- Trace for the AWS deployment (`https://b8yf8qingg.execute-api.us-
  west-1.amazonaws.com/dev/api/v1`):
  - `health` → `…/dev/api/v1/health`
  - `activate` / `refresh` → `…/dev/api/v1/licenses/validate`
- `heartbeat`, `deactivate`, and `public-key` are NOT translated for
  cloud bases yet — they pass through with their literal names. If
  AWS exposes them under different paths we'll extend the
  translation map then.

---

## [1.0.0] - Initial release

Reusable Angular license management UI components extracted from the
desktop apps. Activate / deactivate / refresh / heartbeat against a
local Express-based license server, keychain token persistence, 30-day
local trial, offline activation codes via RS256-signed payloads.
