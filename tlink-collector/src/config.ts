import { Injectable } from '@angular/core'
import { ConfigProvider } from 'tlink-core'

/**
 * Defaults injected into the app-wide config tree under `collector.*`.
 * Kept minimal — most per-target settings live on the profile itself.
 */
@Injectable()
export class CollectorConfigProvider extends ConfigProvider {
    defaults = {
        collector: {
            enabled: false,
            defaultScrapeIntervalSec: 10,
            maxStreamRows: 1000,
        },
    }

    platformDefaults = {}
}
