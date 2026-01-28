# Changelog

All notable changes to the Tlink AI Assistant plugin will be documented in this file.

## [1.0.38] - Migration to Tlink

### Changed
- **Migration from Tabby to Tlink**: Complete rebranding and migration
  - Plugin renamed from `tabby-ai-assistant` to `tlink-ai-assistant`
  - All imports updated from `tabby-*` to `tlink-*`
  - All module declarations updated to use Tlink plugins
  - Configuration keys updated (with backward compatibility for migration)
  - Default language changed from `zh-CN` to `en-US`
  
### Fixed
- **Settings Tab Opening**: Fixed incorrect method for opening settings tab
  - Now uses `SettingsTabComponent` via `nodeRequire`
  - Uses `activeTab` property instead of `focusSection`
  - Properly handles existing settings tabs and split containers

### Added
- **Build System Integration**: Complete webpack and build configuration
  - Created `webpack.config.mjs` with proper Angular preset
  - Created `tsconfig.typings.json` for TypeScript declarations
  - Added HTML loader for Angular component templates
  - Added coverage configuration with 50% minimum thresholds
  - Plugin registered in Tlink's build system (`scripts/vars.mjs`)

### Testing
- **Jest Configuration**: Complete testing infrastructure
  - Created `jest.config.js` with Angular preset
  - Updated test setup files (comments translated to English)
  - Fixed integration test security (API keys use environment variables)
  - Added coverage reporting

### Documentation
- **README Updates**: Updated all references to Tlink
- **CHANGELOG**: Created comprehensive changelog

---

## [1.0.37] - Sidebar Title Bar Optimization

### Fixed
- **macOS Compatibility**: Fixed system control buttons (red/yellow/green) being blocked by sidebar
- **UI Enhancement**: Added branded title bar (AI Assistant logo + draggable area)
- **Cross-Platform**: macOS 38px / Windows/Linux 32px height
- **Platform Detection**: Injected PlatformDetectionService for platform detection

---

## [1.0.35] - OpenAI Compatible Streaming Fix

### Fixed
- **Issue #5**: Fixed "Custom site cannot chat" - 400 error
- **Root Cause**: openai-compatible provider forced `stream: true`, but some third-party sites don't support it
- **Added Config**: `disableStreaming` configuration option (disable streaming response)
- **Added Template**: Settings UI added "OpenAI Compatible Site" configuration template
- **Added Field Types**: Support for checkbox and number type field rendering
- **Code Optimization**: `chatStream()` method detects config, automatically falls back to non-streaming requests
- **User Guide**: If site doesn't support streaming, check "Disable Streaming Response"

---

## [1.0.34] - GLM Provider Dual Mode Support

### Enhanced
- **Dual Mode**: GLM supports two API formats (Anthropic compatible + OpenAI compatible)
- **Auto Detection**: Automatically selects implementation based on Base URL
  - `/api/anthropic` → Anthropic SDK (automatic SSE parsing)
  - `/api/paas/v4` → Axios (responseType: 'text' + manual parsing)
- **Browser Compatibility**: Fixed `responseType: 'stream'` not supported in browser environment

### Refactoring
- Added `detectApiMode()` method for automatic API mode detection
- Added `chatWithAnthropicSdk()` / `chatWithAxios()` to separate implementations
- Added `chatStreamWithAnthropicSdk()` / `chatStreamWithAxios()` for streaming
- Unified response conversion methods `transformChatResponse()` / `transformOpenAIResponse()`

---

## [1.0.30] - Configurable Agent Max Rounds

### Fixed
- **Issue #1**: "Reached max rounds 30" - Users cannot customize max rounds limit
- **Added Config**: `agentMaxRounds` configuration option (default 50, range 10-200)
- **Added UI**: Visual configuration interface in "Chat Settings → Chat Behavior"
- **Code Optimization**: `ai-sidebar.component.ts` reads `maxRounds` from config, replacing hardcoded value
- **Enhanced Detection**: Extended INCOMPLETE_PATTERNS and SUMMARY_PATTERNS regex patterns
- **Added i18n**: agentMaxRounds setting supports EN/CN/JP three languages

