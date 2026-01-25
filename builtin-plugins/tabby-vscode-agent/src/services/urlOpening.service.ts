import { Injectable } from '@angular/core';
import { McpLoggerService } from './mcpLogger.service';

@Injectable({ providedIn: 'root' })
export class UrlOpeningService {
  constructor(private logger: McpLoggerService) {}

  openUrl(url: string): void {
    this.logger.info(`Opening URL: ${url}`);
    try {
      const win: any = window as any;
      const shell = win?.electron?.shell || win?.require?.('electron')?.shell;
      if (shell?.openExternal) {
        shell.openExternal(url);
        return;
      }
      if (typeof win?.open === 'function') {
        win.open(url, '_blank', 'noopener');
        return;
      }
    } catch (error) {
      this.logger.error(`Failed to open URL: ${url}`, error);
      try {
        window.open(url, '_blank', 'noopener');
      } catch (fallbackError) {
        this.logger.error(`Failed to open URL via window.open: ${url}`, fallbackError);
      }
    }
  }
}
