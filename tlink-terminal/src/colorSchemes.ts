import { Injectable } from '@angular/core'
import { TerminalColorScheme } from './api/interfaces'
import { TerminalColorSchemeProvider } from './api/colorSchemeProvider'

@Injectable({ providedIn: 'root' })
export class DefaultColorSchemes extends TerminalColorSchemeProvider {
    /**
     * Default dark scheme — AdventureTime palette. Matches the
     * tlink-community-color-schemes/schemes/AdventureTime entry so
     * picking that name from the dropdown leaves the terminal looking
     * identical to a fresh install. If you want the previous Catppuccin-
     * Mocha-derived default back, swap this block with the values from
     * git history at colorSchemes.ts before this commit.
     */
    static defaultColorScheme: TerminalColorScheme = {
        name: 'AdventureTime',
        foreground: '#f8dcc0',
        background: '#1f1d45',
        cursor: '#efbf38',
        colors: [
            '#050404', // black
            '#bd0013', // red
            '#4ab118', // green
            '#e7741e', // yellow
            '#0f4ac6', // blue
            '#665993', // magenta
            '#70a598', // cyan
            '#f8dcc0', // white
            '#4e7cbf', // bright black
            '#fc5f5a', // bright red
            '#9eff6e', // bright green
            '#efc11a', // bright yellow
            '#1997c6', // bright blue
            '#9b5953', // bright magenta
            '#c8faf4', // bright cyan
            '#f6f5fb', // bright white
        ],
        selection: '#4e7cbf66',
        cursorAccent: '#1f1d45',
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
