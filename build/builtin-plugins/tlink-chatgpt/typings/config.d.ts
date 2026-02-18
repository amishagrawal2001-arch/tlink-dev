import { ConfigProvider } from 'tlink-core';
/** @hidden */
export declare class ChatGPTConfigProvider extends ConfigProvider {
    defaults: {
        chatgpt: {
            apiKey: string;
            model: string;
            baseUrl: string;
            systemPrompt: string;
            temperature: number;
            maxTokens: number;
            agent: {
                enabled: boolean;
                maxRounds: number;
                intent: string;
                autoRunSafeCommands: boolean;
            };
            profiles: never[];
            activeProfileId: string;
            activityFiltersByProfile: {};
            chatHistoryByProfile: {};
            quickQuestions: never[];
            networkAssistant: {
                enabled: boolean;
                vendor: string;
                variant: string;
                deviceLabel: string;
                osVersion: string;
                site: string;
                role: string;
                includeLastOutput: boolean;
                allowCommandRun: boolean;
                dryRunCommandMode: boolean;
                autoTroubleshootAfterCommand: boolean;
                allowlistByVariant: {};
                redactSensitiveData: boolean;
                autoAppendRunbookOutput: boolean;
                favoriteQuickActionsByVariant: {};
            };
        };
    };
}
