import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

// Global styles
import './styles/ai-assistant.scss';

// i18n Services
import { TranslateService } from './i18n';

// Tlink modules
import TlinkCorePlugin, { AppService, ConfigService, HostAppService, ToolbarButtonProvider, ConfigProvider, HotkeyProvider, HotkeysService } from 'tlink-core';
import TlinkTerminalPlugin from 'tlink-terminal';
import { SettingsTabProvider } from 'tlink-settings';

// Core Services
import { AiAssistantService } from './services/core/ai-assistant.service';
import { AiProviderManagerService } from './services/core/ai-provider-manager.service';
import { ConfigProviderService } from './services/core/config-provider.service';
import { LoggerService } from './services/core/logger.service';

// Providers
import { BaseAiProvider } from './services/providers/base-provider.service';
import { OpenAiProviderService } from './services/providers/openai-provider.service';
import { AnthropicProviderService } from './services/providers/anthropic-provider.service';
import { MinimaxProviderService } from './services/providers/minimax-provider.service';
import { GlmProviderService } from './services/providers/glm-provider.service';
import { OpenAiCompatibleProviderService } from './services/providers/openai-compatible.service';
import { OllamaProviderService } from './services/providers/ollama-provider.service';
import { VllmProviderService } from './services/providers/vllm-provider.service';
import { GroqProviderService } from './services/providers/groq-provider.service';
import { TlinkProxyProviderService } from './services/providers/tlink-proxy.provider';
import { TlinkAgentProviderService } from './services/providers/tlink-agent.provider';

// Security Services
import { SecurityValidatorService } from './services/security/security-validator.service';
import { RiskAssessmentService } from './services/security/risk-assessment.service';
import { PasswordManagerService } from './services/security/password-manager.service';
import { ConsentManagerService } from './services/security/consent-manager.service';

// Chat Services
import { ChatSessionService } from './services/chat/chat-session.service';
import { ChatHistoryService } from './services/chat/chat-history.service';
import { CommandGeneratorService } from './services/chat/command-generator.service';
import { AiSidebarService } from './services/chat/ai-sidebar.service';

// Terminal Services
import { TerminalManagerService } from './services/terminal/terminal-manager.service';

// Ollama Services
import { OllamaModelService } from './services/ollama/ollama-model.service';

// Context Engineering Services
import { ContextManager } from './services/context/manager';
import { Compaction } from './services/context/compaction';
import { Memory } from './services/context/memory';
import { TokenBudget } from './services/context/token-budget';

// Platform Services
import { PlatformDetectionService } from './services/platform/platform-detection.service';

// Core Services
import { CheckpointManager } from './services/core/checkpoint.service';
import { ToastService } from './services/core/toast.service';
import { FileStorageService } from './services/core/file-storage.service';

// Enhanced Terminal Services
import { BufferAnalyzerService } from './services/terminal/buffer-analyzer.service';

// MCP Services

// Tlink Providers (enabled for proper integration)

// Components
import { ChatInterfaceComponent } from './components/chat/chat-interface.component';
import { ChatMessageComponent } from './components/chat/chat-message.component';
import { ChatInputComponent } from './components/chat/chat-input.component';
import { ChatSettingsComponent } from './components/chat/chat-settings.component';
import { AiSidebarComponent } from './components/chat/ai-sidebar.component';

import { AiSettingsTabComponent } from './components/settings/ai-settings-tab.component';
import { ProviderConfigComponent } from './components/settings/provider-config.component';
import { SecuritySettingsComponent } from './components/settings/security-settings.component';
import { GeneralSettingsComponent } from './components/settings/general-settings.component';
import { ContextSettingsComponent } from './components/settings/context-settings.component';
import { DataSettingsComponent } from './components/settings/data-settings.component';

import { RiskConfirmDialogComponent } from './components/security/risk-confirm-dialog.component';
import { PasswordPromptComponent } from './components/security/password-prompt.component';
import { ConsentDialogComponent } from './components/security/consent-dialog.component';

import { CommandSuggestionComponent } from './components/terminal/command-suggestion.component';
import { CommandPreviewComponent } from './components/terminal/command-preview.component';
import { AiToolbarButtonComponent } from './components/terminal/ai-toolbar-button.component';

import { LoadingSpinnerComponent } from './components/common/loading-spinner.component';
import { ErrorMessageComponent } from './components/common/error-message.component';

