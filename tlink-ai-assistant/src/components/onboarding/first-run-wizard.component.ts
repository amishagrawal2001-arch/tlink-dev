import { Component, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { ConfigProviderService } from '../../services/core/config-provider.service'
import { AiProviderManagerService } from '../../services/core/ai-provider-manager.service'
import { AiAssistantService } from '../../services/core/ai-assistant.service'
import { LoggerService } from '../../services/core/logger.service'
import { HealthStatus } from '../../types/ai.types'
import { ProviderConfig } from '../../types/provider.types'

/**
 * First-run wizard. Opens when the AI sidebar is first shown with no
 * provider configured, or on-demand via "Rerun AI setup" in settings.
 *
 * Three paths, all end at the same place (a live, smoke-tested provider):
 *   1. "local"  — enable the bundled Ollama server at localhost:11434
 *   2. "cloud"  — paste an API key for Anthropic / OpenAI / Groq
 *   3. "remote" — point at a Tabby / Ollama / vLLM already running
 *
 * Fits on three steps: Choose → Configure → Verify.
 */

type WizardPath = 'local' | 'cloud' | 'remote'
type Step = 'choose' | 'configure' | 'verify'

interface CloudOption {
    name: string
    displayName: string
    defaultBaseURL: string
    defaultModel: string
    keyHint: string
}

interface RemoteOption {
    name: string
    displayName: string
    defaultBaseURL: string
    defaultModel: string
    requiresKey: boolean
    keyHint?: string
}

const CLOUD_OPTIONS: CloudOption[] = [
    {
        name: 'anthropic',
        displayName: 'Anthropic (Claude)',
        defaultBaseURL: 'https://api.anthropic.com',
        defaultModel: 'claude-3-5-sonnet-20241022',
        keyHint: 'sk-ant-...',
    },
    {
        name: 'openai',
        displayName: 'OpenAI (GPT)',
        defaultBaseURL: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
        keyHint: 'sk-...',
    },
    {
        name: 'groq',
        displayName: 'Groq (fast open models)',
        defaultBaseURL: 'https://api.groq.com/openai/v1',
        defaultModel: 'llama-3.3-70b-versatile',
        keyHint: 'gsk_...',
    },
]

const REMOTE_OPTIONS: RemoteOption[] = [
    {
        name: 'ollama',
        displayName: 'Ollama',
        defaultBaseURL: 'http://localhost:11434/v1',
        defaultModel: 'qwen2.5-coder:3b',
        requiresKey: false,
    },
    {
        name: 'tabby',
        displayName: 'Tabby (TabbyML)',
        defaultBaseURL: 'http://localhost:8080',
        defaultModel: 'default',
        requiresKey: false,
        keyHint: 'optional — leave blank for a stock install',
    },
    {
        name: 'openai-compatible',
        displayName: 'vLLM / any OpenAI-compatible endpoint',
        defaultBaseURL: 'http://localhost:8000/v1',
        defaultModel: '',
        requiresKey: true,
        keyHint: 'whatever your server expects',
    },
]

@Component({
    selector: 'app-first-run-wizard',
    templateUrl: './first-run-wizard.component.html',
    styleUrls: ['./first-run-wizard.component.scss'],
})
export class FirstRunWizardComponent implements OnInit {
    step: Step = 'choose'
    path: WizardPath | null = null

    cloudOptions = CLOUD_OPTIONS
    remoteOptions = REMOTE_OPTIONS

    selectedCloud: CloudOption = CLOUD_OPTIONS[0]
    selectedRemote: RemoteOption = REMOTE_OPTIONS[0]

    apiKey = ''
    baseURL = ''
    model = ''

    verifying = false
    verifyError: string | null = null
    verifySuccess = false

    constructor(
        public activeModal: NgbActiveModal,
        private config: ConfigProviderService,
        private providerManager: AiProviderManagerService,
        private aiService: AiAssistantService,
        private logger: LoggerService,
    ) {}

    ngOnInit(): void {
        // Sync the editable fields with the first-pick defaults so the
        // Configure step doesn't open empty.
        this.syncFieldsForSelection()
    }

    pickPath(path: WizardPath): void {
        this.path = path
        this.syncFieldsForSelection()
        this.step = 'configure'
    }

    pickCloudOption(opt: CloudOption): void {
        this.selectedCloud = opt
        this.syncFieldsForSelection()
    }

    pickRemoteOption(opt: RemoteOption): void {
        this.selectedRemote = opt
        this.syncFieldsForSelection()
    }

    private syncFieldsForSelection(): void {
        if (this.path === 'cloud') {
            this.apiKey = ''
            this.baseURL = this.selectedCloud.defaultBaseURL
            this.model = this.selectedCloud.defaultModel
        } else if (this.path === 'remote') {
            this.apiKey = ''
            this.baseURL = this.selectedRemote.defaultBaseURL
            this.model = this.selectedRemote.defaultModel
        } else if (this.path === 'local') {
            this.apiKey = ''
            this.baseURL = 'http://localhost:11434/v1'
            this.model = 'qwen2.5-coder:3b'
        }
    }

    back(): void {
        this.verifyError = null
        this.verifySuccess = false
        if (this.step === 'verify') { this.step = 'configure' } else if (this.step === 'configure') { this.step = 'choose' }
    }

    canContinue(): boolean {
        if (this.step !== 'configure' || !this.path) { return false }
        if (this.path === 'local') { return true }
        if (this.path === 'cloud') { return this.apiKey.trim().length > 0 }
        if (this.path === 'remote') {
            if (!this.baseURL.trim()) { return false }
            if (this.selectedRemote.requiresKey && !this.apiKey.trim()) { return false }
            return true
        }
        return false
    }

    async verify(): Promise<void> {
        if (!this.path) { return }
        this.step = 'verify'
        this.verifying = true
        this.verifyError = null
        this.verifySuccess = false
        try {
            const providerName = this.providerNameForPath()
            const cfg: ProviderConfig = this.buildConfig(providerName)
            this.config.setProviderConfig(providerName, cfg)
            // switchProvider re-reads the saved config and sets the
            // active provider on the manager. Health probe below forces
            // a fresh check (60s cache bypassed).
            const switched = this.aiService.switchProvider(providerName)
            if (!switched) {
                this.verifyError = `Could not activate ${providerName}. The provider may not be registered yet, or its config is invalid.`
                return
            }
            const status = await this.providerManager.getProviderHealthStatus(providerName, true)
            if (status === HealthStatus.HEALTHY || status === HealthStatus.DEGRADED) {
                this.verifySuccess = true
            } else {
                this.verifyError = this.explainUnhealthy(providerName)
            }
        } catch (err: any) {
            this.logger.warn('first-run verify failed', { err })
            this.verifyError = err?.message || String(err)
        } finally {
            this.verifying = false
        }
    }

    private providerNameForPath(): string {
        if (this.path === 'cloud') { return this.selectedCloud.name }
        if (this.path === 'remote') { return this.selectedRemote.name }
        return 'ollama'
    }

    private buildConfig(providerName: string): ProviderConfig {
        const existing = this.config.getProviderConfig(providerName) || {} as ProviderConfig
        return {
            ...(existing || {}),
            name: providerName,
            displayName: existing.displayName || this.defaultDisplayName(providerName),
            enabled: true,
            apiKey: this.apiKey.trim() || existing.apiKey,
            baseURL: this.baseURL.trim(),
            model: this.model.trim() || existing.model,
        }
    }

    private defaultDisplayName(providerName: string): string {
        const cloud = CLOUD_OPTIONS.find(o => o.name === providerName)
        if (cloud) { return cloud.displayName }
        const remote = REMOTE_OPTIONS.find(o => o.name === providerName)
        if (remote) { return remote.displayName }
        if (providerName === 'ollama') { return 'Ollama (Local)' }
        return providerName
    }

    private explainUnhealthy(providerName: string): string {
        if (this.path === 'local') {
            return `Ollama didn't respond on ${this.baseURL}. The bundled server starts automatically; if this persists, open Terminal and run \`ollama list\` to check installation, or retry in ~30s while the model finishes downloading.`
        }
        if (this.path === 'cloud') {
            return `${this.selectedCloud.displayName} rejected the request. Most common cause: the API key is wrong, lacks billing, or the model (${this.model}) isn't enabled on your account.`
        }
        if (this.path === 'remote') {
            return `${this.baseURL} didn't respond as a healthy ${providerName} endpoint. Check the server is running, the URL (including scheme + port) is correct, and — if required — the API key is valid.`
        }
        return `Provider ${providerName} did not respond as healthy.`
    }

    finish(): void {
        this.activeModal.close({ ok: true, provider: this.providerNameForPath() })
    }

    skip(): void {
        this.activeModal.dismiss('skipped')
    }
}
