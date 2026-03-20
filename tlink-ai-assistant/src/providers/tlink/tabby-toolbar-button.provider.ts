import { Injectable } from '@angular/core';
import { ToolbarButtonProvider, ToolbarButton } from 'tlink-core';
import { ConfigProviderService } from '../../services/core/config-provider.service';
import { LoggerService } from '../../services/core/logger.service';

@Injectable()
export class TabbyToolbarButtonProvider extends ToolbarButtonProvider {
    private tabbyRunning = false;
    private tabbyStatusChecked = false;
    private readonly tabbyStatusPollMs = 5000;
    private readonly statusIconClass = 'tlink-tabby-status-icon';

    constructor(
        private config: ConfigProviderService,
        private logger: LoggerService
    ) {
        super();
        this.startStatusPolling();
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
            },
            {
                icon: this.getStatusIconSvg(),
                weight: 12,
                title: this.getStatusTitle(),
                touchBarTitle: 'Tabby',
                click: () => {
                    this.refreshTabbyStatus(true).catch(error => {
                        this.logger.warn('Failed to refresh Tabby status from toolbar click', { error: String(error) });
                    });
                }
            }
        ];
    }

    private startStatusPolling(): void {
        // Kick off immediately so the icon reflects current state soon after toolbar render.
        this.refreshTabbyStatus().catch(error => {
            this.logger.warn('Initial Tabby status check failed', { error: String(error) });
        });

        setInterval(() => {
            this.refreshTabbyStatus().catch(error => {
                this.logger.warn('Tabby status poll failed', { error: String(error) });
            });
        }, this.tabbyStatusPollMs);
    }

    private getStatusIconSvg(): string {
        const dotFill = this.getStatusDotColor();
        const ringStroke = this.getStatusRingColor();
        return `<svg class="${this.statusIconClass}" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="${ringStroke}" stroke-width="1.4"></circle>
            <circle class="tlink-tabby-status-dot" cx="8" cy="8" r="3.2" fill="${dotFill}"></circle>
        </svg>`;
    }

    private getStatusTitle(): string {
        if (!this.tabbyStatusChecked) {
            return 'Tabby server status: checking...';
        }
        return this.tabbyRunning
            ? 'Tabby server status: running'
            : 'Tabby server status: stopped';
    }

    private getStatusDotColor(): string {
        if (!this.tabbyStatusChecked) {
            return '#9aa0a6';
        }
        return this.tabbyRunning ? '#2fb344' : '#e03131';
    }

    private getStatusRingColor(): string {
        if (!this.tabbyStatusChecked) {
            return '#9aa0a6';
        }
        return this.tabbyRunning ? '#2fb344' : '#a0a4aa';
    }

    private applyStatusToToolbarIcon(): void {
        if (typeof document === 'undefined') {
            return;
        }
        document.querySelectorAll(`svg.${this.statusIconClass}`).forEach(root => {
            const ring = root.querySelector('circle:first-of-type') as SVGCircleElement | null;
            const dot = root.querySelector('.tlink-tabby-status-dot') as SVGCircleElement | null;
            if (ring) {
                ring.setAttribute('stroke', this.getStatusRingColor());
            }
            if (dot) {
                dot.setAttribute('fill', this.getStatusDotColor());
            }
            const button = root.closest('button');
            if (button) {
                button.setAttribute('title', this.getStatusTitle());
            }
        });
    }

    private async refreshTabbyStatus(fromUserClick = false): Promise<void> {
        const running = await this.checkTabbyReachability();
        this.tabbyRunning = running;
        this.tabbyStatusChecked = true;
        this.applyStatusToToolbarIcon();
        if (fromUserClick) {
            this.logger.info('Tabby toolbar status check', { running });
        }
    }

    private async checkTabbyReachability(): Promise<boolean> {
        const target = this.getTabbyHostPort();
        if (!target) {
            return false;
        }

        const win: any = window as any;
        const net = win?.require?.('net');
        if (!net?.createConnection) {
            return false;
        }

        return this.checkTcpPort(net, target.host, target.port, 2200);
    }

    private getTabbyHostPort(): { host: string; port: number } | null {
        try {
            const base = this.getTabbyServiceBaseUrl();
            const parsed = new URL(base);
            const host = parsed.hostname || '127.0.0.1';
            const scheme = (parsed.protocol || '').toLowerCase();
            const port = parsed.port
                ? Number(parsed.port)
                : (scheme === 'https:' ? 443 : 80);
            if (!Number.isFinite(port) || port <= 0) {
                return null;
            }
            return { host, port };
        } catch {
            return null;
        }
    }

    private checkTcpPort(net: any, host: string, port: number, timeoutMs: number): Promise<boolean> {
        return new Promise(resolve => {
            let settled = false;
            const socket = net.createConnection({ host, port });

            const finish = (result: boolean) => {
                if (settled) {
                    return;
                }
                settled = true;
                try {
                    socket.destroy();
                } catch {
                    // no-op
                }
                resolve(result);
            };

            try {
                socket.setTimeout(timeoutMs);
                socket.once('connect', () => finish(true));
                socket.once('timeout', () => finish(false));
                socket.once('error', () => finish(false));
                socket.once('close', () => finish(false));
            } catch {
                finish(false);
            }
        });
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

    private getTabbyServiceBaseUrl(): string {
        const base = this.getTabbyBaseUrl();
        return base
            .replace(/\/(v1beta|v1)$/i, '')
            .replace(/\/models$/i, '');
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
