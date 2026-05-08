import { Component, Injector, HostBinding, HostListener, ViewChild, ElementRef, OnDestroy } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { Subscription } from 'rxjs'
import { BaseTabComponent, ConfigService, NotificationsService, HotkeysService } from 'tlink-core'
import { HttpClientService } from '../services/httpClient.service'
import { EnvironmentService } from '../services/environment.service'
import { HistoryService } from '../services/history.service'
import { AssertionsService } from '../services/assertions.service'
import { ScriptService } from '../services/script.service'
import { OAuth2Service } from '../services/oauth2.service'
import { CookiesService } from '../services/cookies.service'
import { WebSocketService, RealtimeKind } from '../services/websocket.service'
import { exportCurl, exportCode, CodeTarget } from '../services/curl'
import {
    APIClientProfile, APIResponse, HttpMethod, BodyType, AuthType, RequestHeader,
    SavedRequest, APICollection, APIEnvironment, EnvironmentVariable,
    FormDataField, ResponseExtractor, ResponseAssertion, GraphQLPayload, OAuth2Config,
    APIKeyLocation, OAuth2GrantType, AwsSigV4Config, TLSConfig, CookieEntry, APIFolder,
} from '../api/interfaces'
import { ImportModalComponent, ImportCollectionResult, ImportModalResult } from './importModal.component'
import { HelpModalComponent } from './helpModal.component'

/**
 * The big API-client tab. Hosts:
 *   - Request URL + method + send/cancel
 *   - Tabs: Params · Headers · Body · Auth · Tests · Pre · Extract · Coll · Hist · Env
 *   - Response pane with body / headers / raw / preview, search-in-text,
 *     status-aware assertions, save-to-file, copy-as-{cURL,fetch,axios,…}
 *   - Realtime mode (WebSocket / SSE) — flips the response area into a
 *     bidirectional frame timeline
 *
 * State persistence is split between three sinks:
 *   - Per-request edits live on `this.*` and serialize into the
 *     recovery token + saved-collection entry.
 *   - Environments + history + collections are shared across tabs and
 *     live in the global config store via their respective services.
 *   - OAuth2 tokens are cached on the AuthConfig (and thus inside the
 *     saved request) so re-opens skip the browser prompt.
 */
@Component({
    selector: 'api-client-tab',
    templateUrl: './apiClientTab.component.pug',
    styleUrls: ['./apiClientTab.component.scss'],
    providers: [WebSocketService],
})
export class APIClientTabComponent extends BaseTabComponent implements OnDestroy {
    @HostBinding('class.api-client-tab') hostClass = true

    profile: APIClientProfile
    methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']
    bodyTypes: BodyType[] = ['none', 'json', 'text', 'urlencoded', 'form-data', 'graphql', 'binary']
    authTypes: AuthType[] = ['none', 'bearer', 'basic', 'apikey', 'oauth2', 'awsSigV4']
    grantTypes: OAuth2GrantType[] = ['authorization_code', 'client_credentials', 'password']
    codeTargets: CodeTarget[] = ['fetch', 'axios', 'python', 'go']

    /** Static-ish request-tab list — pulled out of pug because nested
     *  object literals don't survive Angular's interpolation parser. */
    readonly requestTabs: { id: APIClientTabComponent['activeRequestTab'], label: string }[] = [
        { id: 'headers', label: 'Headers' },
        { id: 'body', label: 'Body' },
        { id: 'auth', label: 'Auth' },
        { id: 'tests', label: 'Tests' },
        { id: 'pre', label: 'Pre' },
        { id: 'post', label: 'Post' },
        { id: 'extract', label: 'Extract' },
        { id: 'net', label: 'Net' },
        { id: 'collections', label: 'Coll' },
        { id: 'cookies', label: 'Cookies' },
        { id: 'history', label: 'Hist' },
        { id: 'env', label: 'Env' },
    ]

    authLabel (type: AuthType): string {
        switch (type) {
            case 'none': return 'No Auth'
            case 'bearer': return 'Bearer'
            case 'basic': return 'Basic'
            case 'apikey': return 'API Key'
            case 'oauth2': return 'OAuth 2.0'
            case 'awsSigV4': return 'AWS SigV4'
            default: return type
        }
    }

    url = 'https://httpbin.org/get'
    method: HttpMethod = 'GET'
    headers: RequestHeader[] = [{ key: '', value: '', enabled: true }]
    body = ''
    bodyType: BodyType = 'none'
    bodyColor = ''
    bodyBgColor = ''
    jsonError: string | null = null
    activeColorPicker: 'text' | 'bg' | null = null

    formData: FormDataField[] = []
    binaryPath = ''
    graphql: GraphQLPayload = { query: '', variables: '{\n}\n', operationName: '' }
    extractors: ResponseExtractor[] = []
    assertions: ResponseAssertion[] = []
    preScript = ''
    postScript = ''

    textPresets: string[] = [
        '#ffffff', '#f8fafc', '#e5e7eb', '#cbd5e1',
        '#fef9c3', '#fde68a', '#fcd34d', '#fb923c',
        '#86efac', '#60a5fa', '#c084fc', '#f87171',
        '#374151', '#1f2937', '#111827', '#000000',
    ]

