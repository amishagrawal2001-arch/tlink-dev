import { Component, Injector, HostBinding, HostListener } from '@angular/core'
import { BaseTabComponent, ConfigService, NotificationsService } from 'tlink-core'
import { HttpClientService } from '../services/httpClient.service'
import { APIClientProfile, APIResponse, HttpMethod, BodyType, AuthType, RequestHeader, SavedRequest, APICollection } from '../api/interfaces'

@Component({
    selector: 'api-client-tab',
    templateUrl: './apiClientTab.component.pug',
    styleUrls: ['./apiClientTab.component.scss'],
})
export class APIClientTabComponent extends BaseTabComponent {
    @HostBinding('class.api-client-tab') hostClass = true

    profile: APIClientProfile
    methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']
    bodyTypes: BodyType[] = ['none', 'json', 'text', 'form-data']
    authTypes: AuthType[] = ['none', 'bearer', 'basic']

    url = 'https://httpbin.org/get'
    method: HttpMethod = 'GET'
    headers: RequestHeader[] = [{ key: '', value: '', enabled: true }]
    body = ''
    bodyType: BodyType = 'none'
    bodyColor = ''
    bodyBgColor = ''
    jsonError: string | null = null
    activeColorPicker: 'text' | 'bg' | null = null

    // Preset palettes tuned for readability on the body textarea. First in each
    // list is a theme-default sentinel ('') which we handle as "use theme".
    textPresets: string[] = [
        // Near-whites / greys — the common defaults on dark backgrounds.
        '#ffffff', '#f8fafc', '#e5e7eb', '#cbd5e1',
        // Warm accents (yellows → orange) — good for dark + light bgs.
        '#fef9c3', '#fde68a', '#fcd34d', '#fb923c',
        // Cool accents — green / blue / purple / red.
        '#86efac', '#60a5fa', '#c084fc', '#f87171',
        // Darks / blacks — paired with the new light backgrounds.
        '#374151', '#1f2937', '#111827', '#000000',
    ]
    bgPresets: string[] = [
        // Lights first — easiest to scan, most requested.
        '#ffffff', '#f8fafc', '#fef9c3', '#fef3c7',
        '#d1fae5', '#dbeafe', '#e9d5ff', '#fce7f3',
        // Mid-tones for tinted backgrounds.
        '#e5e7eb', '#cbd5e1', '#94a3b8', '#64748b',
        // Darks for low-glare coding.
        '#1f2937', '#111827', '#0f172a', '#0c0c0c',
    ]
    auth: { type: AuthType, token: string, username: string, password: string } = {
        type: 'none', token: '', username: '', password: '',
    }
    timeout = 30000

    response: APIResponse | null = null
    sending = false
    activeRequestTab = 'headers'
    activeResponseTab = 'body'

    // Collections
    collections: APICollection[] = []
    showCollections = false
    newCollectionName = ''

    private httpClient: HttpClientService
    private configService: ConfigService
    private notifications: NotificationsService

    constructor (injector: Injector) {
        super(injector)
        this.httpClient = injector.get(HttpClientService)
        this.configService = injector.get(ConfigService)
        this.notifications = injector.get(NotificationsService)
        this.setTitle('API Client')
        this.icon = 'fas fa-globe'
    }

    ngOnInit (): void {

        if (this.profile?.options) {
            this.url = this.profile.options.url || this.url
            this.method = this.profile.options.method || this.method
            this.headers = this.profile.options.headers?.length ? this.profile.options.headers : this.headers
            this.body = this.profile.options.body || this.body
            this.bodyType = this.profile.options.bodyType || this.bodyType
            this.bodyColor = this.profile.options.bodyColor || this.bodyColor
            this.bodyBgColor = this.profile.options.bodyBgColor || this.bodyBgColor
            if (this.profile.options.auth) {
                this.auth = {
                    type: this.profile.options.auth.type || 'none',
                    token: this.profile.options.auth.token || '',
                    username: this.profile.options.auth.username || '',
                    password: this.profile.options.auth.password || '',
                }
            }
            this.timeout = this.profile.options.timeout || this.timeout
        }

        this.validateBody()
        this.loadCollections()
    }

    async send (): Promise<void> {
        if (this.sending || !this.url.trim()) {
            return
        }

        this.sending = true
        this.response = null
        this.setTitle(`API: ${this.method} ${this.getShortUrl()}`)

        try {
            this.response = await this.httpClient.execute({
                url: this.url.trim(),
                method: this.method,
                headers: this.headers,
                body: this.body,
                bodyType: this.bodyType,
                timeout: this.timeout,
                auth: this.auth,
            })

            if (this.response.error) {
                this.notifications.error(this.response.error)
            }
        } catch (e: any) {
            this.notifications.error(e.message || 'Request failed')
        } finally {
            this.sending = false
        }
    }

    get activeHeaderCount (): number {
        return this.headers.filter(h => h.enabled && h.key.trim()).length
    }

    addHeader (): void {
        this.headers.push({ key: '', value: '', enabled: true })
    }

    removeHeader (index: number): void {
        this.headers.splice(index, 1)
    }

