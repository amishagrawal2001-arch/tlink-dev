import { Injectable } from '@angular/core'
import { Observable, throwError } from 'rxjs'
import { TelemetryBroker, TelemetrySample, TelemetrySourceRef } from 'tlink-core'
import { GnmiTelemetryBroker } from 'tlink-gnmi'
import { CollectorTelemetryBroker } from 'tlink-collector'

/**
 * Dashboards-side TelemetryBroker. Dispatches `observe()` to the
 * plugin-local broker owning the referenced profile. Each plugin
 * broker handles its own ref counting and subscription lifecycle —
 * this class is pure routing.
 */
@Injectable({ providedIn: 'root' })
export class DashboardsTelemetryBroker implements TelemetryBroker {
    constructor (
        private readonly gnmi: GnmiTelemetryBroker,
        private readonly collector: CollectorTelemetryBroker,
    ) { }

    observe (ref: TelemetrySourceRef, path: string): Observable<TelemetrySample> {
        if (ref.kind === 'gnmi') {
            return this.gnmi.observe(ref, path)
        }
        if (ref.kind === 'collector') {
            return this.collector.observe(ref, path)
        }
        return throwError(() => new Error(`Unknown telemetry source kind: ${(ref as { kind: string }).kind}`))
    }
}
