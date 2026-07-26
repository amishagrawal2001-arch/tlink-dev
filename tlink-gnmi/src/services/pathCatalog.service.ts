/* eslint-disable @typescript-eslint/no-use-before-define */
import { Injectable } from '@angular/core'

/**
 * Curated catalog of common OpenConfig / vendor-native gNMI sensor
 * paths, so users don't have to type them from memory.
 *
 * Scope kept intentionally small — covers the 80% of things a network
 * engineer wants to watch on a first-visit to a device (CPU, memory,
 * interface counters + state, system, BGP, LLDP). Not exhaustive;
 * vendors expose thousands of paths and the goal here is a good
 * starting point, not a full YANG-model browser.
 *
 * Paths use OpenConfig with `[name=*]` wildcards for list-keys so a
 * subscribe to e.g. /interfaces/interface[name=*]/state/counters
 * returns rows for every interface. When a vendor's native path
 * differs meaningfully from OpenConfig, we ship both under different
 * `vendor` tags — the picker groups them in the UI.
 *
 * The `label` is what the user sees in the picker; `path` is what
 * gets pasted into the subscribe input. Descriptions kept to one
 * line each so the picker stays scannable.
 */
@Injectable({ providedIn: 'root' })
export class GnmiPathCatalogService {
    /**
     * Return every entry. Consumers filter / group as needed;
     * kept as a single flat array so search-by-substring is a one-liner.
     */
    all (): GnmiCatalogEntry[] {
        return CATALOG
    }

    /**
     * Group entries by category, preserving the declaration order of
     * both categories and entries within each category. Used by the
     * accordion picker in the session tab.
     */
    byCategory (): GnmiCatalogGroup[] {
        const groups = new Map<string, GnmiCatalogEntry[]>()
        for (const entry of CATALOG) {
            const list = groups.get(entry.category) ?? []
            list.push(entry)
            groups.set(entry.category, list)
        }
        return [...groups.entries()].map(([category, entries]) => ({ category, entries }))
    }

    /**
     * Substring search across label / path / description — filtered
     * groups keep their category header even when partially matched,
     * so the user always sees where a result lives.
     */
    search (query: string): GnmiCatalogGroup[] {
        const q = query.trim().toLowerCase()
        if (!q) { return this.byCategory() }
        const out: GnmiCatalogGroup[] = []
        for (const g of this.byCategory()) {
            const entries = g.entries.filter(e =>
                e.label.toLowerCase().includes(q) ||
                e.path.toLowerCase().includes(q) ||
                e.description.toLowerCase().includes(q),
            )
            if (entries.length) { out.push({ category: g.category, entries }) }
        }
        return out
    }
}

/** One catalog entry — a labelled, described gNMI path. */
export interface GnmiCatalogEntry {
    /** Short human label shown in the picker. */
    label: string
    /** The path to paste into the subscribe input. */
    path: string
    /** One-line description shown under the label. */
    description: string
    /** Category grouping. Used only as a header string; not typed. */
    category: string
    /** Optional vendor tag when the path is vendor-native, not OpenConfig. */
    vendor?: 'arista' | 'cisco-iosxr' | 'juniper-junos' | 'nokia'
    /** Optional recommended mode (STREAM for changing values, ONCE for static state). */
    suggestedMode?: 'STREAM' | 'ONCE'
    /** Optional recommended stream sub-mode. Only applies when suggestedMode='STREAM'. */
    suggestedStreamMode?: 'SAMPLE' | 'ON_CHANGE' | 'TARGET_DEFINED'
    /** Optional recommended sample interval in seconds. Only applies when SAMPLE. */
    suggestedIntervalSec?: number
}

export interface GnmiCatalogGroup {
    category: string
    entries: GnmiCatalogEntry[]
}

/**
 * The catalog itself. Ordered by likely-first-use — CPU / memory /
 * interfaces up top because they're what most people watch first;
 * BGP / LLDP further down; vendor-native variants at the end.
 */
