import { Injectable } from '@angular/core'
import { Observable, Subject } from 'rxjs'
import stripAnsi from 'strip-ansi'

/**
 * Network-vendor awareness for SSH sessions.
 *
 * Watches the post-auth output of an SSH shell, pattern-matches the
 * banner / login text against known platform signatures, and surfaces
 * the detected platform so other components (snippets picker, output
 * highlighter, safety prompts) can adapt their behavior.
 *
 * Detection runs on the FIRST few KB of session output only — most
 * platforms write their identity in the MOTD or the initial prompt
 * decoration, and we don't want to keep scanning every byte forever.
 */

/** A platform definition: how to recognize it + UI metadata. */
export interface NetworkPlatform {
    /** Stable id used by snippet packs + persisted state. */
    id: string
    /** Display name shown in the tab badge ("JUNOS", "Cisco IOS", …). */
    name: string
    /** FontAwesome icon class (without the leading `fa fa-`). */
    icon: string
    /** Tab badge background/text color hint. */
    color: string
    /**
     * Patterns that, if matched in the early session output, indicate
     * this platform. First-match wins; ordering is significant —
     * place stricter patterns first so a generic linux line doesn't
     * preempt a JUNOS-on-Linux one.
     */
    patterns: RegExp[]
    /** Optional human-readable description for the tooltip. */
    description?: string
}

/**
 * Curated platform list. Patterns drawn from real banners / MOTDs of
 * each vendor's recent OS versions. The ordering matters — JUNOS-EVO
 * mentions Linux in its banner so we must check JUNOS-style markers
 * before falling through to generic Linux.
 */
export const NETWORK_PLATFORMS: NetworkPlatform[] = [
    {
        id: 'junos',
        name: 'JUNOS',
        icon: 'fa-network-wired',
        color: '#0ea5e9',
        description: 'Juniper Networks JUNOS / EVO',
        patterns: [
            /JUNOS\s+[\d.]+/i,
            /---\s*JUNOS\b/,
            /\[edit\]/,                 // JUNOS configuration mode prompt
            /\bvrf:[a-z0-9-]+\]/i,      // JUNOS routing-instance prompt
        ],
    },
    {
        id: 'iosxr',
        name: 'IOS-XR',
        icon: 'fa-network-wired',
        color: '#0891b2',
        description: 'Cisco IOS-XR',
        patterns: [
            /Cisco\s+IOS\s*XR\s+Software/i,
            /XR\s+Software,\s+Version/i,
        ],
    },
    {
        id: 'iosxe',
        name: 'IOS-XE',
        icon: 'fa-network-wired',
        color: '#0d9488',
        description: 'Cisco IOS-XE',
        patterns: [
            /Cisco\s+IOS-XE\s+Software/i,
            /IOS-XE Software,\s+Version/i,
        ],
    },
    {
        id: 'ios',
        name: 'Cisco IOS',
        icon: 'fa-network-wired',
        color: '#14b8a6',
        description: 'Cisco IOS classic',
        patterns: [
            /Cisco\s+Internetwork\s+Operating\s+System/i,
            /^IOS \(tm\)/m,
            /Cisco IOS Software,/i,
        ],
    },
    {
        id: 'nxos',
        name: 'NX-OS',
        icon: 'fa-network-wired',
        color: '#10b981',
        description: 'Cisco NX-OS (Nexus)',
        patterns: [
            /Cisco\s+Nexus\s+Operating\s+System/i,
            /NX-OS\b/,
        ],
    },
    {
        id: 'eos',
        name: 'Arista EOS',
        icon: 'fa-network-wired',
        color: '#f59e0b',
        description: 'Arista Extensible Operating System',
        patterns: [
            /Arista\s+Networks\s+EOS/i,
            /Arista\s+EOS/i,
        ],
    },
    {
        id: 'sros',
        name: 'Nokia SR OS',
        icon: 'fa-network-wired',
        color: '#3b82f6',
        description: 'Nokia Service Router OS (formerly Alcatel-Lucent)',
        patterns: [
            /TiMOS-[A-Z]?-[\d.]+/i,
            /Nokia\s+SR\s+OS/i,
            /Alcatel-Lucent\s+SR/i,
        ],
    },
    {
        id: 'fortios',
        name: 'FortiOS',
        icon: 'fa-shield-alt',
        color: '#dc2626',
        description: 'Fortinet FortiOS / FortiGate',
        patterns: [
            /Welcome to FortiGate/i,
            /FortiOS\s+v[\d.]+/i,
        ],
    },
    {
        id: 'panos',
        name: 'PAN-OS',
        icon: 'fa-shield-alt',
        color: '#ea580c',
        description: 'Palo Alto Networks PAN-OS',
        patterns: [
            /PAN-OS\s+/i,
            /Welcome to.*Palo Alto Networks/i,
        ],
    },
    {
        id: 'mikrotik',
        name: 'MikroTik RouterOS',
        icon: 'fa-network-wired',
        color: '#8b5cf6',
        description: 'MikroTik RouterOS',
        patterns: [
            /MikroTik\s+RouterOS/i,
            /\[admin@MikroTik\]/,
        ],
    },
    {
        id: 'macos',
        name: 'macOS',
        icon: 'fa-apple',
        color: '#a3a3a3',
        description: 'macOS / Darwin',
        patterns: [
            /Darwin\s+Kernel\s+Version/i,
            /Last login:.+ttys\d+/i,    // Darwin pty signature
        ],
    },
    {
        id: 'freebsd',
        name: 'FreeBSD',
        icon: 'fa-server',
        color: '#dc2626',
        description: 'FreeBSD',
        patterns: [
            /FreeBSD\s+[\d.]+(-[A-Z]+)?/i,
            /Welcome to FreeBSD!/i,
        ],
    },
    {
        id: 'openbsd',
        name: 'OpenBSD',
        icon: 'fa-server',
        color: '#fbbf24',
        description: 'OpenBSD',
        patterns: [
            /OpenBSD\s+[\d.]+/i,
        ],
    },
    {
        id: 'linux',
        name: 'Linux',
        icon: 'fa-linux',
        color: '#f97316',
        description: 'Generic Linux distribution',
        patterns: [
            /Welcome to Ubuntu/i,
            /CentOS\s+Linux/i,
            /Red Hat Enterprise Linux/i,
            /Debian GNU\/Linux/i,
            /Alpine Linux/i,
            /Amazon Linux/i,
            /\b[Ll]inux\s+\S+\s+\d+\.\d+/,  // generic kernel string
        ],
    },
]

