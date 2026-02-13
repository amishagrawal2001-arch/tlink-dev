import { ConnectableProfile, Profile } from 'tlink-core'

export interface ResizeEvent {
    columns: number
    rows: number
}

export interface TerminalColorScheme {
    name: string
    foreground: string
    background: string
    cursor: string
    colors: string[]
    selection?: string
    selectionForeground?: string
    cursorAccent?: string
}

export interface BaseTerminalProfile extends Profile {
    terminalColorScheme?: TerminalColorScheme
}

export interface ConnectableTerminalProfile extends BaseTerminalProfile, ConnectableProfile {}

export interface TerminalOutputHighlightRule {
    pattern: string
    flags?: string
    color: string
}

export interface TerminalOutputHighlightConfig {
    enabled: boolean
    skipIfAnsiPresent: boolean
    rules: TerminalOutputHighlightRule[]
}

export type TerminalButtonBarAction = 'send-string' | 'run-script' | 'run-local'

export interface TerminalButtonBarButton {
    label: string
    command: string
    color?: string
    appendEnter?: boolean
    action?: TerminalButtonBarAction
    description?: string
    disableTooltip?: boolean
    sourceFileName?: string
    scriptArgs?: string
}

export interface TerminalButtonBarConfig {
    enabled: boolean
    buttons: TerminalButtonBarButton[]
}
