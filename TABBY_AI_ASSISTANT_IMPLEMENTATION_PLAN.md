# Tabby AI Assistant Implementation Plan for Tlink

## Overview
This document outlines the plan to implement and integrate the `tabby-ai-assistant` plugin into Tlink. The plugin provides a comprehensive AI assistant with multi-provider support, MCP integration, security features, context management, and terminal integration.

## Current State Analysis

### Plugin Structure
- **Location**: `/tabby-ai-assistant/`
- **Type**: Tabby plugin (needs adaptation for Tlink)
- **Version**: 1.0.38
- **Main Features**:
  - Multi-AI provider support (OpenAI, Anthropic, Minimax, GLM, Ollama, vLLM, OpenAI Compatible)
  - MCP (Model Context Protocol) server integration
  - Intelligent command generation and explanation
  - Security risk assessment and protection
  - Context management and memory system
  - Terminal integration with smart context awareness
  - Chat interface with sidebar
  - Settings UI with multiple tabs
  - Hotkey support
  - i18n support (Chinese, English, Japanese)
  - File storage system
  - Theme support (6 themes)

### Key Components

#### Services
1. **Core Services**:
   - `AiAssistantService` - Main AI assistant service
   - `AiProviderManagerService` - Provider management
   - `ConfigProviderService` - Configuration management
   - `LoggerService` - Logging
   - `ToastService` - Toast notifications
   - `FileStorageService` - File-based storage
   - `CheckpointManager` - Context checkpoints

2. **AI Providers**:
   - `BaseAiProvider` - Base provider class
   - `OpenAiProviderService` - OpenAI provider
   - `AnthropicProviderService` - Anthropic/Claude provider
   - `MinimaxProviderService` - Minimax provider
   - `GlmProviderService` - GLM provider (dual mode support)
   - `OpenAiCompatibleProviderService` - OpenAI-compatible sites
   - `OllamaProviderService` - Ollama local provider
   - `VllmProviderService` - vLLM provider

3. **Security Services**:
   - `SecurityValidatorService` - Security validation
   - `RiskAssessmentService` - Risk assessment
   - `PasswordManagerService` - Password management
   - `ConsentManagerService` - User consent management

4. **Chat Services**:
   - `ChatSessionService` - Chat session management
   - `ChatHistoryService` - Chat history
   - `CommandGeneratorService` - Command generation
   - `AiSidebarService` - Sidebar management

5. **Terminal Services**:
   - `TerminalManagerService` - Terminal management
   - `TerminalContextService` - Terminal context
   - `BufferAnalyzerService` - Buffer analysis

6. **Context Services**:
   - `ContextManager` - Context management
   - `Compaction` - Context compaction
   - `Memory` - Memory management
   - `TokenBudget` - Token budget management
   - `SummaryService` - Summary generation

7. **MCP Services**:
   - `MCPClientManager` - MCP client management
   - Transports: `StdioTransport`, `SSETransport`, `HTTPTransport`

8. **Platform Services**:
   - `PlatformDetectionService` - Platform detection
   - `EscapeSequenceService` - Escape sequence handling

#### Components
1. **Chat Components**:
   - `AiSidebarComponent` - Main sidebar
   - `ChatInterfaceComponent` - Chat interface
   - `ChatMessageComponent` - Chat message
   - `ChatInputComponent` - Chat input
   - `ChatSettingsComponent` - Chat settings

2. **Settings Components**:
   - `AiSettingsTabComponent` - Main settings tab
   - `ProviderConfigComponent` - Provider configuration
   - `SecuritySettingsComponent` - Security settings
   - `GeneralSettingsComponent` - General settings
   - `ContextSettingsComponent` - Context settings
   - `DataSettingsComponent` - Data management
   - `MCPSettingsComponent` - MCP settings

3. **Security Components**:
   - `RiskConfirmDialogComponent` - Risk confirmation dialog
   - `PasswordPromptComponent` - Password prompt
   - `ConsentDialogComponent` - Consent dialog

4. **Terminal Components**:
   - `CommandSuggestionComponent` - Command suggestions
   - `CommandPreviewComponent` - Command preview
   - `AiToolbarButtonComponent` - Toolbar button

5. **Common Components**:
   - `LoadingSpinnerComponent` - Loading spinner
   - `ErrorMessageComponent` - Error messages

