import { McpTool, McpResponse } from '../../type/types';
import { AppService } from 'tabby-core';
export declare class VSCodeTool {
    private app;
    constructor(app: AppService);
    handler: () => Promise<McpResponse>;
    getTool(): McpTool<any>;
}
