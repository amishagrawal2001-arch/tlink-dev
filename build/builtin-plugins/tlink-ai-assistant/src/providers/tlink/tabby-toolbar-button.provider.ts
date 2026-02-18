import { Injectable } from '@angular/core';
import { ToolbarButtonProvider, ToolbarButton } from 'tlink-core';
import { ConfigProviderService } from '../../services/core/config-provider.service';
import { LoggerService } from '../../services/core/logger.service';

@Injectable()
export class TabbyToolbarButtonProvider extends ToolbarButtonProvider {
    constructor(
        private config: ConfigProviderService,
        private logger: LoggerService
    ) {
        super();
    }

    provide(): ToolbarButton[] {
        return [
            {
                icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M10.604 1a.5.5 0 0 1 .5.5v3.396a.5.5 0 0 1-1 0V2.707L5.354 7.457a.5.5 0 1 1-.708-.708l4.75-4.75H7.207a.5.5 0 0 1 0-1h3.397z"/>
                    <path d="M13.5 3.5a.5.5 0 0 1 .5.5v8A2.5 2.5 0 0 1 11.5 14h-8A2.5 2.5 0 0 1 1 11.5v-8A2.5 2.5 0 0 1 3.5 1h3a.5.5 0 0 1 0 1h-3A1.5 1.5 0 0 0 2 3.5v8A1.5 1.5 0 0 0 3.5 13h8a1.5 1.5 0 0 0 1.5-1.5v-8a.5.5 0 0 1 .5-.5z"/>
                </svg>`,
                weight: 1,
                title: 'Open Tabby URL',
                touchBarTitle: 'Tabby',
                click: () => {
                    this.openTabbyUrl();
                }
            }
        ];
    }

    private async openTabbyUrl(): Promise<void> {
        try {
            const base = this.getTabbyBaseUrl();
            const url = this.getTabbyWebUrl(base);
            const win: any = window as any;
            const shell = win?.electron?.shell || win?.require?.('electron')?.shell;

            if (shell?.openExternal) {
                await shell.openExternal(url);
                return;
            }

            window.open(url, '_blank', 'noopener');
        } catch (error) {
            this.logger.error('Failed to open Tabby URL from toolbar', error);
        }
    }

    private getTabbyBaseUrl(): string {
        const base = this.config.getProviderConfig('tabby')?.baseURL || 'http://localhost:8080';
        return String(base).trim().replace(/\/+$/, '');
    }

    private getTabbyWebUrl(baseURL: string): string {
        const trimmed = String(baseURL || '').trim().replace(/\/+$/, '');
        if (!trimmed) {
            return 'http://localhost:8080';
        }

        // Convert API endpoints to web root: /v1, /v1beta, /models
        return trimmed
            .replace(/\/(v1beta|v1)\/models$/i, '')
            .replace(/\/(v1beta|v1)$/i, '')
            .replace(/\/models$/i, '');
    }
}