#### Providers
- `AiToolbarButtonProvider` - Toolbar button
- `AiSettingsTabProvider` - Settings tab
- `AiConfigProvider` - Configuration provider
- `AiHotkeyProvider` - Hotkey provider

## Implementation Plan

### Phase 1: Plugin Renaming and Structure Setup

#### 1.1 Rename Plugin Directory
- [ ] Rename `tabby-ai-assistant/` to `tlink-ai-assistant/`
- [ ] Update all internal references

#### 1.2 Update Package Configuration
- [ ] Update `package.json`:
  - Change `name` from `tabby-ai-assistant` to `tlink-ai-assistant`
  - Update `keywords` to include `tlink-plugin`
  - Update `peerDependencies`:
    - `tabby-core` → `tlink-core`
    - `tabby-settings` → `tlink-settings`
    - `tabby-terminal` → `tlink-terminal`
  - Update `devDependencies` similarly
  - Update `repository` and `homepage` URLs if needed

#### 1.3 Update TypeScript Configuration
- [ ] Update `tsconfig.json` path mappings:
  - `tabby-*` → `tlink-*`
- [ ] Verify `baseUrl` and `paths` configuration
- [ ] Check `typeRoots` configuration

### Phase 2: Code Migration

#### 2.1 Update Imports (Critical)
**Files to update:**
- [ ] `src/index.ts` - Main module file
- [ ] `src/main.ts` - Main entry point
- [ ] `src/index-minimal.ts` - Minimal entry point
- [ ] All service files in `src/services/**/*.ts`
- [ ] All component files in `src/components/**/*.ts`
- [ ] All provider files in `src/providers/**/*.ts`
- [ ] All type files in `src/types/**/*.ts`
- [ ] All utility files in `src/utils/**/*.ts`

**Import changes:**
```typescript
// Before
import TabbyCoreModule, { ... } from 'tabby-core';
import { ... } from 'tabby-settings';
import TabbyTerminalModule from 'tabby-terminal';

// After
import TlinkCorePlugin, { ... } from 'tlink-core';
import { ... } from 'tlink-settings';
import TlinkTerminalPlugin from 'tlink-terminal';
```

#### 2.2 Update Module Declaration
- [ ] Update `src/index.ts`:
  - Change `TabbyCoreModule` → `TlinkCorePlugin`
  - Change `TabbyTerminalModule` → `TlinkTerminalPlugin`
  - Update module class name if needed
  - Verify all providers are compatible

#### 2.3 Update Component Templates
- [ ] Check all `.html` files for Tabby-specific references
- [ ] Update any hardcoded "Tabby" strings to "Tlink" in UI
- [ ] Verify template syntax compatibility
- [ ] Check for any Tabby-specific CSS classes

#### 2.4 Update Styles
- [ ] Review `src/styles/ai-assistant.scss`
- [ ] Update any Tabby-specific style references
- [ ] Verify theme compatibility

### Phase 3: API Compatibility Check

#### 3.1 Core API Compatibility
- [ ] Verify `AppService` API compatibility
- [ ] Verify `ConfigService` API compatibility
- [ ] Verify `BaseTabComponent` API compatibility
- [ ] Verify `HostWindowService` API compatibility
- [ ] Verify `HotkeysService` API compatibility

#### 3.2 Terminal API Compatibility
- [ ] Verify `BaseTerminalTabComponent` API compatibility
- [ ] Verify `XTermFrontend` API compatibility
- [ ] Test terminal session discovery
- [ ] Test terminal buffer reading
- [ ] Test terminal context extraction
- [ ] Test command execution

#### 3.3 Settings API Compatibility
- [ ] Verify `SettingsTabProvider` API compatibility
- [ ] Test settings tab registration
- [ ] Verify config provider compatibility
- [ ] Test configuration persistence

#### 3.4 Toolbar API Compatibility
- [ ] Verify `ToolbarButtonProvider` API compatibility
- [ ] Test toolbar button registration
- [ ] Verify button click handling

### Phase 4: Build System Integration

#### 4.1 Webpack Configuration
- [ ] Create or update `webpack.config.js`:
  - Update path mappings
  - Verify build output paths
  - Check plugin build process
  - Update externals configuration
  - Verify loaders (ts-loader, angular2-template-loader, etc.)

#### 4.2 Build Scripts
- [ ] Update build scripts if needed
- [ ] Test plugin build process
- [ ] Verify typings generation
- [ ] Test watch mode

