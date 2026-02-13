import { TerminalOutputHighlightConfig, TerminalOutputHighlightRule } from './api/interfaces';
export interface OutputHighlightRule {
    regex: RegExp;
    start: string;
    prefixGroup?: number;
    captureGroup?: number;
    suffixGroup?: number;
}
type HighlightRuleDefinition = TerminalOutputHighlightRule & {
    prefixGroup?: number;
    captureGroup?: number;
    suffixGroup?: number;
};
export declare const DEFAULT_OUTPUT_HIGHLIGHT_RULES: HighlightRuleDefinition[];
export declare function compileOutputHighlightRules(config?: TerminalOutputHighlightConfig): OutputHighlightRule[];
export declare function applyOutputHighlighting(data: string, rules: OutputHighlightRule[], skipIfAnsiPresent?: boolean): string;
export {};
