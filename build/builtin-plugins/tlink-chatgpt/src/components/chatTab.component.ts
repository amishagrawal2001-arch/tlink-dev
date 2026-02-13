/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Component, ElementRef, HostBinding, HostListener, Injector, ViewChild } from '@angular/core'
import { promises as fs } from 'fs'
import * as path from 'path'
import { AppService, BaseTabComponent, NotificationsService, PartialProfile, PlatformService, Profile, ProfilesService, SplitTabComponent } from 'tlink-core'
import { PasswordStorageService, SSHProfile } from 'tlink-ssh'
import { BaseTerminalTabComponent } from 'tlink-terminal'
import { Subscription } from 'rxjs'

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'
const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant'
const DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-sonnet-20240620'
const DEFAULT_GEMINI_MODEL = 'gemini-1.5-pro'
const DEFAULT_OLLAMA_MODEL = 'llama3.1:8b'
const LEGACY_OLLAMA_MODEL = 'llama3.1:8b-instruct'
const DEFAULT_MAX_TOKENS = 512
const DEFAULT_TEMPERATURE = 0.2

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1'
const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1'
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1'

type ChatProvider = 'openai' | 'openai-compatible' | 'groq' | 'anthropic' | 'gemini' | 'ollama'

interface ChatMessage {
    role: 'user' | 'assistant' | 'error'
    label: string
    content: string
}

interface ChatProfile {
    id: string
    name: string
    provider: ChatProvider
    apiKey: string
    model: string
    baseUrl: string
    systemPrompt: string
    temperature: number
    maxTokens: number
}

interface EffectiveChatSettings {
    provider: ChatProvider
    providerLabel: string
    profileName: string
    apiKey: string
    model: string
    baseUrl: string
    systemPrompt: string
    temperature: number
    maxTokens: number
    apiKeyRequired: boolean
}

interface FetchContext {
    provider: ChatProvider
    model: string
    baseUrl: string
    retry?: boolean
}

type OllamaPullState = 'started' | 'in-progress' | 'failed'

interface ProviderDefinition {
    id: ChatProvider
    label: string
    defaultModel: string
    defaultBaseUrl: string
    requiresApiKey: boolean
    envPrefix: string
}

interface EnvOverrides {
    apiKey?: string
    model?: string
    baseUrl?: string
    systemPrompt?: string
    temperature?: number
    maxTokens?: number
}

type DeviceVendor = 'juniper' | 'cisco' | 'arista'
type DeviceVariant = 'junos' | 'evo' | 'onie' | 'ios' | 'ios-xe' | 'ios-xr' | 'nx-os' | 'eos'

interface NetworkAssistantSettings {
    enabled: boolean
    vendor: DeviceVendor
    variant: DeviceVariant
    deviceLabel: string
    osVersion: string
    site: string
    role: string
    includeLastOutput: boolean
    allowCommandRun: boolean
    autoTroubleshootAfterCommand: boolean
    allowlistByVariant: CommandAllowlist
    redactSensitiveData: boolean
    autoAppendRunbookOutput: boolean
    favoriteQuickActionsByVariant: Partial<Record<DeviceVariant, string[]>>
}

interface NetworkOption {
    id: string
    label: string
}

interface TerminalTarget {
    id: string
    title: string
    tab: BaseTerminalTabComponent<any>
}

interface SuggestedCommand {
    id: string
    command: string
    safe: boolean
    reason?: string
}

type CommandAllowlist = Partial<Record<DeviceVariant, string[]>>

type ConnectionProtocol = 'ssh' | 'telnet'

interface ParsedSshCredentials {
    user?: string
    password?: string
    port?: number
}

interface ParsedSshHost {
    host: string
    user?: string
    port?: number
}

interface PendingCommandAnalysis {
    command: string
    startLineCount: number
    startedAt: number
}

interface QuickAction {
    id: string
    label: string
    command: string
    description?: string
}

interface QuickQuestion {
    id: string
    label: string
    prompt: string
}

interface ActivityEntry {
    id: string
    time: string
    timestamp?: number
    type: 'command' | 'runbook' | 'summary' | 'info'
    title: string
    detail?: string
    tags?: string
}

interface ActivityFilters {
    query: string
    type: ActivityEntry['type'] | 'all'
    tag: string
    timeWindowMinutes?: number | null
}

interface RunbookPack {
    id: string
    label: string
    description: string
    commands: string[]
    notes?: string
}

const NETWORK_ASSISTANT_DEFAULTS: NetworkAssistantSettings = {
    enabled: true,
    vendor: 'juniper',
    variant: 'junos',
    deviceLabel: '',
    osVersion: '',
    site: '',
    role: '',
    includeLastOutput: true,
    allowCommandRun: true,
    autoTroubleshootAfterCommand: true,
    allowlistByVariant: {},
    redactSensitiveData: false,
    autoAppendRunbookOutput: false,
    favoriteQuickActionsByVariant: {},
}

const NETWORK_OUTPUT_MAX_CHARS = 6000
const COMMAND_OUTPUT_MAX_CHARS = 3000
const RUNBOOK_OUTPUT_MAX_CHARS = 4000
const COMMAND_ANALYSIS_DEBOUNCE_MS = 800
const COMMAND_ANALYSIS_MAX_WAIT_MS = 8000
const SESSION_LOG_SUMMARY_MAX_BYTES = 120_000

const DEVICE_VENDORS: NetworkOption[] = [
    { id: 'juniper', label: 'Juniper' },
    { id: 'cisco', label: 'Cisco' },
    { id: 'arista', label: 'Arista' },
]

const DEVICE_VARIANTS: Record<DeviceVendor, NetworkOption[]> = {
    juniper: [
        { id: 'junos', label: 'Junos' },
        { id: 'evo', label: 'EVO' },
        { id: 'onie', label: 'ONIE' },
    ],
    cisco: [
        { id: 'ios', label: 'IOS' },
        { id: 'ios-xe', label: 'IOS XE' },
        { id: 'ios-xr', label: 'IOS XR' },
        { id: 'nx-os', label: 'NX-OS' },
    ],
    arista: [
        { id: 'eos', label: 'EOS' },
    ],
}

const SAFE_COMMAND_PREFIXES: Record<DeviceVariant, string[]> = {
    junos: ['show', 'monitor', 'request', 'ping', 'traceroute'],
    evo: ['show', 'monitor', 'request', 'ping', 'traceroute', 'ip', 'ifconfig', 'ethtool', 'uname', 'uptime', 'dmesg'],
    onie: ['onie-show', 'ip', 'ifconfig', 'ethtool', 'uname', 'uptime', 'dmesg', 'ls', 'cat'],
    ios: ['show', 'ping', 'traceroute'],
    'ios-xe': ['show', 'ping', 'traceroute'],
    'ios-xr': ['show', 'admin show', 'ping', 'traceroute'],
    'nx-os': ['show', 'ping', 'traceroute'],
    eos: ['show', 'ping', 'traceroute'],
}

const UNSAFE_COMMAND_START_PATTERNS = [
    /^\s*configure\b/i,
    /^\s*conf\b/i,
    /^\s*edit\b/i,
    /^\s*set\b/i,
    /^\s*delete\b/i,
    /^\s*commit\b/i,
    /^\s*rollback\b/i,
    /^\s*save\b/i,
    /^\s*load\b/i,
    /^\s*clear\b/i,
    /^\s*write\b/i,
]

const UNSAFE_COMMAND_ANYWHERE_PATTERNS = [
    /\breboot\b/i,
    /\breload\b/i,
    /\bshutdown\b/i,
    /\bpoweroff\b/i,
    /\bupgrade\b/i,
]

const QUICK_ACTIONS_BY_VARIANT: Record<DeviceVariant, QuickAction[]> = {
    junos: [
        { id: 'junos-interfaces-terse', label: 'Interfaces terse', command: 'show interfaces terse' },
        { id: 'junos-bgp-summary', label: 'BGP summary', command: 'show bgp summary' },
        { id: 'junos-chassis-alarms', label: 'Chassis alarms', command: 'show chassis alarms' },
        { id: 'junos-lldp', label: 'LLDP neighbors', command: 'show lldp neighbors' },
    ],
    evo: [
        { id: 'evo-ip-link', label: 'IP link', command: 'ip link show' },
        { id: 'evo-ip-route', label: 'IP route', command: 'ip route show' },
        { id: 'evo-dmesg', label: 'Kernel logs', command: 'dmesg | tail -n 50' },
    ],
    onie: [
        { id: 'onie-show', label: 'ONIE show', command: 'onie-show' },
        { id: 'onie-ip-addr', label: 'IP addr', command: 'ip addr show' },
        { id: 'onie-dmesg', label: 'Kernel logs', command: 'dmesg | tail -n 50' },
    ],
    ios: [
        { id: 'ios-int-status', label: 'Interface status', command: 'show interfaces status' },
        { id: 'ios-bgp', label: 'BGP summary', command: 'show ip bgp summary' },
        { id: 'ios-cdp', label: 'CDP neighbors', command: 'show cdp neighbors' },
        { id: 'ios-version', label: 'Version', command: 'show version' },
    ],
    'ios-xe': [
        { id: 'iosxe-int-status', label: 'Interface status', command: 'show interfaces status' },
        { id: 'iosxe-bgp', label: 'BGP summary', command: 'show ip bgp summary' },
        { id: 'iosxe-lldp', label: 'LLDP neighbors', command: 'show lldp neighbors' },
        { id: 'iosxe-version', label: 'Version', command: 'show version' },
    ],
    'ios-xr': [
        { id: 'iosxr-int-brief', label: 'Interfaces brief', command: 'show interfaces brief' },
        { id: 'iosxr-bgp', label: 'BGP summary', command: 'show bgp summary' },
        { id: 'iosxr-lldp', label: 'LLDP neighbors', command: 'show lldp neighbors' },
        { id: 'iosxr-platform', label: 'Platform', command: 'show platform' },
    ],
    'nx-os': [
        { id: 'nxos-int-status', label: 'Interface status', command: 'show interface status' },
        { id: 'nxos-bgp', label: 'BGP summary', command: 'show bgp summary' },
        { id: 'nxos-cdp', label: 'CDP neighbors', command: 'show cdp neighbors' },
        { id: 'nxos-system', label: 'System resources', command: 'show system resources' },
    ],
    eos: [
        { id: 'eos-int-status', label: 'Interface status', command: 'show interfaces status' },
        { id: 'eos-bgp', label: 'BGP summary', command: 'show ip bgp summary' },
        { id: 'eos-lldp', label: 'LLDP neighbors', command: 'show lldp neighbors' },
        { id: 'eos-version', label: 'Version', command: 'show version' },
    ],
}

const QUICK_QUESTIONS: QuickQuestion[] = [
    { id: 'qq-open-ssh', label: 'Open SSH', prompt: 'open ssh connection' },
    { id: 'qq-open-telnet', label: 'Open Telnet', prompt: 'open telnet connection' },
    { id: 'qq-summary', label: 'Summarize output', prompt: 'Summarize the latest terminal output.' },
    { id: 'qq-interface-status', label: 'Interface status', prompt: 'Check interface status and highlight any down links.' },
    { id: 'qq-bgp-check', label: 'BGP check', prompt: 'Check BGP summary and highlight any issues.' },
]

const RUNBOOKS_BY_VARIANT: Record<DeviceVariant, RunbookPack[]> = {
    junos: [
        {
            id: 'junos-interface',
            label: 'Interface health',
            description: 'Status, optics, and error counters.',
            commands: [
                'show interfaces terse',
                'show interfaces diagnostics optics',
                'show interfaces extensive | match "Physical|Input errors|Output errors|CRC"',
            ],
            notes: [
                'Objective: Monitor the health of network interfaces on a device.',
                '',
                'Commands:',
                '1) show interfaces terse',
                '   Purpose: Display a concise view of all interfaces, including their status and IP addresses.',
                '   Output: Interface status (up/down), IP address (if configured), Protocol (if configured).',
                '   Example:',
                '     Interface            IP Address      Status      Protocol',
                '     Gi0/0                10.1.1.1       up          up',
                '     Gi0/1                unassigned     down        down',
                '',
                '2) show interfaces diagnostics optics',
                '   Purpose: Display detailed information about the interface optics including temperature, voltage, and signal levels.',
                '   Output: Interface name, optical signal levels (Rx/Tx), temperature, voltage.',
                '   Example:',
                '     Interface: Gi0/0',
                '     Optical Signal Levels:',
                '       Rx: -3.5 dBm',
                '       Tx: -3.5 dBm',
                '     Temperature: 25.0 C',
                '     Voltage: 3.3V',
                '',
                '3) show interfaces extensive | match "Physical|Input errors|Output errors|CRC"',
                '   Purpose: Display interface statistics including physical, input, output, and CRC errors.',
                '   Output: Interface name, physical errors, input errors, output errors, CRC errors.',
                '   Example:',
                '     Interface: Gi0/0',
                '     Physical errors: 0',
                '     Input errors: 0',
                '     Output errors: 0',
                '     CRC errors: 0',
                '',
                'Troubleshooting steps:',
                '1) Check status using show interfaces terse. If an interface is down, investigate the reason.',
                '2) Use diagnostics optics to check signal levels and temperature. If signal levels are low or temperature is high, suspect hardware.',
                '3) Use the extensive match to check errors. If errors exist, investigate the cause and take corrective action.',
            ].join('\n'),
        },
        {
            id: 'junos-bgp',
            label: 'BGP summary',
            description: 'Peer state and route counts.',
            commands: [
                'show bgp summary',
                'show route summary',
            ],
        },
        {
            id: 'junos-lldp',
            label: 'LLDP neighbors',
            description: 'Neighbor discovery.',
            commands: [
                'show lldp neighbors',
                'show lldp neighbors detail',
            ],
        },
        {
            id: 'junos-system',
            label: 'System health',
            description: 'Alarms, environment, uptime.',
            commands: [
                'show chassis alarms',
                'show chassis environment',
                'show system uptime',
            ],
        },
    ],
    evo: [
        {
            id: 'evo-interface',
            label: 'Interface health',
            description: 'Link state and counters.',
            commands: [
                'ip link show',
                'ip -s link',
                'ethtool -S <interface>',
            ],
        },
        {
            id: 'evo-routing',
            label: 'Routing summary',
            description: 'Routes and neighbors.',
            commands: [
                'ip route show',
                'ip -6 route show',
            ],
        },
        {
            id: 'evo-system',
            label: 'System health',
            description: 'Kernel messages and load.',
            commands: [
                'uptime',
                'dmesg | tail -n 50',
            ],
        },
    ],
    onie: [
        {
            id: 'onie-system',
            label: 'System health',
            description: 'Basic OS info and logs.',
            commands: [
                'onie-show',
                'uname -a',
                'dmesg | tail -n 50',
            ],
        },
        {
            id: 'onie-interface',
            label: 'Interface health',
            description: 'Link state and addressing.',
            commands: [
                'ip link show',
                'ip addr show',
            ],
        },
    ],
    ios: [
        {
            id: 'ios-interface',
            label: 'Interface health',
            description: 'Status and errors.',
            commands: [
                'show interfaces status',
                'show interfaces counters errors',
            ],
        },
        {
            id: 'ios-bgp',
            label: 'BGP summary',
            description: 'IPv4/IPv6 peers.',
            commands: [
                'show ip bgp summary',
                'show bgp ipv6 unicast summary',
            ],
        },
        {
            id: 'ios-lldp',
            label: 'LLDP/CDP neighbors',
            description: 'Neighbor discovery.',
            commands: [
                'show lldp neighbors',
                'show cdp neighbors',
            ],
        },
        {
            id: 'ios-system',
            label: 'System health',
            description: 'Version, CPU, memory.',
            commands: [
                'show version',
                'show processes cpu sorted',
                'show processes memory summary',
            ],
        },
    ],
    'ios-xe': [
        {
            id: 'iosxe-interface',
            label: 'Interface health',
            description: 'Status and errors.',
            commands: [
                'show interfaces status',
                'show interfaces counters errors',
            ],
        },
        {
            id: 'iosxe-bgp',
            label: 'BGP summary',
            description: 'IPv4/IPv6 peers.',
            commands: [
                'show ip bgp summary',
                'show bgp ipv6 unicast summary',
            ],
        },
        {
            id: 'iosxe-lldp',
            label: 'LLDP/CDP neighbors',
            description: 'Neighbor discovery.',
            commands: [
                'show lldp neighbors',
                'show cdp neighbors',
            ],
        },
        {
            id: 'iosxe-system',
            label: 'System health',
            description: 'Version, CPU, memory.',
            commands: [
                'show version',
                'show processes cpu sorted',
                'show processes memory summary',
            ],
        },
    ],
    'ios-xr': [
        {
            id: 'iosxr-interface',
            label: 'Interface health',
            description: 'Status and counters.',
            commands: [
                'show interfaces brief',
                'show interfaces counters',
            ],
        },
        {
            id: 'iosxr-bgp',
            label: 'BGP summary',
            description: 'IPv4/IPv6 peers.',
            commands: [
                'show bgp summary',
                'show bgp ipv6 unicast summary',
            ],
        },
        {
            id: 'iosxr-lldp',
            label: 'LLDP neighbors',
            description: 'Neighbor discovery.',
            commands: [
                'show lldp neighbors',
                'show lldp neighbors detail',
            ],
        },
        {
            id: 'iosxr-system',
            label: 'System health',
            description: 'Platform and resources.',
            commands: [
                'show platform',
                'show processes cpu',
                'show processes memory',
            ],
        },
    ],
    'nx-os': [
        {
            id: 'nxos-interface',
            label: 'Interface health',
            description: 'Status and errors.',
            commands: [
                'show interface status',
                'show interface counters errors',
            ],
        },
        {
            id: 'nxos-bgp',
            label: 'BGP summary',
            description: 'IPv4/IPv6 peers.',
            commands: [
                'show bgp summary',
                'show bgp ipv6 unicast summary',
            ],
        },
        {
            id: 'nxos-lldp',
            label: 'LLDP/CDP neighbors',
            description: 'Neighbor discovery.',
            commands: [
                'show lldp neighbors',
                'show cdp neighbors',
            ],
        },
        {
            id: 'nxos-system',
            label: 'System health',
            description: 'Version and resources.',
            commands: [
                'show version',
                'show system resources',
            ],
        },
    ],
    eos: [
        {
            id: 'eos-interface',
            label: 'Interface health',
            description: 'Status and errors.',
            commands: [
                'show interfaces status',
                'show interfaces counters errors',
            ],
        },
        {
            id: 'eos-bgp',
            label: 'BGP summary',
            description: 'IPv4/IPv6 peers.',
            commands: [
                'show ip bgp summary',
                'show ipv6 bgp summary',
            ],
        },
        {
            id: 'eos-lldp',
            label: 'LLDP neighbors',
            description: 'Neighbor discovery.',
            commands: [
                'show lldp neighbors',
                'show lldp neighbors detail',
            ],
        },
        {
            id: 'eos-system',
            label: 'System health',
            description: 'Version and environment.',
            commands: [
                'show version',
                'show processes top once',
                'show environment all',
            ],
        },
    ],
}

