export type ConnectionProtocol = 'ssh' | 'telnet';
export interface ParsedSshCredentials {
    user?: string;
    password?: string;
    port?: number;
}
export interface ParsedSshHost {
    host: string;
    user?: string;
    port?: number;
}
export declare function cleanConnectionTarget(value: string): string | null;
export declare function stripLeadingStopwords(value: string): string;
export declare function normalizeHostToken(value: string): string;
export declare function stripCredentialSuffix(value: string): string;
export declare function splitTargets(value: string): string[];
export declare function normalizeGroupTarget(value: string | null | undefined): string | null;
export declare function parseGroupTarget(prompt: string): string | null;
export declare function parseHostTargets(prompt: string, protocol: ConnectionProtocol): string[];
export declare function parseDisconnectTargets(prompt: string, protocol: ConnectionProtocol): string[];
export declare function parseSshCredentials(prompt: string): ParsedSshCredentials;
export declare function parseHostToken(value: string): ParsedSshHost | null;
export declare function parseRegexLiteral(value: string): RegExp | null;
export declare function isPatternTarget(value: string): boolean;
export declare function extractPatternTargetFromPhrase(value: string): string | null;
export declare function buildTargetMatcher(target: string): (value: string) => boolean;
export declare function normalizeCloseTarget(value: string): string | null;
export declare function normalizeOpenTargets(targets: string[]): {
    directTargets: string[];
    patternTargets: string[];
};
export declare function isDisconnectIntent(prompt: string): boolean;
export declare function isReconnectIntent(prompt: string): boolean;
export declare function isDisconnectAllPrompt(prompt: string): boolean;
export declare function isSshConnectionIntent(prompt: string): boolean;
export declare function getConnectionProtocol(prompt: string): ConnectionProtocol | null;
export declare function getDisconnectProtocol(prompt: string): ConnectionProtocol | null;