#### 4.3 Integration with Tlink Build
- [ ] Add plugin to Tlink's plugin discovery
- [ ] Verify plugin loading mechanism
- [ ] Test plugin initialization

### Phase 5: Feature-Specific Updates

#### 5.1 AI Provider System
- [ ] Test all AI providers:
  - OpenAI
  - Anthropic
  - Minimax
  - GLM (dual mode)
  - OpenAI Compatible
  - Ollama
  - vLLM
- [ ] Verify provider configuration
- [ ] Test provider switching
- [ ] Verify API key management
- [ ] Test streaming responses

#### 5.2 MCP Integration
- [ ] Test MCP client manager
- [ ] Test all transport types:
  - Stdio transport
  - SSE transport
  - HTTP transport
- [ ] Test MCP server configuration
- [ ] Test tool discovery and invocation
- [ ] Test timeout and retry mechanisms
- [ ] Verify tool call logging

#### 5.3 Security System
- [ ] Test risk assessment service
- [ ] Test password protection
- [ ] Test consent management
- [ ] Test security validation
- [ ] Verify risk level detection
- [ ] Test security dialogs

#### 5.4 Context Management
- [ ] Test context manager
- [ ] Test memory system
- [ ] Test context compaction
- [ ] Test token budget management
- [ ] Test summary generation
- [ ] Verify checkpoint system

#### 5.5 Chat System
- [ ] Test chat interface
- [ ] Test chat history
- [ ] Test chat sessions
- [ ] Test command generation
- [ ] Test command explanation
- [ ] Test sidebar functionality

#### 5.6 Terminal Integration
- [ ] Test terminal context extraction
- [ ] Test command suggestions
- [ ] Test command preview
- [ ] Test buffer analysis
- [ ] Test terminal manager
- [ ] Verify hotkey integration

#### 5.7 Settings UI
- [ ] Test all settings tabs:
  - General settings
  - Provider configuration
  - Security settings
  - Context settings
  - Data management
  - MCP settings
- [ ] Test settings persistence
- [ ] Test data import/export
- [ ] Test data migration

#### 5.8 i18n System
- [ ] Verify translation files:
  - `en-US.ts`
  - `zh-CN.ts`
  - `ja-JP.ts`
- [ ] Test translation service
- [ ] Verify language switching

#### 5.9 Theme System
- [ ] Test all themes:
  - Follow system
  - Light
  - Dark
  - Pixel retro
  - Cyber tech
  - Parchment
- [ ] Verify theme switching
- [ ] Test theme persistence

#### 5.10 File Storage
- [ ] Test file storage service
- [ ] Verify storage location
- [ ] Test data migration from localStorage
- [ ] Test data export/import
- [ ] Verify file permissions

### Phase 6: Testing and Validation

#### 6.1 Unit Testing
- [ ] Test service initialization
- [ ] Test provider registration
- [ ] Test command generation flow
- [ ] Test security validation
- [ ] Test context management
- [ ] Test MCP integration

#### 6.2 Integration Testing
- [ ] Test plugin loading
- [ ] Test AI provider connections
- [ ] Test MCP server connections
- [ ] Test command execution end-to-end
- [ ] Test chat functionality
- [ ] Test terminal integration
- [ ] Test settings persistence
- [ ] Test data management

#### 6.3 UI Testing
- [ ] Test settings tab UI
- [ ] Test chat interface
- [ ] Test security dialogs
- [ ] Test toolbar buttons
- [ ] Test hotkeys
- [ ] Test responsive design
- [ ] Test theme switching
- [ ] Test i18n switching

#### 6.4 Security Testing
- [ ] Test risk assessment accuracy
- [ ] Test password protection
- [ ] Test consent management
- [ ] Test dangerous command blocking
- [ ] Test security validation

### Phase 7: Documentation and Cleanup

#### 7.1 Documentation Updates
- [ ] Update README.md:
  - Change Tabby references to Tlink
  - Update installation instructions
  - Update usage examples
  - Update API documentation
  - Update configuration guide
- [ ] Update CHANGELOG.md
- [ ] Add Tlink-specific documentation
- [ ] Update i18n documentation

#### 7.2 Code Cleanup
- [ ] Remove Tabby-specific comments
- [ ] Update code comments
- [ ] Remove unused dependencies
- [ ] Optimize imports
- [ ] Update type definitions

#### 7.3 Asset Updates
- [ ] Update images/assets if they reference Tabby
- [ ] Update GIFs/demos if needed
- [ ] Update icons if needed

