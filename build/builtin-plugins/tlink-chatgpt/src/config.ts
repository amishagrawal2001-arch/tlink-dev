import { ConfigProvider } from 'tlink-core'

const DEFAULT_MODEL = 'llama3.1:8b'
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
            profiles: [],
            activeProfileId: '',
            activityFiltersByProfile: {},
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
                autoTroubleshootAfterCommand: true,
                allowlistByVariant: {},
                redactSensitiveData: false,
                autoAppendRunbookOutput: false,
                favoriteQuickActionsByVariant: {},
            },
        },
    }
}