    bgPresets: string[] = [
        '#ffffff', '#f8fafc', '#fef9c3', '#fef3c7',
        '#d1fae5', '#dbeafe', '#e9d5ff', '#fce7f3',
        '#e5e7eb', '#cbd5e1', '#94a3b8', '#64748b',
        '#1f2937', '#111827', '#0f172a', '#0c0c0c',
    ]

    auth: { type: AuthType, token: string, username: string, password: string,
        apiKeyName: string, apiKeyValue: string, apiKeyLocation: APIKeyLocation,
        oauth2: OAuth2Config, awsSigV4: AwsSigV4Config } = {
            type: 'none', token: '', username: '', password: '',
            apiKeyName: '', apiKeyValue: '', apiKeyLocation: 'header',
            oauth2: {
                grantType: 'authorization_code', tokenUrl: '', clientId: '', usePkce: true,
            },
            awsSigV4: {
                accessKeyId: '', secretAccessKey: '', service: 'execute-api', region: 'us-east-1',
            },
        }

    timeout = 30000

    /** Per-request TLS overrides — populated from the Net tab. */
    tls: TLSConfig = {
        rejectUnauthorized: undefined,
        clientCertPath: '',
        clientKeyPath: '',
        caPath: '',
    }

    /** Per-request HTTP proxy override. */
    proxy = ''
    /** Whether to attach + ingest cookies for this request. */
    sendCookies = true

    response: APIResponse | null = null
    sending = false
    private currentController: AbortController | null = null
    activeRequestTab: 'params' | 'headers' | 'body' | 'auth' | 'tests' | 'pre' | 'post' | 'extract' | 'collections' | 'history' | 'env' | 'net' | 'cookies' = 'headers'
    activeResponseTab: 'body' | 'headers' | 'raw' | 'preview' | 'tests' = 'body'

    /** When true, the response pane shows the realtime timeline instead. */
    realtime = false
    realtimeKind: RealtimeKind = 'websocket'
    realtimeMessage = ''
    @ViewChild('frameLog') frameLog?: ElementRef<HTMLElement>

    // Collections + history + env
    collections: APICollection[] = []
    showCollections = false
    newCollectionName = ''

    environments: APIEnvironment[] = []
    activeEnvId: string | null = null
    newEnvName = ''
    /** Quick add: top of the env editor. */
    newVar: EnvironmentVariable = { key: '', value: '', enabled: true, secret: false }

    /** Search-in-response state. Toggled by Ctrl+F or the magnifier
     *  button; we splice marks into the rendered text. */
    responseSearchOpen = false
    responseSearchQuery = ''

    /** Realtime frame log subscription teardown. */
    private subs: Subscription[] = []

    private httpClient: HttpClientService
    private configService: ConfigService
    private notifications: NotificationsService
    envService: EnvironmentService
    historyService: HistoryService
    private assertionsService: AssertionsService
    private scriptService: ScriptService
    private oauth2: OAuth2Service
    cookiesService: CookiesService
    ws: WebSocketService
    private hotkeys: HotkeysService
    private ngbModal: NgbModal

    @ViewChild('urlInput') urlInputRef?: ElementRef<HTMLInputElement>

    constructor (injector: Injector) {
        super(injector)
        this.httpClient = injector.get(HttpClientService)
        this.configService = injector.get(ConfigService)
        this.notifications = injector.get(NotificationsService)
        this.envService = injector.get(EnvironmentService)
        this.historyService = injector.get(HistoryService)
        this.assertionsService = injector.get(AssertionsService)
        this.scriptService = injector.get(ScriptService)
        this.oauth2 = injector.get(OAuth2Service)
        this.cookiesService = injector.get(CookiesService)
        this.ws = injector.get(WebSocketService)
        this.hotkeys = injector.get(HotkeysService)
        this.ngbModal = injector.get(NgbModal)
        this.setTitle('API Client')
        this.icon = 'fas fa-globe'
    }