## Detailed File-by-File Migration Checklist

### Core Files
- [ ] `src/index.ts` - Main module
- [ ] `src/main.ts` - Main entry point
- [ ] `src/index-minimal.ts` - Minimal entry point

### Services - Core
- [ ] `src/services/core/ai-assistant.service.ts`
- [ ] `src/services/core/ai-provider-manager.service.ts`
- [ ] `src/services/core/config-provider.service.ts`
- [ ] `src/services/core/logger.service.ts`
- [ ] `src/services/core/toast.service.ts`
- [ ] `src/services/core/file-storage.service.ts`
- [ ] `src/services/core/checkpoint.service.ts`

### Services - Providers
- [ ] `src/services/providers/base-provider.service.ts`
- [ ] `src/services/providers/openai-provider.service.ts`
- [ ] `src/services/providers/anthropic-provider.service.ts`
- [ ] `src/services/providers/minimax-provider.service.ts`
- [ ] `src/services/providers/glm-provider.service.ts`
- [ ] `src/services/providers/openai-compatible.service.ts`
- [ ] `src/services/providers/ollama-provider.service.ts`
- [ ] `src/services/providers/vllm-provider.service.ts`

### Services - Security
- [ ] `src/services/security/security-validator.service.ts`
- [ ] `src/services/security/risk-assessment.service.ts`
- [ ] `src/services/security/password-manager.service.ts`
- [ ] `src/services/security/consent-manager.service.ts`

### Services - Chat
- [ ] `src/services/chat/chat-session.service.ts`
- [ ] `src/services/chat/chat-history.service.ts`
- [ ] `src/services/chat/command-generator.service.ts`
- [ ] `src/services/chat/ai-sidebar.service.ts`

### Services - Terminal
- [ ] `src/services/terminal/terminal-manager.service.ts`
- [ ] `src/services/terminal/terminal-context.service.ts`
- [ ] `src/services/terminal/buffer-analyzer.service.ts`
- [ ] `src/services/terminal/terminal-tools.service.ts`

### Services - Context
- [ ] `src/services/context/manager.ts`
- [ ] `src/services/context/compaction.ts`
- [ ] `src/services/context/memory.ts`
- [ ] `src/services/context/token-budget.ts`
- [ ] `src/services/context/summary.service.ts`

### Services - MCP
- [ ] `src/services/mcp/mcp-client-manager.service.ts`
- [ ] `src/services/mcp/mcp-message.types.ts`
- [ ] `src/services/mcp/transports/base-transport.ts`
- [ ] `src/services/mcp/transports/stdio-transport.ts`
- [ ] `src/services/mcp/transports/sse-transport.ts`
- [ ] `src/services/mcp/transports/http-transport.ts`

### Services - Platform
- [ ] `src/services/platform/platform-detection.service.ts`
- [ ] `src/services/platform/escape-sequence.service.ts`

### Services - Tools
- [ ] `src/services/tools/tool-stream-processor.service.ts`
- [ ] `src/services/tools/tool-output-formatter.service.ts`
- [ ] `src/services/tools/types/ui-stream-event.types.ts`

### Components - Chat
- [ ] `src/components/chat/ai-sidebar.component.ts`
- [ ] `src/components/chat/chat-interface.component.ts`
- [ ] `src/components/chat/chat-message.component.ts`
- [ ] `src/components/chat/chat-input.component.ts`
- [ ] `src/components/chat/chat-settings.component.ts`

### Components - Settings
- [ ] `src/components/settings/ai-settings-tab.component.ts`
- [ ] `src/components/settings/provider-config.component.ts`
- [ ] `src/components/settings/security-settings.component.ts`
- [ ] `src/components/settings/general-settings.component.ts`
- [ ] `src/components/settings/context-settings.component.ts`
- [ ] `src/components/settings/data-settings.component.ts`
- [ ] `src/components/settings/mcp-settings.component.ts`

### Components - Security
- [ ] `src/components/security/risk-confirm-dialog.component.ts`
- [ ] `src/components/security/password-prompt.component.ts`
- [ ] `src/components/security/consent-dialog.component.ts`

### Components - Terminal
- [ ] `src/components/terminal/command-suggestion.component.ts`
- [ ] `src/components/terminal/command-preview.component.ts`
- [ ] `src/components/terminal/ai-toolbar-button.component.ts`

