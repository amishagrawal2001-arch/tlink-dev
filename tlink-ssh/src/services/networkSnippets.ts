/**
 * Curated command-snippet packs per network platform.
 *
 * Snippets are intentionally short, vendor-idiomatic commands that an
 * operator types ten times a day on that gear. They're meant to be
 * starting points — most assume the user will add specifics (an
 * interface name, a route prefix, a peer IP) before sending.
 *
 * The `template` may include `{placeholder}` markers; the picker
 * substitutes them at insert-time so the user gets the cursor placed
 * where edits are needed.
 *
 * Sources:
 *   - JUNOS: company internal cheat sheet + Juniper TechLibrary
 *   - Cisco IOS / IOS-XE / NX-OS: Cisco DevNet command references
 *   - Arista EOS: Arista CLI guide
 *   - Linux: common diagnostics
 */

export interface NetworkSnippet {
    /** Display label in the picker. */
    label: string
    /** The command/template to send. May contain `{placeholders}`. */
    template: string
    /** One-line explanation. Shown as a subtitle / tooltip. */
    description: string
    /** Tags for filtering (e.g., 'show', 'config', 'troubleshoot'). */
    tags?: string[]
}

export interface SnippetPack {
    platformId: string
    snippets: NetworkSnippet[]
}

/** JUNOS / EVO snippet pack — the device shown in the user's banner. */
const JUNOS_SNIPPETS: NetworkSnippet[] = [
    // Operational mode — at-a-glance health
    { label: 'Show interfaces (terse)', template: 'show interfaces terse', description: 'One-line summary of every interface state', tags: ['show', 'interface'] },
    { label: 'Show interfaces extensive', template: 'show interfaces {ifname} extensive', description: 'Full counters / errors for one interface', tags: ['show', 'interface'] },
    { label: 'Show route summary', template: 'show route summary', description: 'Active route count by protocol', tags: ['show', 'routing'] },
    { label: 'Show route protocol BGP', template: 'show route protocol bgp', description: 'BGP-learned routes only', tags: ['show', 'routing', 'bgp'] },
    { label: 'Show BGP summary', template: 'show bgp summary', description: 'Neighbor states + route counts per peer', tags: ['show', 'bgp'] },
    { label: 'Show BGP neighbor', template: 'show bgp neighbor {peer}', description: 'Detailed state for one BGP peer', tags: ['show', 'bgp'] },
    { label: 'Show OSPF neighbor', template: 'show ospf neighbor', description: 'OSPF adjacency states', tags: ['show', 'ospf'] },
    { label: 'Show ISIS adjacency', template: 'show isis adjacency', description: 'IS-IS neighbors + states', tags: ['show', 'isis'] },
    { label: 'Show MPLS LSP', template: 'show mpls lsp', description: 'Active LSPs', tags: ['show', 'mpls'] },
    { label: 'Show LDP session', template: 'show ldp session', description: 'LDP peers + states', tags: ['show', 'mpls', 'ldp'] },
    { label: 'Show chassis hardware', template: 'show chassis hardware', description: 'Inventory: FRUs, serials, parts', tags: ['show', 'hardware'] },
    { label: 'Show chassis alarms', template: 'show chassis alarms', description: 'Active hardware alarms', tags: ['show', 'hardware'] },
    { label: 'Show system processes extensive', template: 'show system processes extensive', description: 'Per-process CPU + memory', tags: ['show', 'troubleshoot'] },
    { label: 'Show system uptime', template: 'show system uptime', description: 'Uptime + last reboot reason', tags: ['show'] },
    { label: 'Show log messages', template: 'show log messages | last 50', description: 'Recent syslog entries', tags: ['show', 'logs'] },
    { label: 'Monitor traffic interface', template: 'monitor traffic interface {ifname} no-resolve', description: 'tcpdump-style live capture', tags: ['troubleshoot', 'capture'] },
    { label: 'Ping VRF', template: 'ping {target} routing-instance {vrf} count 5', description: 'Ping inside a routing-instance', tags: ['troubleshoot'] },
    { label: 'Traceroute', template: 'traceroute {target} no-resolve', description: 'Hop trace', tags: ['troubleshoot'] },

    // Configuration mode
    { label: 'Configure exclusive', template: 'configure exclusive', description: 'Lock the candidate config so others can\'t edit', tags: ['config'] },
    { label: 'Show | compare', template: 'show | compare', description: 'Diff: candidate vs running config', tags: ['config'] },
    { label: 'Commit confirmed 5', template: 'commit confirmed 5', description: 'Commit, auto-rollback in 5 min unless you commit again', tags: ['config', 'safety'] },
    { label: 'Commit comment', template: 'commit comment "{message}"', description: 'Commit with a changelog note', tags: ['config'] },
    { label: 'Rollback to last commit', template: 'rollback 1', description: 'Discard candidate, restore last committed state', tags: ['config', 'safety'] },
    { label: 'Set route-instance VRF', template: 'set routing-instances {vrf} instance-type vrf', description: 'Define a VRF', tags: ['config', 'vrf'] },
]

