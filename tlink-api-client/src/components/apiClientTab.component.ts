import { Component, Injector, HostBinding } from '@angular/core'
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
        this.auth = {
            type: opts.auth?.type || 'none',
            token: opts.auth?.token || '',
            username: opts.auth?.username || '',
            password: opts.auth?.password || '',
        }
        this.timeout = opts.timeout || 30000
        this.response = null
        this.activeRequestTab = 'headers'
    }

    deleteRequest (col: APICollection, req: SavedRequest): void {
        col.requests = col.requests.filter(r => r !== req)
        this.saveCollections()
    }

    async getRecoveryToken (): Promise<any> {
        return {
            type: 'app:api-client-tab',
            profile: this.profile,
            savedState: {
                url: this.url,
                method: this.method,
                headers: this.headers,
                body: this.body,
                bodyType: this.bodyType,
                auth: this.auth,
            },
        }
    }
}
