import { Injectable } from '@angular/core'
import { Observable, Subject } from 'rxjs'
import { v4 as uuidv4 } from 'uuid'
import { Logger, LogService } from './log.service'
import { PlatformService } from '../api/platform'

export interface SharedSession {
    id: string
    terminal: any // Terminal tab reference
    token: string
    mode: 'read-only' | 'interactive'
    createdAt: Date
    expiresAt?: Date
    password?: string
    viewers: number
}

export interface SessionSharingOptions {
    mode: 'read-only' | 'interactive'
    expiresIn?: number // minutes
    password?: string
}

export interface ParsedShareSessionLink {
    shareUrl: string
    wsUrl: string
    sessionId: string
    token: string
    transport: 'ws'|'wss'
    tokenIsLegacyPrefix: boolean
}

interface ShareBundleEntry {
    sessionId: string
    token: string
    title?: string
}

interface ShareBundlePayloadSession {
    id?: string
    sessionId?: string
    token?: string
    title?: string
}

interface ShareBundlePayload {
    version?: number
    sessions?: ShareBundlePayloadSession[]
}

export interface ParsedShareSessionBundleLink {
    shareUrl: string
    wsUrl: string
    transport: 'ws' | 'wss'
    sessions: ParsedShareSessionLink[]
}

interface ShareBaseInfo {
    baseUrl: string
    transport: 'ws' | 'wss'
}

interface SessionSharingStateChange {
    terminal: any
    sessionId: string
    shared: boolean
}

@Injectable({ providedIn: 'root' })
export class SessionSharingService {
    private logger: Logger
    private readonly maxBundleSessions = 32
    private sharedSessions = new Map<string, SharedSession>()
    private terminalToSessionId = new WeakMap<any, string>() // Maps terminal tab reference to shared session ID
    private sessionIdToTerminal = new Map<string, any>() // Maps session ID to terminal tab reference
    private ws: WebSocket | null = null
    private wsUrl = 'ws://localhost:8080' // Default WebSocket server URL
    private ipcListenersAttached = false
    private sharingStateChanged = new Subject<SessionSharingStateChange>()

    get sharingStateChanged$ (): Observable<SessionSharingStateChange> {
        return this.sharingStateChanged
    }

    constructor (
        log: LogService,
        private platform: PlatformService,
    ) {
        this.logger = log.create('sessionSharing')
        this.attachIPCListeners()
    }

    /**
     * Prompt user to start WebSocket server
     */
    private async promptToStartServer (): Promise<boolean> {
        try {
            const result = await this.platform.showMessageBox({
                type: 'warning',
                message: 'Session Sharing Server Not Running',
                detail: 'The WebSocket server is not running. You need to start it before sharing sessions.\n\nWould you like to start it now?',
                buttons: ['Start Server', 'Cancel'],
                defaultId: 0,
                cancelId: 1,
            })
            return result.response === 0
        } catch (error) {
            this.logger.error('Failed to show prompt:', error)
            return false
        }
    }