    // Called on body text change and on body-type switch. Non-json types clear
    // the error so a stale message never sticks around when the user flips away
    // from json.
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
        if (which === 'text') {
            this.bodyColor = hex
        } else {
            this.bodyBgColor = hex
        }
        this.activeColorPicker = null
    }

    resetColor (which: 'text' | 'bg'): void {
        if (which === 'text') {
            this.bodyColor = ''
        } else {
            this.bodyBgColor = ''
        }
        this.activeColorPicker = null
    }

    onCustomColor (which: 'text' | 'bg', event: Event): void {
        const value = (event.target as HTMLInputElement).value
        this.pickColor(which, value)
    }

    // HostListener is cleaner but keeps a doc-level listener; in a tab this is
    // fine. Closes the popover when the user clicks anywhere else.
    @HostListener('document:click')
    onDocumentClick (): void {
        this.activeColorPicker = null
    }

    getFormattedBody (): string {
        if (!this.response?.body) {
            return ''
        }
        return this.httpClient.formatJson(this.response.body)
    }

    getStatusClass (): string {
        return this.response ? this.httpClient.getStatusClass(this.response.status) : 'secondary'
    }

    getResponseSize (): string {
        return this.response ? this.httpClient.formatSize(this.response.size) : ''
    }

    async copyResponseBody (): Promise<void> {
        if (!this.response) {
            return
        }
        // Copy what the user is currently looking at: formatted JSON, raw body,
        // or a key:value rendering of the headers tab.
        let text = ''
        if (this.activeResponseTab === 'headers') {
            text = this.getResponseHeaders().map(h => `${h.key}: ${h.value}`).join('\n')
        } else if (this.activeResponseTab === 'raw') {
            text = this.response.body || ''
        } else {
            text = this.getFormattedBody()
        }
        if (!text) {
            return
        }
        try {
            await navigator.clipboard.writeText(text)
            this.notifications.info('Copied to clipboard')
        } catch (e: any) {
            this.notifications.error(e?.message || 'Copy failed')
        }
    }

    getResponseHeaders (): { key: string, value: string }[] {
        if (!this.response?.headers) {
            return []
        }
        return Object.entries(this.response.headers).map(([key, value]) => ({ key, value }))
    }

    private getShortUrl (): string {
        try {
            const u = new URL(this.url)
            return u.pathname.length > 20 ? u.host + u.pathname.substring(0, 20) + '...' : u.host + u.pathname
        } catch {
            return this.url.substring(0, 30)
        }
    }

    // --- Collections ---

    loadCollections (): void {
        this.collections = this.configService.store.apiClient?.collections ?? []
    }

    saveCollections (): void {
        if (!this.configService.store.apiClient) {
            (this.configService.store as any).apiClient = { collections: [] }
        }
        // Deep clone to ensure ConfigProxy persists all nested data
        this.configService.store.apiClient.collections = JSON.parse(JSON.stringify(this.collections))
        this.configService.save()
    }

    createCollection (): void {
        if (!this.newCollectionName.trim()) {
            return
        }
        this.collections.push({
            id: `col-${Date.now()}`,
            name: this.newCollectionName.trim(),
            requests: [],
        })
        this.newCollectionName = ''
        this.saveCollections()
    }

    deleteCollection (col: APICollection): void {
        this.collections = this.collections.filter(c => c !== col)
        this.saveCollections()
    }

    saveRequestToCollection (col: APICollection): void {
        const request: SavedRequest = JSON.parse(JSON.stringify({
            id: `req-${Date.now()}`,
            name: `${this.method} ${this.getShortUrl()}`,
            options: {
                url: this.url,
                method: this.method,
                headers: this.headers.filter(h => h.key.trim()),
                body: this.body,
                bodyType: this.bodyType,
                bodyColor: this.bodyColor,
                bodyBgColor: this.bodyBgColor,
                timeout: this.timeout,
                auth: this.auth,
            },
        }))
        col.requests.push(request)
        this.saveCollections()
        this.notifications.info('Request saved')
    }

    loadRequest (req: SavedRequest): void {
        const opts = JSON.parse(JSON.stringify(req.options))
        this.url = opts.url || ''
        this.method = opts.method || 'GET'
        this.headers = opts.headers?.length ? opts.headers : [{ key: '', value: '', enabled: true }]
        this.body = opts.body || ''
        this.bodyType = opts.bodyType || 'none'
        this.bodyColor = opts.bodyColor || ''
        this.bodyBgColor = opts.bodyBgColor || ''
        this.auth = {
            type: opts.auth?.type || 'none',
            token: opts.auth?.token || '',
            username: opts.auth?.username || '',
            password: opts.auth?.password || '',
        }
        this.timeout = opts.timeout || 30000
        this.response = null
        this.activeRequestTab = 'headers'
        this.validateBody()
    }

    deleteRequest (col: APICollection, req: SavedRequest): void {
        col.requests = col.requests.filter(r => r !== req)
        this.saveCollections()
    }

    async getRecoveryToken (): Promise<any> {
        return {
            type: 'app:api-client-tab',
            profile: this.profile,
            savedState: JSON.parse(JSON.stringify({
                url: this.url,
                method: this.method,
                headers: this.headers.filter(h => h.key.trim()),
                body: this.body,
                bodyType: this.bodyType,
                auth: this.auth,
                timeout: this.timeout,
            })),
        }
    }
}