const PROVIDER_BY_ID: Record<ChatProvider, ProviderDefinition> = {
    openai: {
        id: 'openai',
        label: 'OpenAI',
        defaultModel: DEFAULT_OPENAI_MODEL,
        defaultBaseUrl: DEFAULT_OPENAI_BASE_URL,
        requiresApiKey: true,
        envPrefix: 'OPENAI',
    },
    'openai-compatible': {
        id: 'openai-compatible',
        label: 'OpenAI-compatible',
        defaultModel: DEFAULT_OPENAI_MODEL,
        defaultBaseUrl: DEFAULT_OPENAI_BASE_URL,
        requiresApiKey: false,
        envPrefix: 'OPENAI_COMPAT',
    },
    groq: {
        id: 'groq',
        label: 'Groq',
        defaultModel: DEFAULT_GROQ_MODEL,
        defaultBaseUrl: DEFAULT_GROQ_BASE_URL,
        requiresApiKey: true,
        envPrefix: 'GROQ',
    },
    anthropic: {
        id: 'anthropic',
        label: 'Anthropic',
        defaultModel: DEFAULT_ANTHROPIC_MODEL,
        defaultBaseUrl: DEFAULT_ANTHROPIC_BASE_URL,
        requiresApiKey: true,
        envPrefix: 'ANTHROPIC',
    },
    gemini: {
        id: 'gemini',
        label: 'Google Gemini',
        defaultModel: DEFAULT_GEMINI_MODEL,
        defaultBaseUrl: DEFAULT_GEMINI_BASE_URL,
        requiresApiKey: true,
        envPrefix: 'GEMINI',
    },
    ollama: {
        id: 'ollama',
        label: 'Ollama (Local)',
        defaultModel: DEFAULT_OLLAMA_MODEL,
        defaultBaseUrl: DEFAULT_OLLAMA_BASE_URL,
        requiresApiKey: false,
        envPrefix: 'OLLAMA',
    },
}

const PROVIDER_ORDER: ChatProvider[] = ['ollama', 'openai', 'openai-compatible', 'groq', 'anthropic', 'gemini']

function getProviderDefinition (provider: ChatProvider | string): ProviderDefinition {
    return PROVIDER_BY_ID[provider as ChatProvider] ?? PROVIDER_BY_ID.openai
}

function normalizeProvider (provider: ChatProvider | string | undefined | null): ChatProvider {
    if (!provider) {
        return 'openai'
    }
    return provider in PROVIDER_BY_ID ? (provider as ChatProvider) : 'openai'
}

function generateId (): string {
    return Math.random().toString(36).slice(2, 10)
}

