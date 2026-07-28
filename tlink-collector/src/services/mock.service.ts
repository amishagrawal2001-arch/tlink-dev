/* eslint-disable @typescript-eslint/no-use-before-define, @typescript-eslint/max-params */
import { Injectable } from '@angular/core'
import { EventEmitter } from 'events'
import { CollectorProfile, CollectorSample, MockSourceConfig } from '../api'

/**
 * A running mock stream — same handle shape a real Prometheus scraper
 * will produce, so downstream code doesn't have to distinguish.
 * `.stop()` clears the interval; `.on('sample', …)` receives per-metric
 * samples on the profile's scrapeIntervalSec cadence.
 *
 * Uses Node's EventEmitter (not Angular's) because we need named
 * event streams ('sample' vs 'error') — Angular's EventEmitter is a
 * single-stream Subject and doesn't fit.
 */
export interface CollectorHandle extends EventEmitter {
    stop: () => void
}

/**
 * Built-in Mock data source. Generates a synthetic set of metrics
 * per profile — one series per (host, metric-family) tuple — so the
 * UI (Wire log / Latest / Graphical) has realistic streaming data to
 * render before a real Prometheus / Telegraf endpoint is available.
 *
 * Ships as a first-class source rather than test-only because it
 * doubles as a demo target and a regression-testing harness. Every
 * new data-source type should be reachable through this same
 * "start(profile) → CollectorHandle emitting samples" contract.
 *
 * Series shape:
 *   /mock/host{name=host-1}/cpu_percent   → gauge 0..100
 *   /mock/host{name=host-1}/memory_bytes  → gauge auto-growing to 8-16 GiB
 *   /mock/host{name=host-1}/requests_total → monotonic counter
 *   /mock/host{name=host-1}/errors_total   → monotonic counter (rare)
 * hostCount controls fan-out (1..N); scenario controls the value shape.
 */
@Injectable({ providedIn: 'root' })
export class CollectorMockService {
    /**
     * Kick off a mock stream for a profile. Timer runs outside Angular's
     * zone (via plain setInterval — Zone.js patches it as
     * outside-zone when scheduled inline in a non-Angular context)
     * so per-sample emissions don't blast CD; the session tab
     * applies its own throttled markForCheck downstream.
     */
    start (profile: CollectorProfile): CollectorHandle {
        const cfg: MockSourceConfig = profile.options.mock ?? { hostCount: 5, scenario: 'idle' }
        const intervalMs = Math.max(1, profile.options.scrapeIntervalSec ?? 10) * 1000
        const handle = new EventEmitter() as unknown as CollectorHandle
        // Per-series state so counters keep monotonic and gauges wander.
        const state = this.seedState(cfg)
        let tick = 0
        const timer = setInterval(() => {
            tick += 1
            const nowNs = Date.now() * 1_000_000
            for (const sample of this.emitSamples(state, cfg, tick, nowNs, profile.name)) {
                handle.emit('sample', sample)
            }
        }, intervalMs)
        // Emit one immediate sample tick so the UI shows data on the
        // first render rather than waiting a full interval.
        setTimeout(() => {
            tick += 1
            const nowNs = Date.now() * 1_000_000
            for (const sample of this.emitSamples(state, cfg, tick, nowNs, profile.name)) {
                handle.emit('sample', sample)
            }
        }, 50)
        handle.stop = () => { clearInterval(timer) }
        return handle
    }

    /**
     * Per-series persistent state (last CPU %, last memory bytes,
     * counter running totals). Keeps values contiguous across ticks
     * so charts look like realistic trends rather than random noise.
     */
    private seedState (cfg: MockSourceConfig): MockState {
        const hosts: MockHostState[] = []
        for (let i = 0; i < Math.max(1, cfg.hostCount); i++) {
            hosts.push({
                name: `host-${i + 1}`,
                cpu: 20 + Math.floor(rng() * 40),          // start CPU 20-60%
                memBytes: (4 + rng() * 4) * 1024 * 1024 * 1024, // 4-8 GiB
                requestsTotal: Math.floor(rng() * 100_000),
                errorsTotal: Math.floor(rng() * 100),
            })
        }
        return { hosts }
    }

    /**
     * One "scrape tick" — emit fresh values for every series. Scenario
     * decides how the values move:
     *   - idle:     small random walk near baseline
     *   - busy:     high CPU + memory + steady counter growth
     *   - flapping: CPU spikes to 90+% every few ticks then recovers
     *   - growing:  monotonic counter increases at higher rate
     */
    private emitSamples (
        state: MockState,
        cfg: MockSourceConfig,
        tick: number,
        nowNs: number,
        targetName: string,
    ): CollectorSample[] {
        const out: CollectorSample[] = []
        for (const host of state.hosts) {
            this.stepHost(host, cfg.scenario, tick)
            const sample = (metric: string, value: number): CollectorSample => ({
                timestampNs: nowNs,
                path: `/mock/host[name=${host.name}]/${metric}`,
                value,
                kind: 'update',
                target: targetName,
            })
            out.push(sample('cpu_percent', Number(host.cpu.toFixed(1))))
            out.push(sample('memory_bytes', Math.round(host.memBytes)))
            out.push(sample('requests_total', host.requestsTotal))
            out.push(sample('errors_total', host.errorsTotal))
        }
        return out
    }

    /** Move one host's simulated state forward by one tick. */
    private stepHost (host: MockHostState, scenario: MockSourceConfig['scenario'], tick: number): void {
        // Random walk within scenario-specific band.
        const delta = (rng() - 0.5) * 6                  // ±3% jitter
        switch (scenario) {
            case 'busy':
                host.cpu = clamp(host.cpu + delta + 0.4, 60, 95)
                host.memBytes += rng() * 4 * 1024 * 1024  // +0..4 MiB per tick
                host.requestsTotal += 80 + Math.floor(rng() * 40)
                if (rng() < 0.2) { host.errorsTotal += 1 }
                break
            case 'flapping':
                if (tick % 6 === 0) {
                    host.cpu = 88 + rng() * 10          // spike
                } else {
                    host.cpu = clamp(host.cpu + delta - 2, 15, 50)
                }
                host.memBytes += (rng() - 0.5) * 2 * 1024 * 1024
                host.requestsTotal += 20 + Math.floor(rng() * 30)
                if (rng() < 0.1) { host.errorsTotal += 1 }
                break
            case 'growing':
                host.cpu = clamp(host.cpu + delta, 20, 70)
                host.memBytes += 1 * 1024 * 1024        // +1 MiB per tick, deliberate leak
                host.requestsTotal += 200 + Math.floor(rng() * 100)
                if (rng() < 0.05) { host.errorsTotal += 1 }
                break
            case 'idle':
            default:
                host.cpu = clamp(host.cpu + delta, 5, 30)
                host.memBytes += (rng() - 0.5) * 1024 * 1024
                host.requestsTotal += 5 + Math.floor(rng() * 10)
                if (rng() < 0.02) { host.errorsTotal += 1 }
                break
        }
    }
}

interface MockState {
    hosts: MockHostState[]
}
interface MockHostState {
    name: string
    cpu: number
    memBytes: number
    requestsTotal: number
    errorsTotal: number
}

/**
 * PRNG helper. Math.random is fine — mocks don't need cryptographic
 * quality; using a seeded PRNG would just add code without meaningful
 * benefit. Callers rely on this for jitter, spike triggers, etc.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function rng () { return Math.random() }

function clamp (v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v
}