const CATALOG: GnmiCatalogEntry[] = [
    // ─── CPU ───
    {
        category: 'CPU',
        label: 'CPU utilization — all components',
        path: '/components/component/cpu/utilization/state',
        description: 'Instant / avg / min / max CPU % across every RE / linecard CPU.',
        suggestedMode: 'STREAM', suggestedStreamMode: 'SAMPLE', suggestedIntervalSec: 10,
    },
    {
        category: 'CPU',
        label: 'CPU instant',
        path: '/components/component/cpu/utilization/state/instant',
        description: 'Just the current-sample CPU % (cheapest single-leaf).',
        suggestedMode: 'STREAM', suggestedStreamMode: 'SAMPLE', suggestedIntervalSec: 5,
    },
    {
        category: 'CPU',
        label: 'CPU avg',
        path: '/components/component/cpu/utilization/state/avg',
        description: 'Averaged CPU % over the reporting window.',
        suggestedMode: 'STREAM', suggestedStreamMode: 'SAMPLE', suggestedIntervalSec: 30,
    },

    // ─── Memory ───
    {
        category: 'Memory',
        label: 'Memory usage summary',
        path: '/system/memory/state',
        description: 'Total physical / reserved / used / free — all leaves.',
        suggestedMode: 'STREAM', suggestedStreamMode: 'SAMPLE', suggestedIntervalSec: 30,
    },
    {
        category: 'Memory',
        label: 'Memory — used',
        path: '/system/memory/state/used',
        description: 'Bytes currently in use.',
        suggestedMode: 'STREAM', suggestedStreamMode: 'SAMPLE', suggestedIntervalSec: 30,
    },
    {
        category: 'Memory',
        label: 'Memory — free',
        path: '/system/memory/state/free',
        description: 'Bytes free.',
        suggestedMode: 'STREAM', suggestedStreamMode: 'SAMPLE', suggestedIntervalSec: 30,
    },

    // ─── Interfaces ───
    {
        category: 'Interfaces',
        label: 'Interface state (all)',
        path: '/interfaces/interface/state',
        description: 'Admin/oper status, description, MTU, type, last-change for every interface.',
        suggestedMode: 'STREAM', suggestedStreamMode: 'ON_CHANGE',
    },
    {
        category: 'Interfaces',
        label: 'Interface counters (all)',
        path: '/interfaces/interface/state/counters',
        description: 'in/out octets, packets, errors, discards across every interface.',
        suggestedMode: 'STREAM', suggestedStreamMode: 'SAMPLE', suggestedIntervalSec: 30,
    },
    {
        category: 'Interfaces',
        label: 'in-octets (all)',
        path: '/interfaces/interface/state/counters/in-octets',
        description: 'Ingress byte counter — the classic "bandwidth in" metric.',
        suggestedMode: 'STREAM', suggestedStreamMode: 'SAMPLE', suggestedIntervalSec: 10,
    },
    {
        category: 'Interfaces',
        label: 'out-octets (all)',
        path: '/interfaces/interface/state/counters/out-octets',
        description: 'Egress byte counter.',
        suggestedMode: 'STREAM', suggestedStreamMode: 'SAMPLE', suggestedIntervalSec: 10,
    },
    {
        category: 'Interfaces',
        label: 'in-errors / out-errors',
        path: '/interfaces/interface/state/counters/in-errors',
        description: 'Ingress errors — nonzero means something needs attention.',
        suggestedMode: 'STREAM', suggestedStreamMode: 'ON_CHANGE',
    },
    {
        category: 'Interfaces',
        label: 'oper-status (all)',
        path: '/interfaces/interface/state/oper-status',
        description: 'UP / DOWN / TESTING / DORMANT — link status only.',
        suggestedMode: 'STREAM', suggestedStreamMode: 'ON_CHANGE',
    },

    // ─── System ───
    {
        category: 'System',
        label: 'Hostname',
        path: '/system/state/hostname',
        description: 'Configured device hostname.',
        suggestedMode: 'ONCE',
    },
    {
        category: 'System',
        label: 'Current datetime',
        path: '/system/state/current-datetime',
        description: 'Device wall-clock time — sanity check for clock drift.',
        suggestedMode: 'STREAM', suggestedStreamMode: 'SAMPLE', suggestedIntervalSec: 5,
    },
    {
        category: 'System',
        label: 'Boot time',
        path: '/system/state/boot-time',
        description: 'When the device last booted.',
        suggestedMode: 'ONCE',
    },
    {
        category: 'System',
        label: 'Uptime',
        path: '/system/state/uptime',
        description: 'Time since last boot (may be vendor-augmented).',
        suggestedMode: 'STREAM', suggestedStreamMode: 'SAMPLE', suggestedIntervalSec: 60,
    },

    // ─── BGP ───
    {
        category: 'BGP',
        label: 'BGP neighbor session state',
        path: '/network-instances/network-instance/protocols/protocol/bgp/neighbors/neighbor/state/session-state',
        description: 'ESTABLISHED / IDLE / ACTIVE — one row per BGP peer.',
        suggestedMode: 'STREAM', suggestedStreamMode: 'ON_CHANGE',
    },
    {
        category: 'BGP',
        label: 'BGP neighbor counters',
        path: '/network-instances/network-instance/protocols/protocol/bgp/neighbors/neighbor/state/messages',
        description: 'Sent / received message counters per peer.',
        suggestedMode: 'STREAM', suggestedStreamMode: 'SAMPLE', suggestedIntervalSec: 30,
    },

    // ─── LLDP ───
    {
        category: 'LLDP',
        label: 'LLDP neighbors',
        path: '/lldp/interfaces/interface/neighbors/neighbor/state',
        description: 'Everything LLDP learned about the far-side of each link.',
        suggestedMode: 'STREAM', suggestedStreamMode: 'ON_CHANGE',
    },
    {
        category: 'LLDP',
        label: 'LLDP neighbor system-name',
        path: '/lldp/interfaces/interface/neighbors/neighbor/state/system-name',
        description: 'Just the neighbor hostname — good for a quick topology map.',
        suggestedMode: 'STREAM', suggestedStreamMode: 'ON_CHANGE',
    },

    // ─── Routing ───
    {
        category: 'Routing',
        label: 'Route count per network instance',
        path: '/network-instances/network-instance/afts/ipv4-unicast/ipv4-entry',
        description: 'IPv4 unicast RIB entries — count for capacity monitoring.',
        suggestedMode: 'STREAM', suggestedStreamMode: 'SAMPLE', suggestedIntervalSec: 60,
    },

    // ─── Vendor-native (Junos) ───
    {
        category: 'Junos native',
        vendor: 'juniper-junos',
        label: 'Junos linecard CPU',
        path: '/junos/system/linecard/cpu/memory/utilization',
        description: 'Junos-specific linecard CPU + memory rollup (finer detail than OpenConfig).',
        suggestedMode: 'STREAM', suggestedStreamMode: 'SAMPLE', suggestedIntervalSec: 30,
    },
    {
        category: 'Junos native',
        vendor: 'juniper-junos',
        label: 'Junos interface counters (native)',
        path: '/junos/system/linecard/interface',
        description: 'Junos-native per-interface counters (higher-resolution than OC on some builds).',
        suggestedMode: 'STREAM', suggestedStreamMode: 'SAMPLE', suggestedIntervalSec: 10,
    },
]
