import { Injectable } from '@angular/core'
import { Observable, throwError } from 'rxjs'
import { PathedSample, TelemetryBroker, TelemetrySample, TelemetrySourceRef } from 'tlink-core'
import { GnmiTelemetryBroker } from 'tlink-gnmi'
import { CollectorTelemetryBroker } from 'tlink-collector'

/**
 * Dashboards-side TelemetryBroker. Dispatches to the plugin-local
 * broker owning the referenced profile. Each plugin broker handles
 * its own ref counting and subscription lifecycle — this class is
 * pure routing.
 *
 * M4.2b: proxies `observeAll` (collector only — gNMI throws) and
 * `observeErrors` (both plugins) so session tabs can consume the
 * broker alongside the dashboard tiles.
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

    observeAll (ref: TelemetrySourceRef): Observable<PathedSample> {
        if (ref.kind === 'collector') {
            return this.collector.observeAll(ref)
        }
        if (ref.kind === 'gnmi') {
            return throwError(() => new Error('observeAll is not supported for gNMI sources — subscribe per-path instead'))
        }
        return throwError(() => new Error(`Unknown telemetry source kind: ${(ref as { kind: string }).kind}`))
    }

    observeErrors (ref: TelemetrySourceRef, path: string): Observable<Error> {
        if (ref.kind === 'gnmi') {
            return this.gnmi.observeErrors(ref, path)
        }
        if (ref.kind === 'collector') {
            return this.collector.observeErrors(ref, path)
        }
        return throwError(() => new Error(`Unknown telemetry source kind: ${(ref as { kind: string }).kind}`))
    }
}