/** Cisco IOS / IOS-XE shared snippet pack. */
const CISCO_IOS_SNIPPETS: NetworkSnippet[] = [
    { label: 'Show running-config', template: 'show running-config', description: 'Active configuration', tags: ['show', 'config'] },
    { label: 'Show ip interface brief', template: 'show ip interface brief', description: 'IP + state per interface', tags: ['show', 'interface'] },
    { label: 'Show interfaces description', template: 'show interfaces description', description: 'Interface descriptions + state', tags: ['show', 'interface'] },
    { label: 'Show interface', template: 'show interface {ifname}', description: 'Detailed counters', tags: ['show', 'interface'] },
    { label: 'Show ip route', template: 'show ip route', description: 'IPv4 routing table', tags: ['show', 'routing'] },
    { label: 'Show ipv6 route', template: 'show ipv6 route', description: 'IPv6 routing table', tags: ['show', 'routing'] },
    { label: 'Show ip bgp summary', template: 'show ip bgp summary', description: 'BGP peer states', tags: ['show', 'bgp'] },
    { label: 'Show ip bgp neighbor', template: 'show ip bgp neighbors {peer}', description: 'Detailed BGP peer', tags: ['show', 'bgp'] },
    { label: 'Show ip ospf neighbor', template: 'show ip ospf neighbor', description: 'OSPF adjacencies', tags: ['show', 'ospf'] },
    { label: 'Show vlan brief', template: 'show vlan brief', description: 'VLAN list + member ports', tags: ['show', 'l2'] },
    { label: 'Show mac address-table', template: 'show mac address-table', description: 'L2 MAC table', tags: ['show', 'l2'] },
    { label: 'Show cdp neighbor detail', template: 'show cdp neighbor detail', description: 'Connected Cisco devices', tags: ['show', 'discovery'] },
    { label: 'Show lldp neighbor detail', template: 'show lldp neighbor detail', description: 'LLDP-discovered neighbors', tags: ['show', 'discovery'] },
    { label: 'Show version', template: 'show version', description: 'Software + hardware info', tags: ['show'] },
    { label: 'Show inventory', template: 'show inventory', description: 'Module / FRU inventory', tags: ['show', 'hardware'] },
    { label: 'Show logging | last 50', template: 'show logging | last 50', description: 'Recent log entries', tags: ['show', 'logs'] },
    { label: 'Configure terminal', template: 'configure terminal', description: 'Enter global config mode', tags: ['config'] },
    { label: 'Write memory', template: 'write memory', description: 'Save running-config to startup', tags: ['config'] },
    { label: 'Reload in 5 (safe)', template: 'reload in 5', description: 'Schedule reboot in 5 min — cancel with `reload cancel`', tags: ['config', 'safety'] },
    { label: 'Ping', template: 'ping {target}', description: 'Reachability test', tags: ['troubleshoot'] },
    { label: 'Traceroute', template: 'traceroute {target}', description: 'Hop trace', tags: ['troubleshoot'] },
]

/** Cisco NX-OS — overlaps a lot with IOS but a few distinct commands. */
const NXOS_SNIPPETS: NetworkSnippet[] = [
    { label: 'Show interface brief', template: 'show interface brief', description: 'NX-OS interface summary', tags: ['show', 'interface'] },
    { label: 'Show ip route vrf', template: 'show ip route vrf {vrf}', description: 'Routes inside a VRF', tags: ['show', 'routing', 'vrf'] },
    { label: 'Show vpc', template: 'show vpc', description: 'vPC peer + member-port state', tags: ['show', 'l2'] },
    { label: 'Show fex', template: 'show fex', description: 'Fabric-extender status (Nexus 5k/7k)', tags: ['show', 'fex'] },
    { label: 'Show feature', template: 'show feature', description: 'Enabled NX-OS features', tags: ['show'] },
    { label: 'Copy running startup', template: 'copy running-config startup-config', description: 'Save config', tags: ['config'] },
    ...CISCO_IOS_SNIPPETS,    // include the IOS basics
]

/** IOS-XR snippet pack. Different commit semantics from IOS. */
const IOSXR_SNIPPETS: NetworkSnippet[] = [
    { label: 'Show interfaces brief', template: 'show interfaces brief', description: 'Interface summary', tags: ['show', 'interface'] },
    { label: 'Show route summary', template: 'show route summary', description: 'Routes by protocol', tags: ['show', 'routing'] },
    { label: 'Show bgp summary', template: 'show bgp summary', description: 'BGP peer states', tags: ['show', 'bgp'] },
    { label: 'Show platform', template: 'show platform', description: 'Card states', tags: ['show', 'hardware'] },
    { label: 'Show version', template: 'show version', description: 'IOS-XR release info', tags: ['show'] },
    { label: 'Configure', template: 'configure', description: 'Enter config mode (XR-style)', tags: ['config'] },
    { label: 'Show configuration commit list', template: 'show configuration commit list', description: 'Commit history (XR has rollback by commit-id)', tags: ['config'] },
    { label: 'Commit confirmed', template: 'commit confirmed', description: 'Commit, auto-rollback unless re-committed', tags: ['config', 'safety'] },
    { label: 'Rollback last 1', template: 'rollback configuration last 1', description: 'Undo most recent commit', tags: ['config', 'safety'] },
]

