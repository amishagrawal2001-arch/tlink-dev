import { Injectable } from '@angular/core'
import { ConfigProvider } from 'tlink-core'

/**
 * Defaults injected into the app-wide config tree under `gnmi.*`.
 *
 * `enabled` is the experimental gate. Until v1.3+ users must flip it
 * on in Settings → Advanced → Experimental before any gNMI plugin
 * surface (tab type, profile provider, hotkeys) activates. This lets
 * us dark-launch each milestone without exposing half-built UI to
 * everyone by default.
 */
@Injectable()
export class GnmiConfigProvider extends ConfigProvider {
    defaults = {
        gnmi: {
            enabled: false,
            defaultEncoding: 'JSON_IETF',
            defaultTimeoutMs: 10_000,
            /** Pretty-print JSON values in the live stream view. */
            prettyPrintJson: true,
            /** Truncate very long values in the stream table to keep the UI snappy. */
            maxValueRenderLength: 4096,
        },
    }

    platformDefaults = {}
}