    ngOnInit (): void {
        // Recovered profiles can ship with options shaped differently
        // than the current type (older saves), so the guards below
        // remain defensive even when the static type says otherwise.
        const opts = this.profile.options as Partial<typeof this.profile.options> | undefined
        if (opts) {
            /* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- empty-string saved values should fall back to defaults */
            this.url = opts.url || this.url
            this.method = opts.method || this.method
            this.headers = opts.headers?.length ? opts.headers : this.headers
            this.body = opts.body || this.body
            this.bodyType = opts.bodyType || this.bodyType
            this.bodyColor = opts.bodyColor || this.bodyColor
            this.bodyBgColor = opts.bodyBgColor || this.bodyBgColor
            /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
            this.formData = opts.formData ? JSON.parse(JSON.stringify(opts.formData)) : []
            this.binaryPath = opts.binaryPath ?? ''
            if (opts.graphql) {
                this.graphql = JSON.parse(JSON.stringify(opts.graphql))
            }
            this.extractors = opts.extractors ? JSON.parse(JSON.stringify(opts.extractors)) : []
            this.assertions = opts.assertions ? JSON.parse(JSON.stringify(opts.assertions)) : []
            this.preScript = opts.preScript ?? ''
            this.postScript = opts.postScript ?? ''
            if (opts.auth) {
                const a = opts.auth
                this.auth = {
                    type: a.type,
                    token: a.token ?? '',
                    username: a.username ?? '',
                    password: a.password ?? '',
                    apiKeyName: a.apiKeyName ?? '',
                    apiKeyValue: a.apiKeyValue ?? '',
                    apiKeyLocation: a.apiKeyLocation ?? 'header',
                    oauth2: a.oauth2 ? JSON.parse(JSON.stringify(a.oauth2)) : this.auth.oauth2,
                    awsSigV4: a.awsSigV4 ? JSON.parse(JSON.stringify(a.awsSigV4)) : this.auth.awsSigV4,
                }
            }
            this.timeout = opts.timeout ?? this.timeout
            if (opts.tls) {
                this.tls = { ...this.tls, ...opts.tls }
            }
            this.proxy = opts.proxy ?? ''
            this.sendCookies = opts.sendCookies !== false
        }
        this.validateBody()
        this.loadCollections()

        // React to env changes elsewhere (other tab edits) so this
        // tab's URL-bar token highlighter stays current.
        this.subs.push(this.envService.environments$.subscribe(envs => {
            this.environments = envs
        }))
        this.subs.push(this.envService.activeId$.subscribe(id => {
            this.activeEnvId = id
        }))

        // Wire global hotkeys. Only handle when this tab has focus.
        this.subs.push(this.hotkeys.hotkey$.subscribe(hotkey => {
            if (!this.hasFocus) {return}
            switch (hotkey) {
                case 'api-client.send':
                    this.send()
                    break
                case 'api-client.save':
                    this.activeRequestTab = 'collections'
                    break
                case 'api-client.focus-url':
                    this.urlInputRef?.nativeElement.focus()
                    this.urlInputRef?.nativeElement.select()
                    break
                case 'api-client.toggle-history':
                    this.activeRequestTab = this.activeRequestTab === 'history' ? 'headers' : 'history'
                    break
                case 'api-client.find':
                    this.openResponseSearch()
                    break
                case 'api-client.cancel':
                    this.cancel()
                    break
                case 'api-client.import-curl':
                    this.openImport('curl')
                    break
                case 'api-client.help':
                    this.openHelp()
                    break
            }
        }))

        // Realtime frame autoscroll.
        this.subs.push(this.ws.frames$.subscribe(() => {
            setTimeout(() => {
                if (this.frameLog) {
                    this.frameLog.nativeElement.scrollTop = this.frameLog.nativeElement.scrollHeight
                }
            }, 0)
        }))
    }

    ngOnDestroy (): void {
        this.subs.forEach(s => s.unsubscribe())
        this.ws.close()
        this.cancel()
    }

    // ----- send / cancel ------------------------------------------------

    async send (): Promise<void> {
        if (this.sending || !this.url.trim()) {
            return
        }
        this.sending = true
        this.response = null
        this.setTitle(`API: ${this.method} ${this.getShortUrl()}`)

        // Snapshot the current form into options for this run.
        let options = this.snapshotOptions()

        // Pre-script — runs against a deep clone, so failed mutations
        // don't poison the open form.
        if (this.preScript.trim()) {
            const pre = this.scriptService.runPre(options)
            if (pre.error) {
                this.notifications.error(`Pre-script: ${pre.error}`)
            }
            ({ options } = pre)
            for (const l of pre.logs) {
                console.log('[api-client pre]', l)
            }
        }

        const controller = new AbortController()
        this.currentController = controller

        try {
            const result = this.httpClient.executeWithSignal(options, controller)
            const response = await result.promise
            this.response = response

            // Post-script — runs even on non-2xx so users can branch
            // on it. Result + errors land in the dev console.
            if (this.postScript.trim()) {
                const post = this.scriptService.runPost(options, response)
                if (post.error) {
                    this.notifications.error(`Post-script: ${post.error}`)
                }
                for (const l of post.logs) {
                    console.log('[api-client post]', l)
                }
            }

            // Assertions
            response.assertionResults = this.assertionsService.run(response, this.assertions)

            // Status-aware tab title.
            if (response.error) {
                this.setTitle(`API: ✗ ${this.method} ${this.getShortUrl()}`)
                this.notifications.error(response.error)
            } else {
                const ok = response.status >= 200 && response.status < 300
                this.setTitle(`API: ${ok ? '✓' : '✗'} ${response.status} ${this.method} ${this.getShortUrl()}`)
            }

            // History.
            this.historyService.record(options, response)
        } catch (e: any) {
            this.notifications.error(e.message || 'Request failed')
        } finally {
            this.sending = false
            this.currentController = null
        }
    }

    cancel (): void {
        if (this.currentController) {
            try { this.currentController.abort() } catch { /* already aborted */ }
        }
    }

