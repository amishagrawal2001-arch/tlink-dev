import { Injector } from '@angular/core'
import { Subject } from 'rxjs'
import { Logger, LogService } from 'tlink-core'
import { RDPProfile } from '../api'

// Type definitions for node-rdpjs (since it may not have TypeScript definitions)
interface RDPClient {
    on(event: 'connect', callback: () => void): void
    on(event: 'bitmap', callback: (bitmap: BitmapData) => void): void
    on(event: 'close', callback: () => void): void
    on(event: 'error', callback: (error: Error) => void): void
    connect(host: string, port: number): void
    sendKeyEventScancode(code: number, isPressed: boolean): void
    sendPointerEvent(x: number, y: number, button: number, isPressed: boolean): void
    close(): void
}

interface BitmapData {
    x: number
    y: number
    width: number
    height: number
    bitsPerPixel: number
    buffer: Buffer
}

interface RDPClientOptions {
    domain?: string
    userName: string
    password?: string
    enablePerf?: boolean
    autoLogin?: boolean
    decompress?: boolean
    screen: {
        width: number
        height: number
    }
    locale?: string
    logLevel?: string
}

declare function createRDPClient(options: RDPClientOptions): RDPClient

export class RDPSession {
    private client: RDPClient | null = null
    private logger: Logger
    profile: RDPProfile
    open = false
    willDestroy$ = new Subject<void>()
    bitmap$ = new Subject<BitmapData>()
    error$ = new Subject<Error>()

    constructor (injector: Injector, profile: RDPProfile) {
        this.profile = profile
        const log = injector.get(LogService)
        this.logger = log.create('rdp')
    }

    async start (): Promise<void> {
        if (this.open || this.client) {
            return
        }

        try {
            // Import node-rdpjs (using require for compatibility)
            let rdpjs: any
            try {
                rdpjs = require('node-rdpjs')
            } catch (error) {
                throw new Error('node-rdpjs is not installed. Please install it: npm install node-rdpjs')
            }

            const createClient = rdpjs.createClient || rdpjs.default?.createClient
            if (!createClient) {
                throw new Error('node-rdpjs createClient function not found')
            }

            const options: RDPClientOptions = {
                userName: this.profile.options.user,
                password: this.profile.options.password,
                domain: this.profile.options.domain,
                enablePerf: true,
                autoLogin: true,
                decompress: false,
                screen: {
                    width: this.profile.options.width ?? 1920,
                    height: this.profile.options.height ?? 1080,
                },
                locale: 'en',
                logLevel: 'INFO',
            }

            this.client = createClient(options) as RDPClient

            // Set up event handlers
            this.client.on('connect', () => {
                this.logger.info('RDP connection established')
                this.open = true
            })

            this.client.on('bitmap', (bitmap: BitmapData) => {
                this.bitmap$.next(bitmap)
            })

            this.client.on('close', () => {
                this.logger.info('RDP connection closed')
                this.open = false
                this.willDestroy$.next()
            })

            this.client.on('error', (error: Error) => {
                this.logger.error('RDP error:', error)
                this.error$.next(error)
                this.open = false
            })

            // Connect to RDP server
            const host = this.profile.options.host
            const port = this.profile.options.port ?? 3389
            
            if (!host || host.trim() === '') {
                throw new Error('RDP host is required')
            }
            
            this.logger.info(`Connecting to RDP server ${host}:${port}`)
            this.client.connect(host, port)

        } catch (error) {
            this.logger.error('Failed to start RDP session:', error)
            this.open = false
            throw error
        }
    }

    sendKeyEvent (code: number, isPressed: boolean): void {
        if (this.client && this.open) {
            this.client.sendKeyEventScancode(code, isPressed)
        }
    }

    sendPointerEvent (x: number, y: number, button: number, isPressed: boolean): void {
        if (this.client && this.open) {
            this.client.sendPointerEvent(x, y, button, isPressed)
        }
    }

    destroy (): void {
        if (this.client) {
            try {
                this.client.close()
            } catch (error) {
                this.logger.error('Error closing RDP client:', error)
            }
            this.client = null
        }
        this.open = false
        this.willDestroy$.next()
        this.willDestroy$.complete()
    }
}

