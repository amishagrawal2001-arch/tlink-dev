import { McpLoggerService } from './mcpLogger.service';
export declare class UrlOpeningService {
    private logger;
    constructor(logger: McpLoggerService);
    openUrl(url: string): void;
}
