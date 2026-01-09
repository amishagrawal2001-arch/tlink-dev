import { Injectable } from '@angular/core'
import { ConsoleLogger, Logger } from 'tlink-core'

@Injectable({ providedIn: 'root' })
export class ConsoleLogService {
    create (name: string): Logger {
        return new ConsoleLogger(name)
    }
}