### Components - Common
- [ ] `src/components/common/loading-spinner.component.ts`
- [ ] `src/components/common/error-message.component.ts`

### Providers
- [ ] `src/providers/tabby/ai-toolbar-button.provider.ts`
- [ ] `src/providers/tabby/ai-settings-tab.provider.ts`
- [ ] `src/providers/tabby/ai-config.provider.ts`
- [ ] `src/providers/tabby/ai-hotkey.provider.ts`

### Types
- [ ] `src/types/ai.types.ts`
- [ ] `src/types/provider.types.ts`
- [ ] `src/types/security.types.ts`
- [ ] `src/types/terminal.types.ts`

### Utils
- [ ] `src/utils/validation.utils.ts`
- [ ] `src/utils/formatting.utils.ts`
- [ ] `src/utils/encryption.utils.ts`
- [ ] `src/utils/cost.utils.ts`

### i18n
- [ ] `src/i18n/index.ts`
- [ ] `src/i18n/types.ts`
- [ ] `src/i18n/translations/en-US.ts`
- [ ] `src/i18n/translations/zh-CN.ts`
- [ ] `src/i18n/translations/ja-JP.ts`

### Styles
- [ ] `src/styles/ai-assistant.scss`
- [ ] `src/styles/themes.scss`

### Configuration Files
- [ ] `package.json` - Package configuration
- [ ] `tsconfig.json` - TypeScript config
- [ ] `webpack.config.js` - Webpack config (if exists)
- [ ] `setup-jest.ts` - Jest setup

## Potential Issues and Solutions

### Issue 1: API Differences
**Problem**: Tlink APIs might differ from Tabby APIs
**Solution**: 
- Create compatibility layer if needed
- Update code to use Tlink APIs
- Test thoroughly

### Issue 2: Module Loading
**Problem**: Plugin might not load correctly
**Solution**:
- Verify plugin discovery mechanism
- Check module exports
- Test plugin initialization

### Issue 3: Build System
**Problem**: Build might fail due to path issues
**Solution**:
- Update all path mappings
- Verify webpack configuration
- Test build process

### Issue 4: Runtime Errors
**Problem**: Runtime errors due to missing dependencies
**Solution**:
- Verify all dependencies are available
- Check peer dependencies
- Test in clean environment

### Issue 5: MCP Integration
**Problem**: MCP servers might not connect properly
**Solution**:
- Verify MCP transport implementations
- Test all transport types
- Check timeout and retry logic

### Issue 6: Security System
**Problem**: Security features might not work correctly
**Solution**:
- Verify risk assessment logic
- Test password protection
- Test consent management

### Issue 7: Context Management
**Problem**: Context might not be managed correctly
**Solution**:
- Verify context manager implementation
- Test memory system
- Test compaction logic

### Issue 8: File Storage
**Problem**: File storage might not work on all platforms
**Solution**:
- Verify platform-specific paths
- Test file permissions
- Test data migration

## Success Criteria

1. ✅ Plugin builds successfully
2. ✅ Plugin loads in Tlink without errors
3. ✅ All AI providers are functional
4. ✅ MCP integration works correctly
5. ✅ Security system works as expected
6. ✅ Context management functions properly
7. ✅ Chat interface is fully functional
8. ✅ Terminal integration works correctly
9. ✅ Settings UI is accessible and functional
10. ✅ Hotkeys work correctly
11. ✅ i18n system works for all languages
12. ✅ Themes work correctly
13. ✅ File storage works on all platforms
14. ✅ Data migration works correctly

## Timeline Estimate

- **Phase 1-2** (Setup & Migration): 3-4 days
- **Phase 3** (API Compatibility): 2-3 days
- **Phase 4** (Build Integration): 1-2 days
- **Phase 5** (Feature Updates): 4-5 days
- **Phase 6** (Testing): 3-4 days
- **Phase 7** (Documentation): 1-2 days

**Total Estimated Time**: 14-20 days

## Next Steps

1. Start with Phase 1: Rename and update package.json
2. Proceed with Phase 2: Update all imports
3. Test after each phase to catch issues early
4. Document any API differences found
5. Create compatibility layer if needed

## Notes

- The plugin uses Angular 15, which should be compatible with Tlink
- Multiple AI providers need individual testing
- MCP integration is complex and needs thorough testing
- Security system is critical and needs careful validation
- Context management system is sophisticated and needs testing
- File storage system needs platform-specific testing
- i18n system needs verification for all languages
- Theme system needs visual verification