---

## [1.0.28] - Minimax Provider Tool Call Deep Fix

### Fixed
- **Tool Call Events**: Fixed missing tool call events, AI outputting `<invoke>` XML format
- **Core Fix 1**: Refactored `transformMessages` to use Anthropic tool_use/tool_result format
- **Core Fix 2**: Enhanced `buildToolResultMessage` to add toolResults field
- **Core Fix 3**: Preserved toolCalls in message object for next round conversion
- **Core Fix 4**: Simplified `buildAgentSystemPrompt` to prevent AI from mimicking XML
- **Type Extension**: ChatMessage added toolCalls, toolResults, tool_use_id fields

---

## [1.0.27] - Regex Matching Comprehensive Optimization

### Fixed
- **Early Termination**: Agent terminated in round 5 due to "no_tools" false positive
- **Root Cause**: Patterns like "now re-query" not covered by INCOMPLETE_PATTERNS
- **Enhancement**: INCOMPLETE_PATTERNS increased from ~40 to ~120+ patterns
- **Added Chinese Patterns**: Retry, continue, again, try again, check, etc.
- **Added English Patterns**: again, retry, try again, let me try, need to try, etc.
- **Extended SUMMARY_PATTERNS**: wrap up, concluding, finish up, etc.

---

## [1.0.26] - Context System and Tool Call Integration

### Enhanced
- **Context Manager Integration**: ContextManager integrated into Agent loop
- **Effective History**: Uses `getEffectiveHistory()` to get intelligently filtered history messages
- **ReAct Framework**: Agent system prompt adds ReAct framework (Thought → Action → Observation)
- **Task Complete Tool**: Emphasized `task_complete` tool as the only task completion method
- **Optimization**: maxRounds increased from 5 to 30, supporting complex tasks
- **New Method**: `convertToAgentMessage()` - ApiMessage to ChatMessage conversion
- **Added**: History summary message marker `[History Summary]`

---

## [1.0.25] - Agent Loop Logic Fix

### Fixed
- **BUG**: checkTermination returned shouldTerminate: false but still terminated directly
- **Root Cause**: else branch ignored checkTermination result and called subscriber.complete()
- **Fix**: else branch checks !termination.shouldTerminate before continuing next round
- **Optimization**: Uses termination.reason as termination reason instead of hardcoded 'no_tools'

---

## [1.0.24] - Agent Duplicate Execution Fix

### Fixed
- **BUG**: Agent repeated previously completed operations
- **Root Cause**: buildAgentMessages filtered out all ASSISTANT messages, causing tool execution results to be lost
- **Fix**: Preserved AI replies but cleaned tool card HTML
- **New Method**: cleanToolCardHtml() - Removes HTML while preserving plain text results
- **Optimization**: History messages now include previous tool execution results

---

## [1.0.23] - Agent Early Termination Fix

### Fixed
- **BUG**: AI said "let me use tool" but terminated without calling
- **Enhancement**: Extended INCOMPLETE_PATTERNS regex (added MCP/tool-related patterns)
- **Enhancement**: Added tool name mention detection (mentionsToolWithoutCalling)
- **New Termination Reason**: 'mentioned_tool' - AI mentioned tool but didn't call
- **New Type**: TerminationReason enum added 'mentioned_tool'
- **Optimization**: buildAgentSystemPrompt added "forbidden behaviors" rules

---

## [1.0.22] - Agent History Context Optimization

### Fixed
- **BUG**: Agent directly accessed wrong memory instead of executing commands
- **Enhancement**: History message limit (MAX_AGENT_HISTORY = 10)
- **Enhancement**: Agent system prompt emphasizes "must execute tools"
- **Optimization**: Separated system messages and conversation messages, history only keeps last 10
- **New Methods**: buildAgentMessages(), buildAgentSystemPrompt()

---

## [1.0.21] - MCP Reliability Enhancement

