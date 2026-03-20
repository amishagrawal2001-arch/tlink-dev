import { Injectable } from '@angular/core'
import * as fs from 'fs'
import * as path from 'path'
import { RDPProfile } from '../api'

export interface SessionLogHandle {
    filePath: string
    stream: fs.WriteStream
}

@Injectable({ providedIn: 'root' })
export class RDPSessionLoggerService {
    startLogging (profile: RDPProfile): SessionLogHandle | null {
        const logConfig = profile.options.sessionLog
        if (!logConfig?.enabled) {
            return null
        }

        const homeDir = process.env.HOME || process.env.USERPROFILE || ''
        const logDir = logConfig.directory || path.join(homeDir, '.tlink', 'rdp-session-logs')

        try {
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true })
            }
        } catch {
            return null
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const host = (profile.options.host || 'unknown').replace(/[^a-zA-Z0-9.-]/g, '_')
        const user = (profile.options.user || 'unknown').replace(/[^a-zA-Z0-9.-]/g, '_')
        const fileName = `${user}@${host}_${timestamp}.rdp.jsonl`
        const filePath = path.join(logDir, fileName)

        const stream = fs.createWriteStream(filePath, { flags: 'a' })
        return { filePath, stream }
    }

    logEvent (handle: SessionLogHandle | null, type: string, data?: any): void {
        if (!handle) {
            return
        }
        const entry = {
            timestamp: new Date().toISOString(),
            type,
            ...(data !== undefined ? { data } : {}),
        }
        try {
            handle.stream.write(JSON.stringify(entry) + '\n')
        } catch {
            // ignore write errors
        }
    }

    stopLogging (handle: SessionLogHandle | null): void {
        if (!handle) {
            return
        }
        try {
            handle.stream.end()
        } catch {
            // ignore
        }
    }
}