    private snapshotOptions (): import('../api/interfaces').APIClientOptions {
        return {
            url: this.url.trim(),
            method: this.method,
            headers: this.headers.map(h => ({ ...h })),
            body: this.body,
            bodyType: this.bodyType,
            bodyColor: this.bodyColor,
            bodyBgColor: this.bodyBgColor,
            timeout: this.timeout,
            auth: {
                type: this.auth.type,
                token: this.auth.token,
                username: this.auth.username,
                password: this.auth.password,
                apiKeyName: this.auth.apiKeyName,
                apiKeyValue: this.auth.apiKeyValue,
                apiKeyLocation: this.auth.apiKeyLocation,
                oauth2: { ...this.auth.oauth2 },
                awsSigV4: { ...this.auth.awsSigV4 },
            },
            formData: this.formData.map(f => ({ ...f })),
            binaryPath: this.binaryPath || undefined,
            graphql: this.bodyType === 'graphql' ? { ...this.graphql } : undefined,
            extractors: this.extractors.map(e => ({ ...e })),
            assertions: this.assertions.map(a => ({ ...a })),
            preScript: this.preScript,
            postScript: this.postScript,
            tls: { ...this.tls },
            proxy: this.proxy.trim() || undefined,
            sendCookies: this.sendCookies,
        }
    }

    // ----- basics ------------------------------------------------------

    get activeHeaderCount (): number {
        return this.headers.filter(h => h.enabled && h.key.trim()).length
    }

    get unresolvedTokens (): string[] {
        return this.envService.findUnresolved(this.url)
    }

    addHeader (): void {
        this.headers.push({ key: '', value: '', enabled: true })
    }

    removeHeader (index: number): void {
        this.headers.splice(index, 1)
    }

    validateBody (): void {
        if (this.bodyType !== 'json' || !this.body.trim()) {
            this.jsonError = null
            return
        }
        try {
            JSON.parse(this.body)
            this.jsonError = null
        } catch (e: any) {
            this.jsonError = e?.message || 'Invalid JSON'
        }
    }

    setBodyType (bt: BodyType): void {
        this.bodyType = bt
        this.validateBody()
    }

    toggleColorPicker (which: 'text' | 'bg', event?: Event): void {
        event?.stopPropagation()
        this.activeColorPicker = this.activeColorPicker === which ? null : which
    }

    pickColor (which: 'text' | 'bg', hex: string): void {
        if (which === 'text') {this.bodyColor = hex} else {this.bodyBgColor = hex}
        this.activeColorPicker = null
    }

    resetColor (which: 'text' | 'bg'): void {
        if (which === 'text') {this.bodyColor = ''} else {this.bodyBgColor = ''}
        this.activeColorPicker = null
    }

    onCustomColor (which: 'text' | 'bg', event: Event): void {
        const { value } = (event.target as HTMLInputElement)
        this.pickColor(which, value)
    }

    @HostListener('document:click')
    onDocumentClick (): void {
        this.activeColorPicker = null
    }

