import { Injector } from '@angular/core'
import { LogService, ParsedShareSessionLink } from 'tlink-core'
import { BaseSession } from './session'

export type SharedSessionJoinErrorCode =
    | 'CONNECTION_FAILED'
    | 'CONNECTION_CLOSED'
    | 'TIMEOUT'
    | 'SESSION_NOT_FOUND'
    | 'INVALID_TOKEN'
    | 'INVALID_PASSWORD'
    | 'SESSION_EXPIRED'
    | 'UNKNOWN'

export class SharedSessionJoinError extends Error {
    constructor (
        public code: SharedSessionJoinErrorCode,
        message: string,
    ) {
        super(message)
        this.name = 'SharedSessionJoinError'
    }
}

export interface SharedSessionViewerStartOptions {
    password?: string
}

export class SharedSessionViewerSession extends BaseSession {
    private ws: WebSocket | null = null
    private joined = false
    private mode: 'read-only' | 'interactive' = 'read-only'

    get sharingMode (): 'read-only' | 'interactive' {
        return this.mode
    }

    constructor (
        injector: Injector,
        private link: ParsedShareSessionLink,
    ) {
        super(injector.get(LogService).create('sharedSessionViewer'))
    }

    async start (options: SharedSessionViewerStartOptions = {}): Promise<void> {
        if (this.joined) {
            return
        }
        await this.connectAndJoin(options.password)
    }

    resize (_columns: number, _rows: number): void {
        // No-op for shared viewer sessions
    }

    write (data: Buffer): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.joined || this.mode !== 'interactive') {
            return
        }

        this.ws.send(JSON.stringify({
            type: 'input',
            sessionId: this.link.sessionId,
            data: data.toString('base64'),
        }))
    }

    kill (_signal?: string): void {
        this.closeSocket()
    }

    async gracefullyKillProcess (): Promise<void> {
        this.closeSocket()
    }

    supportsWorkingDirectory (): boolean {
        return false
    }

    async getWorkingDirectory (): Promise<string | null> {
        return null
    }

    private async connectAndJoin (password?: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let settled = false
            let timeout: ReturnType<typeof setTimeout> | undefined

            const clearJoinTimeout = () => {
                if (timeout) {
                    clearTimeout(timeout)
                    timeout = undefined
                }
            }

            const resolveJoin = () => {
                if (settled) {
                    return
                }
                settled = true
                clearJoinTimeout()
                resolve()
            }

            const rejectJoin = (error: SharedSessionJoinError) => {
                if (settled) {
                    return
                }
                settled = true
                clearJoinTimeout()
                this.closeSocket()
                reject(error)
            }

            try {
                this.ws = new WebSocket(this.link.wsUrl)
            } catch (error: any) {
                rejectJoin(new SharedSessionJoinError(
                    'CONNECTION_FAILED',
                    error?.message || 'Failed to open WebSocket connection',
                ))
                return
            }

            const ws = this.ws
            timeout = setTimeout(() => {
                rejectJoin(new SharedSessionJoinError('TIMEOUT', 'Timed out while joining shared session'))
            }, 10000)

            ws.onopen = () => {
                ws.send(JSON.stringify({
                    type: 'join',
                    sessionId: this.link.sessionId,
                    token: this.link.token,
                    password,
                }))
            }

            ws.onerror = () => {
                if (!this.joined) {
                    rejectJoin(new SharedSessionJoinError('CONNECTION_FAILED', 'Connection failed'))
                }
            }

            ws.onclose = () => {
                this.ws = null
                if (!this.joined) {
                    rejectJoin(new SharedSessionJoinError('CONNECTION_CLOSED', 'Connection closed before join completed'))
                    return
                }
                if (this.open) {
                    this.open = false
                    this.closed.next()
                }
            }

            ws.onmessage = (event: MessageEvent) => {
                const message = this.parseMessage(event.data)
                if (!message || typeof message.type !== 'string') {
                    return
                }

                switch (message.type) {
                    case 'joined':
                        this.mode = message.mode === 'interactive' ? 'interactive' : 'read-only'
                        this.joined = true
                        this.open = true
                        resolveJoin()
                        break
                    case 'output':
                        if (typeof message.data === 'string' && message.data.length) {
                            this.emitOutput(Buffer.from(message.data, 'base64'))
                        }
                        break
                    case 'error':
                        if (!this.joined) {
                            rejectJoin(this.mapJoinError(message.message))
                        } else if (typeof message.message === 'string') {
                            this.logger.debug('Session sharing server error:', message.message)
                        }
                        break
                }
            }
        })
    }

    private parseMessage (rawData: any): any | null {
        try {
            if (typeof rawData === 'string') {
                return JSON.parse(rawData)
            }
            if (rawData instanceof ArrayBuffer) {
                return JSON.parse(Buffer.from(rawData).toString('utf-8'))
            }
            if (ArrayBuffer.isView(rawData)) {
                return JSON.parse(Buffer.from(rawData.buffer, rawData.byteOffset, rawData.byteLength).toString('utf-8'))
            }
        } catch (error) {
            this.logger.debug('Failed to parse shared-session message:', error)
        }
        return null
    }

    private mapJoinError (rawMessage: any): SharedSessionJoinError {
        const message = String(rawMessage ?? 'Unknown error').trim()
        const normalized = message.toLowerCase()

        if (normalized.includes('session not found')) {
            return new SharedSessionJoinError('SESSION_NOT_FOUND', message)
        }
        if (normalized.includes('invalid token')) {
            return new SharedSessionJoinError('INVALID_TOKEN', message)
        }
        if (normalized.includes('invalid password')) {
            return new SharedSessionJoinError('INVALID_PASSWORD', message)
        }
        if (normalized.includes('session expired')) {
            return new SharedSessionJoinError('SESSION_EXPIRED', message)
        }
        return new SharedSessionJoinError('UNKNOWN', message || 'Unknown session sharing error')
    }

    private closeSocket (): void {
        if (!this.ws) {
            return
        }
        try {
            this.ws.close()
        } catch {
            // Ignore close failures
        }
        this.ws = null
    }
}
