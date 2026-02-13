import * as fs from 'fs'
import * as path from 'path'
import { Injectable } from '@angular/core'
import { ConsoleLogger, Logger } from 'tlink-core'
import { ElectronService } from '../services/electron.service'

type WinstonLogger = {
    error: (...args: any[]) => void
    warn: (...args: any[]) => void
    info: (...args: any[]) => void
    debug: (...args: any[]) => void
    log?: (...args: any[]) => void
}

const makeConsoleLogger = (): WinstonLogger => ({
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    info: console.info.bind(console),
    debug: console.debug?.bind(console) ?? console.log.bind(console),
    log: console.log.bind(console),
})

const initializeWinston = (electron: ElectronService): WinstonLogger => {
    const isRenderer = typeof window !== 'undefined' && (window as any).process?.type === 'renderer'
    if (isRenderer) {
        return makeConsoleLogger()
    }

    const logDirectory = electron?.app?.getPath?.('userData')
    if (!logDirectory) {
        return makeConsoleLogger()
    }

    let winston: any
    try {
        // eslint-disable-next-line
        winston = require('winston')
    } catch (e) {
        console.error('Failed to load winston, using Console only:', e)
        return makeConsoleLogger()
    }

    let FileTransport: any
    try {
        FileTransport = winston?.transports?.File
    } catch (e) {
        console.error('Failed to load winston File transport, using Console only:', e)
        return makeConsoleLogger()
    }

    if (!FileTransport) {
        console.error('Failed to load winston File transport, using Console only')
        return makeConsoleLogger()
    }

    if (!fs.existsSync(logDirectory)) {
        fs.mkdirSync(logDirectory, { recursive: true })
    }

    return winston.createLogger({
        transports: [
            new FileTransport({
                level: 'debug',
                filename: path.join(logDirectory, 'log.txt'),
                format: winston.format.simple(),
                handleExceptions: false,
                maxsize: 5242880,
                maxFiles: 5,
            }),
        ],
        exitOnError: false,
    })
}

export class WinstonAndConsoleLogger extends ConsoleLogger {
    constructor (private winstonLogger: WinstonLogger, name: string) {
        super(name)
    }

    protected doLog (level: string, ...args: any[]): void {
        super.doLog(level, ...args)
        const target = this.winstonLogger[level] ?? this.winstonLogger.log
        if (target) {
            target(...args)
        }
    }
}

@Injectable({ providedIn: 'root' })
export class ElectronLogService {
    private log: WinstonLogger

    /** @hidden */
    constructor (electron: ElectronService) {
        this.log = initializeWinston(electron)
    }

    create (name: string): Logger {
        return new WinstonAndConsoleLogger(this.log, name)
    }
}