// Tlink Integration Providers (enabled for proper integration)
import { AiToolbarButtonProvider } from './providers/tlink/ai-toolbar-button.provider';
import { AiSettingsTabProvider } from './providers/tlink/ai-settings-tab.provider';
import { AiConfigProvider } from './providers/tlink/ai-config.provider';
import { AiHotkeyProvider } from './providers/tlink/ai-hotkey.provider';

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        TlinkCorePlugin,
        TlinkTerminalPlugin,
        NgbModule
    ],
    providers: [
        // Core Services
        AiAssistantService,
        AiProviderManagerService,
        ConfigProviderService,
        LoggerService,

        // i18n Services
        TranslateService,

        // AI Providers
        OpenAiProviderService,
        AnthropicProviderService,
        MinimaxProviderService,
        GlmProviderService,
        OpenAiCompatibleProviderService,
        OllamaProviderService,
        VllmProviderService,
        GroqProviderService,
        TlinkProxyProviderService,
        TlinkAgentProviderService,

        // Security Services
        SecurityValidatorService,
        RiskAssessmentService,
        PasswordManagerService,
        ConsentManagerService,

        // Chat Services
        ChatSessionService,
        ChatHistoryService,
        CommandGeneratorService,
        AiSidebarService,

        // Terminal Services
        TerminalManagerService,

        // Ollama Services
        OllamaModelService,

        // Context Engineering Services
        ContextManager,
        Compaction,
        Memory,
        TokenBudget,

        // Platform Services
        PlatformDetectionService,

        // Core Services
        CheckpointManager,

        // Toast Service
        ToastService,

        // File Storage Service
        FileStorageService,

        // Enhanced Terminal Services
        BufferAnalyzerService,


        // Tlink Integration Providers
        // Note: AI Assistant button moved to left dock, but provider still enabled to provide command
        { provide: ToolbarButtonProvider, useClass: AiToolbarButtonProvider, multi: true },
        { provide: SettingsTabProvider, useClass: AiSettingsTabProvider, multi: true },
        { provide: ConfigProvider, useClass: AiConfigProvider, multi: true },
        { provide: HotkeyProvider, useClass: AiHotkeyProvider, multi: true },
    ],
    declarations: [
        // Chat Components
        ChatInterfaceComponent,
        ChatMessageComponent,
        ChatInputComponent,
        ChatSettingsComponent,
        AiSidebarComponent,

        // Settings Components
        AiSettingsTabComponent,
        ProviderConfigComponent,
        SecuritySettingsComponent,
        GeneralSettingsComponent,
        ContextSettingsComponent,
        DataSettingsComponent,

        // Security Components
        RiskConfirmDialogComponent,
        PasswordPromptComponent,
        ConsentDialogComponent,

        // Terminal Components
        CommandSuggestionComponent,
        CommandPreviewComponent,
        AiToolbarButtonComponent,

        // Common Components
        LoadingSpinnerComponent,
        ErrorMessageComponent
    ],
    entryComponents: [
        ChatInterfaceComponent,
        AiSidebarComponent,
        RiskConfirmDialogComponent,
        PasswordPromptComponent,
        ConsentDialogComponent,
        CommandSuggestionComponent,
        CommandPreviewComponent
    ]
})
export default class AiAssistantModule {
    constructor(
        private app: AppService,
        private config: ConfigService,
        private aiService: AiAssistantService,
        private sidebarService: AiSidebarService,
        private terminalManager: TerminalManagerService,
        hotkeys: HotkeysService,
        hostApp: HostAppService
    ) {
        console.log('[AiAssistantModule] Module initialized');

        // Wait for app to be ready before initializing
        this.app.ready$.subscribe(() => {
            this.config.ready$.toPromise().then(() => {
                // Initialize AI service
                this.aiService.initialize();

                // Delay 1 second to initialize sidebar, wait for Tlink DOM to be fully ready
                // This matches the implementation of tlink-ssh-sidebar
                setTimeout(() => {
                    this.sidebarService.initialize();
                }, 1000);
            });
        });

        // Subscribe to hotkey events
        hotkeys.hotkey$.subscribe(hotkey => {
            this.handleHotkey(hotkey);
        });

        hostApp.aiAssistantRequest$.subscribe(() => {
            this.aiService.openChatInterface();
        });
    }

    /**
     * Handle hotkey events
     */
    private handleHotkey(hotkey: string): void {
        switch (hotkey) {
            case 'ai-assistant-toggle':
                this.aiService.openAssistantWindow();
                break;

            case 'ai-command-generation':
                this.handleCommandGeneration();
                break;

            case 'ai-explain-command':
                this.handleExplainCommand();
                break;
        }
    }

    /**
     * Handle command generation hotkey (Ctrl+Shift+G)
     * 1. Try to get selected text
     * 2. Try to get last command
     * 3. Get terminal context
     * 4. Build prompt and send
     */
    private handleCommandGeneration(): void {
        // 1. Try to get selected text
        const selectedText = this.terminalManager.getSelectedText();

        // 2. Try to get last command
        const lastCommand = this.terminalManager.getLastCommand();

        // 3. Get terminal context
        const context = this.terminalManager.getRecentContext();

        // 4. Build prompt
        let prompt: string;
        if (selectedText) {
            prompt = `Please help me optimize or improve this command:\n\`\`\`\n${selectedText}\n\`\`\``;
        } else if (lastCommand) {
            prompt = `Based on the current terminal state, please help me generate the next command needed.\n\nRecently executed command: ${lastCommand}\n\nTerminal context:\n\`\`\`\n${context}\n\`\`\``;
        } else {
            prompt = `Please generate the command needed based on the current terminal state.\n\nTerminal context:\n\`\`\`\n${context}\n\`\`\``;
        }

        // 5. Send message (auto-send)
        this.sidebarService.sendPresetMessage(prompt, true);
    }

    /**
     * Handle command explanation hotkey (Ctrl+Shift+E)
     * 1. Try to get selected text
     * 2. Try to get last command
     * 3. Build prompt and send
     */
    private handleExplainCommand(): void {
        // 1. Try to get selected text
        const selectedText = this.terminalManager.getSelectedText();

        // 2. Try to get last command
        const lastCommand = this.terminalManager.getLastCommand();

        // 3. Build prompt
        let prompt: string;
        if (selectedText) {
            prompt = `Please explain in detail what this command does and what each parameter means:\n\`\`\`\n${selectedText}\n\`\`\``;
        } else if (lastCommand) {
            prompt = `Please explain in detail what this command does and what each parameter means:\n\`\`\`\n${lastCommand}\n\`\`\``;
        } else {
            // Read more context for user selection
            const context = this.terminalManager.getRecentContext();
            prompt = `Please explain the recent terminal output:\n\`\`\`\n${context}\n\`\`\``;
        }

        // 4. Send message (auto-send)
        this.sidebarService.sendPresetMessage(prompt, true);
    }
}

export const forRoot = (): typeof AiAssistantModule => {
    return AiAssistantModule;
};

declare const module: any;
if (typeof module !== 'undefined' && module.exports) {
    module.exports.forRoot = forRoot;
    module.exports.default = AiAssistantModule;
}