    /**
     * Generate a shareable link for a terminal session
     */
    async shareSession (
        terminal: any,
        options: SessionSharingOptions,
    ): Promise<string | null> {
        if (this.isSessionShared(terminal)) {
            await this.stopSharing(terminal)
        }

        const serverReady = await this.ensureServerRunningForSharing()
        if (!serverReady) {
            return null
        }

        try {
            const sessionId = uuidv4()
            const token = uuidv4()

            const sharedSession: SharedSession = {
                id: sessionId,
                terminal,
                token,
                mode: options.mode,
                createdAt: new Date(),
                expiresAt: options.expiresIn
                    ? new Date(Date.now() + options.expiresIn * 60 * 1000)
                    : undefined,
                password: options.password,
                viewers: 0,
            }

            this.sharedSessions.set(sessionId, sharedSession)
            this.terminalToSessionId.set(terminal, sessionId)
            this.sessionIdToTerminal.set(sessionId, terminal)
            this.sharingStateChanged.next({
                terminal,
                sessionId,
                shared: true,
            })

            // Register session with embedded WebSocket server via IPC (if in Electron)
            try {
                const ipcRenderer = this.getIpcRenderer()
                if (ipcRenderer) {
                    await ipcRenderer.invoke('session-sharing:register', sessionId, token, options.mode, options.password, options.expiresIn)
                    this.logger.info('Session registered with embedded server via IPC')
                } else {
                    // Fallback: try direct WebSocket connection (for future cloud/web support)
                    await this.connectWebSocket()
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send(JSON.stringify({
                            type: 'register',
                            sessionId: sharedSession.id,
                            token: sharedSession.token,
                            mode: sharedSession.mode,
                        }))
                    }
                }
            } catch (error) {
                // Server not available - this is OK for now
                // Session can still be shared via URL, but real-time sharing won't work
                this.logger.debug('Session sharing server not available, session can still be shared via URL:', error)
            }

            const { baseUrl, transport } = await this.getShareBaseInfo()
            const shareUrl = this.buildShareUrl(baseUrl, sessionId, token, transport)

            this.logger.info('Session shared:', sessionId, shareUrl)
            
            // Note: The decorator will automatically attach when it detects the terminal is shared
            // Since decorators are attached when terminals are created, we need to wait a bit
            // for the decorator to re-check. For now, this is handled by the decorator checking
            // on attach. In the future, we could use an observable to notify decorators.
            
            return shareUrl
        } catch (error) {
            this.logger.error('Failed to share session:', error)
            return null
        }
    }

    /**
     * Share multiple terminal sessions and return a single bundle URL.
     * Existing shared sessions are reused to avoid interrupting active viewers.
     */
    async shareSessionBundle (
        terminals: any[],
        options: SessionSharingOptions,
    ): Promise<string | null> {
        const uniqueTerminals = Array.from(new Set((terminals ?? []).filter(Boolean)))
        if (!uniqueTerminals.length) {
            return null
        }

        const serverReady = await this.ensureServerRunningForSharing()
        if (!serverReady) {
            return null
        }

        const bundleEntries: ShareBundleEntry[] = []
        const seenSessionIds = new Set<string>()

        for (const terminal of uniqueTerminals) {
            if (bundleEntries.length >= this.maxBundleSessions) {
                this.logger.warn(`Bundle session limit reached (${this.maxBundleSessions}), skipping remaining sessions`)
                break
            }

            let sharedSession = this.getSharedSession(terminal)
            if (sharedSession) {
                const registered = await this.ensureSessionRegisteredWithServer(sharedSession)
                if (!registered) {
                    await this.stopSharing(terminal)
                    sharedSession = null
                }
            }

            if (!sharedSession) {
                const shared = await this.shareSession(terminal, options)
                if (!shared) {
                    continue
                }
                sharedSession = this.getSharedSession(terminal)
            }
            if (!sharedSession || seenSessionIds.has(sharedSession.id)) {
                continue
            }

            seenSessionIds.add(sharedSession.id)
            bundleEntries.push({
                sessionId: sharedSession.id,
                token: sharedSession.token,
                title: this.extractBundleEntryTitle(terminal),
            })
        }

        if (!bundleEntries.length) {
            return null
        }

        const { baseUrl, transport } = await this.getShareBaseInfo()
        return this.buildShareBundleUrl(baseUrl, bundleEntries, transport)
    }

    /**
     * Stop sharing a session
     */
    async stopSharing (terminal: any): Promise<void> {
        try {
            const sessionId = this.terminalToSessionId.get(terminal)
            if (!sessionId) {
                return
            }

            const sharedSession = this.sharedSessions.get(sessionId)
            if (sharedSession) {
                // Unregister session with embedded WebSocket server via IPC (if in Electron)
                try {
                    const ipcRenderer = this.getIpcRenderer()
                    if (ipcRenderer) {
                        await ipcRenderer.invoke('session-sharing:unregister', sessionId)
                    } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send(JSON.stringify({
                            type: 'unregister',
                            sessionId: sharedSession.id,
                        }))
                    }
                } catch (error) {
                    this.logger.debug('Failed to unregister session with server:', error)
                }

                this.sharedSessions.delete(sessionId)
                this.terminalToSessionId.delete(terminal)
                this.sessionIdToTerminal.delete(sessionId)
                this.sharingStateChanged.next({
                    terminal,
                    sessionId,
                    shared: false,
                })
            }

            this.logger.info('Session sharing stopped:', sessionId)
        } catch (error) {
            this.logger.error('Failed to stop sharing session:', error)
        }
    }

    /**
     * Check if a session is currently shared
     */
    isSessionShared (terminal: any): boolean {
        return this.terminalToSessionId.has(terminal)
    }

    /**
     * Get the shared session for a terminal
     */
    getSharedSession (terminal: any): SharedSession | null {
        const sessionId = this.terminalToSessionId.get(terminal)
        if (!sessionId) {
            return null
        }
        return this.sharedSessions.get(sessionId) || null
    }

    /**
     * Get shareable link for an already-shared terminal
     */
    async getShareableLink (terminal: any): Promise<string | null> {
        const sharedSession = this.getSharedSession(terminal)
        if (!sharedSession) {
            return null
        }

        const { baseUrl, transport } = await this.getShareBaseInfo()
        return this.buildShareUrl(baseUrl, sharedSession.id, sharedSession.token, transport)
    }

    /**
     * Copy shareable link to clipboard
     */
    async copyShareableLink (terminal: any): Promise<boolean> {
        const shareUrl = await this.getShareableLink(terminal)
        if (!shareUrl) {
            return false
        }

        try {
            this.platform.setClipboard({ text: shareUrl })
            return true
        } catch (error) {
            this.logger.error('Failed to copy link to clipboard:', error)
            return false
        }
    }

    /**
     * Join a shared session
     */
    async joinSession (sessionId: string, token: string, password?: string): Promise<boolean> {
        try {
            await this.connectWebSocket()
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                this.logger.error('WebSocket not connected')
                return false
            }

            this.ws.send(JSON.stringify({
                type: 'join',
                sessionId,
                token,
                password,
            }))

            return true
        } catch (error) {
            this.logger.error('Failed to join session:', error)
            return false
        }
    }

    /**
     * Parse tlink session-sharing URL into connection details
     */
    parseShareUrl (rawUrl: string): ParsedShareSessionLink | null {
        const shareUrl = (rawUrl ?? '').trim()
        if (!shareUrl.startsWith('tlink://share/')) {
            return null
        }

        const stripped = shareUrl.slice('tlink://share/'.length)
        const marker = '/session/'
        const markerIndex = stripped.indexOf(marker)

        let rawEndpoint = ''
        let afterSession = ''

        if (markerIndex >= 0) {
            rawEndpoint = decodeURIComponent(stripped.slice(0, markerIndex))
            afterSession = stripped.slice(markerIndex + marker.length)
        } else if (stripped.startsWith('session/')) {
            rawEndpoint = ''
            afterSession = stripped.slice('session/'.length)
        } else {
            return null
        }

        const normalizedEndpoint = this.normalizeEndpoint(rawEndpoint) || '127.0.0.1:8080'

        const [rawSessionSegment = '', rawQuery = ''] = afterSession.split('?', 2)
        const sessionSegment = decodeURIComponent(rawSessionSegment).split('/')[0]?.trim() ?? ''
        const query = new URLSearchParams(rawQuery)
        const transport = (query.get('transport') ?? 'ws').toLowerCase() === 'wss' ? 'wss' : 'ws'
        const explicitToken = query.get('token') ?? ''

        let sessionId = ''
        let token = explicitToken
        let tokenIsLegacyPrefix = false

        if (this.isUUID(sessionSegment)) {
            sessionId = sessionSegment
        } else if (sessionSegment.length > 36 && this.isUUID(sessionSegment.slice(0, 36))) {
            // Legacy format: <sessionId><tokenPrefix>
            sessionId = sessionSegment.slice(0, 36)
            if (!token) {
                token = sessionSegment.slice(36)
                tokenIsLegacyPrefix = token.length > 0
            }
        }

        if (!sessionId || !token) {
            return null
        }

        return {
            shareUrl,
            wsUrl: `${transport}://${normalizedEndpoint}/session`,
            sessionId,
            token,
            transport,
            tokenIsLegacyPrefix,
        }
    }

    /**
     * Parse a multi-session bundle URL generated by shareSessionBundle.
     */
    parseShareBundleUrl (rawUrl: string): ParsedShareSessionBundleLink | null {
        const shareUrl = (rawUrl ?? '').trim()
        if (!shareUrl.startsWith('tlink://share/')) {
            return null
        }

        const stripped = shareUrl.slice('tlink://share/'.length)
        const marker = '/bundle'
        const markerIndex = stripped.indexOf(marker)

        let rawEndpoint = ''
        let rawQuery = ''

        if (markerIndex >= 0) {
            rawEndpoint = this.safeDecodeURIComponent(stripped.slice(0, markerIndex))
            const afterBundle = stripped.slice(markerIndex + marker.length)
            rawQuery = afterBundle.startsWith('?') ? afterBundle.slice(1) : ''
        } else if (stripped.startsWith('bundle')) {
            rawEndpoint = ''
            const afterBundle = stripped.slice('bundle'.length)
            rawQuery = afterBundle.startsWith('?') ? afterBundle.slice(1) : ''
        } else {
            return null
        }

        const normalizedEndpoint = this.normalizeEndpoint(rawEndpoint) || '127.0.0.1:8080'
        const query = new URLSearchParams(rawQuery)
        const transport = (query.get('transport') ?? 'ws').toLowerCase() === 'wss' ? 'wss' : 'ws'
        const rawPayload = (query.get('data') ?? '').trim()
        if (!rawPayload) {
            return null
        }

        const payload = this.parseBundlePayload(rawPayload)
        if (!payload?.sessions?.length) {
            return null
        }

        const baseUrl = `tlink://share/${normalizedEndpoint}`
        const wsUrl = `${transport}://${normalizedEndpoint}/session`
        const sessions: ParsedShareSessionLink[] = []
        const seenKeys = new Set<string>()

        for (const entry of payload.sessions) {
            if (sessions.length >= this.maxBundleSessions) {
                this.logger.warn(`Ignoring extra shared sessions in bundle (limit ${this.maxBundleSessions})`)
                break
            }

            const sessionId = String(entry?.sessionId ?? entry?.id ?? '').trim()
            const token = String(entry?.token ?? '').trim()
            if (!this.isUUID(sessionId) || !token) {
                continue
            }
            const key = `${sessionId}|${token}`
            if (seenKeys.has(key)) {
                continue
            }
            seenKeys.add(key)
            sessions.push({
                shareUrl: this.buildShareUrl(baseUrl, sessionId, token, transport),
                wsUrl,
                sessionId,
                token,
                transport,
                tokenIsLegacyPrefix: false,
            })
        }

        if (!sessions.length) {
            return null
        }

        return {
            shareUrl,
            wsUrl,
            transport,
            sessions,
        }
    }

    /**
     * Broadcast terminal output to viewers
     */
    broadcastOutput (sessionId: string, data: Buffer): void {
        const sharedSession = this.sharedSessions.get(sessionId)
        if (!sharedSession) {
            return
        }

        // Broadcast via IPC (if in Electron) or direct WebSocket
        try {
            const ipcRenderer = this.getIpcRenderer()
            if (ipcRenderer) {
                ipcRenderer.send('session-sharing:broadcast-output', sessionId, data)
            } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'output',
                    sessionId: sharedSession.id,
                    data: data.toString('base64'),
                }))
            }
        } catch (error) {
            this.logger.debug('Failed to broadcast output:', error)
        }
    }

    /**
     * Forward input from viewer to terminal (for interactive mode)
     */
    forwardInput (sessionId: string, data: Buffer): void {
        const sharedSession = this.sharedSessions.get(sessionId)
        if (!sharedSession || sharedSession.mode !== 'interactive') {
            return
        }

        // Forward via IPC (if in Electron) or direct WebSocket
        try {
            const ipcRenderer = this.getIpcRenderer()
            if (ipcRenderer) {
                ipcRenderer.send('session-sharing:forward-input', sessionId, data)
            } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'input',
                    sessionId: sharedSession.id,
                    data: data.toString('base64'),
                }))
            }
        } catch (error) {
            this.logger.debug('Failed to forward input:', error)
        }
    }

    /**
     * Connect to WebSocket server
     */
    private async connectWebSocket (): Promise<void> {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return
        }

        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.wsUrl)

                this.ws.onopen = () => {
                    this.logger.info('WebSocket connected')
                    resolve()
                }

                this.ws.onerror = (error) => {
                    this.logger.error('WebSocket error:', error)
                    // For now, fail silently - in production, would show notification
                    reject(error)
                }

                this.ws.onclose = () => {
                    this.logger.info('WebSocket closed')
                    this.ws = null
                }

                this.ws.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data)
                        this.handleWebSocketMessage(message)
                    } catch (error) {
                        this.logger.error('Failed to parse WebSocket message:', error)
                    }
                }
            } catch (error) {
                this.logger.error('Failed to create WebSocket:', error)
                reject(error)
            }
        })
    }

    /**
     * Handle incoming WebSocket messages
     */
    private handleWebSocketMessage (message: any): void {
        switch (message.type) {
            case 'viewer-joined':
                this.handleViewerJoined(message)
                break
            case 'viewer-left':
                this.handleViewerLeft(message)
                break
            case 'input':
                this.handleViewerInput(message)
                break
            default:
                this.logger.warn('Unknown WebSocket message type:', message.type)
        }
    }

    private handleViewerJoined (message: any): void {
        const sharedSession = this.sharedSessions.get(message.sessionId)
        if (sharedSession) {
            sharedSession.viewers++
            this.logger.info('Viewer joined:', message.sessionId, 'Total viewers:', sharedSession.viewers)
        }
    }

    private handleViewerLeft (message: any): void {
        const sharedSession = this.sharedSessions.get(message.sessionId)
        if (sharedSession && sharedSession.viewers > 0) {
            sharedSession.viewers--
            this.logger.info('Viewer left:', message.sessionId, 'Total viewers:', sharedSession.viewers)
        }
    }

    private handleViewerInput (message: any): void {
        // This will be handled by the decorator
        // For now, just log it
        this.logger.debug('Viewer input received:', message.sessionId)
    }

    /**
     * Get base URL for shareable links
     */
    private async getShareBaseInfo (): Promise<ShareBaseInfo> {
        // Try to get WebSocket server URL from embedded server (if in Electron)
        try {
            const ipcRenderer = this.getIpcRenderer()
            if (ipcRenderer && ipcRenderer.invoke) {
                // Try to get public URL first (if tunnel is active)
                const publicUrl = await ipcRenderer.invoke('session-sharing:get-public-url')
                if (publicUrl) {
                    return {
                        baseUrl: this.convertWebSocketUrlToShareBaseUrl(publicUrl),
                        transport: this.getTransportFromWebSocketUrl(publicUrl),
                    }
                }

                // Prefer network URL for sharing with other users
                const networkUrl = await ipcRenderer.invoke('session-sharing:get-network-url')
                if (networkUrl && !String(networkUrl).includes('<your-ip>')) {
                    return {
                        baseUrl: this.convertWebSocketUrlToShareBaseUrl(networkUrl),
                        transport: this.getTransportFromWebSocketUrl(networkUrl),
                    }
                }

                // Fallback to local URL
                const localUrl = await ipcRenderer.invoke('session-sharing:get-server-url', false)
                return {
                    baseUrl: this.convertWebSocketUrlToShareBaseUrl(localUrl),
                    transport: this.getTransportFromWebSocketUrl(localUrl),
                }
            }
        } catch (error) {
            // Fallback to placeholder
            this.logger.debug('Could not get server URL from IPC:', error)
        }
        return {
            baseUrl: 'tlink://share',
            transport: 'ws',
        }
    }

    /**
     * Get shareable URL with network access information
     */
    async getShareableUrlWithInfo (terminal: any): Promise<{ url: string, networkUrl?: string, publicUrl?: string } | null> {
        const sharedSession = this.getSharedSession(terminal)
        if (!sharedSession) {
            return null
        }

        const { baseUrl, transport } = await this.getShareBaseInfo()
        const shareUrl = this.buildShareUrl(baseUrl, sharedSession.id, sharedSession.token, transport)
        
        const result: { url: string, networkUrl?: string, publicUrl?: string } = { url: shareUrl }

        try {
            const ipcRenderer = this.getIpcRenderer()
            if (ipcRenderer) {
                const networkUrl = await ipcRenderer.invoke('session-sharing:get-network-url')
                if (networkUrl) {
                    result.networkUrl = this.convertWebSocketUrlToShareBaseUrl(networkUrl)
                }

                // Get public URL if available
                const publicUrl = await ipcRenderer.invoke('session-sharing:get-public-url')
                if (publicUrl) {
                    result.publicUrl = this.convertWebSocketUrlToShareBaseUrl(publicUrl)
                }
            }
        } catch (error) {
            this.logger.debug('Could not get network/public URL info:', error)
        }

        return result
    }

    private buildShareUrl (baseUrl: string, sessionId: string, token: string, transport: 'ws' | 'wss'): string {
        const separator = baseUrl.includes('?') ? '&' : '?'
        return `${baseUrl}/session/${sessionId}${separator}token=${encodeURIComponent(token)}&transport=${transport}`
    }

    private buildShareBundleUrl (baseUrl: string, sessions: ShareBundleEntry[], transport: 'ws' | 'wss'): string {
        const separator = baseUrl.includes('?') ? '&' : '?'
        const payload = JSON.stringify({
            version: 1,
            sessions: sessions.map(session => ({
                id: session.sessionId,
                token: session.token,
                title: session.title,
            })),
        })
        return `${baseUrl}/bundle${separator}data=${encodeURIComponent(payload)}&transport=${transport}`
    }

    private convertWebSocketUrlToShareBaseUrl (url: string): string {
        try {
            const parsed = new URL(url)
            return `tlink://share/${parsed.host}`
        } catch {
            return String(url)
                .replace(/^wss?:\/\//, 'tlink://share/')
                .replace(/\/session\/?$/i, '')
        }
    }

    private getTransportFromWebSocketUrl (url: string): 'ws' | 'wss' {
        try {
            return new URL(url).protocol === 'wss:' ? 'wss' : 'ws'
        } catch {
            return String(url).startsWith('wss://') ? 'wss' : 'ws'
        }
    }

    private normalizeEndpoint (endpoint: string): string | null {
        let result = (endpoint ?? '').trim()
        if (!result) {
            return null
        }
        result = result.replace(/^wss?:\/\//i, '')
        result = result.replace(/\/session\/?$/i, '')
        result = result.replace(/^\/+|\/+$/g, '')
        return result || null
    }

    private isUUID (value: string): boolean {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    }

    private parseBundlePayload (rawPayload: string): ShareBundlePayload | null {
        const candidates: string[] = [rawPayload]
        try {
            const decoded = decodeURIComponent(rawPayload)
            if (decoded !== rawPayload) {
                candidates.push(decoded)
            }
        } catch {
            // Ignore URI decode errors and continue with raw payload
        }

        for (const candidate of candidates) {
            try {
                const parsed = JSON.parse(candidate)
                if (parsed && typeof parsed === 'object') {
                    return parsed
                }
            } catch {
                // Keep trying other decoding variants
            }
        }
        return null
    }

    private safeDecodeURIComponent (value: string): string {
        try {
            return decodeURIComponent(value)
        } catch {
            return value
        }
    }

    private async ensureServerRunningForSharing (): Promise<boolean> {
        const ipcRenderer = this.getIpcRenderer()
        if (!ipcRenderer) {
            return true
        }

        try {
            const isRunning = await ipcRenderer.invoke('session-sharing:is-server-running')
            if (isRunning) {
                return true
            }

            const shouldStart = await this.promptToStartServer()
            if (!shouldStart) {
                this.logger.info('Session sharing cancelled - server not running')
                return false
            }

            const result = await ipcRenderer.invoke('session-sharing:start-server')
            if (!result?.success) {
                this.logger.error('Failed to start WebSocket server:', result?.error)
                return false
            }

            this.logger.info('WebSocket server started, continuing with session share')
            return true
        } catch (error) {
            this.logger.debug('Could not check server status, continuing anyway:', error)
            return true
        }
    }

    private async ensureSessionRegisteredWithServer (sharedSession: SharedSession): Promise<boolean> {
        const ipcRenderer = this.getIpcRenderer()
        if (!ipcRenderer) {
            return true
        }

        try {
            const isRegistered = await ipcRenderer.invoke('session-sharing:is-registered', sharedSession.id)
            if (isRegistered) {
                return true
            }

            const expiresIn = this.getRemainingExpiryMinutes(sharedSession.expiresAt)
            if (expiresIn !== undefined && expiresIn <= 0) {
                return false
            }

            await ipcRenderer.invoke(
                'session-sharing:register',
                sharedSession.id,
                sharedSession.token,
                sharedSession.mode,
                sharedSession.password,
                expiresIn,
            )
            this.logger.info('Re-registered shared session with embedded server via IPC:', sharedSession.id)
            return true
        } catch (error) {
            this.logger.error('Failed to ensure shared session registration:', error)
            return false
        }
    }

    private getRemainingExpiryMinutes (expiresAt?: Date): number | undefined {
        if (!expiresAt) {
            return undefined
        }
        const remainingMs = expiresAt.getTime() - Date.now()
        if (remainingMs <= 0) {
            return 0
        }
        return Math.ceil(remainingMs / 60000)
    }

    private extractBundleEntryTitle (terminal: any): string | undefined {
        const preferred = String(terminal?.title ?? terminal?.profile?.name ?? '').trim()
        return preferred || undefined
    }

    private attachIPCListeners (): void {
        if (this.ipcListenersAttached) {
            return
        }
        const ipcRenderer = this.getIpcRenderer()
        if (!ipcRenderer || !ipcRenderer.on) {
            return
        }
        this.ipcListenersAttached = true

        ipcRenderer.on('session-sharing:viewer-count-changed', (_event: any, sessionId: string, count: number) => {
            const sharedSession = this.sharedSessions.get(sessionId)
            if (sharedSession) {
                sharedSession.viewers = Math.max(0, Number(count) || 0)
            }
        })

        ipcRenderer.on('session-sharing:terminal-input', (_event: any, sessionId: string, data: any) => {
            this.handleIncomingViewerInput(sessionId, data)
        })
    }

    private handleIncomingViewerInput (sessionId: string, data: any): void {
        const sharedSession = this.sharedSessions.get(sessionId)
        if (!sharedSession || sharedSession.mode !== 'interactive') {
            return
        }

        const terminal = this.sessionIdToTerminal.get(sessionId)
        if (!terminal) {
            return
        }

        const payload = this.normalizeIncomingBuffer(data)
        if (!payload.length) {
            return
        }

        try {
            if (typeof terminal.sendInput === 'function') {
                terminal.sendInput(payload)
                return
            }
            if (terminal.session && typeof terminal.session.feedFromTerminal === 'function') {
                terminal.session.feedFromTerminal(payload)
            }
        } catch (error) {
            this.logger.debug('Failed to route viewer input to terminal:', error)
        }
    }

    private normalizeIncomingBuffer (data: any): Buffer {
        if (!data) {
            return Buffer.from('')
        }
        if (Buffer.isBuffer(data)) {
            return data
        }
        if (data instanceof ArrayBuffer) {
            return Buffer.from(data)
        }
        if (ArrayBuffer.isView(data)) {
            return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
        }
        if (Array.isArray(data)) {
            return Buffer.from(data)
        }
        if (typeof data === 'string') {
            return Buffer.from(data, 'utf-8')
        }
        if (typeof data === 'object' && Array.isArray(data.data)) {
            return Buffer.from(data.data)
        }
        return Buffer.from('')
    }

    /**
     * Get IPC renderer if available (in Electron)
     */
    private getIpcRenderer (): any {
        try {
            // Check if we're in Electron renderer process
            if (typeof window !== 'undefined' && (window as any).require) {
                const electron = (window as any).require('electron')
                if (electron && electron.ipcRenderer) {
                    return electron.ipcRenderer
                }
            }
            // Also try require if available (Node.js environment)
            if (typeof require !== 'undefined') {
                try {
                    const electron = require('electron')
                    if (electron && electron.ipcRenderer) {
                        return electron.ipcRenderer
                    }
                } catch {
                    // Not in Electron
                }
            }
        } catch {
            // IPC not available
        }
        return null
    }
}
