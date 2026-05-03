import { Injectable } from '@angular/core'
import { BehaviorSubject, Observable, Subject } from 'rxjs'
import { EnvironmentService } from './environment.service'

/**
 * Lightweight WebSocket / SSE client.
 *
 * Both transports speak in "frames" so the UI can present a single
 * timeline. We don't try to pretend SSE is a WebSocket — we just give
 * the user a unified frames$ stream + close$ signal so the timeline
 * panel doesn't need to know which it is.
 *
 * The service is per-tab (consumed via the component's Injector child
 * scope — see apiClientTab module). Closing the tab disposes the
 * underlying connection.
 */

export type FrameDirection = 'in' | 'out' | 'system'
export interface RealtimeFrame {
    id: string
    timestamp: number
    direction: FrameDirection
    text: string
    /** Optional sub-event name for SSE (`event:` line). */
    eventName?: string
}

export type RealtimeKind = 'websocket' | 'sse'
export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'closing' | 'closed' | 'error'

@Injectable()
export class WebSocketService {
    private socket: WebSocket | null = null
    private eventSource: EventSource | null = null
    private framesSubject = new BehaviorSubject<RealtimeFrame[]>([])
    private statusSubject = new BehaviorSubject<RealtimeStatus>('idle')
    private errorSubject = new Subject<string>()

    constructor (private envService: EnvironmentService) {}

    get frames$ (): Observable<RealtimeFrame[]> { return this.framesSubject.asObservable() }
    get status$ (): Observable<RealtimeStatus> { return this.statusSubject.asObservable() }
    get error$ (): Observable<string> { return this.errorSubject.asObservable() }
    get status (): RealtimeStatus { return this.statusSubject.value }
    get frames (): RealtimeFrame[] { return this.framesSubject.value }

    open (kind: RealtimeKind, urlRaw: string, protocols?: string[]): void {
        if (this.socket ?? this.eventSource) {
            this.close()
        }
        const url = this.envService.substitute(urlRaw)
        this.statusSubject.next('connecting')
        this.append('system', `connecting to ${url}`)
        try {
            if (kind === 'websocket') {
                this.socket = new WebSocket(url, protocols)
                this.socket.onopen = () => {
                    this.statusSubject.next('open')
                    this.append('system', 'connected')
                }
                this.socket.onmessage = (ev: MessageEvent) => {
                    this.append('in', typeof ev.data === 'string' ? ev.data : '[binary frame]')
                }
                this.socket.onerror = () => {
                    this.statusSubject.next('error')
                    this.errorSubject.next('WebSocket error (see status)')
                }
                this.socket.onclose = ev => {
                    this.statusSubject.next('closed')
                    this.append('system', `closed (code ${ev.code}${ev.reason ? `: ${ev.reason}` : ''})`)
                }
            } else {
                this.eventSource = new EventSource(url)
                this.eventSource.onopen = () => {
                    this.statusSubject.next('open')
                    this.append('system', 'connected')
                }
                this.eventSource.onmessage = (ev: MessageEvent) => {
                    this.append('in', String(ev.data ?? ''))
                }
                this.eventSource.onerror = () => {
                    this.statusSubject.next('error')
                    this.errorSubject.next('SSE error — connection lost')
                }
            }
        } catch (e: any) {
            this.statusSubject.next('error')
            this.errorSubject.next(e?.message ?? 'Failed to connect')
        }
    }

    send (text: string): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            this.errorSubject.next('Socket not open')
            return
        }
        try {
            this.socket.send(text)
            this.append('out', text)
        } catch (e: any) {
            this.errorSubject.next(e?.message ?? 'Failed to send')
        }
    }

    close (): void {
        this.statusSubject.next('closing')
        try { this.socket?.close() } catch { /* already gone */ }
        try { this.eventSource?.close() } catch { /* already gone */ }
        this.socket = null
        this.eventSource = null
        if (this.statusSubject.value !== 'closed') {
            this.statusSubject.next('closed')
        }
    }

    clear (): void {
        this.framesSubject.next([])
    }

    private append (direction: FrameDirection, text: string, eventName?: string): void {
        const f: RealtimeFrame = {
            id: `frm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: Date.now(),
            direction,
            text,
            eventName,
        }
        // Cap frame log to keep memory bounded for chatty sockets.
        const next = [...this.framesSubject.value, f].slice(-500)
        this.framesSubject.next(next)
    }
}