/** Arista EOS — IOS-like but with bash escape and structured outputs. */
const EOS_SNIPPETS: NetworkSnippet[] = [
    { label: 'Show interfaces status', template: 'show interfaces status', description: 'Interface states', tags: ['show', 'interface'] },
    { label: 'Show ip route summary', template: 'show ip route summary', description: 'Route counts by protocol', tags: ['show', 'routing'] },
    { label: 'Show ip bgp summary', template: 'show ip bgp summary', description: 'BGP peers', tags: ['show', 'bgp'] },
    { label: 'Show vlan', template: 'show vlan', description: 'VLAN members', tags: ['show', 'l2'] },
    { label: 'Show version', template: 'show version', description: 'EOS release + hardware', tags: ['show'] },
    { label: 'Show platform', template: 'show platform', description: 'Hardware platform info', tags: ['show', 'hardware'] },
    { label: 'Show as JSON', template: '{cmd} | json', description: 'Wrap any show with `| json` for structured output', tags: ['show', 'json'] },
    { label: 'Bash escape', template: 'bash', description: 'Drop into bash on EOS', tags: ['troubleshoot'] },
    { label: 'Configure', template: 'configure', description: 'Enter config mode', tags: ['config'] },
    { label: 'Write memory', template: 'write memory', description: 'Save config', tags: ['config'] },
]

/** Linux generic snippet pack. Catches the long tail. */
const LINUX_SNIPPETS: NetworkSnippet[] = [
    { label: 'IP addresses', template: 'ip -br addr', description: 'Brief IP per interface', tags: ['show', 'network'] },
    { label: 'IP routes', template: 'ip -br route', description: 'Routing table', tags: ['show', 'network'] },
    { label: 'Listening sockets', template: 'ss -ltnp', description: 'Listening TCP + processes', tags: ['show', 'network'] },
    { label: 'Disk usage', template: 'df -h', description: 'Filesystem usage', tags: ['show', 'system'] },
    { label: 'Top processes by memory', template: 'ps aux --sort=-%mem | head -10', description: 'Top 10 memory consumers', tags: ['show', 'system'] },
    { label: 'Top processes by CPU', template: 'ps aux --sort=-%cpu | head -10', description: 'Top 10 CPU consumers', tags: ['show', 'system'] },
    { label: 'System log (journalctl)', template: 'journalctl -xe --no-pager | tail -50', description: 'Recent systemd journal', tags: ['show', 'logs'] },
    { label: 'Kernel ring buffer', template: 'dmesg --time-format=iso | tail -50', description: 'Recent kernel messages', tags: ['show', 'logs'] },
    { label: 'systemctl failed', template: 'systemctl --failed', description: 'Failed services', tags: ['show', 'system'] },
    { label: 'Tail a log', template: 'tail -f {path}', description: 'Follow a log file', tags: ['show', 'logs'] },
]

/** Generic / fallback pack — shown when no platform was detected. */
const GENERIC_SNIPPETS: NetworkSnippet[] = [
    { label: 'Hostname', template: 'hostname', description: 'Print the host name', tags: ['show'] },
    { label: 'Whoami', template: 'whoami', description: 'Print the current user', tags: ['show'] },
    { label: 'Date', template: 'date', description: 'System date + time', tags: ['show'] },
    { label: 'Uptime', template: 'uptime', description: 'Uptime + load average', tags: ['show'] },
]

/** Public registry — caller looks up by platformId. */
export const NETWORK_SNIPPET_PACKS: SnippetPack[] = [
    { platformId: 'junos',    snippets: JUNOS_SNIPPETS },
    { platformId: 'iosxr',    snippets: IOSXR_SNIPPETS },
    { platformId: 'iosxe',    snippets: CISCO_IOS_SNIPPETS },
    { platformId: 'ios',      snippets: CISCO_IOS_SNIPPETS },
    { platformId: 'nxos',     snippets: NXOS_SNIPPETS },
    { platformId: 'eos',      snippets: EOS_SNIPPETS },
    { platformId: 'linux',    snippets: LINUX_SNIPPETS },
    { platformId: 'macos',    snippets: LINUX_SNIPPETS },     // POSIX overlap
    { platformId: 'freebsd',  snippets: LINUX_SNIPPETS },
    { platformId: 'openbsd',  snippets: LINUX_SNIPPETS },
    { platformId: 'generic',  snippets: GENERIC_SNIPPETS },
]

export function getSnippetsForPlatform (platformId: string | null): NetworkSnippet[] {
    if (!platformId) {
        return NETWORK_SNIPPET_PACKS.find(p => p.platformId === 'generic')?.snippets ?? []
    }
    const pack = NETWORK_SNIPPET_PACKS.find(p => p.platformId === platformId)
    return pack?.snippets ?? GENERIC_SNIPPETS
}