## Usage and Workflow Guide

### Installation

#### Method 1: Install from Plugin Manager
1. Open Tlink settings
2. Navigate to **Plugins** section
3. Search for "AI Assistant" or "tlink-ai-assistant"
4. Click **Install**
5. Restart Tlink to complete installation

#### Method 2: Manual Installation
1. Clone or download the plugin to your plugins directory
2. Navigate to the plugin directory: `cd ~/.config/tlink/plugins/tlink-ai-assistant`
3. Install dependencies: `npm install`
4. Build the plugin: `npm run build`
5. Restart Tlink

### Initial Setup

#### Step 1: Configure AI Provider
1. Open Tlink settings
2. Navigate to **Settings → AI Assistant**
3. Select **Provider Configuration** tab
4. Choose your AI provider:
   - **OpenAI**: Enter API key, select model (e.g., GPT-4)
   - **Anthropic**: Enter API key, select model (e.g., Claude-3-Sonnet)
   - **Minimax**: Enter API key, select model (e.g., MiniMax-M2)
   - **GLM**: Enter API key, select model (e.g., GLM-4)
   - **Ollama**: Configure endpoint (default: `http://localhost:11434/v1`)
   - **vLLM**: Configure endpoint (default: `http://localhost:8000/v1`)
   - **OpenAI Compatible**: Enter custom endpoint and API key
5. Save configuration

#### Step 2: Configure Security Settings
1. Navigate to **Security Settings** tab
2. Configure security options:
   - **Password Protection**: Enable for high-risk commands
   - **Risk Assessment Level**: Set sensitivity (Low/Medium/High)
   - **Consent Persistence**: Set days to remember consent (default: 30)
3. Save settings

#### Step 3: Configure Context Settings
1. Navigate to **Context Settings** tab
2. Configure context management:
   - **Token Budget**: Set maximum tokens
   - **Memory Types**: Configure short/medium/long-term memory
   - **Auto Compaction**: Enable automatic context compression
3. Save settings

#### Step 4: Configure MCP Servers (Optional)
1. Navigate to **MCP Settings** tab
2. Click **Add Server**
3. Configure server:
   - **Name**: Give server a name
   - **Transport Type**: Choose Stdio/SSE/HTTP
   - **Configuration**: Enter transport-specific settings
   - **Auto Connect**: Enable to connect on startup
4. Click **Connect** to test
5. Save configuration

### Basic Workflow

#### Workflow 1: Chat with AI Assistant

1. **Open AI Assistant**
   - Click **AI Assistant** button in toolbar
   - Or press `Ctrl+Shift+A` (Windows/Linux) or `⌘+Shift+A` (macOS)

2. **Start Chatting**
   - Type your question in the chat input
   - Press Enter or click Send
   - AI will respond in the chat interface

3. **Use Context**
   - AI automatically uses terminal context
   - Can reference recent commands and output
   - Context is managed automatically

#### Workflow 2: Generate Commands

1. **Select Text (Optional)**
   - Select text in terminal
   - Press `Ctrl+Shift+G` (Windows/Linux) or `⌘+Shift+G` (macOS)
   - AI generates optimized command

2. **Without Selection**
   - Press `Ctrl+Shift+G`
   - AI reads terminal context
   - Generates appropriate command

3. **Review and Execute**
   - Review generated command
   - Execute if safe
   - AI provides explanation

#### Workflow 3: Explain Commands

1. **Select Command**
   - Select command in terminal
   - Press `Ctrl+Shift+E` (Windows/Linux) or `⌘+Shift+E` (macOS)
   - AI explains command details

2. **Without Selection**
   - Press `Ctrl+Shift+E`
   - AI explains last executed command

#### Workflow 4: Security Workflow

1. **Command Risk Assessment**
   - AI assesses command risk level
   - Shows risk indicator (Low/Medium/High/Extreme)

2. **User Confirmation**
   - Medium/High risk: Requires confirmation
   - Extreme risk: Requires password

3. **Consent Management**
   - User consent is remembered (30 days default)
   - Can be cleared in settings

#### Workflow 5: MCP Tool Usage

1. **Connect MCP Server**
   - Configure MCP server in settings
   - Enable auto-connect
   - Server connects on startup

2. **AI Uses Tools**
   - AI automatically discovers MCP tools
   - Uses tools when appropriate
   - Shows tool execution in chat

