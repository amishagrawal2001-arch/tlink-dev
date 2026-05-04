import { Component } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

/**
 * Searchable in-app help / quick-reference for the API client.
 *
 * Lives next to the README — the full guide is on disk + GitHub, this
 * modal is the "I just need to remember the hotkey" surface accessible
 * from the ⋮ overflow menu and the `?` keyboard shortcut.
 *
 * The content is grouped into sections; the search box filters items
 * across all sections so users can type "cookie" and immediately see
 * the cookies tab + the related toggles regardless of where they live.
 */

interface HelpItem {
    /** Short label — what the user is trying to do. */
    label: string
    /** How to do it (hotkey, click path, or short prose). */
    howto: string
    /** Optional one-line clarification. */
    detail?: string
    /** Lowercased keywords for the search filter. */
    keywords?: string
}

interface HelpSection {
    title: string
    icon: string
    items: HelpItem[]
}

const SECTIONS: HelpSection[] = [
    {
        title: 'Send + cancel',
        icon: 'fa-paper-plane',
        items: [
            { label: 'Send the request', howto: 'Ctrl+Enter or click Send', keywords: 'send fire run go' },
            { label: 'Cancel in-flight request', howto: 'Click the red Cancel button', detail: 'Replaces Send while a request is running.', keywords: 'cancel abort stop' },
            { label: 'Status-aware tab title', howto: 'Automatic', detail: 'After send: API: ✓ 200 GET /path or ✗ for failures.', keywords: 'title status code' },
        ],
    },
    {
        title: 'URL + environment variables',
        icon: 'fa-layer-group',
        items: [
            { label: 'Focus URL bar', howto: 'Ctrl+L', keywords: 'url focus jump' },
            { label: 'Use a variable', howto: '{{varName}} in URL / headers / body / auth', detail: 'Resolved at send-time. Active env wins; global env is fallback.', keywords: 'env variable substitute template' },
            { label: 'Switch active environment', howto: 'Click the layer-group icon in the URL bar', keywords: 'env environment switch dev staging prod' },
            { label: 'Manage environments', howto: 'Env tab', detail: 'Add / edit / delete envs and their variables. Mark a value as secret to dot it out.', keywords: 'env environment manage edit secret' },
            { label: '"N unresolved" chip in URL bar', howto: 'Means a {{token}} did not resolve', detail: 'Hover for the list. Add the var in Env tab.', keywords: 'unresolved missing env' },
        ],
    },
    {
        title: 'Body types',
        icon: 'fa-file-code',
        items: [
            { label: 'JSON / text', howto: 'Body tab → pick type → edit', keywords: 'json text body' },
            { label: 'urlencoded', howto: 'Body tab → urlencoded → key=value lines', detail: 'One pair per line, or & joined.', keywords: 'urlencoded form key value' },
            { label: 'form-data with files', howto: 'Body tab → form-data → "Add file field" → pick file', keywords: 'multipart form-data file upload' },
            { label: 'GraphQL split editor', howto: 'Body tab → graphql → query + variables panes', detail: 'Optional operation name. Serialized to JSON at send.', keywords: 'graphql query variables operation' },
            { label: 'Binary body', howto: 'Body tab → binary → pick file', detail: 'Raw bytes go on the wire.', keywords: 'binary raw upload' },
        ],
    },
    {
        title: 'Authentication',
        icon: 'fa-key',
        items: [
            { label: 'Bearer token', howto: 'Auth tab → Bearer → paste token', keywords: 'bearer token auth' },
            { label: 'Basic auth', howto: 'Auth tab → Basic → username + password', keywords: 'basic auth username password' },
            { label: 'API key in header or query', howto: 'Auth tab → API Key → name + value + location', keywords: 'apikey api-key header query' },
            { label: 'OAuth 2.0 (auth-code with PKCE)', howto: 'Auth tab → OAuth 2.0 → fill auth/token URLs + client → "Get new token"', detail: 'Opens an Electron window for sign-in; captures the redirect.', keywords: 'oauth oauth2 auth-code pkce' },
            { label: 'OAuth 2.0 (client-credentials)', howto: 'Auth tab → OAuth 2.0 → grant: client_credentials → token URL + client ID/secret', detail: 'Machine-to-machine. No browser prompt.', keywords: 'oauth client credentials machine' },
            { label: 'Clear cached OAuth token', howto: 'Auth tab → OAuth 2.0 → Clear', keywords: 'oauth clear logout' },
            { label: 'AWS SigV4', howto: 'Auth tab → AWS SigV4 → access key + secret + region + service', detail: 'Optional session token for STS credentials. Body must be json/text — multipart/blob can\'t be signed.', keywords: 'aws sigv4 amazon iam' },
        ],
    },
    {
        title: 'Tests + scripts',
        icon: 'fa-vial',
        items: [
            { label: 'Add an assertion', howto: 'Tests tab → Add → pick kind (status / header / body-contains / JSON path)', detail: 'Pass/fail pills render above the response.', keywords: 'assert assertion test verify check' },
            { label: 'Pre-request script', howto: 'Pre tab → JavaScript', detail: 'tlink.req.headers.set, tlink.env.set/get, tlink.log. 2s budget.', keywords: 'pre script javascript before' },
            { label: 'Post-response script', howto: 'Post tab → JavaScript', detail: 'tlink.res.json/status/headers, tlink.env.set, tlink.log.', keywords: 'post script javascript after' },
            { label: 'Auto-extract value to env', howto: 'Extract tab → Add → name + source + JSON path', detail: 'Solves login → call chaining without scripts.', keywords: 'extract chain login token' },
        ],
    },
    {
        title: 'Network overrides',
        icon: 'fa-network-wired',
        items: [
            { label: 'Send through HTTP proxy', howto: 'Net tab → HTTP proxy URL', detail: 'http://corp:3128 or http://user:pass@corp:3128. CONNECT tunnel for HTTPS.', keywords: 'proxy http corp' },
            { label: 'Ignore TLS errors', howto: 'Net tab → "Ignore TLS certificate errors"', detail: 'Dev only — red-flagged in UI.', keywords: 'tls insecure self-signed' },
            { label: 'Client cert / mTLS', howto: 'Net tab → Pick client cert + key + CA', detail: 'PEM files. Used when a server requires client certs.', keywords: 'mtls client cert pem' },
            { label: 'Disable cookies for one request', howto: 'Net tab → uncheck "Send + receive cookies"', keywords: 'cookies disable' },
        ],
    },
    {
        title: 'Collections + history',
        icon: 'fa-folder',
        items: [
            { label: 'Save current request', howto: 'Coll tab → pick collection → +', detail: 'Or Ctrl+S to jump straight to the Coll tab.', keywords: 'save collection store' },
            { label: 'Add folder to a collection', howto: 'Coll tab → folder-plus icon on the collection', keywords: 'folder organize' },
            { label: 'Move request to folder', howto: 'Per-row dropdown', keywords: 'folder move organize' },
            { label: 'Reorder requests', howto: '↑ / ↓ buttons on each row', keywords: 'reorder sort move' },
            { label: 'Re-run from history', howto: 'Hist tab → click any row', detail: 'Auto-logged on every send (capped 100, persists across restarts).', keywords: 'history rerun replay' },
            { label: 'Clear history', howto: 'Hist tab → trash icon at top', keywords: 'history clear delete' },
        ],
    },
    {
        title: 'Cookies',
        icon: 'fa-cookie-bite',
        items: [
            { label: 'View cookies', howto: 'Cookies tab', detail: 'Domain-suffix matched. Set-Cookie ingest is automatic.', keywords: 'cookies view jar' },
            { label: 'Edit a cookie', howto: 'Cookies tab → edit name/value/domain inline', keywords: 'cookies edit' },
            { label: 'Clear all cookies', howto: 'Cookies tab → trash icon at top', keywords: 'cookies clear delete' },
        ],
    },
    {
        title: 'Imports',
        icon: 'fa-file-import',
        items: [
            { label: 'Import cURL', howto: '⋮ overflow → Import cURL → paste', keywords: 'curl import paste' },
            { label: 'Import Postman v2.1', howto: '⋮ overflow → Import Postman → paste collection JSON', detail: 'Folders + variables come along.', keywords: 'postman import collection' },
            { label: 'Import OpenAPI 3.x', howto: '⋮ overflow → Import OpenAPI → paste JSON', detail: 'One example request per (path, method).', keywords: 'openapi swagger import' },
        ],
    },
    {
        title: 'Code generation',
        icon: 'fa-code',
        items: [
            { label: 'Copy as cURL', howto: '⋮ overflow → Copy as cURL', keywords: 'copy curl export' },
            { label: 'Copy as fetch / axios / Python / Go', howto: '⋮ overflow → Copy as …', keywords: 'copy code generate fetch axios python go' },
        ],
    },
    {
        title: 'Realtime (WS / SSE)',
        icon: 'fa-bolt',
        items: [
            { label: 'Toggle realtime mode', howto: '⋮ overflow → Enable realtime (WS/SSE)', detail: 'Response area becomes a bidirectional frame timeline.', keywords: 'websocket sse realtime' },
            { label: 'Connect a WebSocket', howto: 'wss:// URL → Connect → type message + Send', keywords: 'websocket connect wss' },
            { label: 'Subscribe to SSE', howto: 'https:// URL → Connect (SSE mode)', keywords: 'sse server-sent events stream' },
            { label: 'Clear frame log', howto: 'Clear button on the realtime toolbar', keywords: 'frames clear realtime' },
        ],
    },
    {
        title: 'Response',
        icon: 'fa-file-alt',
        items: [
            { label: 'Find in response', howto: 'Ctrl+F', detail: 'Matches highlight in yellow.', keywords: 'find search response' },
            { label: 'Save response to file', howto: 'Download icon on response toolbar', detail: 'Suggests a filename based on URL + content-type.', keywords: 'save download response file' },
            { label: 'Image preview', howto: 'Automatic for image/* responses', detail: 'Preview tab appears next to Body.', keywords: 'image preview png jpg' },
            { label: 'Copy response body', howto: 'Copy icon on response toolbar', keywords: 'copy response body' },
        ],
    },
]

@Component({
    templateUrl: './helpModal.component.pug',
    styleUrls: ['./helpModal.component.scss'],
})
export class HelpModalComponent {
    sections = SECTIONS
    query = ''

    constructor (private modalInstance: NgbActiveModal) {}

    /** Filter sections + items by the search box. A section appears
     *  when at least one of its items matches; non-matching items are
     *  hidden so the visible list stays tight. Empty query shows
     *  everything. */
    visibleSections (): HelpSection[] {
        const q = this.query.trim().toLowerCase()
        if (!q) {
            return this.sections
        }
        const out: HelpSection[] = []
        for (const sec of this.sections) {
            const items = sec.items.filter(it => this.matches(it, sec.title, q))
            if (items.length) {
                out.push({ ...sec, items })
            }
        }
        return out
    }

    private matches (it: HelpItem, sectionTitle: string, q: string): boolean {
        return it.label.toLowerCase().includes(q)
            || it.howto.toLowerCase().includes(q)
            || (it.detail?.toLowerCase().includes(q) ?? false)
            || (it.keywords?.toLowerCase().includes(q) ?? false)
            || sectionTitle.toLowerCase().includes(q)
    }

    close (): void {
        this.modalInstance.close(null)
    }
}
