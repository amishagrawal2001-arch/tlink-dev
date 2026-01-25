import { ToolCategory } from '../type/types';
import { VSCodeTool } from './terminal/vscode-tool';
export declare class VSCodeToolCategory implements ToolCategory {
    private vscodeTool;
    name: string;
    mcpTools: any[];
    constructor(vscodeTool: VSCodeTool);
}