3. **Monitor Tool Calls**
   - View tool call history
   - Check tool call statistics
   - Review tool execution logs

### Advanced Usage

#### Context Management

**Features**:
- Automatic context compression
- Memory management (short/medium/long-term)
- Token budget management
- Context checkpoints

**Configuration**:
- Set token budget limits
- Configure memory types
- Enable auto-compaction
- Set checkpoint intervals

#### Multi-Provider Support

**Switching Providers**:
1. Go to Provider Configuration
2. Select different provider
3. Configure API key/endpoint
4. Save and switch

**Provider-Specific Features**:
- **OpenAI**: Full feature support
- **Anthropic**: Enhanced safety features
- **GLM**: Dual mode (Anthropic/OpenAI compatible)
- **Ollama**: Local processing, no API key
- **vLLM**: High-performance local inference

#### Theme Customization

**Available Themes**:
- **Follow System**: Matches OS theme
- **Light**: Classic light theme
- **Dark**: Dark background theme
- **Pixel Retro**: 8-bit pixel style
- **Cyber Tech**: Cyberpunk tech style
- **Parchment**: Vintage paper texture

**Switching Themes**:
1. Go to General Settings
2. Select theme from dropdown
3. Theme applies immediately

#### Data Management

**Export Data**:
1. Go to Data Settings
2. Click **Export All Data**
3. Save JSON backup file

**Import Data**:
1. Go to Data Settings
2. Click **Import Data**
3. Select backup file
4. Confirm import

**Migration**:
- System detects old localStorage data
- Prompts for migration
- Migrates to file storage automatically

### Hotkeys Reference

| Hotkey | Function | Description |
|--------|----------|-------------|
| `Ctrl+Shift+A` | Toggle AI Assistant | Open/close sidebar |
| `Ctrl+Shift+G` | Generate Command | Generate/optimize command |
| `Ctrl+Shift+E` | Explain Command | Explain selected/last command |

**macOS**: Use `⌘` instead of `Ctrl`

### Troubleshooting

#### AI Provider Not Working
1. Check API key is correct
2. Verify endpoint URL
3. Check network connectivity
4. Review provider logs

#### MCP Server Not Connecting
1. Verify server configuration
2. Check transport type matches server
3. Test connection manually
4. Review connection logs

#### Security Issues
1. Check password is set (if enabled)
2. Verify consent settings
3. Review risk assessment logs
4. Check security settings

#### Context Issues
1. Check token budget settings
2. Verify context configuration
3. Review memory settings
4. Check compaction settings

#### File Storage Issues
1. Verify storage directory permissions
2. Check disk space
3. Review file storage logs
4. Test data export/import

### Best Practices

1. **Security**
   - Enable password protection for high-risk commands
   - Review risk assessments carefully
   - Keep API keys secure
   - Regularly review consent records

2. **Performance**
   - Configure appropriate token budgets
   - Enable auto-compaction for long sessions
   - Use appropriate AI provider for task
   - Monitor context usage

3. **Context Management**
   - Set reasonable token budgets
   - Configure memory types appropriately
   - Use checkpoints for long sessions
   - Review context compression settings

4. **MCP Integration**
   - Use appropriate transport type
   - Configure timeouts correctly
   - Enable auto-retry for reliability
   - Monitor tool call statistics

5. **Provider Selection**
   - Use local providers (Ollama/vLLM) for privacy
   - Use cloud providers for performance
   - Test provider compatibility
   - Monitor API usage and costs

### Example Scenarios

#### Scenario 1: Development Workflow
1. Open terminal in project directory
2. Press `Ctrl+Shift+G` to generate command
3. AI suggests `npm install` based on context
4. Execute command
5. Ask AI to explain any errors
6. AI provides fix suggestions

#### Scenario 2: System Administration
1. Select system command
2. Press `Ctrl+Shift+E` to explain
3. AI explains command and parameters
4. Review risk assessment
5. Confirm if safe
6. Execute command

#### Scenario 3: Learning Commands
1. Ask AI: "How do I find large files?"
2. AI suggests `find` command
3. Ask for explanation
4. AI explains each parameter
5. Execute and learn

#### Scenario 4: MCP Tool Usage
1. Configure filesystem MCP server
2. Ask AI: "List files in /home/user"
3. AI uses MCP tool automatically
4. Results shown in chat
5. Continue conversation with context