@Injectable({ providedIn: 'root' })
export class NetworkPlatformService {
    /** Per-session detected platform. Keyed by session id provided by
     *  the caller (sshSession instance is fine — used by reference). */
    private detected = new Map<string, NetworkPlatform>()
    /** Buffered detection-time output per session — bounded so a long
     *  session that never matches doesn't grow forever. */
    private buffers = new Map<string, string>()
    private readonly DETECTION_BUFFER_LIMIT = 8 * 1024  // 8KB
    private readonly DETECTION_TIMEOUT_MS = 30_000

    /**
     * BehaviorSubject so late subscribers (e.g., a tab opened
     * after the session detected its platform) get the current value
     * immediately. Emits null when no detection / cleared.
     */
    private detectedSubject = new Subject<{ sessionId: string; platform: NetworkPlatform }>()
    get detected$ (): Observable<{ sessionId: string; platform: NetworkPlatform }> {
        return this.detectedSubject
    }

    /**
     * Feed a chunk of session output for detection. Stops feeding
     * automatically once a platform is detected or after the
     * buffer-limit / timeout is exceeded.
     */
    feedOutput (sessionId: string, chunk: string): void {
        if (this.detected.has(sessionId)) {
            return
        }

        const stripped = stripAnsi(chunk)
        if (!stripped) {
            return
        }

        const buffered = (this.buffers.get(sessionId) ?? '') + stripped
        if (buffered.length > this.DETECTION_BUFFER_LIMIT) {
            // Stop accumulating; we'll never decide more from longer
            // text than this. Unknown is unknown.
            this.buffers.delete(sessionId)
            return
        }
        this.buffers.set(sessionId, buffered)

        const match = this.detectFromText(buffered)
        if (match) {
            this.detected.set(sessionId, match)
            this.buffers.delete(sessionId)
            this.detectedSubject.next({ sessionId, platform: match })
        }
    }

    /**
     * Stand-alone detector — useful for testing and for any caller
     * that wants to detect from a known string without going through
     * the streaming feedOutput path.
     */
    detectFromText (text: string): NetworkPlatform | null {
        for (const platform of NETWORK_PLATFORMS) {
            for (const pattern of platform.patterns) {
                if (pattern.test(text)) {
                    return platform
                }
            }
        }
        return null
    }

    getPlatform (sessionId: string): NetworkPlatform | null {
        return this.detected.get(sessionId) ?? null
    }

    /**
     * Allow the user to manually override the detected platform —
     * useful when auto-detect missed (some custom MOTDs don't include
     * the vendor name) or got it wrong.
     */
    setManualPlatform (sessionId: string, platformId: string): NetworkPlatform | null {
        const platform = NETWORK_PLATFORMS.find(p => p.id === platformId) ?? null
        if (platform) {
            this.detected.set(sessionId, platform)
            this.detectedSubject.next({ sessionId, platform })
        } else {
            this.detected.delete(sessionId)
        }
        return platform
    }

    /** Forget any platform association for a session. Called when
     *  the SSH session is destroyed. */
    forget (sessionId: string): void {
        this.detected.delete(sessionId)
        this.buffers.delete(sessionId)
    }

    /**
     * Convenience: subscribe to a session's output$ and run detection
     * automatically. Returns a teardown function.
     */
    attach (sessionId: string, output$: Observable<string>): () => void {
        const startedAt = Date.now()
        const sub = output$.subscribe(chunk => {
            // Bail after timeout — long-running sessions that never
            // match shouldn't keep scanning forever.
            if (Date.now() - startedAt > this.DETECTION_TIMEOUT_MS) {
                sub.unsubscribe()
                this.buffers.delete(sessionId)
                return
            }
            this.feedOutput(sessionId, chunk)
            // If we matched, unsubscribe — no need to keep watching.
            if (this.detected.has(sessionId)) {
                sub.unsubscribe()
            }
        })
        return () => sub.unsubscribe()
    }
}