    // Ctrl+F for response search. We swallow the event so the host
    // browser's find dialog doesn't open.
    @HostListener('keydown', ['$event'])
    onKeydown (event: KeyboardEvent): void {
        if ((event.ctrlKey || event.metaKey) && event.key === 'f' && this.response) {
            event.preventDefault()
            this.openResponseSearch()
        } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            this.send()
        } else if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault()
            this.activeRequestTab = 'collections'
        } else if ((event.ctrlKey || event.metaKey) && event.key === 'l') {
            event.preventDefault()
            this.urlInputRef?.nativeElement.focus()
            this.urlInputRef?.nativeElement.select()
        } else if (event.key === 'Escape' && this.responseSearchOpen) {
            this.responseSearchOpen = false
            this.responseSearchQuery = ''
        } else if (event.key === '?' && !this.isTypingTarget(event.target)) {
            // Plain `?` opens help — but only when the user isn't
            // mid-keystroke in an input/textarea, where '?' is a
            // legitimate character. The active-tag check is the
            // standard "GitHub-style hotkey" guard.
            event.preventDefault()
            this.openHelp()
        }
    }

    private isTypingTarget (target: EventTarget | null): boolean {
        if (!(target instanceof HTMLElement)) {return false}
        const tag = target.tagName
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
    }

    openResponseSearch (): void {
        if (!this.response) {
            return
        }
        this.responseSearchOpen = true
        // Focus the search input on next tick.
        setTimeout(() => {
            const el = document.querySelector<HTMLInputElement>('.response-search-input')
            el?.focus()
            el?.select()
        }, 0)
    }

    closeResponseSearch (): void {
        this.responseSearchOpen = false
        this.responseSearchQuery = ''
    }

    // ----- response helpers --------------------------------------------

    getFormattedBody (): string {
        if (!this.response?.body) {return ''}
        return this.httpClient.formatJson(this.response.body)
    }

    /** Returns the rendered body with <mark>…</mark> spans around
     *  search matches. We keep this as plain text + replacement
     *  markers so Angular's change detection only re-renders on
     *  search input. */
    getSearchHighlightedBody (): string {
        const text = this.activeResponseTab === 'raw' ? (this.response?.body ?? '') : this.getFormattedBody()
        if (!this.responseSearchOpen || !this.responseSearchQuery) {
            return this.escape(text)
        }
        const escaped = this.escape(text)
        const q = this.responseSearchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        return escaped.replace(new RegExp(q, 'gi'), m => `<mark>${m}</mark>`)
    }

    private escape (s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }

    isImageResponse (): boolean {
        return !!this.response?.contentType?.startsWith('image/')
    }

    getImageDataUrl (): string | null {
        if (!this.response?.bodyBytes || !this.isImageResponse()) {return null}
        // Convert to base64 in one pass — small enough for reasonable
        // image responses (sub-10MB), and keeps the template pure.
        let binary = ''
        const bytes = this.response.bodyBytes
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i])
        }
        return `data:${this.response.contentType};base64,${btoa(binary)}`
    }

    getStatusClass (): string {
        return this.response ? this.httpClient.getStatusClass(this.response.status) : 'secondary'
    }

    getResponseSize (): string {
        return this.response ? this.httpClient.formatSize(this.response.size) : ''
    }

    async copyResponseBody (): Promise<void> {
        if (!this.response) {return}
        let text = ''
        if (this.activeResponseTab === 'headers') {
            text = this.getResponseHeaders().map(h => `${h.key}: ${h.value}`).join('\n')
        } else if (this.activeResponseTab === 'raw') {
            text = this.response.body || ''
        } else {
            text = this.getFormattedBody()
        }
        if (!text) {return}
        try {
            await navigator.clipboard.writeText(text)
            this.notifications.info('Copied to clipboard')
        } catch (e: any) {
            this.notifications.error(e?.message || 'Copy failed')
        }
    }

    async copyAsCurl (): Promise<void> {
        const cmd = exportCurl(this.snapshotOptions())
        await navigator.clipboard.writeText(cmd)
        this.notifications.info('Copied as cURL')
    }

    async copyAsCode (target: CodeTarget): Promise<void> {
        const code = exportCode(this.snapshotOptions(), target)
        await navigator.clipboard.writeText(code)
        this.notifications.info(`Copied as ${target}`)
    }

    async saveResponseToFile (): Promise<void> {
        if (!this.response?.bodyBytes) {return}
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const remote = require('@electron/remote')
            const result = await remote.dialog.showSaveDialog({
                defaultPath: this.suggestFilenameFromResponse(),
            })
            if (!result || result.canceled || !result.filePath) {return}
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const fs = require('fs')
            await fs.promises.writeFile(result.filePath, Buffer.from(this.response.bodyBytes))
            this.notifications.info(`Saved to ${result.filePath}`)
        } catch (e: any) {
            this.notifications.error(e?.message || 'Save failed')
        }
    }

    private suggestFilenameFromResponse (): string {
        try {
            const u = new URL(this.url)
            const last = u.pathname.split('/').filter(Boolean).pop() ?? 'response'
            const ext = this.response?.contentType?.includes('json') ? '.json'
                : this.response?.contentType?.startsWith('image/') ? `.${this.response.contentType.split('/')[1]}`
                    : this.response?.contentType?.includes('html') ? '.html'
                        : this.response?.contentType?.includes('xml') ? '.xml' : ''
            return last + (ext && !last.endsWith(ext) ? ext : '')
        } catch {
            return 'response'
        }
    }

    getResponseHeaders (): { key: string, value: string }[] {
        if (!this.response?.headers) {return []}
        return Object.entries(this.response.headers).map(([key, value]) => ({ key, value }))
    }

    private getShortUrl (): string {
        try {
            const u = new URL(this.envService.substitute(this.url))
            return u.pathname.length > 20 ? u.host + u.pathname.substring(0, 20) + '...' : u.host + u.pathname
        } catch {
            return this.url.substring(0, 30)
        }
    }

    // ----- help --------------------------------------------------------

    /** Open the searchable help modal. Same content lives in the
     *  README on disk + GitHub; the modal is the in-app surface. */
    openHelp (): void {
        this.ngbModal.open(HelpModalComponent, { size: 'lg' })
    }

    // ----- imports + code-gen ------------------------------------------

    openImport (preferred?: 'curl' | 'postman' | 'openapi'): void {
        const ref = this.ngbModal.open(ImportModalComponent, { size: 'lg' })
        const m = ref.componentInstance as ImportModalComponent
        if (preferred) {m.setPreferred(preferred)}
        ref.result.then(
            (res: ImportModalResult | ImportCollectionResult | null) => {
                if (!res) {return}
                if (res.kind === 'curl') {
                    this.applyImportedRequest(res.options)
                    this.notifications.info('cURL imported')
                } else {
                    this.applyImportedCollection(res)
                }
            },
            () => { /* dismissed */ },
        )
    }

    private applyImportedRequest (options: any): void {
        this.url = options.url
        this.method = options.method
        this.headers = options.headers?.length ? options.headers : [{ key: '', value: '', enabled: true }]
        this.body = options.body ?? ''
        this.bodyType = options.bodyType ?? 'none'
        this.formData = options.formData ?? []
        this.auth = {
            type: options.auth?.type ?? 'none',
            token: options.auth?.token ?? '',
            username: options.auth?.username ?? '',
            password: options.auth?.password ?? '',
            apiKeyName: options.auth?.apiKeyName ?? '',
            apiKeyValue: options.auth?.apiKeyValue ?? '',
            apiKeyLocation: options.auth?.apiKeyLocation ?? 'header',
            oauth2: options.auth?.oauth2 ?? this.auth.oauth2,
            awsSigV4: options.auth?.awsSigV4 ?? this.auth.awsSigV4,
        }
        this.tls = { ...this.tls, ...(options.tls ?? {}) }
        this.proxy = options.proxy ?? ''
        this.sendCookies = options.sendCookies !== false
        this.validateBody()
    }

    private applyImportedCollection (res: ImportCollectionResult): void {
        this.collections.push(res.result.collection)
        this.saveCollections()
        if (res.result.environment) {
            this.envService.create(res.result.environment.name)
            const created = this.envService.environments[this.envService.environments.length - 1]
            created.variables = res.result.environment.variables
            this.envService.update(created)
        }
        const w = res.result.warnings
        const noun = res.source === 'postman' ? 'Postman' : 'OpenAPI'
        if (w.length) {
            this.notifications.info(`${noun} imported with ${w.length} caveat${w.length === 1 ? '' : 's'} (see console)`)
            for (const warn of w) {
                console.warn('[api-client import]', warn.path, warn.message)
            }
        } else {
            this.notifications.info(`${noun} collection imported`)
        }
        this.activeRequestTab = 'collections'
    }

    // ----- realtime ----------------------------------------------------

    toggleRealtime (): void {
        this.realtime = !this.realtime
        if (!this.realtime) {
            this.ws.close()
        }
    }

    realtimeOpen (): void {
        this.ws.open(this.realtimeKind, this.url)
    }

    realtimeClose (): void {
        this.ws.close()
    }

    realtimeSend (): void {
        if (!this.realtimeMessage.trim()) {return}
        this.ws.send(this.realtimeMessage)
        this.realtimeMessage = ''
    }

    realtimeClear (): void {
        this.ws.clear()
    }

    // ----- collections -------------------------------------------------

    loadCollections (): void {
        this.collections = this.configService.store.apiClient?.collections ?? []
    }

    saveCollections (): void {
        if (!this.configService.store.apiClient) {
            (this.configService.store).apiClient = { collections: [] }
        }
        this.configService.store.apiClient.collections = JSON.parse(JSON.stringify(this.collections))
        this.configService.save()
        // Any save means the grouping may have changed — flush the
        // memoized groups so the next *ngFor pass rebuilds them.
        // Without this, the WeakMap cache would keep stale references
        // and the UI wouldn't reflect adds/moves/deletes.
        this.invalidateFoldered()
    }

    createCollection (): void {
        if (!this.newCollectionName.trim()) {return}
        this.collections.push({
            id: `col-${Date.now()}`,
            name: this.newCollectionName.trim(),
            requests: [],
            folders: [],
        })
        this.newCollectionName = ''
        this.saveCollections()
    }

    deleteCollection (col: APICollection): void {
        this.collections = this.collections.filter(c => c !== col)
        this.saveCollections()
    }

    /**
     * Inline save-to-collection dialog state. Clicking the + button on
     * a collection opens a small editable input pre-filled with the
     * auto-generated name (`METHOD shortUrl`); the user can rename
     * before confirming. Empty input falls back to the auto-name so
     * users who don't care can just hit Enter.
     */
    savingToCollection: APICollection | null = null
    pendingSaveName = ''

    /** Open the inline save form for a collection. */
    startSaveToCollection (col: APICollection): void {
        this.savingToCollection = col
        this.pendingSaveName = `${this.method} ${this.getShortUrl()}`
        // Defer the focus so the input has rendered.
        setTimeout(() => {
            const el = document.querySelector('.save-name-input')
            el?.focus()
            el?.select()
        }, 0)
    }

    cancelSaveToCollection (): void {
        this.savingToCollection = null
        this.pendingSaveName = ''
    }

    /** Apply the (possibly renamed) save. Falls back to the auto-name
     *  on empty input so a user who just hits Enter still gets a
     *  meaningful label. */
    confirmSaveToCollection (col: APICollection): void {
        const trimmed = this.pendingSaveName.trim()
        const name = trimmed || `${this.method} ${this.getShortUrl()}`
        const request: SavedRequest = JSON.parse(JSON.stringify({
            id: `req-${Date.now()}`,
            name,
            options: this.snapshotOptions(),
        }))
        col.requests.push(request)
        this.saveCollections()
        this.cancelSaveToCollection()
        this.notifications.info(`Saved as "${name}"`)
    }

    /** Quick-save without prompting — used when the auto-name is fine.
     *  Mapped to the original toolbar "+" if the user wants the
     *  no-friction path. Today we route everything through the inline
     *  form by default; this stays as a service-method for the
     *  ssh-snippets-style "save current request here" flow. */
    saveRequestToCollection (col: APICollection): void {
        const request: SavedRequest = JSON.parse(JSON.stringify({
            id: `req-${Date.now()}`,
            name: `${this.method} ${this.getShortUrl()}`,
            options: this.snapshotOptions(),
        }))
        col.requests.push(request)
        this.saveCollections()
        this.notifications.info('Request saved')
    }

    // ----- inline rename of saved requests -----------------------------

    renamingRequest: SavedRequest | null = null
    pendingRenameName = ''

    startRenameRequest (req: SavedRequest): void {
        this.renamingRequest = req
        this.pendingRenameName = req.name
        setTimeout(() => {
            const el = document.querySelector('.rename-input')
            el?.focus()
            el?.select()
        }, 0)
    }

    cancelRenameRequest (): void {
        this.renamingRequest = null
        this.pendingRenameName = ''
    }

    confirmRenameRequest (req: SavedRequest): void {
        const trimmed = this.pendingRenameName.trim()
        if (!trimmed) {
            this.cancelRenameRequest()
            return
        }
        req.name = trimmed
        this.saveCollections()
        this.cancelRenameRequest()
    }

    loadRequest (req: SavedRequest): void {
        this.applyImportedRequest(JSON.parse(JSON.stringify(req.options)))
        this.preScript = req.options.preScript ?? ''
        this.postScript = req.options.postScript ?? ''
        this.extractors = req.options.extractors ? JSON.parse(JSON.stringify(req.options.extractors)) : []
        this.assertions = req.options.assertions ? JSON.parse(JSON.stringify(req.options.assertions)) : []
        if (req.options.graphql) {
            this.graphql = JSON.parse(JSON.stringify(req.options.graphql))
        }
        this.binaryPath = req.options.binaryPath ?? ''
        this.timeout = req.options.timeout
        this.response = null
        this.activeRequestTab = 'headers'
    }

    deleteRequest (col: APICollection, req: SavedRequest): void {
        col.requests = col.requests.filter(r => r !== req)
        this.saveCollections()
    }

    // ----- environments ------------------------------------------------

    createEnv (): void {
        if (!this.newEnvName.trim()) {return}
        const env = this.envService.create(this.newEnvName.trim())
        this.envService.setActive(env.id)
        this.newEnvName = ''
    }

    setActiveEnv (id: string | null): void {
        this.envService.setActive(id)
    }

    deleteEnv (env: APIEnvironment): void {
        if (env.id === 'global') {
            this.notifications.error('Global environment cannot be deleted; clear its variables instead')
            return
        }
        this.envService.delete(env.id)
    }

    addVariable (env: APIEnvironment): void {
        const next = { ...env, variables: [...env.variables, EnvironmentService.newVariable()] }
        this.envService.update(next)
    }

    removeVariable (env: APIEnvironment, idx: number): void {
        const next = { ...env, variables: env.variables.filter((_, i) => i !== idx) }
        this.envService.update(next)
    }

    updateEnv (env: APIEnvironment): void {
        // Called on (ngModelChange) for variable rows. Pass through.
        this.envService.update(env)
    }

    // ----- extractors / assertions / scripts ---------------------------

    addExtractor (): void {
        this.extractors.push({ name: '', source: 'body', path: '', enabled: true })
    }

    removeExtractor (i: number): void {
        this.extractors.splice(i, 1)
    }

    addAssertion (kind: ResponseAssertion['kind']): void {
        const defaults: Record<ResponseAssertion['kind'], ResponseAssertion> = {
            status: { kind: 'status', op: 'eq', expected: '200', enabled: true },
            header: { kind: 'header', op: 'exists', target: 'Content-Type', expected: '', enabled: true },
            'body-contains': { kind: 'body-contains', op: 'contains', expected: '', enabled: true },
            'json-path-equals': { kind: 'json-path-equals', op: 'eq', target: 'data.id', expected: '', enabled: true },
        }
        this.assertions.push({ ...defaults[kind] })
    }

    removeAssertion (i: number): void {
        this.assertions.splice(i, 1)
    }

    // ----- TLS / proxy file pickers (Net tab) -------------------------

    async pickClientCert (): Promise<void> {
        const path = await this.pickOpenPath()
        if (path) {this.tls.clientCertPath = path}
    }

    async pickClientKey (): Promise<void> {
        const path = await this.pickOpenPath()
        if (path) {this.tls.clientKeyPath = path}
    }

    async pickCAFile (): Promise<void> {
        const path = await this.pickOpenPath()
        if (path) {this.tls.caPath = path}
    }

    clearTlsPath (which: 'cert' | 'key' | 'ca'): void {
        if (which === 'cert') {this.tls.clientCertPath = ''}
        if (which === 'key') {this.tls.clientKeyPath = ''}
        if (which === 'ca') {this.tls.caPath = ''}
    }

    // ----- cookies UI helpers ------------------------------------------

    addCookie (): void {
        this.cookiesService.create({
            domain: '',
            name: '',
            value: '',
            enabled: true,
            secure: false,
        })
    }

    updateCookie (cookie: CookieEntry): void {
        this.cookiesService.update(cookie)
    }

    deleteCookie (id: string): void {
        this.cookiesService.delete(id)
    }

    clearAllCookies (): void {
        this.cookiesService.clearAll()
    }

    // ----- folders + drag-reorder -------------------------------------

    addFolder (col: APICollection): void {
        if (!col.folders) {col.folders = []}
        const name = prompt('Folder name')?.trim()
        if (!name) {return}
        col.folders.push({
            id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name,
            order: col.folders.length,
        })
        this.saveCollections()
    }

    deleteFolder (col: APICollection, folderId: string): void {
        if (!col.folders) {return}
        col.folders = col.folders.filter(f => f.id !== folderId)
        // Move requests back to root.
        for (const req of col.requests) {
            if (req.folderId === folderId) {req.folderId = null}
        }
        this.saveCollections()
    }

    /**
     * Returns the requests grouped by folder (root requests first).
     *
     * **Memoized** by collection identity — this method is called from
     * `*ngFor` inside the Coll tab, which means change-detection invokes
     * it on every tick. Returning a fresh array each call would force
     * Angular to tear down and rebuild every saved-request row (each
     * containing a `[ngModel]` select), which in turn triggers another
     * change-detection pass — an infinite render loop that hangs the
     * zone. The cache is invalidated by `saveCollections()` and on
     * mutating helpers (`addFolder` / `deleteFolder` / `moveRequest`
     * / `moveRequestUp` / `moveRequestDown` / `deleteRequest`).
     */
    private folderedCache = new WeakMap<APICollection, { folder: APIFolder | null, requests: SavedRequest[] }[]>()

    folderedRequests (col: APICollection): { folder: APIFolder | null, requests: SavedRequest[] }[] {
        const cached = this.folderedCache.get(col)
        if (cached) {
            return cached
        }
        const root = col.requests.filter(r => !r.folderId)
        const groups: { folder: APIFolder | null, requests: SavedRequest[] }[] = [{ folder: null, requests: root }]
        const folders = [...(col.folders ?? [])].sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
        for (const f of folders) {
            groups.push({
                folder: f,
                requests: col.requests.filter(r => r.folderId === f.id),
            })
        }
        this.folderedCache.set(col, groups)
        return groups
    }

    /** Invalidate the foldered-requests cache for one (or all) collections.
     *  Called from every mutation that could change the grouping. */
    private invalidateFoldered (col?: APICollection): void {
        if (col) {
            this.folderedCache.delete(col)
        } else {
            this.folderedCache = new WeakMap()
        }
    }

    /** Move a request to a different folder (or root). Called from a
     *  context-menu / drop target in the UI. */
    moveRequest (req: SavedRequest, folderId: string | null): void {
        req.folderId = folderId
        this.saveCollections()
    }

    /** Reorder a request within its folder by swapping with the previous /
     *  next sibling. Drag-and-drop is more polished but a long way off; this
     *  gets us functional reordering with two arrow buttons per row. */
    moveRequestUp (col: APICollection, req: SavedRequest): void {
        const peers = col.requests.filter(r => r.folderId === req.folderId)
        const idxInPeers = peers.indexOf(req)
        if (idxInPeers <= 0) {return}
        const swap = peers[idxInPeers - 1]
        const fullA = col.requests.indexOf(req)
        const fullB = col.requests.indexOf(swap)
        col.requests[fullA] = swap
        col.requests[fullB] = req
        this.saveCollections()
    }

    moveRequestDown (col: APICollection, req: SavedRequest): void {
        const peers = col.requests.filter(r => r.folderId === req.folderId)
        const idxInPeers = peers.indexOf(req)
        if (idxInPeers === -1 || idxInPeers >= peers.length - 1) {return}
        const swap = peers[idxInPeers + 1]
        const fullA = col.requests.indexOf(req)
        const fullB = col.requests.indexOf(swap)
        col.requests[fullA] = swap
        col.requests[fullB] = req
        this.saveCollections()
    }

    // ----- history -----------------------------------------------------

    rerunHistory (id: string): void {
        const e = this.historyService.entries.find(h => h.id === id)
        if (!e) {return}
        this.applyImportedRequest(e.options)
        this.activeRequestTab = 'headers'
        void this.send()
    }

    deleteHistory (id: string): void {
        this.historyService.delete(id)
    }

    clearHistory (): void {
        this.historyService.clear()
    }

    formatHistoryTime (ts: number): string {
        const d = new Date(ts)
        return d.toLocaleTimeString()
    }

    // ----- form-data ---------------------------------------------------

    addFormDataField (kind: 'text' | 'file'): void {
        this.formData.push({ key: '', value: '', kind, enabled: true })
    }

    removeFormDataField (i: number): void {
        this.formData.splice(i, 1)
    }

    async pickFormDataFile (i: number): Promise<void> {
        const path = await this.pickOpenPath()
        if (path) {this.formData[i].filePath = path}
    }

    async pickBinaryFile (): Promise<void> {
        const path = await this.pickOpenPath()
        if (path) {this.binaryPath = path}
    }

    private async pickOpenPath (): Promise<string | null> {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const remote = require('@electron/remote')
            const result = await remote.dialog.showOpenDialog({
                properties: ['openFile'],
            })
            if (!result || result.canceled || !result.filePaths?.length) {return null}
            return result.filePaths[0]
        } catch (e: any) {
            this.notifications.error(e?.message ?? 'File picker failed')
            return null
        }
    }

    // ----- OAuth2 ------------------------------------------------------

    async refreshOAuthToken (): Promise<void> {
        try {
            await this.oauth2.acquireToken(this.auth.oauth2)
            this.notifications.info('OAuth2 token refreshed')
        } catch (e: any) {
            this.notifications.error(e?.message ?? 'OAuth2 failed')
        }
    }

    clearOAuthToken (): void {
        this.oauth2.clear(this.auth.oauth2)
        this.notifications.info('OAuth2 token cleared')
    }

    // ----- recovery ----------------------------------------------------

    async getRecoveryToken (): Promise<any> {
        return {
            type: 'app:api-client-tab',
            profile: this.profile,
            savedState: JSON.parse(JSON.stringify(this.snapshotOptions())),
        }
    }
}