### Added
- **Request Timeout Management**: Unified timeout configuration
- **Auto Retry Mechanism**: Maximum 3 retries with incremental delay (1s → 2s → 3s)
- **Tool Call Logging**: MCPToolCall history recording
- **New APIs**: getToolCallHistory(), getToolCallStats(), clearToolCallHistory()
- **New Type**: MCPToolCallStats interface

---

## [1.0.20] - MCP (Model Context Protocol) Support

### Added
- **MCP Protocol**: Type definitions (mcp-message.types.ts)
- **Transport Layer**: Stdio, SSE, HTTP three transport methods
- **MCP Client Manager**: MCPClientManager
- **MCP Server Configuration UI**: MCPSettingsComponent
- **Server Editor Dialog**: MCPServerDialogComponent
- **Auto Discovery**: Automatically discovers and calls MCP tools
- **i18n**: MCP settings interface supports EN/CN/JP three languages
- **Storage**: MCP server configuration stored in `mcp-servers.json`

---

## [1.0.17] - Data Management Enhancement

### Added
- **File Storage Service**: FileStorageService
- **Data Migration**: Migration from localStorage to file storage
- **Data Management UI**: Data management settings page
- **Export/Import**: Export/import all data
- **File Management**: View and manage storage files
- **Browser Storage Migration**: Migrate data from browser storage
- **i18n**: Data management page supports EN/CN/JP three languages
- **Storage Location**: `%APPDATA%/tlink/plugins/tlink-ai-assistant/data`

---

## [1.0.16] - Theme System Enhancement

### Fixed
- **Dark Theme**: Fixed dark theme appearing same as system theme
- **New Themes**: Parchment (retro paper texture light theme), Pixel (8-bit pixel style), Cyber Tech (cyberpunk tech style)
- **UI Optimization**: Dark theme uses deeper background color (#0d0d14)
- **i18n**: Japanese translation support added

---

## [1.0.15] - Smart Agent Tool Call Loop & Hotkey Features

### Fixed
- **RxJS Issue**: Fixed tool call loop interruption caused by RxJS async complete callback
- **Agent Loop**: Complete Agent multi-round tool call loop
- **Termination Detector**: Intelligent termination detection (6 conditions: task_complete, no_tools, summarizing, repeated_tool, high_failure_rate, timeout)
- **Task Complete Tool**: Allows AI to actively end tasks
- **Hotkeys**: `Ctrl+Shift+G` command generation, `Ctrl+Shift+E` command explanation
- **Performance**: Regex pre-compilation, incomplete/summary hint detection
- **New Types**: `MessageRole.TOOL`, `TerminationReason`, `AgentState`, etc.

---

## [1.0.12] - Code Deduplication, Type Optimization, Configuration Unification

### Changed
- Removed ~800 lines of duplicate code from 7 providers
- `BaseAiProvider` changed from abstract class to interface + abstract class implementation
- Added unified configuration system `PROVIDER_DEFAULTS`

---

## Initial Release

### Features
- Multiple AI provider support (OpenAI, Anthropic, Minimax, GLM, Ollama, vLLM)
- Intelligent command generation
- Command explanation
- Error fixing
- Terminal awareness
- Security validation
- Risk assessment
- Password protection
- Consent management
- MCP server support
- Theme system
- i18n support (EN, CN, JP)
- File storage system
- Data management

---

## Migration Notes

### From Tabby to Tlink (v1.0.38+)

When upgrading from `tabby-ai-assistant` to `tlink-ai-assistant`:

1. **Data Migration**: The plugin will automatically detect old `tabby-ai-assistant-*` keys in localStorage and prompt for migration
2. **Configuration**: All configuration is automatically migrated to Tlink's configuration system
3. **Storage**: Data is migrated from browser localStorage to file storage system
4. **No Data Loss**: All chat history, memories, and settings are preserved during migration

### Breaking Changes
- Plugin name changed: `tabby-ai-assistant` → `tlink-ai-assistant`
- Package name changed in package.json
- Module imports changed: `tabby-*` → `tlink-*`

### Deprecated
- Browser localStorage storage (migrated to file storage)
- Old configuration keys `tabby-ai-assistant-*` (migrated to `tlink-ai-assistant-*`)
