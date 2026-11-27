import { ConfigProvider } from 'tlink-core'

// Keep this aligned with the AI Sidebar plugin's default (tlink-ai-assistant).
// Users commonly run both plugins and are confused when each defaults to a
// different model they then have to pull separately.
const DEFAULT_MODEL = 'qwen2.5-coder:3b'
const DEFAULT_MAX_TOKENS = 512
const DEFAULT_TEMPERATURE = 0.2

/** @hidden */
export class ChatGPTConfigProvider extends ConfigProvider {
    defaults = {
        chatgpt: {
            apiKey: '',
            model: DEFAULT_MODEL,
            baseUrl: 'http://localhost:11434/v1',
            systemPrompt: '',
            temperature: DEFAULT_TEMPERATURE,
            maxTokens: DEFAULT_MAX_TOKENS,
            agent: {
                enabled: false,
                maxRounds: 4,
                intent: 'auto',
                autoRunSafeCommands: false,
            },
            profiles: [],
            activeProfileId: '',
            activityFiltersByProfile: {},
            chatHistoryByProfile: {},
            quickQuestions: [],
            networkAssistant: {
                enabled: true,
                vendor: 'juniper',
                variant: 'junos',
                deviceLabel: '',
                osVersion: '',
                site: '',
                role: '',
                includeLastOutput: true,
                allowCommandRun: true,
                dryRunCommandMode: false,
                autoTroubleshootAfterCommand: true,
                allowlistByVariant: {},
                redactSensitiveData: false,
                autoAppendRunbookOutput: false,
                favoriteQuickActionsByVariant: {},
            },
        },
    }
}
