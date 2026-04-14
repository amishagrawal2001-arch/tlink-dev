import { Injectable } from '@angular/core'
import { TerminalColorScheme } from './api/interfaces'
import { TerminalColorSchemeProvider } from './api/colorSchemeProvider'

@Injectable({ providedIn: 'root' })
export class DefaultColorSchemes extends TerminalColorSchemeProvider {
    static defaultColorScheme: TerminalColorScheme = {
        name: 'NexTerm Default',
        foreground: '#d4d4d4',
        background: '#1e1e2e',
        cursor: '#f5e0dc',
        colors: [
            '#45475a', // black
            '#f38ba8', // red
            '#a6e3a1', // green
            '#f9e2af', // yellow
            '#89b4fa', // blue
            '#cba6f7', // magenta
            '#94e2d5', // cyan
            '#bac2de', // white
            '#585b70', // bright black
            '#f38ba8', // bright red
            '#a6e3a1', // bright green
            '#f9e2af', // bright yellow
            '#89b4fa', // bright blue
            '#cba6f7', // bright magenta
            '#94e2d5', // bright cyan
            '#a6adc8', // bright white
        ],
        selection: '#585b7066',
        cursorAccent: '#1e1e2e',
    }

    static defaultLightColorScheme: TerminalColorScheme = {
        name: 'NexTerm Default Light',
        foreground: '#4c4f69',
        background: '#eff1f5',
        cursor: '#dc8a78',
        colors: [
            '#5c5f77', // black
            '#d20f39', // red
            '#40a02b', // green
            '#df8e1d', // yellow
            '#1e66f5', // blue
            '#8839ef', // magenta
            '#179299', // cyan
            '#acb0be', // white
            '#6c6f85', // bright black
            '#d20f39', // bright red
            '#40a02b', // bright green
            '#df8e1d', // bright yellow
            '#1e66f5', // bright blue
            '#8839ef', // bright magenta
            '#179299', // bright cyan
            '#bcc0cc', // bright white
        ],
        selection: '#acb0be66',
        cursorAccent: '#eff1f5',
    }

    async getSchemes (): Promise<TerminalColorScheme[]> {
        return [
            DefaultColorSchemes.defaultColorScheme,
            DefaultColorSchemes.defaultLightColorScheme,
        ]
    }
}