function getEnvValue (name: string): string | null {
    const value = process.env[name]
    if (!value) {
        return null
    }
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

function getEnvNumberMaybe (name: string): number | null {
    const value = getEnvValue(name)
    if (!value) {
        return null
    }
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function normalizeBaseUrl (value: string, fallback: string): string {
    const trimmed = value.trim()
    const base = trimmed || fallback
    return base.replace(/\/$/, '')
}

/** @hidden */
@Component({
    selector: 'chat-tab',
    templateUrl: './chatTab.component.pug',
    styleUrls: ['./chatTab.component.scss'],
})
export class ChatTabComponent extends BaseTabComponent {
    @HostBinding('class.chat-tab-host') hostClass = true
    @HostBinding('style.--chat-bg') chatBg = 'var(--body-bg)'
    @HostBinding('style.--chat-fg') chatFg = 'var(--theme-fg)'
    @HostBinding('style.--chat-muted') chatMuted = 'var(--theme-fg-more)'
    @HostBinding('style.--chat-border') chatBorder = 'var(--theme-bg-more-2)'
    @HostBinding('style.--chat-header-bg') chatHeaderBg = 'var(--theme-bg-more)'
    @HostBinding('style.--chat-header-fg') chatHeaderFg = 'var(--chat-fg)'
    @HostBinding('style.--chat-panel-bg') chatPanelBg = 'var(--theme-bg-more-2)'
    @HostBinding('style.--chat-input-bg') chatInputBg = 'var(--theme-bg)'
    @HostBinding('style.--chat-input-fg') chatInputFg = 'var(--chat-fg)'
    @HostBinding('style.--chat-user-bg') chatUserBg = 'var(--theme-primary)'
    @HostBinding('style.--chat-user-fg') chatUserFg = 'var(--theme-primary-fg)'
    @HostBinding('style.--chat-assistant-bg') chatAssistantBg = 'var(--theme-bg-more)'
    @HostBinding('style.--chat-assistant-fg') chatAssistantFg = 'var(--chat-fg)'
    @HostBinding('style.--chat-error-bg') chatErrorBg = 'rgba(255, 0, 0, 0.08)'
    @HostBinding('style.--chat-error-fg') chatErrorFg = 'var(--theme-danger)'

    @ViewChild('messagesContainer') messagesRef?: ElementRef<HTMLElement>
    @ViewChild('draftInput') draftInputRef?: ElementRef<HTMLTextAreaElement>
    @ViewChild('activitySearch') activitySearchRef?: ElementRef<HTMLInputElement>
    @ViewChild('terminalSelect') terminalSelectRef?: ElementRef<HTMLSelectElement>

    messages: ChatMessage[] = []
    draft = ''
    sending = false
    showSettings = false

    profiles: ChatProfile[] = []
    activeProfileId = ''
    profileForm: ChatProfile = this.createProfile('ollama')
    providers = PROVIDER_ORDER.map(provider => getProviderDefinition(provider))

    envPrefix = ''
    envHasApiKey = false
    envModel = ''
    envBaseUrl = ''
    envSystemPromptSet = false
    envApiKeyPlaceholder = ''
    envSystemPromptPlaceholder = 'Optional system prompt'
    apiKeyHint = 'API key is stored per profile.'

    activeProfileName = ''
    activeProviderLabel = ''
    providerDefaultsModel = DEFAULT_OLLAMA_MODEL
    providerDefaultsBaseUrl = DEFAULT_OLLAMA_BASE_URL

    effectiveModel = DEFAULT_OLLAMA_MODEL
    effectiveBaseUrl = DEFAULT_OLLAMA_BASE_URL
    systemPromptSet = false
    missingApiKey = false

    networkForm: NetworkAssistantSettings = { ...NETWORK_ASSISTANT_DEFAULTS, autoAppendRunbookOutput: false }
    networkVendors = DEVICE_VENDORS
    networkVariants = DEVICE_VARIANTS.juniper

    terminalTargets: TerminalTarget[] = []
    activeTerminalId = ''
    lastTerminalTitle = ''
    suggestedCommands: SuggestedCommand[] = []
    suggestedCommandsCollapsed = false
    terminalOutput = ''
    runbookPacks: RunbookPack[] = []
    quickActions: QuickAction[] = []
    quickQuestions: QuickQuestion[] = QUICK_QUESTIONS.map(question => ({ ...question }))
    pinnedQuickActions: QuickAction[] = []
    parsedSummary = ''
    runningRunbookId = ''
    allowlistText = ''
    runbookOutputBuffer = ''
    runbookOutputTruncated = false
    lastRunbookOutput = ''
    lastRunbookLabel = ''
    lastRunbookAt = 0
    activityLog: ActivityEntry[] = []
    exportMenuOpen = false
    summarizingLog = false
    activityFilterQuery = ''
    activityFilterType: ActivityEntry['type'] | 'all' = 'all'
    activityFilterTag = ''
    activityFilterWindowMinutes: number | null = null
    redactionPreview = ''
    redactionPreviewVisible = false
    quickQuestionEditMode = false

    private activeTerminal?: BaseTerminalTabComponent<any>
    private terminalOutputSubscription?: Subscription
    private terminalIdByTab = new WeakMap<BaseTerminalTabComponent<any>, string>()
    private lastTerminalTab?: BaseTerminalTabComponent<any>
    private parseTimeout?: number
    private commandAnalysisTimeout?: number
    private pendingCommandAnalysis?: PendingCommandAnalysis
    private activityFilterPersistTimeout?: number
    private quickQuestionPersistTimeout?: number
    private lastProvider: ChatProvider = 'openai'
    private ollamaPullInProgress = false

    constructor (
        private notifications: NotificationsService,
        private app: AppService,
        private platform: PlatformService,
        private profilesService: ProfilesService,
        private passwordStorage: PasswordStorageService,
        injector: Injector,
    ) {
        super(injector)
        this.setTitle('AI Chat')
        this.icon = null
    }

    ngOnInit (): void {
        this.setupTerminalTracking()
        if (this.config.store) {
            this.initializeFromConfig()
        } else {
            this.refreshEffectiveSettings()
        }
        this.subscribeUntilDestroyed(this.config.ready$, () => {
            this.initializeFromConfig()
        })
    }

    @HostListener('document:keydown', ['$event'])
    onGlobalKeydown (event: KeyboardEvent): void {
        if (event.key === 'Escape' && this.exportMenuOpen) {
            this.closeExportMenu()
            return
        }
        if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 't') {
            if (!this.isEditableTarget(event.target)) {
                event.preventDefault()
                this.focusTerminalSelector()
            }
            return
        }
        if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) {
            return
        }
        if (this.isEditableTarget(event.target)) {
            return
        }
        event.preventDefault()
        this.focusActivitySearch()
    }

    @HostListener('document:click', ['$event'])
    onGlobalClick (event: MouseEvent): void {
        if (!this.exportMenuOpen) {
            return
        }
        const target = event.target as HTMLElement | null
        if (target?.closest('.activity-export')) {
            return
        }
        this.closeExportMenu()
    }

    async send (): Promise<void> {
        const prompt = this.getDraftValue().trim()
        if (!prompt || this.sending) {
            return
        }
        this.draft = ''
        if (this.draftInputRef?.nativeElement) {
            this.draftInputRef.nativeElement.value = ''
        }
        await this.sendPrompt(prompt)
    }

    sendQuickQuestion (question: QuickQuestion): void {
        if (this.sending) {
            return
        }
        const prompt = question.prompt.trim()
        if (!prompt.length) {
            return
        }
        this.draft = prompt
        if (this.draftInputRef?.nativeElement) {
            this.draftInputRef.nativeElement.value = prompt
            this.draftInputRef.nativeElement.focus()
        }
        this.send()
    }

    toggleQuickQuestionEditMode (): void {
        this.quickQuestionEditMode = !this.quickQuestionEditMode
    }

    addQuickQuestion (): void {
        this.quickQuestions = [
            ...this.quickQuestions,
            { id: generateId(), label: 'New question', prompt: '' },
        ]
        this.persistQuickQuestions()
    }

    removeQuickQuestion (question: QuickQuestion): void {
        this.quickQuestions = this.quickQuestions.filter(item => item.id !== question.id)
        this.persistQuickQuestions()
    }

    resetQuickQuestions (): void {
        this.quickQuestions = QUICK_QUESTIONS.map(entry => ({ ...entry }))
        this.persistQuickQuestions()
    }

    onQuickQuestionChange (): void {
        this.scheduleQuickQuestionPersist()
    }

    getVisibleQuickQuestions (): QuickQuestion[] {
        return this.quickQuestions.filter(question => question.label.trim().length)
    }

    onInputKeydown (event: KeyboardEvent): void {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            this.send()
        }
    }

    onDraftInput (event: Event): void {
        const target = event.target as HTMLTextAreaElement | null
        this.draft = target?.value ?? ''
    }

    clear (): void {
        this.messages = []
        this.suggestedCommands = []
        this.scrollToBottom()
    }

    clearActivityLog (): void {
        this.activityLog = []
    }

    toggleExportMenu (): void {
        this.exportMenuOpen = !this.exportMenuOpen
    }

    closeExportMenu (): void {
        this.exportMenuOpen = false
    }

    clearActivityFilters (): void {
        this.applyActivityFilters()
        this.scheduleActivityFilterPersist()
    }

    clearFiltersAndExportAllCsv (): void {
        this.clearActivityFilters()
        this.exportActivityLogCsv()
    }

    clearFiltersAndExportAllJson (): void {
        this.clearActivityFilters()
        this.exportActivityLogJson()
    }

    resetActivityFiltersToSaved (): void {
        this.loadActivityFilters(this.activeProfileId)
    }

    focusActivitySearch (): void {
        const focusInput = (): void => {
            const input = this.activitySearchRef?.nativeElement
            if (input) {
                input.focus()
                input.select()
            }
        }

        if (!this.showSettings) {
            this.showSettings = true
            this.loadProfiles()
            window.setTimeout(() => focusInput(), 0)
            return
        }

        focusInput()
    }

    focusTerminalSelector (): void {
        const focusSelect = (): void => {
            const select = this.terminalSelectRef?.nativeElement
            if (select) {
                select.focus()
                select.scrollIntoView({ block: 'center' })
            }
        }

        window.setTimeout(() => focusSelect(), 0)
    }

    onActivityFilterChange (): void {
        this.scheduleActivityFilterPersist()
    }

    setActivityType (type: ActivityEntry['type'] | 'all'): void {
        if (type === 'all') {
            this.activityFilterType = 'all'
        } else {
            this.activityFilterType = this.activityFilterType === type ? 'all' : type
        }
        this.scheduleActivityFilterPersist()
    }

    isActivityTypeActive (type: ActivityEntry['type'] | 'all'): boolean {
        return this.activityFilterType === type
    }

    setActivityTimeWindow (minutes: number | null): void {
        if (minutes === null) {
            this.activityFilterWindowMinutes = null
        } else {
            this.activityFilterWindowMinutes = this.activityFilterWindowMinutes === minutes ? null : minutes
        }
        this.scheduleActivityFilterPersist()
    }

    isActivityTimeWindowActive (minutes: number | null): boolean {
        return this.activityFilterWindowMinutes === minutes
    }

    getActivityTags (entry: ActivityEntry): string[] {
        return entry.tags
            ? entry.tags.split(',').map(tag => tag.trim()).filter(Boolean)
            : []
    }

    applyActivityTag (tag: string): void {
        const normalized = tag.trim()
        if (!normalized) {
            return
        }
        if (this.isActivityTagActive(normalized)) {
            this.activityFilterTag = ''
            this.scheduleActivityFilterPersist()
            return
        }
        this.activityFilterTag = normalized
        this.scheduleActivityFilterPersist()
    }

    isActivityTagActive (tag: string): boolean {
        return this.activityFilterTag.trim().toLowerCase() === tag.trim().toLowerCase()
    }

    get filteredActivityLog (): ActivityEntry[] {
        const query = this.activityFilterQuery.trim().toLowerCase()
        const tagQuery = this.activityFilterTag.trim().toLowerCase()
        const typeFilter = this.activityFilterType
        const windowMinutes = this.activityFilterWindowMinutes
        const threshold = windowMinutes ? Date.now() - windowMinutes * 60 * 1000 : null

        if (!query && !tagQuery && typeFilter === 'all' && windowMinutes === null) {
            return this.activityLog
        }

        return this.activityLog.filter(entry => {
            if (typeFilter !== 'all' && entry.type !== typeFilter) {
                return false
            }

            if (threshold !== null) {
                const timestamp = this.getActivityTimestamp(entry)
                if (!timestamp || timestamp < threshold) {
                    return false
                }
            }

            if (tagQuery) {
                const tags = (entry.tags ?? '').toLowerCase()
                if (!tags || !this.matchesAllTokens(tags, tagQuery)) {
                    return false
                }
            }

            if (!query) {
                return true
            }

            const haystack = [
                entry.title,
                entry.detail ?? '',
                entry.tags ?? '',
                entry.type,
            ].join(' ').toLowerCase()

            return this.matchesAllTokens(haystack, query)
        })
    }

    get activityLogMeta (): string {
        if (!this.activityLog.length) {
            return 'No activity yet'
        }
        const filteredCount = this.filteredActivityLog.length
        if (this.isActivityFilterActive()) {
            return `${filteredCount} of ${this.activityLog.length} entries`
        }
        return `${this.activityLog.length} entries`
    }

    get activityTypeCounts (): { type: ActivityEntry['type'] | 'all', label: string, count: number }[] {
        const total = this.activityLog.length
        const counts: Record<ActivityEntry['type'], number> = {
            command: 0,
            runbook: 0,
            summary: 0,
            info: 0,
        }
        for (const entry of this.activityLog) {
            counts[entry.type] += 1
        }
        return [
            { type: 'all', label: 'All', count: total },
            { type: 'command', label: 'Commands', count: counts.command },
            { type: 'runbook', label: 'Runbooks', count: counts.runbook },
            { type: 'summary', label: 'Summaries', count: counts.summary },
            { type: 'info', label: 'Info', count: counts.info },
        ]
    }

    isActivityFilterActive (): boolean {
        return this.activityFilterType !== 'all'
            || this.activityFilterQuery.trim().length > 0
            || this.activityFilterTag.trim().length > 0
            || this.activityFilterWindowMinutes !== null
    }

    exportActivityLogCsv (): void {
        const csv = this.buildActivityCsv(this.activityLog)
        this.platform.setClipboard({ text: csv })
        this.notifications.notice('Activity log copied as CSV')
    }

    exportFilteredActivityLogCsv (): void {
        const csv = this.buildActivityCsv(this.filteredActivityLog)
        this.platform.setClipboard({ text: csv })
        this.notifications.notice('Filtered activity log copied as CSV')
    }

    exportActivityLogJson (): void {
        const payload = JSON.stringify(this.activityLog, null, 2)
        this.platform.setClipboard({ text: payload })
        this.notifications.notice('Activity log copied as JSON')
    }

    exportFilteredActivityLogJson (): void {
        const payload = JSON.stringify(this.filteredActivityLog, null, 2)
        this.platform.setClipboard({ text: payload })
        this.notifications.notice('Filtered activity log copied as JSON')
    }

    exportFilteredActivitySummary (): void {
        const summary = this.buildActivitySummary(this.filteredActivityLog, true, true, false, false)
        this.platform.setClipboard({ text: summary })
        this.notifications.notice('Filtered activity summary copied')
    }

    exportFilteredActivitySummaryNoTags (): void {
        const summary = this.buildActivitySummary(this.filteredActivityLog, true, false, false, false)
        this.platform.setClipboard({ text: summary })
        this.notifications.notice('Filtered activity summary (no tags) copied')
    }

    exportFilteredActivitySummaryTitlesOnly (): void {
        const summary = this.buildActivitySummary(this.filteredActivityLog, true, false, false, true)
        this.platform.setClipboard({ text: summary })
        this.notifications.notice('Filtered activity summary (titles only) copied')
    }

    exportFilteredActivitySummaryTimeTitleOnly (): void {
        const summary = this.buildActivitySummary(this.filteredActivityLog, true, false, true, false)
        this.platform.setClipboard({ text: summary })
        this.notifications.notice('Filtered activity summary (time + title) copied')
    }

    toggleSettings (): void {
        this.showSettings = !this.showSettings
        if (this.showSettings) {
            this.loadProfiles()
        }
    }

    onProfileChange (): void {
        this.loadActiveProfileForm()
        this.loadActivityFilters(this.activeProfileId)
        this.persistProfiles()
        this.refreshEffectiveSettings()
    }

    onProviderChange (): void {
        const provider = normalizeProvider(this.profileForm.provider)
        const nextDefinition = getProviderDefinition(provider)
        const previousDefinition = getProviderDefinition(this.lastProvider)

        const modelValue = this.profileForm.model.trim()
        if (!modelValue || modelValue === previousDefinition.defaultModel) {
            this.profileForm.model = nextDefinition.defaultModel
        }

        const baseValue = this.profileForm.baseUrl.trim()
        const normalizedBase = normalizeBaseUrl(baseValue, previousDefinition.defaultBaseUrl)
        if (!baseValue || normalizedBase === previousDefinition.defaultBaseUrl) {
            this.profileForm.baseUrl = nextDefinition.defaultBaseUrl
        }

        this.profileForm.provider = provider
        this.lastProvider = provider
        this.refreshEffectiveSettings()
    }

    onNetworkVendorChange (): void {
        const vendor = this.networkForm.vendor
        this.networkVariants = DEVICE_VARIANTS[vendor] ?? []
        if (!this.networkVariants.find(option => option.id === this.networkForm.variant)) {
            this.networkForm.variant = (this.networkVariants[0]?.id as DeviceVariant) ?? 'junos'
        }
        this.refreshQuickActions()
        this.refreshRunbookPacks()
        this.refreshEffectiveSettings()
        if (this.redactionPreviewVisible) {
            this.updateRedactionPreview()
        }
    }

    onNetworkSettingsChange (): void {
        if (!this.networkForm.enabled) {
            this.suggestedCommands = []
        }
        this.refreshAllowlistText()
        this.refreshQuickActions()
        this.refreshRunbookPacks()
        this.refreshEffectiveSettings()
        if (this.redactionPreviewVisible) {
            this.updateRedactionPreview()
        }
    }

    onAllowlistChange (): void {
        const items = this.allowlistText
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
        this.setAllowlistForVariant(this.networkForm.variant, items)
        this.refreshEffectiveSettings()
    }

    resetAllowlist (): void {
        this.setAllowlistForVariant(this.networkForm.variant, [])
        this.refreshAllowlistText()
        this.refreshEffectiveSettings()
    }

    onTerminalTargetChange (): void {
        const target = this.terminalTargets.find(candidate => candidate.id === this.activeTerminalId)
        this.setActiveTerminal(target?.tab)
    }

    useLastTerminal (): void {
        if (this.lastTerminalTab) {
            this.setActiveTerminal(this.lastTerminalTab)
        }
    }

    clearCapturedOutput (): void {
        this.terminalOutput = ''
        this.clearPendingCommandAnalysis()
    }

    saveNetworkSettings (): void {
        this.persistNetworkSettings('Network assistant saved')
        this.refreshEffectiveSettings()
        if (this.redactionPreviewVisible) {
            this.updateRedactionPreview()
        }
    }

    addProfile (): void {
        const provider = normalizeProvider(this.profileForm.provider)
        const newProfile = this.createProfile(provider)
        this.profiles = [...this.profiles, newProfile]
        this.activeProfileId = newProfile.id
        this.profileForm = { ...newProfile }
        this.lastProvider = newProfile.provider
        this.loadActivityFilters(newProfile.id)
        this.persistProfiles('Chat profile added')
        this.refreshEffectiveSettings()
    }

    deleteProfile (): void {
        if (this.profiles.length <= 1) {
            this.notifications.error('At least one chat profile is required')
            return
        }

        const index = this.profiles.findIndex(profile => profile.id === this.activeProfileId)
        if (index === -1) {
            return
        }

        this.profiles.splice(index, 1)
        const nextProfile = this.profiles[Math.max(0, index - 1)]
        this.activeProfileId = nextProfile.id
        this.profileForm = { ...nextProfile }
        this.lastProvider = nextProfile.provider
        this.loadActivityFilters(this.activeProfileId)
        this.persistProfiles('Chat profile removed')
        this.refreshEffectiveSettings()
    }

    saveSettings (): void {
        const index = this.profiles.findIndex(profile => profile.id === this.activeProfileId)
        if (index === -1) {
            return
        }

        const normalized = this.normalizeProfile(this.profileForm, this.activeProfileId)
        this.profiles[index] = normalized
        this.profileForm = { ...normalized }
        this.lastProvider = normalized.provider
        this.persistProfiles('Chat profile saved')
        this.refreshEffectiveSettings()
    }

    clearApiKey (): void {
        this.profileForm.apiKey = ''
        this.saveSettings()
    }

    getProviderLabel (provider: ChatProvider): string {
        return getProviderDefinition(provider).label
    }

    private loadProfiles (): void {
        const store = this.getChatStore()
        const rawProfiles = Array.isArray(store.profiles) ? store.profiles : []

        if (!rawProfiles.length) {
            if (this.hasLegacyProfileData(store)) {
                const migrated = this.createProfileFromLegacy(store)
                store.profiles = [migrated]
                store.activeProfileId = migrated.id
            } else {
                const defaultProfile = this.createProfile('ollama')
                store.profiles = [defaultProfile]
                store.activeProfileId = defaultProfile.id
            }
            this.config.save()
        }

        const storedProfiles = Array.isArray(store.profiles) ? store.profiles : []
        this.profiles = storedProfiles.map(profile => this.normalizeProfile(profile))

        if (!this.profiles.length) {
            this.profiles = [this.createProfile('ollama')]
        }

        const activeId = store.activeProfileId || this.profiles[0].id
        this.activeProfileId = this.findProfile(activeId) ? activeId : this.profiles[0].id
        this.loadActiveProfileForm()
    }

    private loadActiveProfileForm (): void {
        const active = this.getActiveProfile()
        this.profileForm = { ...active }
        this.lastProvider = active.provider
    }

    private persistProfiles (noticeMessage?: string): void {
        const store = this.getChatStore()

        store.profiles = this.profiles
        store.activeProfileId = this.activeProfileId
        this.config.save()
        if (noticeMessage) {
            this.notifications.notice(noticeMessage)
        }
    }

    private createProfileFromLegacy (store: Record<string, unknown>): ChatProfile {
        return this.normalizeProfile({
            id: generateId(),
            name: 'OpenAI',
            provider: 'openai',
            apiKey: typeof store.apiKey === 'string' ? store.apiKey : '',
            model: typeof store.model === 'string' ? store.model : '',
            baseUrl: typeof store.baseUrl === 'string' ? store.baseUrl : '',
            systemPrompt: typeof store.systemPrompt === 'string' ? store.systemPrompt : '',
            temperature: typeof store.temperature === 'number' ? store.temperature : DEFAULT_TEMPERATURE,
            maxTokens: typeof store.maxTokens === 'number' ? store.maxTokens : DEFAULT_MAX_TOKENS,
        })
    }

    private createProfile (provider: ChatProvider): ChatProfile {
        const definition = getProviderDefinition(provider)
        return {
            id: generateId(),
            name: this.createProfileName(definition.label),
            provider,
            apiKey: '',
            model: definition.defaultModel,
            baseUrl: definition.defaultBaseUrl,
            systemPrompt: '',
            temperature: DEFAULT_TEMPERATURE,
            maxTokens: DEFAULT_MAX_TOKENS,
        }
    }

    private createProfileName (base: string): string {
        const existing = new Set(this.profiles.map(profile => profile.name))
        if (!existing.has(base)) {
            return base
        }
        let index = 2
        let name = `${base} ${index}`
        while (existing.has(name)) {
            index += 1
            name = `${base} ${index}`
        }
        return name
    }

    private hasLegacyProfileData (store: Record<string, unknown>): boolean {
        const apiKey = typeof store.apiKey === 'string' ? store.apiKey.trim() : ''
        const model = typeof store.model === 'string' ? store.model.trim() : ''
        const baseUrl = typeof store.baseUrl === 'string' ? store.baseUrl.trim() : ''
        const systemPrompt = typeof store.systemPrompt === 'string' ? store.systemPrompt.trim() : ''
        const temperature = typeof store.temperature === 'number' ? store.temperature : null
        const maxTokens = typeof store.maxTokens === 'number' ? store.maxTokens : null

        if (apiKey || systemPrompt) {
            return true
        }
        if (model && model !== DEFAULT_OLLAMA_MODEL) {
            return true
        }
        if (baseUrl) {
            const normalized = normalizeBaseUrl(baseUrl, DEFAULT_OLLAMA_BASE_URL)
            if (normalized !== DEFAULT_OLLAMA_BASE_URL) {
                return true
            }
        }
        if (temperature !== null && temperature !== DEFAULT_TEMPERATURE) {
            return true
        }
        if (maxTokens !== null && maxTokens !== DEFAULT_MAX_TOKENS) {
            return true
        }
        return false
    }

    private normalizeProfile (profile: Partial<ChatProfile>, fallbackId?: string): ChatProfile {
        const provider = normalizeProvider(profile.provider)
        const definition = getProviderDefinition(provider)

        const nameValue = typeof profile.name === 'string' ? profile.name.trim() : ''
        const modelValue = typeof profile.model === 'string' ? profile.model.trim() : ''
        const baseValue = typeof profile.baseUrl === 'string' ? profile.baseUrl.trim() : ''
        const systemPromptValue = typeof profile.systemPrompt === 'string' ? profile.systemPrompt.trim() : ''
        const apiKeyValue = typeof profile.apiKey === 'string' ? profile.apiKey.trim() : ''

        const normalizedModel = provider === 'ollama' && modelValue === LEGACY_OLLAMA_MODEL
            ? definition.defaultModel
            : (modelValue || definition.defaultModel)

        return {
            id: profile.id || fallbackId || generateId(),
            name: nameValue || definition.label,
            provider,
            apiKey: apiKeyValue,
            model: normalizedModel,
            baseUrl: normalizeBaseUrl(baseValue || definition.defaultBaseUrl, definition.defaultBaseUrl),
            systemPrompt: systemPromptValue,
            temperature: this.normalizeTemperature(Number(profile.temperature ?? DEFAULT_TEMPERATURE)),
            maxTokens: this.normalizeMaxTokens(Number(profile.maxTokens ?? DEFAULT_MAX_TOKENS)),
        }
    }

    private findProfile (profileId: string): ChatProfile | undefined {
        return this.profiles.find(profile => profile.id === profileId)
    }

    private getActiveProfile (): ChatProfile {
        return this.findProfile(this.activeProfileId) ?? this.profiles[0]
    }

    private refreshEffectiveSettings (): void {
        const settings = this.getEffectiveSettings()
        const providerDefinition = getProviderDefinition(settings.provider)

        this.activeProfileName = settings.profileName
        this.activeProviderLabel = providerDefinition.label
        this.providerDefaultsModel = providerDefinition.defaultModel
        this.providerDefaultsBaseUrl = providerDefinition.defaultBaseUrl
        this.effectiveModel = settings.model
        this.effectiveBaseUrl = settings.baseUrl
        this.systemPromptSet = !!settings.systemPrompt || this.networkForm.enabled
        this.missingApiKey = settings.apiKeyRequired && !settings.apiKey

        this.updateEnvStatus(providerDefinition)
    }

    private updateEnvStatus (providerDefinition: ProviderDefinition): void {
        const envOverrides = this.getEnvOverrides(providerDefinition.id)
        const prefix = providerDefinition.envPrefix

        this.envPrefix = prefix
        this.envHasApiKey = !!envOverrides.apiKey
        this.envModel = envOverrides.model ?? ''
        this.envBaseUrl = envOverrides.baseUrl ?? ''
        this.envSystemPromptSet = !!envOverrides.systemPrompt
        this.envApiKeyPlaceholder = this.envHasApiKey && prefix ? `Using ${prefix}_API_KEY` : ''
        this.envSystemPromptPlaceholder = this.envSystemPromptSet && prefix
            ? `Using ${prefix}_SYSTEM_PROMPT`
            : 'Optional system prompt'

        const baseHint = providerDefinition.requiresApiKey
            ? 'API key is stored per profile.'
            : 'API key is optional for this provider.'

        this.apiKeyHint = prefix
            ? `${baseHint} Environment variable ${prefix}_API_KEY overrides if set.`
            : baseHint
    }

    private normalizeTemperature (value: number): number {
        if (!Number.isFinite(value)) {
            return DEFAULT_TEMPERATURE
        }
        return Math.max(0, Math.min(2, value))
    }

    private normalizeMaxTokens (value: number): number {
        if (!Number.isFinite(value)) {
            return DEFAULT_MAX_TOKENS
        }
        return Math.max(1, Math.floor(value))
    }

    private getEnvOverrides (provider: ChatProvider): EnvOverrides {
        const definition = getProviderDefinition(provider)
        const prefix = definition.envPrefix
        if (!prefix) {
            return {}
        }

        const apiKey = getEnvValue(`${prefix}_API_KEY`) || undefined
        const model = getEnvValue(`${prefix}_MODEL`) || undefined
        const baseUrl = getEnvValue(`${prefix}_BASE_URL`) || undefined
        const systemPrompt = getEnvValue(`${prefix}_SYSTEM_PROMPT`) || undefined
        const temperature = getEnvNumberMaybe(`${prefix}_TEMPERATURE`) ?? undefined
        const maxTokens = getEnvNumberMaybe(`${prefix}_MAX_TOKENS`) ?? undefined

        return {
            apiKey,
            model,
            baseUrl,
            systemPrompt,
            temperature,
            maxTokens,
        }
    }

    private getEffectiveSettings (): EffectiveChatSettings {
        const activeProfile = this.getActiveProfile()
        const provider = normalizeProvider(activeProfile?.provider)
        const providerDefinition = getProviderDefinition(provider)
        const envOverrides = this.getEnvOverrides(provider)

        const apiKey = envOverrides.apiKey ?? activeProfile.apiKey
        const model = envOverrides.model ?? activeProfile.model
        const baseUrl = normalizeBaseUrl(envOverrides.baseUrl ?? activeProfile.baseUrl, providerDefinition.defaultBaseUrl)
        const systemPrompt = envOverrides.systemPrompt ?? activeProfile.systemPrompt
        const temperature = this.normalizeTemperature(envOverrides.temperature ?? activeProfile.temperature)
        const maxTokens = this.normalizeMaxTokens(envOverrides.maxTokens ?? activeProfile.maxTokens)

        return {
            provider,
            providerLabel: providerDefinition.label,
            profileName: activeProfile.name,
            apiKey,
            model: model.trim() || providerDefinition.defaultModel,
            baseUrl,
            systemPrompt: systemPrompt.trim(),
            temperature,
            maxTokens,
            apiKeyRequired: providerDefinition.requiresApiKey,
        }
    }

    private getConversationHistory (): ChatMessage[] {
        return this.messages.filter(message => message.role === 'user' || message.role === 'assistant')
    }

    private buildOpenAiMessages (
        systemPrompt: string,
        redactor?: (value: string) => string,
    ): { role: string, content: string }[] {
        const history = this.getConversationHistory().map(message => ({
            role: message.role,
            content: redactor ? redactor(message.content) : message.content,
        }))

        return [
            ...(systemPrompt ? [{ role: 'system', content: redactor ? redactor(systemPrompt) : systemPrompt }] : []),
            ...history,
        ]
    }

    private buildGeminiContents (
        redactor?: (value: string) => string,
    ): { role: string, parts: { text: string }[] }[] {
        return this.getConversationHistory().map(message => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: redactor ? redactor(message.content) : message.content }],
        }))
    }

    private async requestCompletion (): Promise<string | null> {
        const settings = this.getEffectiveSettings()
        if (settings.apiKeyRequired && !settings.apiKey) {
            const message = `${settings.providerLabel} API key is not set`
            this.appendMessage('error', message)
            this.notifications.error(message)
            return null
        }

        switch (settings.provider) {
            case 'anthropic':
                return this.requestAnthropic(settings)
            case 'gemini':
                return this.requestGemini(settings)
            case 'ollama':
            case 'openai-compatible':
            case 'openai':
            default:
                return this.requestOpenAi(settings)
        }
    }

    private async requestOpenAi (settings: EffectiveChatSettings): Promise<string | null> {
        const redactor = this.getRedactor(settings)
        const systemPrompt = this.buildEffectiveSystemPrompt(settings.systemPrompt, redactor)
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        }
        if (settings.apiKey) {
            headers.Authorization = `Bearer ${settings.apiKey}`
        }

        const payloadText = await this.fetchPayload(`${settings.baseUrl}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: settings.model,
                temperature: settings.temperature,
                max_tokens: settings.maxTokens,
                stream: false,
                messages: this.buildOpenAiMessages(systemPrompt, redactor),
            }),
        }, {
            provider: settings.provider,
            model: settings.model,
            baseUrl: settings.baseUrl,
        })

        if (payloadText === null) {
            return null
        }

        try {
            const payload = JSON.parse(payloadText)
            const content = payload?.choices?.[0]?.message?.content ?? payload?.choices?.[0]?.text
            if (typeof content === 'string' && content.trim().length) {
                return content.trim()
            }
        } catch {
            // fall through to raw text
        }

        return this.handleRawResponse(payloadText)
    }

    private async requestAnthropic (settings: EffectiveChatSettings): Promise<string | null> {
        const redactor = this.getRedactor(settings)
        const systemPrompt = this.buildEffectiveSystemPrompt(settings.systemPrompt, redactor)
        const payloadText = await this.fetchPayload(`${settings.baseUrl}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': settings.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: settings.model,
                max_tokens: settings.maxTokens,
                temperature: settings.temperature,
                system: systemPrompt || undefined,
                messages: this.getConversationHistory().map(message => ({
                    role: message.role,
                    content: redactor ? redactor(message.content) : message.content,
                })),
            }),
        })

        if (payloadText === null) {
            return null
        }

        try {
            const payload = JSON.parse(payloadText)
            const parts = Array.isArray(payload?.content) ? payload.content : []
            const text = parts
                .map((part: { text?: string }) => part?.text)
                .filter((part: string | undefined) => typeof part === 'string' && part.trim().length)
                .join('\n')

            if (text.trim().length) {
                return text.trim()
            }
        } catch {
            // fall through to raw text
        }

        return this.handleRawResponse(payloadText)
    }

    private async requestGemini (settings: EffectiveChatSettings): Promise<string | null> {
        const redactor = this.getRedactor(settings)
        const systemPrompt = this.buildEffectiveSystemPrompt(settings.systemPrompt, redactor)
        const queryKey = settings.apiKey ? `?key=${encodeURIComponent(settings.apiKey)}` : ''
        const url = `${settings.baseUrl}/models/${encodeURIComponent(settings.model)}:generateContent${queryKey}`

        const payloadText = await this.fetchPayload(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: this.buildGeminiContents(redactor),
                generationConfig: {
                    temperature: settings.temperature,
                    maxOutputTokens: settings.maxTokens,
                },
                systemInstruction: systemPrompt
                    ? { parts: [{ text: systemPrompt }] }
                    : undefined,
            }),
        })

        if (payloadText === null) {
            return null
        }

        try {
            const payload = JSON.parse(payloadText)
            const parts = payload?.candidates?.[0]?.content?.parts
            const text = Array.isArray(parts)
                ? parts
                    .map((part: { text?: string }) => part?.text)
                    .filter((part: string | undefined) => typeof part === 'string' && part.trim().length)
                    .join('')
                : ''

            if (text.trim().length) {
                return text.trim()
            }
        } catch {
            // fall through to raw text
        }

        return this.handleRawResponse(payloadText)
    }

    private async fetchPayload (url: string, init: RequestInit, context?: FetchContext): Promise<string | null> {
        let response: Response
        try {
            response = await fetch(url, init)
        } catch (err) {
            const message = `Chat request failed: ${String(err)}`
            this.appendMessage('error', message)
            this.notifications.error('Chat request failed', String(err))
            return null
        }

        let payloadText = ''
        try {
            const contentType = response.headers.get('content-type') ?? ''
            if (contentType.includes('text/event-stream')) {
                payloadText = await this.readEventStream(response)
            } else {
                payloadText = await response.text()
            }
        } catch (err) {
            const message = `Chat request failed: ${String(err)}`
            this.appendMessage('error', message)
            this.notifications.error('Chat request failed', String(err))
            return null
        }

        if (!response.ok) {
            const errorMessage = payloadText.length ? payloadText : `${response.status} ${response.statusText}`
            if (context?.provider === 'ollama' && !context.retry) {
                const ollamaMessage = this.getOllamaErrorMessage(payloadText) ?? errorMessage
                if (this.isOllamaModelMissing(ollamaMessage)) {
                    const pullState = this.queueOllamaModelPull(context.model, context.baseUrl)
                    const message = pullState === 'started'
                        ? `Ollama model "${context.model}" is downloading. Retry once it finishes.`
                        : pullState === 'in-progress'
                            ? `Ollama model "${context.model}" is downloading. Try again shortly.`
                            : `Ollama model "${context.model}" is not installed.`
                    this.appendMessage('error', message)
                    this.notifications.info(message)
                    return null
                }
            }
            this.appendMessage('error', errorMessage)
            this.notifications.error('Chat request failed', errorMessage)
            return null
        }

        return payloadText
    }

    private async readEventStream (response: Response): Promise<string> {
        if (!response.body) {
            return ''
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let output = ''

        while (true) {
            const { done, value } = await reader.read()
            if (done) {
                break
            }
            buffer += decoder.decode(value, { stream: true })
            let lineBreakIndex = buffer.indexOf('\n')
            while (lineBreakIndex !== -1) {
                const line = buffer.slice(0, lineBreakIndex).trim()
                buffer = buffer.slice(lineBreakIndex + 1)
                if (line.startsWith('data:')) {
                    const data = line.slice(5).trim()
                    if (data === '[DONE]') {
                        return output.trim()
                    }
                    try {
                        const payload = JSON.parse(data)
                        const delta = payload?.choices?.[0]?.delta?.content
                            ?? payload?.choices?.[0]?.message?.content
                            ?? payload?.choices?.[0]?.text
                        if (typeof delta === 'string') {
                            output += delta
                        }
                    } catch {
                        // Ignore malformed chunks and keep going.
                    }
                }
                lineBreakIndex = buffer.indexOf('\n')
            }
        }

        return output.trim()
    }

    private handleRawResponse (payloadText: string): string | null {
        if (payloadText.trim().length) {
            return payloadText.trim()
        }

        const fallback = 'Chat response was empty'
        this.appendMessage('error', fallback)
        this.notifications.error(fallback)
        return null
    }

    private getOllamaErrorMessage (payloadText: string): string | null {
        try {
            const payload = JSON.parse(payloadText)
            const message = payload?.error?.message
            return typeof message === 'string' ? message : null
        } catch {
            return null
        }
    }

    private isOllamaModelMissing (message: string): boolean {
        const normalized = message.toLowerCase()
        return normalized.includes('model') && normalized.includes('not found')
    }

    private getOllamaRootUrl (baseUrl: string): string {
        try {
            const url = new URL(baseUrl)
            url.pathname = url.pathname.replace(/\/v1\/?$/, '')
            url.search = ''
            url.hash = ''
            return url.toString().replace(/\/$/, '')
        } catch {
            return baseUrl.replace(/\/v1\/?$/, '')
        }
    }

    private async pullOllamaModel (model: string, baseUrl: string): Promise<boolean> {
        const trimmed = model.trim()
        if (!trimmed.length) {
            return false
        }
        this.notifications.info(`Downloading ${trimmed}...`)
        try {
            const rootUrl = this.getOllamaRootUrl(baseUrl)
            const response = await fetch(`${rootUrl}/api/pull`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: trimmed,
                    stream: false,
                }),
            })
            const bodyText = await response.text()
            if (!response.ok) {
                this.notifications.error('Ollama pull failed', bodyText || response.statusText)
                return false
            }
            this.notifications.notice(`${trimmed} is ready`)
            return true
        } catch (err) {
            this.notifications.error('Ollama pull failed', String(err))
            return false
        }
    }

    private queueOllamaModelPull (model: string, baseUrl: string): OllamaPullState {
        if (this.ollamaPullInProgress) {
            return 'in-progress'
        }
        const trimmed = model.trim()
        if (!trimmed.length) {
            return 'failed'
        }
        this.ollamaPullInProgress = true
        void this.pullOllamaModel(trimmed, baseUrl).finally(() => {
            this.ollamaPullInProgress = false
        })
        return 'started'
    }

    private appendMessage (role: ChatMessage['role'], content: string): void {
        this.messages = [...this.messages, {
            role,
            label: role === 'user' ? 'You' : role === 'assistant' ? 'Assistant' : 'Error',
            content,
        }]
        if (role === 'assistant') {
            this.suggestedCommands = this.parseSuggestedCommands(content)
        }
    }

    private getDraftValue (): string {
        if (this.draft?.length) {
            return this.draft
        }
        return this.draftInputRef?.nativeElement?.value ?? ''
    }

    private loadNetworkSettings (): void {
        const store = this.getChatStore()
        const raw = (store.networkAssistant ?? {}) as Partial<NetworkAssistantSettings>
        this.networkForm = {
            ...NETWORK_ASSISTANT_DEFAULTS,
            ...raw,
            autoAppendRunbookOutput: false,
        }
        this.onNetworkVendorChange()
        this.refreshRunbookPacks()
        this.refreshQuickActions()
        this.refreshPinnedQuickActions()
    }

    private loadQuickQuestions (): void {
        const store = this.getChatStore()
        const raw = Array.isArray(store.quickQuestions) ? store.quickQuestions : null
        if (!raw || !raw.length) {
            this.quickQuestions = QUICK_QUESTIONS.map(entry => ({ ...entry }))
            store.quickQuestions = this.quickQuestions
            this.config.save()
            return
        }
        this.quickQuestions = raw.map(entry => this.normalizeQuickQuestion(entry))
    }

    private normalizeQuickQuestion (entry: Partial<QuickQuestion>): QuickQuestion {
        return {
            id: entry.id ?? generateId(),
            label: typeof entry.label === 'string' ? entry.label : '',
            prompt: typeof entry.prompt === 'string' ? entry.prompt : '',
        }
    }

    private persistQuickQuestions (): void {
        const store = this.getChatStore()
        store.quickQuestions = this.quickQuestions.map(question => ({
            id: question.id || generateId(),
            label: question.label ?? '',
            prompt: question.prompt ?? '',
        }))
        this.config.save()
    }

    private persistNetworkSettings (noticeMessage?: string): void {
        const store = this.getChatStore()
        store.networkAssistant = { ...this.networkForm, autoAppendRunbookOutput: false }
        this.config.save()
        if (noticeMessage) {
            this.notifications.notice(noticeMessage)
        }
    }

    private setupTerminalTracking (): void {
        this.refreshTerminalTargets()
        this.subscribeUntilDestroyed(this.app.tabsChanged$, () => this.refreshTerminalTargets())
        this.subscribeUntilDestroyed(this.app.activeTabChange$, tab => {
            const focusedTab = this.resolveFocusedTab(tab)
            if (focusedTab instanceof BaseTerminalTabComponent) {
                this.lastTerminalTab = focusedTab
                this.lastTerminalTitle = focusedTab.title || 'Terminal'
                if (!this.activeTerminalId) {
                    this.setActiveTerminal(focusedTab)
                }
            }
            this.refreshTerminalTargets()
        })
    }

    private refreshTerminalTargets (): void {
        const terminals = this.getAllTabs()
            .filter(tab => tab instanceof BaseTerminalTabComponent) as BaseTerminalTabComponent<any>[]
        const previousId = this.activeTerminalId
        this.terminalTargets = terminals.map(tab => ({
            id: this.getTerminalId(tab),
            title: tab.title || 'Terminal',
            tab,
        }))

        if (previousId && this.terminalTargets.find(target => target.id === previousId)) {
            return
        }
        if (this.lastTerminalTab && terminals.includes(this.lastTerminalTab)) {
            this.setActiveTerminal(this.lastTerminalTab)
            return
        }
        if (this.terminalTargets.length) {
            this.setActiveTerminal(this.terminalTargets[0].tab)
            return
        }
        this.setActiveTerminal(undefined)
    }

    get activeSessionLogPath (): string {
        return (this.activeTerminal as any)?.sessionLogPath || ''
    }

    get activeSessionLogName (): string {
        const logPath = this.activeSessionLogPath
        return logPath ? path.basename(logPath) : ''
    }

    private getAllTabs (): BaseTabComponent[] {
        const expanded: BaseTabComponent[] = []
        for (const tab of this.app.tabs) {
            if (tab instanceof SplitTabComponent) {
                expanded.push(...tab.getAllTabs())
            } else {
                expanded.push(tab)
            }
        }
        return expanded
    }

    private restoreChatFocus (): void {
        const parentTab = this.app.getParentTab(this)
        const topLevel = parentTab ?? this
        if (this.app.activeTab !== topLevel) {
            this.app.selectTab(topLevel)
        }
        if (parentTab instanceof SplitTabComponent) {
            parentTab.focus(this)
        }
    }

    private async waitForAssistantResponseRender (): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, 0))
    }

    private resolveFocusedTab (tab: BaseTabComponent | null): BaseTabComponent | null {
        if (tab instanceof SplitTabComponent) {
            return tab.getFocusedTab() ?? tab.getAllTabs()[0] ?? tab
        }
        return tab
    }

    private setActiveTerminal (tab?: BaseTerminalTabComponent<any>): void {
        this.activeTerminal = tab
        this.activeTerminalId = tab ? this.getTerminalId(tab) : ''
        if (this.terminalOutputSubscription) {
            this.terminalOutputSubscription.unsubscribe()
            this.terminalOutputSubscription = undefined
        }
        this.clearPendingCommandAnalysis()
        if (!tab) {
            return
        }
        this.terminalOutputSubscription = tab.output$.subscribe(data => {
            this.appendTerminalOutput(data)
        })
    }

    private getTerminalId (tab: BaseTerminalTabComponent<any>): string {
        let id = this.terminalIdByTab.get(tab)
        if (!id) {
            id = generateId()
            this.terminalIdByTab.set(tab, id)
        }
        return id
    }

    private appendTerminalOutput (data: string): void {
        const cleaned = this.stripAnsi(data)
        if (!cleaned) {
            return
        }
        this.terminalOutput = `${this.terminalOutput}${cleaned}`
        if (this.terminalOutput.length > NETWORK_OUTPUT_MAX_CHARS) {
            this.terminalOutput = this.terminalOutput.slice(-NETWORK_OUTPUT_MAX_CHARS)
        }
        if (this.runningRunbookId) {
            this.appendRunbookOutput(cleaned)
        }
        this.scheduleParseTerminalOutput()
        if (this.pendingCommandAnalysis) {
            this.schedulePendingCommandAnalysis()
        }
    }

    private refreshRunbookPacks (): void {
        this.runbookPacks = RUNBOOKS_BY_VARIANT[this.networkForm.variant] ?? []
    }

    private refreshQuickActions (): void {
        this.quickActions = QUICK_ACTIONS_BY_VARIANT[this.networkForm.variant] ?? []
        this.refreshPinnedQuickActions()
    }

    private stripAnsi (value: string): string {
        return value.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    }

    private buildEffectiveSystemPrompt (
        basePrompt: string,
        redactor?: (value: string) => string,
    ): string {
        const parts: string[] = []
        if (basePrompt.trim().length) {
            parts.push(basePrompt.trim())
        }
        if (this.networkForm.enabled) {
            parts.push(this.buildNetworkSystemPrompt())
            const context = this.buildNetworkContext(redactor)
            if (context.length) {
                parts.push(context)
            }
        }
        const combined = parts.join('\n\n')
        return redactor ? redactor(combined) : combined
    }

    private buildNetworkSystemPrompt (): string {
        const vendorLabel = this.getVendorLabel(this.networkForm.vendor)
        const variantLabel = this.getVariantLabel(this.networkForm.variant)
        const safePrefixes = this.getAllowlistForVariant(this.networkForm.variant).join(', ')
        return [
            `You are a network troubleshooting assistant for ${vendorLabel} devices (${variantLabel}).`,
            'Only suggest read-only or diagnostic commands. Never suggest configuration changes.',
            `Preferred command prefixes for this variant: ${safePrefixes}.`,
            'If more data is needed, include a "Suggested commands:" section with bullet points.',
            'Keep responses concise, highlight likely cause, and ask before running any command.',
        ].join(' ')
    }

    private buildNetworkContext (redactor?: (value: string) => string): string {
        const lines: string[] = []
        const deviceLabel = this.networkForm.deviceLabel.trim()
        if (deviceLabel) {
            lines.push(`Device: ${deviceLabel}`)
        }
        const osVersion = this.networkForm.osVersion.trim()
        if (osVersion) {
            lines.push(`OS: ${osVersion}`)
        }
        const site = this.networkForm.site.trim()
        if (site) {
            lines.push(`Site: ${site}`)
        }
        const role = this.networkForm.role.trim()
        if (role) {
            lines.push(`Role: ${role}`)
        }
        lines.push(`Variant: ${this.getVariantLabel(this.networkForm.variant)}`)
        if (this.parsedSummary.trim().length) {
            lines.push('Parsed facts:')
            lines.push(this.parsedSummary.trim())
        }
        if (this.networkForm.includeLastOutput && this.terminalOutput.trim().length) {
            lines.push('Recent output:')
            lines.push(this.terminalOutput.trim())
        }
        const context = lines.length ? `Context:\n${lines.join('\n')}` : ''
        return redactor ? redactor(context) : context
    }

    private getVendorLabel (vendor: DeviceVendor): string {
        return DEVICE_VENDORS.find(option => option.id === vendor)?.label ?? vendor
    }

    private getVariantLabel (variant: DeviceVariant): string {
        const options = DEVICE_VARIANTS[this.networkForm.vendor] ?? []
        return options.find(option => option.id === variant)?.label ?? variant
    }

    private parseSuggestedCommands (content: string): SuggestedCommand[] {
        if (!this.networkForm.enabled) {
            return []
        }
        const candidates = new Set<string>()
        const lines = content.split(/\r?\n/)
        let inCommandsSection = false
        for (const rawLine of lines) {
            const line = rawLine.trim()
            if (!line) {
                if (inCommandsSection) {
                    break
                }
                continue
            }
            if (/^(suggested commands|commands|next commands)\b[:]*$/i.test(line)) {
                inCommandsSection = true
                continue
            }
            const cleaned = line.replace(/^[-*•]+\s*/, '').replace(/^\d+[\.)]\s*/, '')
            if (!cleaned) {
                continue
            }
            if (inCommandsSection || this.looksLikeCommand(cleaned)) {
                candidates.add(cleaned)
            }
        }

        return [...candidates].map(command => {
            const stripped = this.stripWrappingQuotes(command)
            const check = this.checkCommandSafety(stripped)
            return {
                id: generateId(),
                command: stripped,
                safe: check.safe,
                reason: check.reason,
            }
        })
    }

    private normalizeCommand (value: string): string {
        let normalized = value.toLowerCase().trim()
        if (!normalized.length) {
            return normalized
        }
        normalized = normalized.replace(/^`+/, '').replace(/`+$/, '').trim()
        normalized = normalized.replace(/^(command|cmd|run|execute)\s*[:=-]?\s+/, '')
        const promptMatch = normalized.match(/^[^\s]+[>#]\s*/)
        if (promptMatch) {
            normalized = normalized.slice(promptMatch[0].length).trim()
        } else {
            normalized = normalized.replace(/^[$>#]\s+/, '')
        }
        return normalized
    }

    private stripWrappingQuotes (value: string): string {
        let trimmed = value.trim()
        const pairs: Array<[string, string]> = [
            ['"', '"'],
            ["'", "'"],
            ['`', '`'],
            ['“', '”'],
            ['‘', '’'],
        ]
        for (const [start, end] of pairs) {
            if (trimmed.length >= 2 && trimmed.startsWith(start) && trimmed.endsWith(end)) {
                trimmed = trimmed.slice(start.length, -end.length).trim()
                break
            }
        }
        return trimmed
    }

    private looksLikeCommand (value: string): boolean {
        const normalized = this.normalizeCommand(value)
        if (normalized.startsWith('cli -c')) {
            return normalized.includes('show ')
        }
        const prefixes = this.getAllowlistForVariant(this.networkForm.variant)
            .map(prefix => prefix.toLowerCase().trim())
            .filter(Boolean)
        return prefixes.some(prefix => normalized.startsWith(prefix))
    }

    private checkCommandSafety (command: string): { safe: boolean, reason?: string } {
        for (const pattern of UNSAFE_COMMAND_START_PATTERNS) {
            if (pattern.test(command)) {
                return { safe: false, reason: 'Matches a config-changing keyword' }
            }
        }
        for (const pattern of UNSAFE_COMMAND_ANYWHERE_PATTERNS) {
            if (pattern.test(command)) {
                return { safe: false, reason: 'Contains a disruptive action keyword' }
            }
        }
        if (!this.looksLikeCommand(command)) {
            return { safe: false, reason: 'Not in allowed command prefixes' }
        }
        return { safe: true }
    }

    private refreshAllowlistText (): void {
        const list = this.getAllowlistForVariant(this.networkForm.variant)
        this.allowlistText = list.join('\n')
    }

    private getAllowlistForVariant (variant: DeviceVariant): string[] {
        const stored = this.networkForm.allowlistByVariant?.[variant]
        if (stored && stored.length) {
            return stored
        }
        return SAFE_COMMAND_PREFIXES[variant] ?? []
    }

    private setAllowlistForVariant (variant: DeviceVariant, list: string[]): void {
        if (!this.networkForm.allowlistByVariant) {
            this.networkForm.allowlistByVariant = {}
        }
        if (!list.length) {
            delete this.networkForm.allowlistByVariant[variant]
            return
        }
        this.networkForm.allowlistByVariant[variant] = list
    }

    insertRunbook (pack: RunbookPack): void {
        const content = this.formatRunbookForChat(pack)
        this.draft = this.draft ? `${this.draft}\n\n${content}` : content
        if (this.draftInputRef?.nativeElement) {
            this.draftInputRef.nativeElement.value = this.draft
        }
    }

    async copyRunbook (pack: RunbookPack): Promise<void> {
        this.platform.setClipboard({ text: this.formatRunbookForClipboard(pack) })
        this.notifications.notice('Runbook copied to clipboard')
    }

    async runRunbookPack (pack: RunbookPack): Promise<void> {
        if (!this.networkForm.allowCommandRun) {
            this.notifications.error('Runbook execution is disabled')
            return
        }
        if (this.runningRunbookId) {
            this.notifications.notice('Another runbook is running')
            return
        }
        const terminal = this.getTerminalForRun()
        if (!terminal) {
            this.notifications.error('No terminal selected. Open a terminal tab or pick one in settings.')
            return
        }
        if (!terminal.session?.open) {
            this.notifications.error('Selected terminal is not connected')
            return
        }
        this.runningRunbookId = pack.id
        this.runbookOutputBuffer = ''
        this.runbookOutputTruncated = false
        this.addActivity('runbook', `Runbook started: ${pack.label}`, `Terminal: ${terminal.title || 'Terminal'}`)

        try {
            for (const command of pack.commands) {
                const response = await this.platform.showMessageBox({
                    type: 'warning',
                    message: `Run "${pack.label}" command?`,
                    detail: command,
                    buttons: ['Run', 'Skip', 'Cancel'],
                    defaultId: 0,
                    cancelId: 2,
                })
                if (response.response === 2) {
                    this.addActivity('info', `Runbook cancelled: ${pack.label}`, command)
                    this.notifications.notice('Runbook cancelled')
                    break
                }
                if (response.response === 1) {
                    this.addActivity('info', `Runbook skipped: ${command}`, pack.label)
                    continue
                }
                if (this.containsPlaceholder(command)) {
                    this.addActivity('info', `Runbook blocked (placeholder): ${command}`, pack.label)
                    this.notifications.error('Command contains placeholders, edit before running')
                    continue
                }
                terminal.sendInput(`${command}\r`)
                this.addActivity('command', `Runbook command: ${command}`, pack.label)
            }
        } finally {
            const output = this.runbookOutputBuffer.trim()
            if (output.length) {
                this.lastRunbookOutput = output
                this.lastRunbookLabel = pack.label
                this.lastRunbookAt = Date.now()
                if (this.networkForm.autoAppendRunbookOutput) {
                    this.appendMessage('user', this.formatRunbookOutputForChat(pack.label, output, this.runbookOutputTruncated))
                }
            }
            this.addActivity('runbook', `Runbook finished: ${pack.label}`)
            this.runningRunbookId = ''
        }
    }

    async runQuickAction (action: QuickAction): Promise<void> {
        if (this.containsPlaceholder(action.command)) {
            this.notifications.error('Command contains placeholders, edit before running')
            return
        }
        await this.runSuggestedCommand(action.command, true, `Quick action: ${action.label}`)
    }

    toggleQuickActionPinned (action: QuickAction): void {
        const ids = this.getPinnedActionIds(this.networkForm.variant)
        const next = ids.includes(action.id)
            ? ids.filter(id => id !== action.id)
            : [...ids, action.id]
        this.setPinnedActionIds(this.networkForm.variant, next)
        this.refreshPinnedQuickActions()
    }

    isQuickActionPinned (action: QuickAction): boolean {
        return this.getPinnedActionIds(this.networkForm.variant).includes(action.id)
    }

    async summarizeLastRun (): Promise<void> {
        if (this.sending) {
            this.notifications.notice('Wait for the current response to finish')
            return
        }
        if (!this.lastRunbookOutput.trim().length) {
            this.notifications.notice('No runbook output captured yet')
            return
        }
        const label = this.lastRunbookLabel || 'runbook'
        this.addActivity('summary', `Summarize runbook: ${label}`)
        const note = this.runbookOutputTruncated
            ? 'Note: output is truncated to the most recent data.'
            : ''
        const prompt = [
            `Summarize the last runbook output (${label}).`,
            'Focus on anomalies, likely root cause, and next steps.',
            note,
            '',
            this.lastRunbookOutput.trim(),
        ].filter(Boolean).join('\n')

        await this.sendPrompt(prompt)
    }

    async summarizeParsedFacts (): Promise<void> {
        if (this.sending) {
            this.notifications.notice('Wait for the current response to finish')
            return
        }
        if (!this.parsedSummary.trim().length) {
            this.notifications.notice('No parsed facts available yet')
            return
        }
        this.addActivity('summary', 'Summarize parsed facts')
        const prompt = [
            'Summarize the parsed network facts below.',
            'Highlight anomalies, risks, and recommended next checks.',
            '',
            this.parsedSummary.trim(),
        ].join('\n')
        await this.sendPrompt(prompt)
    }

    async summarizeSessionLog (): Promise<void> {
        if (this.sending || this.summarizingLog) {
            this.notifications.notice('Wait for the current response to finish')
            return
        }
        const logPath = this.activeSessionLogPath
        if (!this.activeTerminal || !logPath) {
            this.notifications.error('No session log found for the active terminal. Enable session logging and try again.')
            return
        }
        this.summarizingLog = true
        try {
            const { content, truncated, size } = await this.readSessionLogContent(logPath)
            const cleaned = this.stripAnsi(content).trim()
            if (!cleaned.length) {
                this.notifications.notice('Session log is empty')
                return
            }

            const note = truncated
                ? `Log truncated to the last ${this.formatBytes(SESSION_LOG_SUMMARY_MAX_BYTES)} of ${this.formatBytes(size)}.`
                : ''
            const prompt = [
                `Summarize the current session log (${path.basename(logPath)}).`,
                'Highlight key commands, errors, warnings, and recommended next steps. Keep it concise.',
                note,
                '',
                cleaned,
            ].filter(Boolean).join('\n')

            this.addActivity('summary', 'Summarize session log', path.basename(logPath))
            await this.sendPrompt(prompt)
        } catch (error) {
            const code = (error as { code?: string } | undefined)?.code
            const message = code === 'ENOENT'
                ? 'Session log file not found. Start logging and try again.'
                : 'Failed to read session log for summary'
            this.notifications.error(message)
        } finally {
            this.summarizingLog = false
        }
    }

    private formatRunbookForChat (pack: RunbookPack): string {
        const lines = pack.commands.map(command => `- ${command}`)
        const sections = [`Runbook: ${pack.label}`]
        if (pack.notes?.trim().length) {
            sections.push(pack.notes.trim())
        }
        sections.push(`Commands:\n${lines.join('\n')}`)
        return sections.join('\n\n')
    }

    private formatRunbookForClipboard (pack: RunbookPack): string {
        return pack.commands.join('\n')
    }

    private async readSessionLogContent (logPath: string): Promise<{ content: string, truncated: boolean, size: number }> {
        const stats = await fs.stat(logPath)
        if (!stats.isFile()) {
            throw new Error('Session log is not a file')
        }
        const size = stats.size
        if (size <= SESSION_LOG_SUMMARY_MAX_BYTES) {
            const content = await fs.readFile(logPath, 'utf-8')
            return { content, truncated: false, size }
        }

        const handle = await fs.open(logPath, 'r')
        try {
            const start = Math.max(0, size - SESSION_LOG_SUMMARY_MAX_BYTES)
            const length = Math.min(SESSION_LOG_SUMMARY_MAX_BYTES, size)
            const buffer = Buffer.alloc(length)
            const { bytesRead } = await handle.read(buffer, 0, length, start)
            const content = buffer.slice(0, bytesRead).toString('utf-8')
            return { content, truncated: true, size }
        } finally {
            await handle.close()
        }
    }

    private formatRunbookOutputForChat (label: string, output: string, truncated: boolean): string {
        const suffix = truncated ? '\n\n(Output truncated to most recent data.)' : ''
        return `Runbook output (${label}):\n${output}${suffix}`
    }

    private containsPlaceholder (command: string): boolean {
        return /<[^>]+>/.test(command)
    }

    private appendRunbookOutput (data: string): void {
        this.runbookOutputBuffer = `${this.runbookOutputBuffer}${data}`
        if (this.runbookOutputBuffer.length > RUNBOOK_OUTPUT_MAX_CHARS) {
            this.runbookOutputBuffer = this.runbookOutputBuffer.slice(-RUNBOOK_OUTPUT_MAX_CHARS)
            this.runbookOutputTruncated = true
        }
    }

    private queueCommandAnalysis (command: string): void {
        if (!this.networkForm.enabled || !this.networkForm.autoTroubleshootAfterCommand) {
            return
        }
        const startLineCount = this.terminalOutput.split(/\r?\n/).length
        this.pendingCommandAnalysis = {
            command,
            startLineCount,
            startedAt: Date.now(),
        }
        this.schedulePendingCommandAnalysis()
    }

    private schedulePendingCommandAnalysis (): void {
        if (!this.pendingCommandAnalysis) {
            return
        }
        if (this.commandAnalysisTimeout) {
            window.clearTimeout(this.commandAnalysisTimeout)
        }
        this.commandAnalysisTimeout = window.setTimeout(() => {
            this.commandAnalysisTimeout = undefined
            void this.runPendingCommandAnalysis()
        }, COMMAND_ANALYSIS_DEBOUNCE_MS)
    }

    private clearPendingCommandAnalysis (): void {
        if (this.commandAnalysisTimeout) {
            window.clearTimeout(this.commandAnalysisTimeout)
            this.commandAnalysisTimeout = undefined
        }
        this.pendingCommandAnalysis = undefined
    }

    private async runPendingCommandAnalysis (): Promise<void> {
        const pending = this.pendingCommandAnalysis
        if (!pending) {
            return
        }
        if (this.sending) {
            if (Date.now() - pending.startedAt < COMMAND_ANALYSIS_MAX_WAIT_MS) {
                this.schedulePendingCommandAnalysis()
            } else {
                this.clearPendingCommandAnalysis()
            }
            return
        }
        const output = this.getCommandOutputSince(pending.startLineCount)
        if (!output.trim().length && Date.now() - pending.startedAt < COMMAND_ANALYSIS_MAX_WAIT_MS) {
            this.schedulePendingCommandAnalysis()
            return
        }
        this.pendingCommandAnalysis = undefined
        if (!output.trim().length && !this.terminalOutput.trim().length) {
            return
        }
        this.addActivity('summary', `Analyze command output: ${pending.command}`)
        const prompt = this.buildCommandAnalysisPrompt(pending.command, output)
        await this.sendPrompt(prompt)
    }

    private getCommandOutputSince (startLineCount: number): string {
        const lines = this.terminalOutput.split(/\r?\n/)
        const safeStart = Math.min(startLineCount, lines.length)
        const recent = lines.slice(safeStart).join('\n').trim()
        if (!recent.length) {
            return ''
        }
        if (recent.length > COMMAND_OUTPUT_MAX_CHARS) {
            return recent.slice(-COMMAND_OUTPUT_MAX_CHARS)
        }
        return recent
    }

    private buildCommandAnalysisPrompt (command: string, output: string): string {
        const lines = [
            `Analyze the latest output from: ${command}.`,
            'Call out likely root cause, evidence, and next steps.',
        ]
        if (output.trim().length) {
            lines.push('', 'Command output:', output.trim())
        } else {
            lines.push('', 'No command-specific output captured. Use recent terminal context instead.')
        }
        return lines.join('\n')
    }

    toggleRedactionPreview (): void {
        this.redactionPreviewVisible = !this.redactionPreviewVisible
        if (this.redactionPreviewVisible) {
            this.updateRedactionPreview()
        }
    }

    updateRedactionPreview (): void {
        const base = this.buildEffectiveSystemPrompt(this.profileForm.systemPrompt)
        if (!this.networkForm.redactSensitiveData) {
            this.redactionPreview = base
            return
        }
        const redactor = this.getRedactor(this.getEffectiveSettings())
        this.redactionPreview = redactor ? redactor(base) : base
    }

    private async sendPrompt (prompt: string): Promise<void> {
        this.clearPendingCommandAnalysis()
        this.appendMessage('user', prompt)
        this.suggestedCommands = []
        this.sending = true
        this.scrollToBottom()

        try {
            if (await this.handleLocalDisconnectRequest(prompt)) {
                return
            }
            if (await this.handleLocalConnectionRequest(prompt)) {
                return
            }
            const response = await this.requestCompletion()
            if (response) {
                this.appendMessage('assistant', response)
            }
        } finally {
            this.sending = false
            this.scrollToBottom()
        }
    }

    private async handleLocalConnectionRequest (prompt: string): Promise<boolean> {
        const protocol = this.getConnectionProtocol(prompt)
        if (!protocol) {
            return false
        }

        const credentials = protocol === 'ssh' ? this.parseSshCredentials(prompt) : {}
        const groupTarget = this.parseGroupTarget(prompt)
        if (groupTarget) {
            if (this.isReconnectIntent(prompt)) {
                return this.reconnectConnectionsByGroup(groupTarget, protocol)
            }
            return this.handleGroupConnectionRequest(groupTarget, protocol)
        }

        const hostTargets = this.parseHostTargets(prompt, protocol)
        const normalizedTargets = this.normalizeOpenTargets(hostTargets)
        if (this.isReconnectIntent(prompt) && normalizedTargets.directTargets.length) {
            return this.reconnectOrOpenHostConnections(protocol, normalizedTargets.directTargets, credentials)
        }
        if (normalizedTargets.patternTargets.length) {
            await this.openConnectionsByPattern(protocol, normalizedTargets.patternTargets)
            if (!normalizedTargets.directTargets.length && !credentials.user && !credentials.password) {
                return true
            }
        }

        let targetName = normalizedTargets.directTargets.length ? null : await this.extractTargetWithLocalLlm(prompt)
        if (targetName && this.isGroupPhrasePrompt(prompt)) {
            targetName = this.normalizeGroupTarget(targetName)
        }
        if (!normalizedTargets.directTargets.length && !targetName) {
            if (this.isReconnectIntent(prompt)) {
                if (this.activeTerminal?.profile?.type === protocol) {
                    return this.reconnectTerminalTabs([this.activeTerminal], protocol)
                }
                this.appendMessage('assistant', `Tell me which ${protocol.toUpperCase()} connection to reconnect. Example: "reconnect ssh connection to xai-qfx5240-01".`)
                return true
            }
            this.appendMessage('assistant', 'Tell me which group or profile to open. Example: "open ssh connection for device in group/profile FA_UNIT".')
            return true
        }

        if (normalizedTargets.directTargets.length || credentials.user || credentials.password) {
            const targets = normalizedTargets.directTargets.length ? normalizedTargets.directTargets : this.splitTargets(targetName ?? '')
            if (this.isReconnectIntent(prompt)) {
                return this.reconnectOrOpenHostConnections(protocol, targets, credentials)
            }
            return this.handleDirectHostConnections(protocol, targets, credentials)
        }

        const targetPattern = targetName ? this.extractPatternTargetFromPhrase(targetName) : null
        if (targetPattern) {
            if (this.isReconnectIntent(prompt)) {
                return this.reconnectConnectionsByTargets(protocol, [targetPattern])
            }
            await this.openConnectionsByPattern(protocol, [targetPattern])
            return true
        }

        const profiles = await this.resolveProfilesForTarget(targetName ?? '')
        const matchingProfiles = profiles.filter(profile => profile.type === protocol)
        if (matchingProfiles.length) {
            if (this.isReconnectIntent(prompt)) {
                return this.reconnectConnectionsByProfiles(matchingProfiles, protocol, targetName ?? undefined)
            }
            return this.handleGroupConnectionRequest(targetName ?? '', protocol, matchingProfiles)
        }

        if (this.isReconnectIntent(prompt) && targetName) {
            return this.reconnectConnectionsByTargets(protocol, this.splitTargets(targetName))
        }
        return this.handleDirectHostConnections(protocol, this.splitTargets(targetName ?? ''), credentials)
    }

    private async handleLocalDisconnectRequest (prompt: string): Promise<boolean> {
        const protocol = this.getDisconnectProtocol(prompt)
        if (!protocol) {
            return false
        }

        const groupTarget = this.parseGroupTarget(prompt)
        if (groupTarget) {
            return this.disconnectConnectionsByGroup(groupTarget, protocol)
        }

        const hostTargets = this.parseDisconnectTargets(prompt, protocol)
        let targetName = hostTargets.length ? null : await this.extractTargetWithLocalLlm(prompt)
        if (targetName && this.isGroupPhrasePrompt(prompt)) {
            const normalized = this.normalizeGroupTarget(targetName)
            if (normalized) {
                return this.disconnectConnectionsByGroup(normalized, protocol)
            }
        }

        if (!hostTargets.length && !targetName) {
            if (this.isDisconnectAllPrompt(prompt)) {
                return this.disconnectAllConnections(protocol)
            }
            if (this.activeTerminal?.profile?.type === protocol) {
                return this.disconnectTerminalTabs([this.activeTerminal], protocol)
            }
            this.appendMessage('assistant', `Tell me which ${protocol.toUpperCase()} connection to close. Example: "close ssh connection to xai-qfx5240-01" or "close all ssh connections".`)
            return true
        }

        if (targetName && !hostTargets.length) {
            const profiles = await this.resolveProfilesForTarget(targetName)
            const matchingProfiles = profiles.filter(profile => profile.type === protocol)
            if (matchingProfiles.length) {
                return this.disconnectConnectionsByProfiles(matchingProfiles, protocol, targetName)
            }
        }

        const targets = hostTargets.length ? hostTargets : this.splitTargets(targetName ?? '')
        if (this.isDisconnectAllPrompt(prompt) || targets.some(target => ['*', 'all', 'everything'].includes(target.toLowerCase()))) {
            return this.disconnectAllConnections(protocol)
        }
        return this.disconnectConnectionsByTargets(protocol, targets)
    }

    private async handleGroupConnectionRequest (targetName: string, protocol: ConnectionProtocol, profilesOverride?: PartialProfile<Profile>[]): Promise<boolean> {
        const profiles = profilesOverride ?? (await this.resolveProfilesForTarget(targetName)).filter(profile => profile.type === protocol)
        if (!profiles.length) {
            const message = `No ${protocol.toUpperCase()} profiles found for "${targetName}".`
            this.appendMessage('error', message)
            this.notifications.error(message)
            return true
        }

        const { openTabs, closedProfiles } = this.partitionProfilesByOpenTabs(profiles, protocol)
        if (openTabs.length) {
            this.appendMessage('assistant', `Already connected: ${this.formatTabNames(openTabs)}`)
        }
        if (!closedProfiles.length) {
            return true
        }

        const openedList = closedProfiles.map(profile => profile.name).join(', ')
        const openingMessage = `Opening ${protocol.toUpperCase()} connection${closedProfiles.length === 1 ? '' : 's'}: ${openedList}`

        if (protocol !== 'ssh') {
            const detailLines = closedProfiles.slice(0, 10).map(profile => `- ${profile.name}`)
            if (closedProfiles.length > 10) {
                detailLines.push(`...and ${closedProfiles.length - 10} more`)
            }
            const response = await this.platform.showMessageBox({
                type: 'warning',
                message: closedProfiles.length === 1
                    ? `Open ${protocol.toUpperCase()} connection for "${closedProfiles[0].name}"?`
                    : `Open ${closedProfiles.length} ${protocol.toUpperCase()} connections for "${targetName}"?`,
                detail: detailLines.join('\n'),
                buttons: ['Open', 'Cancel'],
                defaultId: 0,
                cancelId: 1,
            })
            if (response.response !== 0) {
                this.appendMessage('assistant', `${protocol.toUpperCase()} connection request cancelled.`)
                return true
            }
        } else {
            this.appendMessage('assistant', openingMessage)
            await this.waitForAssistantResponseRender()
        }

        for (const profile of closedProfiles) {
            await this.profilesService.launchProfile(profile)
            if (protocol === 'ssh') {
                this.restoreChatFocus()
            }
        }

        if (protocol !== 'ssh') {
            this.appendMessage('assistant', openingMessage)
        }
        return true
    }

    private async handleDirectHostConnections (protocol: ConnectionProtocol, targets: string[], credentials: ParsedSshCredentials): Promise<boolean> {
        const parsedTargets = targets
            .map(target => this.parseHostToken(target))
            .filter((target): target is ParsedSshHost => !!target)

        if (!parsedTargets.length) {
            const message = `Could not parse ${protocol.toUpperCase()} targets.`
            this.appendMessage('error', message)
            this.notifications.error(message)
            return true
        }

        const { existingTabs, missingTargets } = this.partitionTargetsByExistingTabs(protocol, parsedTargets, credentials)
        if (existingTabs.length) {
            this.appendMessage('assistant', `Already connected: ${this.formatTabNames(existingTabs)}`)
        }
        if (!missingTargets.length) {
            return true
        }

        if (protocol === 'ssh' && credentials.password && !credentials.user && parsedTargets.some(target => !target.user)) {
            const message = 'Password provided but no username found. Please include a username.'
            this.appendMessage('error', message)
            this.notifications.error(message)
            return true
        }

        if (protocol !== 'ssh') {
            const detailLines = parsedTargets.slice(0, 10).map(target => {
                const port = credentials.port ?? target.port ?? 23
                return `- ${target.host}:${port}`
            })
            if (parsedTargets.length > 10) {
                detailLines.push(`...and ${parsedTargets.length - 10} more`)
            }
            const credentialNote = credentials.user || credentials.password
                ? 'Credentials: provided (ignored for Telnet)'
                : 'Credentials: not provided'
            detailLines.push(credentialNote)

            const response = await this.platform.showMessageBox({
                type: 'warning',
                message: parsedTargets.length === 1
                    ? `Open ${protocol.toUpperCase()} connection to "${parsedTargets[0].host}"?`
                    : `Open ${parsedTargets.length} ${protocol.toUpperCase()} connections?`,
                detail: detailLines.join('\n'),
                buttons: ['Open', 'Cancel'],
                defaultId: 0,
                cancelId: 1,
            })
            if (response.response !== 0) {
                this.appendMessage('assistant', `${protocol.toUpperCase()} connection request cancelled.`)
                return true
            }
        } else {
            const openingMessage = `Opening ${protocol.toUpperCase()} connection${missingTargets.length === 1 ? '' : 's'}: ${missingTargets.map(target => target.host).join(', ')}`
            this.appendMessage('assistant', openingMessage)
            await this.waitForAssistantResponseRender()
        }

        const openedNames: string[] = []
        for (const target of missingTargets) {
            const user = credentials.user ?? target.user
            const port = credentials.port ?? target.port
            const profile = protocol === 'ssh'
                ? this.buildDirectSshProfile(target.host, user, port)
                : this.buildDirectTelnetProfile(target.host, port)

            if (protocol === 'ssh' && credentials.password) {
                const fullProfile = this.profilesService.getConfigProxyForProfile<SSHProfile>(profile)
                await this.passwordStorage.savePassword(fullProfile, credentials.password, user)
            }

            await this.profilesService.launchProfile(profile)
            if (protocol === 'ssh') {
                this.restoreChatFocus()
            }
            openedNames.push(profile.name ?? target.host)
        }

        if (protocol !== 'ssh') {
            this.appendMessage('assistant', `Opening ${protocol.toUpperCase()} connection${openedNames.length === 1 ? '' : 's'}: ${openedNames.join(', ')}`)
        }
        return true
    }

    private async disconnectConnectionsByGroup (targetName: string, protocol: ConnectionProtocol): Promise<boolean> {
        const profiles = (await this.resolveProfilesForTarget(targetName)).filter(profile => profile.type === protocol)
        if (!profiles.length) {
            const message = `No ${protocol.toUpperCase()} profiles found for "${targetName}".`
            this.appendMessage('error', message)
            this.notifications.error(message)
            return true
        }
        return this.disconnectConnectionsByProfiles(profiles, protocol, targetName)
    }

    private async reconnectConnectionsByGroup (targetName: string, protocol: ConnectionProtocol): Promise<boolean> {
        const profiles = (await this.resolveProfilesForTarget(targetName)).filter(profile => profile.type === protocol)
        if (!profiles.length) {
            const message = `No ${protocol.toUpperCase()} profiles found for "${targetName}".`
            this.appendMessage('error', message)
            this.notifications.error(message)
            return true
        }
        return this.reconnectConnectionsByProfiles(profiles, protocol, targetName)
    }

    private async disconnectConnectionsByProfiles (profiles: PartialProfile<Profile>[], protocol: ConnectionProtocol, targetName?: string): Promise<boolean> {
        const tabs = this.getTerminalTabsByProtocol(protocol)
        const matches = tabs.filter(tab => profiles.some(profile => this.isProfileMatch(tab.profile, profile)))
        if (!matches.length) {
            const message = `No active ${protocol.toUpperCase()} connections found for "${targetName ?? 'selected profiles'}".`
            this.appendMessage('assistant', message)
            return true
        }
        return this.disconnectTerminalTabs(matches, protocol)
    }

    private async reconnectConnectionsByProfiles (profiles: PartialProfile<Profile>[], protocol: ConnectionProtocol, targetName?: string): Promise<boolean> {
        const { openTabs, closedProfiles } = this.partitionProfilesByOpenTabs(profiles, protocol)
        if (openTabs.length) {
            await this.reconnectTerminalTabs(openTabs, protocol)
        }
        if (closedProfiles.length) {
            await this.handleGroupConnectionRequest(targetName ?? 'selected profiles', protocol, closedProfiles)
        } else if (!openTabs.length) {
            const message = `No active ${protocol.toUpperCase()} connections found for "${targetName ?? 'selected profiles'}".`
            this.appendMessage('assistant', message)
        }
        return true
    }

    private async disconnectConnectionsByTargets (protocol: ConnectionProtocol, targets: string[]): Promise<boolean> {
        const normalizedTargets = targets
            .map(target => this.normalizeCloseTarget(target))
            .filter((target): target is string => !!target)
        if (!normalizedTargets.length) {
            const message = `Could not parse ${protocol.toUpperCase()} targets to close.`
            this.appendMessage('error', message)
            this.notifications.error(message)
            return true
        }

        const matchers = normalizedTargets.map(target => this.buildTargetMatcher(target))
        const tabs = this.getTerminalTabsByProtocol(protocol)
        const matches = tabs.filter(tab => this.tabMatchesTargets(tab, matchers))
        if (!matches.length) {
            const message = `No active ${protocol.toUpperCase()} connections matched: ${normalizedTargets.join(', ')}.`
            this.appendMessage('assistant', message)
            return true
        }
        return this.disconnectTerminalTabs(matches, protocol)
    }

    private async reconnectConnectionsByTargets (protocol: ConnectionProtocol, targets: string[]): Promise<boolean> {
        const normalizedTargets = targets
            .map(target => this.normalizeCloseTarget(target))
            .filter((target): target is string => !!target)
        if (!normalizedTargets.length) {
            const message = `Could not parse ${protocol.toUpperCase()} targets to reconnect.`
            this.appendMessage('error', message)
            this.notifications.error(message)
            return true
        }

        const matchers = normalizedTargets.map(target => this.buildTargetMatcher(target))
        const tabs = this.getTerminalTabsByProtocol(protocol)
        const matches = tabs.filter(tab => this.tabMatchesTargets(tab, matchers))
        if (!matches.length) {
            const message = `No active ${protocol.toUpperCase()} connections matched: ${normalizedTargets.join(', ')}.`
            this.appendMessage('assistant', message)
            return true
        }
        return this.reconnectTerminalTabs(matches, protocol)
    }

    private async reconnectOrOpenHostConnections (protocol: ConnectionProtocol, targets: string[], credentials: ParsedSshCredentials): Promise<boolean> {
        const parsedTargets = targets
            .map(target => this.parseHostToken(target))
            .filter((target): target is ParsedSshHost => !!target)
        if (!parsedTargets.length) {
            const message = `Could not parse ${protocol.toUpperCase()} targets.`
            this.appendMessage('error', message)
            this.notifications.error(message)
            return true
        }

        const { existingTabs, missingTargets } = this.partitionTargetsByExistingTabs(protocol, parsedTargets, credentials)
        if (existingTabs.length) {
            await this.reconnectTerminalTabs(existingTabs, protocol)
        }
        if (missingTargets.length) {
            const targetQueries = missingTargets.map(target => {
                const user = credentials.user ?? target.user
                const port = credentials.port ?? target.port
                return protocol === 'ssh'
                    ? this.buildQuickConnectQuery(target.host, user, port)
                    : (port ? `${target.host}:${port}` : target.host)
            })
            await this.handleDirectHostConnections(protocol, targetQueries, credentials)
        } else if (!existingTabs.length) {
            const message = `No active ${protocol.toUpperCase()} connections matched: ${parsedTargets.map(target => target.host).join(', ')}.`
            this.appendMessage('assistant', message)
        }
        return true
    }

    private async openConnectionsByPattern (protocol: ConnectionProtocol, targets: string[]): Promise<void> {
        const matchers = targets
            .map(target => this.extractPatternTargetFromPhrase(target) ?? target)
            .map(target => this.buildTargetMatcher(target))
        const profiles = await this.profilesService.getProfiles({ includeBuiltin: true, clone: true })
        const matchedProfiles = profiles
            .filter(profile => profile.type === protocol)
            .filter(profile => this.profileMatchesTargets(profile, matchers))

        if (!matchedProfiles.length) {
            const message = `No ${protocol.toUpperCase()} profiles matched: ${targets.join(', ')}.`
            this.appendMessage('assistant', message)
            return
        }

        const uniqueProfiles = this.dedupeProfiles(matchedProfiles)
        const { openTabs, closedProfiles } = this.partitionProfilesByOpenTabs(uniqueProfiles, protocol)
        if (openTabs.length) {
            this.appendMessage('assistant', `Already connected: ${this.formatTabNames(openTabs)}`)
        }
        if (!closedProfiles.length) {
            return
        }

        const openedList = closedProfiles.map(profile => profile.name).join(', ')
        const openingMessage = `Opening ${protocol.toUpperCase()} connection${closedProfiles.length === 1 ? '' : 's'}: ${openedList}`

        if (protocol !== 'ssh') {
            const detailLines = closedProfiles.slice(0, 10).map(profile => `- ${profile.name}`)
            if (closedProfiles.length > 10) {
                detailLines.push(`...and ${closedProfiles.length - 10} more`)
            }
            const response = await this.platform.showMessageBox({
                type: 'warning',
                message: closedProfiles.length === 1
                    ? `Open ${protocol.toUpperCase()} connection for "${closedProfiles[0].name}"?`
                    : `Open ${closedProfiles.length} ${protocol.toUpperCase()} connections?`,
                detail: detailLines.join('\n'),
                buttons: ['Open', 'Cancel'],
                defaultId: 0,
                cancelId: 1,
            })
            if (response.response !== 0) {
                this.appendMessage('assistant', `${protocol.toUpperCase()} connection request cancelled.`)
                return
            }
        } else {
            this.appendMessage('assistant', openingMessage)
            await this.waitForAssistantResponseRender()
        }

        for (const profile of closedProfiles) {
            await this.profilesService.launchProfile(profile)
            if (protocol === 'ssh') {
                this.restoreChatFocus()
            }
        }

        if (protocol !== 'ssh') {
            this.appendMessage('assistant', openingMessage)
        }
    }

    private profileMatchesTargets (profile: PartialProfile<Profile>, matchers: Array<(value: string) => boolean>): boolean {
        const candidates = this.getProfileCandidates(profile)
        return candidates.some(candidate => matchers.some(match => match(candidate)))
    }

    private getProfileCandidates (profile: PartialProfile<Profile>): string[] {
        const candidates = new Set<string>()
        if (profile.name) {
            candidates.add(profile.name)
        }
        if (profile.id) {
            candidates.add(profile.id)
        }
        if (profile.options?.host) {
            candidates.add(profile.options.host)
        }
        if (profile.group) {
            candidates.add(profile.group)
        }
        return Array.from(candidates).filter(Boolean)
    }

    private dedupeProfiles (profiles: PartialProfile<Profile>[]): PartialProfile<Profile>[] {
        const seen = new Set<string>()
        const deduped: PartialProfile<Profile>[] = []
        for (const profile of profiles) {
            const key = profile.id || `${profile.type}:${profile.name}:${profile.group ?? ''}`
            if (seen.has(key)) {
                continue
            }
            seen.add(key)
            deduped.push(profile)
        }
        return deduped
    }

    private async disconnectAllConnections (protocol: ConnectionProtocol): Promise<boolean> {
        const tabs = this.getTerminalTabsByProtocol(protocol)
        if (!tabs.length) {
            this.appendMessage('assistant', `No active ${protocol.toUpperCase()} connections to close.`)
            return true
        }
        return this.disconnectTerminalTabs(tabs, protocol)
    }

    private async disconnectTerminalTabs (tabs: BaseTerminalTabComponent<any>[], protocol: ConnectionProtocol): Promise<boolean> {
        const closingLabel = this.formatTabNames(tabs)
        this.appendMessage('assistant', `Closing ${protocol.toUpperCase()} connection${tabs.length === 1 ? '' : 's'}: ${closingLabel}`)
        await this.waitForAssistantResponseRender()

        for (const tab of tabs) {
            await this.disconnectTerminalTab(tab)
            if (protocol === 'ssh') {
                this.restoreChatFocus()
            }
        }
        return true
    }

    private async disconnectTerminalTab (tab: BaseTerminalTabComponent<any>): Promise<void> {
        const disconnect = (tab as { disconnect?: () => Promise<void> }).disconnect
        if (typeof disconnect === 'function') {
            await disconnect.call(tab)
            return
        }
        tab.destroy()
    }

    private async reconnectTerminalTabs (tabs: BaseTerminalTabComponent<any>[], protocol: ConnectionProtocol): Promise<boolean> {
        const reconnectLabel = this.formatTabNames(tabs)
        this.appendMessage('assistant', `Reconnecting ${protocol.toUpperCase()} connection${tabs.length === 1 ? '' : 's'}: ${reconnectLabel}`)
        await this.waitForAssistantResponseRender()

        for (const tab of tabs) {
            await this.reconnectTerminalTab(tab)
            if (protocol === 'ssh') {
                this.restoreChatFocus()
            }
        }
        return true
    }

    private async reconnectTerminalTab (tab: BaseTerminalTabComponent<any>): Promise<void> {
        const reconnect = (tab as { reconnect?: () => Promise<void> }).reconnect
        if (typeof reconnect === 'function') {
            await reconnect.call(tab)
            return
        }
        const profile = tab.profile as PartialProfile<Profile>
        await this.disconnectTerminalTab(tab)
        await this.profilesService.launchProfile(profile)
    }

    private getTerminalTabsByProtocol (protocol: ConnectionProtocol): BaseTerminalTabComponent<any>[] {
        return this.getAllTabs()
            .filter(tab => tab instanceof BaseTerminalTabComponent)
            .filter(tab => (tab as BaseTerminalTabComponent<any>).profile?.type === protocol) as BaseTerminalTabComponent<any>[]
    }

    private partitionProfilesByOpenTabs (profiles: PartialProfile<Profile>[], protocol: ConnectionProtocol): { openTabs: BaseTerminalTabComponent<any>[], closedProfiles: PartialProfile<Profile>[] } {
        const tabs = this.getTerminalTabsByProtocol(protocol)
        const openTabs: BaseTerminalTabComponent<any>[] = []
        const closedProfiles: PartialProfile<Profile>[] = []
        for (const profile of profiles) {
            const match = tabs.find(tab => this.isProfileMatch(tab.profile, profile))
            if (match) {
                if (!openTabs.includes(match)) {
                    openTabs.push(match)
                }
            } else {
                closedProfiles.push(profile)
            }
        }
        return { openTabs, closedProfiles }
    }

    private partitionTargetsByExistingTabs (protocol: ConnectionProtocol, targets: ParsedSshHost[], credentials: ParsedSshCredentials): { existingTabs: BaseTerminalTabComponent<any>[], missingTargets: ParsedSshHost[] } {
        const tabs = this.getTerminalTabsByProtocol(protocol)
        const existingTabs: BaseTerminalTabComponent<any>[] = []
        const missingTargets: ParsedSshHost[] = []
        for (const target of targets) {
            const match = tabs.find(tab => this.tabMatchesHost(tab, target, credentials))
            if (match) {
                if (!existingTabs.includes(match)) {
                    existingTabs.push(match)
                }
            } else {
                missingTargets.push(target)
            }
        }
        return { existingTabs, missingTargets }
    }

    private tabMatchesHost (tab: BaseTerminalTabComponent<any>, target: ParsedSshHost, credentials: ParsedSshCredentials): boolean {
        const profile = tab.profile as PartialProfile<Profile>
        const host = (profile.options?.host ?? '').toLowerCase()
        if (!host || host !== target.host.toLowerCase()) {
            return false
        }
        const expectedPort = credentials.port ?? target.port
        if (expectedPort && profile.options?.port && profile.options.port !== expectedPort) {
            return false
        }
        const expectedUser = credentials.user ?? target.user
        if (expectedUser && profile.options?.user && profile.options.user !== expectedUser) {
            return false
        }
        return true
    }

    private isProfileMatch (tabProfile: PartialProfile<Profile>, profile: PartialProfile<Profile>): boolean {
        if (tabProfile.id && profile.id && tabProfile.id === profile.id) {
            return true
        }
        if (tabProfile.name && profile.name && tabProfile.name === profile.name) {
            return true
        }
        if (tabProfile.group && profile.group && tabProfile.group === profile.group) {
            return true
        }
        const tabHost = tabProfile.options?.host
        const profileHost = profile.options?.host
        if (tabHost && profileHost && tabHost === profileHost) {
            return true
        }
        return false
    }

    private formatTabNames (tabs: BaseTerminalTabComponent<any>[]): string {
        const names = tabs.map(tab => {
            const profile = tab.profile as PartialProfile<Profile> | undefined
            return profile?.name || profile?.options?.host || tab.title || 'Session'
        })
        const limited = names.slice(0, 10)
        if (names.length > 10) {
            limited.push(`...and ${names.length - 10} more`)
        }
        return limited.join(', ')
    }

    private normalizeCloseTarget (value: string): string | null {
        const cleaned = this.cleanConnectionTarget(value) ?? ''
        if (!cleaned) {
            return null
        }
        const parsed = this.parseHostToken(cleaned)
        return parsed?.host ?? cleaned
    }

    private normalizeOpenTargets (targets: string[]): { directTargets: string[], patternTargets: string[] } {
        const directTargets: string[] = []
        const patternTargets: string[] = []
        for (const target of targets) {
            const pattern = this.extractPatternTargetFromPhrase(target)
            if (pattern) {
                patternTargets.push(pattern)
                continue
            }
            if (this.isPatternTarget(target)) {
                patternTargets.push(target)
                continue
            }
            directTargets.push(target)
        }
        return { directTargets, patternTargets }
    }

    private extractPatternTargetFromPhrase (value: string): string | null {
        const cleaned = this.cleanConnectionTarget(value ?? '')
        if (!cleaned) {
            return null
        }
        if (this.isPatternTarget(cleaned)) {
            return cleaned
        }

        const regexMatch = cleaned.match(/(?:regex|regexp|pattern|matches|matching)\s+(?<pattern>\/.+\/[a-z]*)/i)
        if (regexMatch?.groups?.pattern) {
            return regexMatch.groups.pattern.trim()
        }

        const startsMatch = cleaned.match(/(?:starts with|starting with|begins with|prefix(?: is)?)\s+(?<value>.+)$/i)
        if (startsMatch?.groups?.value) {
            const token = this.cleanConnectionTarget(startsMatch.groups.value)
            return token ? `${token}*` : null
        }

        const endsMatch = cleaned.match(/(?:ends with|ending with|finishes with|suffix(?: is)?)\s+(?<value>.+)$/i)
        if (endsMatch?.groups?.value) {
            const token = this.cleanConnectionTarget(endsMatch.groups.value)
            return token ? `*${token}` : null
        }

        const containsMatch = cleaned.match(/(?:contains|containing|includes|including|with string)\s+(?<value>.+)$/i)
        if (containsMatch?.groups?.value) {
            const token = this.cleanConnectionTarget(containsMatch.groups.value)
            return token ? `*${token}*` : null
        }

        return null
    }

    private isPatternTarget (value: string): boolean {
        return value.includes('*') || value.includes('?') || !!this.parseRegexLiteral(value)
    }

    private buildTargetMatcher (target: string): (value: string) => boolean {
        const regex = this.parseRegexLiteral(target)
        if (regex) {
            return value => regex.test(value)
        }
        if (target.includes('*') || target.includes('?')) {
            const escaped = target.replace(/[.+^${}()|[\]\\]/g, '\\$&')
            const pattern = `^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`
            const wildcard = new RegExp(pattern, 'i')
            return value => wildcard.test(value)
        }
        const normalized = target.toLowerCase()
        return value => value.toLowerCase() === normalized
    }

    private parseRegexLiteral (value: string): RegExp | null {
        if (!value.startsWith('/') || value.length < 2) {
            return null
        }
        const lastSlash = value.lastIndexOf('/')
        if (lastSlash <= 0) {
            return null
        }
        const pattern = value.slice(1, lastSlash)
        const rawFlags = value.slice(lastSlash + 1) || 'i'
        const flags = rawFlags.replace('g', '') || 'i'
        try {
            return new RegExp(pattern, flags)
        } catch {
            return null
        }
    }

    private tabMatchesTargets (tab: BaseTerminalTabComponent<any>, matchers: Array<(value: string) => boolean>): boolean {
        const candidates = this.getTabCandidates(tab)
        return candidates.some(candidate => matchers.some(match => match(candidate)))
    }

    private getTabCandidates (tab: BaseTerminalTabComponent<any>): string[] {
        const profile = tab.profile as PartialProfile<Profile> | undefined
        const candidates = new Set<string>()
        if (profile?.name) {
            candidates.add(profile.name)
        }
        if (profile?.id) {
            candidates.add(profile.id)
        }
        if (profile?.options?.host) {
            candidates.add(profile.options.host)
        }
        if (profile?.group) {
            candidates.add(profile.group)
        }
        if (tab.title) {
            candidates.add(tab.title)
        }
        return Array.from(candidates).filter(Boolean)
    }

    private parseGroupTarget (prompt: string): string | null {
        const patterns = [
            /all\s+devices?\s+(?:in|under)\s+(?<target>.+?)\s+profile\s+group\b/i,
            /(?:in|under)\s+(?<target>.+?)\s+profile\s+group\b/i,
            /(?<target>.+?)\s+profile\s+group\b/i,
            /all\s+devices?\s+(?:in|under)\s+(?:profile\s+group|group|profile)\s*[:=]?\s+(?<target>.+)$/i,
            /profile\s+group\s*[:=]?\s+(?<target>.+)$/i,
            /device\s+in\s+(?:group\/profile|group|profile)\s*[:=]?\s+(?<target>.+)$/i,
            /for\s+(?:device\s+in\s+)?(?:group\/profile|group|profile)\s*[:=]?\s+(?<target>.+)$/i,
            /(?:group\/profile|group|profile(?!\s+group))\s*[:=]?\s+(?<target>.+)$/i,
        ]

        for (const pattern of patterns) {
            const match = prompt.match(pattern)
            if (!match) {
                continue
            }
            const raw = match.groups?.target ?? match[1]
            const cleaned = this.normalizeGroupTarget(raw)
            if (cleaned) {
                return cleaned
            }
        }

        return null
    }

    private parseDisconnectTargets (prompt: string, protocol: ConnectionProtocol): string[] {
        const action = '(?:close|disconnect|terminate|end|kill|stop)'
        const protocolToken = protocol === 'telnet' ? 'telnet' : 'ssh'
        const patterns = [
            new RegExp(`${action}\\s+(?:all\\s+)?${protocolToken}\\s+(?:connections?|sessions?|tabs?)\\s+(?:to|for|with)\\s+(?<target>.+)$`, 'i'),
            new RegExp(`${action}\\s+${protocolToken}\\s+(?:connections?|sessions?|tabs?)\\s+(?:to|for|with)\\s+(?<target>.+)$`, 'i'),
            new RegExp(`${action}\\s+${protocolToken}\\s+(?:to|from|for|with)\\s+(?<target>.+)$`, 'i'),
            new RegExp(`${action}\\s+(?:${protocolToken}\\s+)?(?:connection|session|tab)\\s+(?:to|for|with)\\s+(?<target>.+)$`, 'i'),
            new RegExp(`${action}\\s+${protocolToken}\\s+(?<target>.+)$`, 'i'),
            new RegExp(`${action}\\s+(?<target>.+)$`, 'i'),
        ]

        for (const pattern of patterns) {
            const match = prompt.match(pattern)
            if (!match) {
                continue
            }
            const raw = match.groups?.target ?? match[1]
            const cleaned = this.stripCredentialSuffix(this.cleanConnectionTarget(raw) ?? '')
            const patternTarget = this.extractPatternTargetFromPhrase(cleaned) ?? cleaned
            if (!patternTarget
                || this.isDisconnectAllPrompt(cleaned)
                || /^(?:connection|connections|session|sessions|tab|tabs)$/i.test(patternTarget)
                || /^(?:ssh|telnet)\s*(?:connection|connections|session|sessions|tab|tabs)?$/i.test(patternTarget)) {
                return []
            }
            return this.splitTargets(patternTarget)
        }

        return []
    }

    private normalizeGroupTarget (value: string | null | undefined): string | null {
        const cleaned = this.cleanConnectionTarget(value ?? '')
        if (!cleaned) {
            return null
        }
        let target = cleaned
            .replace(/^profile\s+group\s*/i, '')
            .replace(/\s+profile\s+group$/i, '')
            .replace(/^group\s*/i, '')
            .replace(/\s+group$/i, '')
            .trim()
        if (!target) {
            return null
        }
        if (/^(group|profile|profile\s+group|all|devices?)$/i.test(target)) {
            return null
        }
        return target
    }

    private isGroupPhrasePrompt (prompt: string): boolean {
        return /\bprofile\s+group\b/i.test(prompt) || /\bgroup\b/i.test(prompt)
    }

    private parseHostTargets (prompt: string, protocol: ConnectionProtocol): string[] {
        const patterns = protocol === 'telnet'
            ? [
                /open\s+telnet\s+connection\s+(?:with|to)\s+(?<target>.+)$/i,
                /open\s+telnet\s+session\s+(?:with|to)\s+(?<target>.+)$/i,
                /\btelnet\s+(?<target>.+)$/i,
            ]
            : [
                /open\s+(?:an?\s+)?ssh\s+connection\s+(?:with|to)\s+(?<target>.+)$/i,
                /open\s+(?:an?\s+)?ssh\s+session\s+(?:with|to)\s+(?<target>.+)$/i,
                /open\s+(?:an?\s+)?ssh\s+connections?\s+(?<target>.+)$/i,
                /\bssh\s+(?:to|into)\s+(?<target>.+)$/i,
                /\bssh\s+connections?\s+(?<target>.+)$/i,
                /\bssh\s+(?<target>.+)$/i,
            ]

        const sharedPatterns = [
            /\bconnect\s+to\s+(?<target>.+)$/i,
            /for\s+device\s+(?<target>.+)$/i,
            /\bdevice\s+(?<target>.+)$/i,
        ]

        for (const pattern of [...patterns, ...sharedPatterns]) {
            const match = prompt.match(pattern)
            if (!match) {
                continue
            }
            const raw = match.groups?.target ?? match[1]
            const cleaned = this.stripCredentialSuffix(this.cleanConnectionTarget(raw) ?? '')
            return this.splitTargets(cleaned)
        }

        return []
    }

    private parseSshCredentials (prompt: string): ParsedSshCredentials {
        const credentials: ParsedSshCredentials = {}

        const slashMatch = prompt.match(/user\s*\/\s*pass(?:word)?\s*[:=]?\s*(?<user>[^\s/]+)\s*\/\s*(?<pass>[^\s,]+)/i)
        if (slashMatch?.groups) {
            credentials.user = slashMatch.groups.user
            credentials.password = slashMatch.groups.pass
        }

        const combinedMatch = prompt.match(/user(?:name)?\s*,?\s*pass(?:word)?\s*[-:=]\s*(?<user>[^\s/]+)\s*\/\s*(?<pass>[^\s,]+)/i)
        if (combinedMatch?.groups) {
            credentials.user = combinedMatch.groups.user
            credentials.password = combinedMatch.groups.pass
        }

        if (!credentials.user) {
            const userMatch = prompt.match(/\buser(?:name)?\b\s*[:=,-]?\s*(?<user>[^\s,]+)/i)
            if (userMatch?.groups?.user) {
                credentials.user = userMatch.groups.user
            }
        }

        if (!credentials.password) {
            const passMatch = prompt.match(/\bpass(?:word)?\b\s*[:=,-]?\s*(?<pass>[^\s,]+)/i)
            if (passMatch?.groups?.pass) {
                credentials.password = passMatch.groups.pass
            }
        }

        const portMatch = prompt.match(/\bport\b\s*[:=,-]?\s*(?<port>\d{2,5})/i)
        if (portMatch?.groups?.port) {
            credentials.port = Number(portMatch.groups.port)
        }

        return credentials
    }

    private parseHostToken (value: string): ParsedSshHost | null {
        const cleaned = this.stripCredentialSuffix(this.cleanConnectionTarget(value) ?? '')
        if (!cleaned) {
            return null
        }

        let hostPart = this.normalizeHostToken(cleaned)
        let user: string | undefined
        let port: number | undefined

        if (hostPart.includes('@')) {
            const idx = hostPart.lastIndexOf('@')
            user = hostPart.slice(0, idx)
            hostPart = hostPart.slice(idx + 1)
        }

        if (hostPart.startsWith('[') && hostPart.includes(']')) {
            const end = hostPart.indexOf(']')
            const after = hostPart.slice(end + 1)
            if (after.startsWith(':')) {
                const parsed = Number(after.slice(1))
                if (Number.isFinite(parsed)) {
                    port = parsed
                }
            }
            hostPart = hostPart.slice(1, end)
        } else {
            const parts = hostPart.split(':')
            if (parts.length === 2 && /^\d+$/.test(parts[1])) {
                port = Number(parts[1])
                hostPart = parts[0]
            }
        }

        return hostPart ? { host: hostPart, user, port } : null
    }

    private buildQuickConnectQuery (host: string, user?: string, port?: number): string {
        let query = host
        if (user) {
            query = `${user}@${query}`
        }
        if (port) {
            query = `${query}:${port}`
        }
        return query
    }

    private buildDirectSshProfile (host: string, user?: string, port?: number): PartialProfile<SSHProfile> {
        const query = this.buildQuickConnectQuery(host, user, port)
        return {
            name: query,
            type: 'ssh',
            options: {
                host,
                user: user || 'root',
                port: port ?? 22,
            },
        }
    }

    private buildDirectTelnetProfile (host: string, port?: number): PartialProfile<Profile> {
        return {
            name: port ? `${host}:${port}` : host,
            type: 'telnet',
            options: {
                host,
                port: port ?? 23,
                inputMode: 'readline',
                outputNewlines: 'crlf',
            },
        }
    }

    private splitTargets (value: string): string[] {
        if (!value) {
            return []
        }
        const normalized = value.replace(/\s+and\s+/gi, ',')
        return normalized
            .split(/[;,]/)
            .map(item => this.cleanConnectionTarget(item) ?? '')
            .filter(item => item.length > 0)
    }

    private getConnectionProtocol (prompt: string): ConnectionProtocol | null {
        if (/\btelnet\b/i.test(prompt)) {
            return 'telnet'
        }
        if (this.isSshConnectionIntent(prompt)) {
            return 'ssh'
        }
        return null
    }

    private getDisconnectProtocol (prompt: string): ConnectionProtocol | null {
        if (!this.isDisconnectIntent(prompt)) {
            return null
        }
        if (/\btelnet\b/i.test(prompt)) {
            return 'telnet'
        }
        if (/\bssh\b/i.test(prompt)) {
            return 'ssh'
        }
        return 'ssh'
    }

    private isDisconnectIntent (prompt: string): boolean {
        return /\b(close|disconnect|terminate|end|kill|stop)\b/i.test(prompt)
    }

    private isReconnectIntent (prompt: string): boolean {
        return /\b(reconnect|re-open|reopen|retry|restart)\b/i.test(prompt)
    }

    private isDisconnectAllPrompt (prompt: string): boolean {
        return /\b(all|everything|all\s+connections|all\s+sessions|all\s+devices?)\b/i.test(prompt)
    }

    private isSshConnectionIntent (prompt: string): boolean {
        return /open\s+(?:an?\s+)?ssh\s+connection/i.test(prompt)
            || /open\s+(?:an?\s+)?ssh\s+session/i.test(prompt)
            || /\bssh\s+(?:to|into)\b/i.test(prompt)
            || /\bssh\s+\S+/i.test(prompt)
            || /\bconnect\s+to\b/i.test(prompt)
            || /\bopen\s+connection\b/i.test(prompt)
            || /\bopen\s+session\b/i.test(prompt)
    }

    private cleanConnectionTarget (value: string): string | null {
        if (!value) {
            return null
        }
        let target = value.trim()
        target = target.replace(/^[\"'`]+|[\"'`]+$/g, '')
        target = target.replace(/[?.!,;:\s]+$/g, '')
        target = target.replace(/\s+(please|pls|now)$/i, '')
        target = target.trim()
        return target.length ? target : null
    }

    private normalizeHostToken (value: string): string {
        let hostPart = value.trim()
        hostPart = hostPart.replace(/^(?:ssh|telnet)\s+/i, '')
        hostPart = hostPart.replace(/^(?:connections?|sessions?|tabs?|devices?|hosts?)\s+(?:to|with|for|at)\s+/i, '')
        hostPart = hostPart.replace(/^(?:connections?|sessions?|tabs?|devices?|hosts?)\s+/i, '')
        hostPart = hostPart.replace(/^(?:to|with|for|at|into|on|via|using|from)\s+/i, '')
        hostPart = this.stripLeadingStopwords(hostPart)
        return hostPart.trim()
    }

    private stripLeadingStopwords (value: string): string {
        const stopwords = [
            'to',
            'with',
            'for',
            'at',
            'into',
            'on',
            'via',
            'using',
            'from',
            'host',
            'device',
            'server',
            'router',
            'switch',
            'named',
            'called',
        ]
        let result = value.trim()
        let changed = true
        while (changed) {
            changed = false
            for (const word of stopwords) {
                if (result.toLowerCase().startsWith(`${word} `)) {
                    result = result.slice(word.length).trim()
                    changed = true
                }
            }
        }
        return result
    }

    private stripCredentialSuffix (value: string): string {
        return value.replace(/\s+(?:user(?:name)?|pass(?:word)?)\b.*$/i, '').trim()
    }

    private getOllamaSettingsForExtraction (): EffectiveChatSettings {
        const definition = getProviderDefinition('ollama')
        const envOverrides = this.getEnvOverrides('ollama')
        const ollamaProfile = this.profiles.find(profile => profile.provider === 'ollama')
            ?? (this.getActiveProfile().provider === 'ollama' ? this.getActiveProfile() : undefined)

        const modelValue = (envOverrides.model ?? ollamaProfile?.model ?? definition.defaultModel).trim()
        const normalizedModel = modelValue === LEGACY_OLLAMA_MODEL ? definition.defaultModel : (modelValue || definition.defaultModel)
        const baseValue = (envOverrides.baseUrl ?? ollamaProfile?.baseUrl ?? definition.defaultBaseUrl).trim()

        return {
            provider: 'ollama',
            providerLabel: definition.label,
            profileName: ollamaProfile?.name ?? definition.label,
            apiKey: '',
            model: normalizedModel,
            baseUrl: normalizeBaseUrl(baseValue || definition.defaultBaseUrl, definition.defaultBaseUrl),
            systemPrompt: '',
            temperature: 0,
            maxTokens: 64,
            apiKeyRequired: false,
        }
    }

    private async extractTargetWithLocalLlm (prompt: string): Promise<string | null> {
        const settings = this.getOllamaSettingsForExtraction()
        const payloadText = await this.fetchPayload(`${settings.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: settings.model,
                temperature: 0,
                max_tokens: 64,
                stream: false,
                messages: [
                    {
                        role: 'system',
                        content: 'Extract the SSH/Telnet target(s) from the user request. Reply with only the target names, comma-separated if multiple. If none, reply with an empty string.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
            }),
        }, {
            provider: settings.provider,
            model: settings.model,
            baseUrl: settings.baseUrl,
        })

        if (!payloadText) {
            return null
        }

        let content = ''
        try {
            const payload = JSON.parse(payloadText)
            const messageContent = payload?.choices?.[0]?.message?.content ?? payload?.choices?.[0]?.text
            if (typeof messageContent === 'string') {
                content = messageContent
            } else if (payload?.target && typeof payload.target === 'string') {
                content = payload.target
            }
        } catch {
            content = payloadText
        }

        if (!content || !content.trim().length) {
            return null
        }

        const cleaned = this.cleanConnectionTarget(content)
        return cleaned || null
    }

    private async resolveProfilesForTarget (targetName: string): Promise<PartialProfile<Profile>[]> {
        const normalized = targetName.toLowerCase()
        const groups = await this.profilesService.getProfileGroups({ includeProfiles: true, includeNonUserGroup: true })
        const group = groups.find(candidate => {
            const name = (candidate.name ?? '').toLowerCase()
            const id = (candidate.id ?? '').toLowerCase()
            return name === normalized || id === normalized
        })
        if (group?.profiles?.length) {
            return group.profiles
        }
        const profiles = await this.profilesService.getProfiles({ includeBuiltin: true, clone: true })
        return profiles.filter(profile => {
            const name = (profile.name ?? '').toLowerCase()
            const id = (profile.id ?? '').toLowerCase()
            return name === normalized || id === normalized
        })
    }

    private addActivity (type: ActivityEntry['type'], title: string, detail?: string): void {
        const tags = this.buildActivityTags()
        const timestamp = Date.now()
        const entry: ActivityEntry = {
            id: generateId(),
            time: this.formatTimestamp(timestamp),
            timestamp,
            type,
            title,
            detail,
            tags: tags || undefined,
        }
        this.activityLog = [entry, ...this.activityLog].slice(0, 200)
    }

    private buildActivityTags (): string {
        const tags: string[] = []
        const device = this.networkForm.deviceLabel.trim()
        if (device) {
            tags.push(`device=${device}`)
        }
        const role = this.networkForm.role.trim()
        if (role) {
            tags.push(`role=${role}`)
        }
        const site = this.networkForm.site.trim()
        if (site) {
            tags.push(`site=${site}`)
        }
        return tags.join(', ')
    }

    private formatTimestamp (value: number): string {
        const date = new Date(value)
        const hh = String(date.getHours()).padStart(2, '0')
        const mm = String(date.getMinutes()).padStart(2, '0')
        const ss = String(date.getSeconds()).padStart(2, '0')
        return `${hh}:${mm}:${ss}`
    }

    private formatBytes (value: number): string {
        if (value >= 1024 * 1024) {
            return `${(value / (1024 * 1024)).toFixed(1)} MB`
        }
        if (value >= 1024) {
            return `${(value / 1024).toFixed(1)} KB`
        }
        return `${value} B`
    }

    private escapeCsv (value: string): string {
        const needsQuotes = /[",\n]/.test(value)
        const escaped = value.replace(/"/g, '""')
        return needsQuotes ? `"${escaped}"` : escaped
    }

    private buildActivityCsv (entries: ActivityEntry[]): string {
        const rows = [
            ['time', 'type', 'title', 'detail', 'tags'],
            ...entries.map(entry => [
                entry.time,
                entry.type,
                entry.title,
                entry.detail ?? '',
                entry.tags ?? '',
            ]),
        ]
        return rows.map(row => row.map(value => this.escapeCsv(value)).join(',')).join('\n')
    }

    private buildActivitySummary (
        entries: ActivityEntry[],
        includeHeader: boolean,
        includeTags: boolean,
        timeTitleOnly: boolean,
        titlesOnly: boolean,
    ): string {
        const lines: string[] = []
        if (includeHeader) {
            lines.push(`Activity log (${entries.length} entries)`)
        }
        for (const entry of entries) {
            if (titlesOnly) {
                lines.push(entry.title)
                continue
            }
            const base = timeTitleOnly
                ? `[${entry.time}] ${entry.title}`
                : `[${entry.time}] ${entry.type}: ${entry.title}`
            const detail = timeTitleOnly ? '' : entry.detail ? ` — ${entry.detail}` : ''
            const tags = includeTags && entry.tags ? ` (${entry.tags})` : ''
            lines.push(`${base}${detail}${tags}`)
        }
        return lines.join('\n')
    }

    private applyActivityFilters (filters?: Partial<ActivityFilters>): void {
        this.activityFilterQuery = filters?.query ?? ''
        this.activityFilterType = filters?.type ?? 'all'
        this.activityFilterTag = filters?.tag ?? ''
        this.activityFilterWindowMinutes = typeof filters?.timeWindowMinutes === 'number'
            ? filters.timeWindowMinutes
            : null
    }

    private loadActivityFilters (profileId?: string): void {
        if (this.activityFilterPersistTimeout) {
            clearTimeout(this.activityFilterPersistTimeout)
            this.activityFilterPersistTimeout = undefined
        }
        const store = this.getChatStore()
        const filtersByProfile = (store.activityFiltersByProfile ?? {}) as Record<string, ActivityFilters>
        const key = profileId || this.activeProfileId
        const filters = key ? filtersByProfile[key] : undefined
        if (filters) {
            this.applyActivityFilters(filters)
        } else {
            this.applyActivityFilters()
        }
    }

    private persistActivityFilters (): void {
        const store = this.getChatStore()
        const profileId = this.activeProfileId
        if (!profileId) {
            return
        }
        const filtersByProfile = (store.activityFiltersByProfile ?? {}) as Record<string, ActivityFilters>
        const filters: ActivityFilters = {
            query: this.activityFilterQuery.trim(),
            type: this.activityFilterType,
            tag: this.activityFilterTag.trim(),
            timeWindowMinutes: this.activityFilterWindowMinutes,
        }

        if (this.isActivityFilterActive()) {
            filtersByProfile[profileId] = filters
        } else {
            delete filtersByProfile[profileId]
        }

        store.activityFiltersByProfile = filtersByProfile
        this.config.save()
    }

    private initializeFromConfig (): void {
        this.loadProfiles()
        this.loadActivityFilters(this.activeProfileId)
        this.loadNetworkSettings()
        this.loadQuickQuestions()
        this.refreshEffectiveSettings()
    }

    private getChatStore (): Record<string, any> {
        if (!this.config.store) {
            return (this.config.getDefaults() as Record<string, any>).chatgpt ?? {}
        }
        if (!this.config.store.chatgpt || typeof this.config.store.chatgpt !== 'object') {
            const defaults = this.config.getDefaults() as Record<string, any>
            this.config.store.chatgpt = defaults.chatgpt ?? {}
        }
        return this.config.store.chatgpt as Record<string, any>
    }

    private getActivityTimestamp (entry: ActivityEntry): number | null {
        if (typeof entry.timestamp === 'number') {
            return entry.timestamp
        }
        const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(entry.time)
        if (!match) {
            return null
        }
        const now = new Date()
        const candidate = new Date(now)
        candidate.setHours(Number(match[1]), Number(match[2]), Number(match[3]), 0)
        let timestamp = candidate.getTime()
        if (timestamp - now.getTime() > 60 * 1000) {
            timestamp -= 24 * 60 * 60 * 1000
        }
        return timestamp
    }

    private scheduleActivityFilterPersist (): void {
        if (this.activityFilterPersistTimeout) {
            clearTimeout(this.activityFilterPersistTimeout)
        }
        this.activityFilterPersistTimeout = window.setTimeout(() => {
            this.activityFilterPersistTimeout = undefined
            this.persistActivityFilters()
        }, 300)
    }

    private scheduleQuickQuestionPersist (): void {
        if (this.quickQuestionPersistTimeout) {
            clearTimeout(this.quickQuestionPersistTimeout)
        }
        this.quickQuestionPersistTimeout = window.setTimeout(() => {
            this.quickQuestionPersistTimeout = undefined
            this.persistQuickQuestions()
        }, 300)
    }

    private isEditableTarget (target: EventTarget | null): boolean {
        if (!(target instanceof HTMLElement)) {
            return false
        }
        const tagName = target.tagName.toLowerCase()
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
            return true
        }
        if (target.isContentEditable) {
            return true
        }
        return !!target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
    }

    private matchesAllTokens (value: string, query: string): boolean {
        return query.split(/\s+/).every(token => value.includes(token))
    }

    private refreshPinnedQuickActions (): void {
        const ids = this.getPinnedActionIds(this.networkForm.variant)
        this.pinnedQuickActions = ids
            .map(id => this.quickActions.find(action => action.id === id))
            .filter((action): action is QuickAction => !!action)
    }

    private getPinnedActionIds (variant: DeviceVariant): string[] {
        return this.networkForm.favoriteQuickActionsByVariant?.[variant] ?? []
    }

    private setPinnedActionIds (variant: DeviceVariant, ids: string[]): void {
        if (!this.networkForm.favoriteQuickActionsByVariant) {
            this.networkForm.favoriteQuickActionsByVariant = {}
        }
        if (!ids.length) {
            delete this.networkForm.favoriteQuickActionsByVariant[variant]
            return
        }
        this.networkForm.favoriteQuickActionsByVariant[variant] = ids
    }

    private getRedactor (settings: EffectiveChatSettings): ((value: string) => string) | undefined {
        if (!this.networkForm.enabled || !this.networkForm.redactSensitiveData) {
            return undefined
        }
        if (this.isLocalEndpoint(settings.baseUrl)) {
            return undefined
        }
        return (value: string) => this.redactSensitiveData(value)
    }

    private isLocalEndpoint (baseUrl: string): boolean {
        try {
            const url = new URL(baseUrl)
            const host = url.hostname
            return host === 'localhost' || host === '127.0.0.1' || host === '::1'
        } catch {
            return false
        }
    }

    private redactSensitiveData (value: string): string {
        const ipv4 = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g
        const ipv6 = /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}(?:%[\w.-]+)?(?:\/\d{1,3})?\b/g
        const hostnameWithDot = /\b[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+\b/g
        const hostnameToken = /\b[a-zA-Z0-9-]*[a-zA-Z][a-zA-Z0-9-]*\d[a-zA-Z0-9-]*\b/g

        return value
            .replace(ipv4, '<ip4>')
            .replace(ipv6, '<ip6>')
            .replace(hostnameWithDot, '<host>')
            .replace(hostnameToken, '<host>')
    }

    private scheduleParseTerminalOutput (): void {
        if (this.parseTimeout) {
            window.clearTimeout(this.parseTimeout)
        }
        this.parseTimeout = window.setTimeout(() => {
            this.parseTimeout = undefined
            this.parsedSummary = this.buildParsedSummary()
        }, 300)
    }

    private buildParsedSummary (): string {
        const lines = this.getRecentLines()
        const sections: string[] = []
        const interfaceSummary = this.parseInterfaceSummary(lines)
        if (interfaceSummary) {
            sections.push(interfaceSummary)
        }
        const bgpSummary = this.parseBgpSummary(lines)
        if (bgpSummary) {
            sections.push(bgpSummary)
        }
        const neighborSummary = this.parseNeighborSummary(lines)
        if (neighborSummary) {
            sections.push(neighborSummary)
        }
        const environmentSummary = this.parseEnvironmentSummary(lines)
        if (environmentSummary) {
            sections.push(environmentSummary)
        }
        return sections.join('\n')
    }

    private getRecentLines (): string[] {
        const lines = this.terminalOutput.split(/\r?\n/)
        return lines.slice(Math.max(0, lines.length - 400))
    }

    private parseInterfaceSummary (lines: string[]): string | null {
        switch (this.networkForm.variant) {
            case 'junos':
                return this.parseJunosInterfaces(lines)
            case 'evo':
            case 'onie':
                return this.parseLinuxInterfaces(lines)
            case 'ios':
            case 'ios-xe':
            case 'ios-xr':
            case 'nx-os':
            case 'eos':
                return this.parseCiscoInterfaces(lines)
            default:
                return null
        }
    }

    private parseJunosInterfaces (lines: string[]): string | null {
        let total = 0
        let up = 0
        const down: string[] = []

        for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('Interface')) {
                continue
            }
            const parts = trimmed.split(/\s+/)
            if (parts.length < 3) {
                continue
            }
            const name = parts[0]
            if (name.includes('.')) {
                continue
            }
            const admin = parts[1]
            const link = parts[2]
            if ((admin === 'up' || admin === 'down') && (link === 'up' || link === 'down')) {
                total += 1
                if (link === 'up') {
                    up += 1
                } else {
                    down.push(name)
                }
            }
        }

        if (!total) {
            return null
        }
        return this.formatInterfaceSummary(total, up, down)
    }

    private parseLinuxInterfaces (lines: string[]): string | null {
        let total = 0
        let up = 0
        const down: string[] = []
        const regex = /^\d+:\s+([^:]+):.*\bstate\s+(\w+)/i

        for (const line of lines) {
            const match = regex.exec(line)
            if (!match) {
                continue
            }
            const name = match[1]
            const state = match[2].toLowerCase()
            total += 1
            if (state === 'up' || state === 'unknown') {
                up += 1
            } else {
                down.push(name)
            }
        }

        if (!total) {
            return null
        }
        return this.formatInterfaceSummary(total, up, down)
    }

    private parseCiscoInterfaces (lines: string[]): string | null {
        const statusKeywords = new Set([
            'connected',
            'notconnect',
            'disabled',
            'err-disabled',
            'inactive',
            'suspended',
            'monitoring',
            'down',
            'up',
        ])
        const downStatuses = new Set(['notconnect', 'disabled', 'err-disabled', 'inactive', 'suspended', 'down'])
        let total = 0
        let up = 0
        const down: string[] = []

        for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.toLowerCase().startsWith('port ')) {
                continue
            }
            const tokens = trimmed.split(/\s+/)
            if (tokens.length < 2) {
                continue
            }
            const port = tokens[0]
            const statusIndex = tokens.findIndex((token, idx) => idx > 0 && statusKeywords.has(token.toLowerCase()))
            if (statusIndex === -1) {
                continue
            }
            const status = tokens[statusIndex].toLowerCase()
            total += 1
            if (status === 'connected' || status === 'up') {
                up += 1
            } else if (downStatuses.has(status)) {
                down.push(port)
            }
        }

        if (!total) {
            return null
        }
        return this.formatInterfaceSummary(total, up, down)
    }

    private formatInterfaceSummary (total: number, up: number, down: string[]): string {
        const downCount = total - up
        const sample = down.slice(0, 5)
        const sampleText = sample.length ? ` Down: ${sample.join(', ')}${down.length > sample.length ? '…' : ''}` : ''
        return `Interfaces: ${up} up / ${downCount} down (${total} total).${sampleText}`
    }

    private parseBgpSummary (lines: string[]): string | null {
        const neighborRegex = /^\s*([0-9a-fA-F:.]+)\s+\d+/i
        let total = 0
        let established = 0
        const down: string[] = []

        for (const line of lines) {
            const trimmed = line.trim()
            const match = neighborRegex.exec(trimmed)
            if (!match) {
                continue
            }
            const neighbor = match[1]
            const tokens = trimmed.split(/\s+/)
            const stateToken = tokens[tokens.length - 1]
            if (!stateToken) {
                continue
            }
            total += 1
            if (/^\d+(\+\d+)?$/.test(stateToken) || /^\d+\/\d+/.test(stateToken)) {
                established += 1
            } else {
                down.push(neighbor)
            }
        }

        if (!total) {
            return null
        }
        const downCount = total - established
        const sample = down.slice(0, 5)
        const sampleText = sample.length ? ` Down: ${sample.join(', ')}${down.length > sample.length ? '…' : ''}` : ''
        return `BGP: ${established} established / ${downCount} down (${total} peers).${sampleText}`
    }

    private parseNeighborSummary (lines: string[]): string | null {
        switch (this.networkForm.variant) {
            case 'junos':
                return this.parseJunosNeighbors(lines)
            case 'ios':
            case 'ios-xe':
            case 'ios-xr':
            case 'nx-os':
            case 'eos':
                return this.parseCiscoNeighbors(lines)
            default:
                return null
        }
    }

    private parseJunosNeighbors (lines: string[]): string | null {
        let total = 0
        const neighbors: string[] = []
        for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('Local Interface') || trimmed.startsWith('LLDP')) {
                continue
            }
            const parts = trimmed.split(/\s+/)
            if (parts.length < 2) {
                continue
            }
            const remote = parts[1]
            if (!remote || remote === '-') {
                continue
            }
            total += 1
            if (neighbors.length < 5) {
                neighbors.push(remote)
            }
        }
        if (!total) {
            return null
        }
        const sample = neighbors.length ? ` Sample: ${neighbors.join(', ')}${total > neighbors.length ? '…' : ''}` : ''
        return `Neighbors: ${total} (LLDP).${sample}`
    }

    private parseCiscoNeighbors (lines: string[]): string | null {
        let total = 0
        const neighbors: string[] = []
        for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.toLowerCase().includes('device id')) {
                continue
            }
            const tokens = trimmed.split(/\s+/)
            if (!tokens.length) {
                continue
            }
            const device = tokens[0]
            if (!device || device.includes(':')) {
                continue
            }
            if (device.toLowerCase() === 'total') {
                continue
            }
            total += 1
            if (neighbors.length < 5) {
                neighbors.push(device)
            }
        }
        if (!total) {
            return null
        }
        const sample = neighbors.length ? ` Sample: ${neighbors.join(', ')}${total > neighbors.length ? '…' : ''}` : ''
        return `Neighbors: ${total} (LLDP/CDP).${sample}`
    }

    private parseEnvironmentSummary (lines: string[]): string | null {
        switch (this.networkForm.variant) {
            case 'junos':
                return this.parseJunosEnvironment(lines)
            case 'ios':
            case 'ios-xe':
            case 'ios-xr':
            case 'nx-os':
            case 'eos':
                return this.parseCiscoEnvironment(lines)
            default:
                return null
        }
    }

    private parseJunosEnvironment (lines: string[]): string | null {
        let alarms = 0
        let fans = 0
        let fansOk = 0
        let tempsOk = 0
        let tempsTotal = 0

        for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) {
                continue
            }
            if (/Alarm|alarms/i.test(trimmed) && /No alarms/i.test(trimmed)) {
                alarms = 0
            }
            if (/Alarm/i.test(trimmed) && /Major|Minor|Critical/i.test(trimmed)) {
                alarms += 1
            }
            if (/Fan/i.test(trimmed) && /\bOK\b/i.test(trimmed)) {
                fans += 1
                fansOk += 1
            } else if (/Fan/i.test(trimmed) && /\b(FAIL|Not OK|Failed)\b/i.test(trimmed)) {
                fans += 1
            }
            if (/Temp|Temperature/i.test(trimmed)) {
                tempsTotal += 1
                if (/\bOK\b/i.test(trimmed)) {
                    tempsOk += 1
                }
            }
        }

        const parts: string[] = []
        if (fans) {
            parts.push(`Fans OK: ${fansOk}/${fans}`)
        }
        if (tempsTotal) {
            parts.push(`Temps OK: ${tempsOk}/${tempsTotal}`)
        }
        if (alarms) {
            parts.push(`Alarms: ${alarms}`)
        }
        if (!parts.length) {
            return null
        }
        return `Environment: ${parts.join(', ')}`
    }

    private parseCiscoEnvironment (lines: string[]): string | null {
        let fans = 0
        let fansOk = 0
        let psu = 0
        let psuOk = 0
        let tempsTotal = 0
        let tempsOk = 0

        for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) {
                continue
            }
            if (/fan/i.test(trimmed)) {
                fans += 1
                if (/\bok\b|\bnormal\b|\bgreen\b/i.test(trimmed)) {
                    fansOk += 1
                }
            }
            if (/power|psu/i.test(trimmed)) {
                psu += 1
                if (/\bok\b|\bnormal\b|\bon\b/i.test(trimmed)) {
                    psuOk += 1
                }
            }
            if (/temp|temperature/i.test(trimmed)) {
                tempsTotal += 1
                if (/\bok\b|\bnormal\b/i.test(trimmed)) {
                    tempsOk += 1
                }
            }
        }

        const parts: string[] = []
        if (fans) {
            parts.push(`Fans OK: ${fansOk}/${fans}`)
        }
        if (psu) {
            parts.push(`PSU OK: ${psuOk}/${psu}`)
        }
        if (tempsTotal) {
            parts.push(`Temps OK: ${tempsOk}/${tempsTotal}`)
        }
        if (!parts.length) {
            return null
        }
        return `Environment: ${parts.join(', ')}`
    }

    async copyCommand (command: string): Promise<void> {
        this.platform.setClipboard({ text: command })
        this.notifications.notice('Command copied to clipboard')
    }

    copyMessage (message: ChatMessage): void {
        if (!message?.content) {
            return
        }
        this.platform.setClipboard({ text: message.content })
        const label = message.role === 'assistant' ? 'Assistant response' : 'Message'
        this.notifications.notice(`${label} copied to clipboard`)
    }

    toggleSuggestedCommands (): void {
        this.suggestedCommandsCollapsed = !this.suggestedCommandsCollapsed
    }

    clearSuggestedCommands (): void {
        this.suggestedCommands = []
        this.suggestedCommandsCollapsed = false
    }

    async runSuggestedCommand (command: string, safe: boolean, source?: string): Promise<void> {
        if (!this.networkForm.allowCommandRun || !safe) {
            return
        }
        const prepared = this.applyPaginationBypass(this.stripWrappingQuotes(command))
        const terminal = this.getTerminalForRun()
        if (!terminal) {
            this.notifications.error('No terminal selected')
            return
        }
        if (!terminal.session?.open) {
            this.notifications.error('Selected terminal is not connected')
            return
        }
        const response = await this.platform.showMessageBox({
            type: 'warning',
            message: 'Run command in selected terminal?',
            detail: prepared,
            buttons: ['Run', 'Cancel'],
            defaultId: 0,
            cancelId: 1,
        })
        if (response.response !== 0) {
            return
        }
        terminal.sendInput(`${prepared}\r`)
        const label = source ? `${source} - ${prepared}` : `Run: ${prepared}`
        this.addActivity('command', label, `Terminal: ${terminal.title || 'Terminal'}`)
        this.queueCommandAnalysis(prepared)
    }

    private applyPaginationBypass (command: string): string {
        const variant = this.networkForm.variant
        if ((variant === 'junos' || variant === 'evo') && /^\s*show\b/i.test(command) && !/\|\s*no-?more\b/i.test(command)) {
            return `${command} | no-more`
        }
        return command
    }

    private getTerminalForRun (): BaseTerminalTabComponent<any> | undefined {
        if (this.activeTerminal && this.terminalTargets.some(target => target.tab === this.activeTerminal)) {
            return this.activeTerminal
        }
        if (this.lastTerminalTab && this.terminalTargets.some(target => target.tab === this.lastTerminalTab)) {
            this.setActiveTerminal(this.lastTerminalTab)
            return this.lastTerminalTab
        }
        const fallback = this.terminalTargets[0]?.tab
        if (fallback) {
            this.setActiveTerminal(fallback)
            return fallback
        }
        return undefined
    }

    private scrollToBottom (): void {
        setTimeout(() => {
            const element = this.messagesRef?.nativeElement
            if (element) {
                element.scrollTop = element.scrollHeight
            }
        })
    }
}
