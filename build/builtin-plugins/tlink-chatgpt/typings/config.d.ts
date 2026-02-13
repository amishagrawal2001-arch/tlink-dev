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
            profiles: never[];
            activeProfileId: string;
            activityFiltersByProfile: {};
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
                autoTroubleshootAfterCommand: boolean;
                allowlistByVariant: {};
                redactSensitiveData: boolean;
                autoAppendRunbookOutput: boolean;
                favoriteQuickActionsByVariant: {};
            };
        };
    };
}
