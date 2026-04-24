# Changelog

All notable changes to the Tlink AI Assistant plugin will be documented in this file.

## [1.0.40] - Agent Hardening + Observability

Large bug-fix + hardening release across the AI Agent pipeline.
Shipped with a new 57-test jest suite and a CI test gate so the class
of regressions this release fixes can't silently return.

### Security / correctness (critical)
- **CRITICAL: Risk-band downgrade fixed.** Every dangerous command
  (`rm -rf /`, `sudo rm`, fork bombs, `mkfs`, `curl | sh`, Cisco
  `reload` / `format`) had been silently downgraded to MEDIUM risk
  because `maxSeverity < RiskLevel.MEDIUM` was doing string
  comparison (`'critical' < 'medium'` is TRUE alphabetically). The
  risk catalog was functionally broken for weeks. Now compares via
  numeric severity. Caught by the new test suite on first run.
- **Risk patterns expanded & case-normalized.** Every pattern now
  uses `/i` so `RM -RF /` or `Conf T` can't bypass. Added patterns
  for `shred` on root, `mkfs`, raw-device redirects, classic fork
  bomb `:(){:|:&};:`, `curl|sh` / `wget|bash` pipelines, and Cisco
  gaps (`copy running-config`, `boot system`, `delete flash:`,
  `format flash:`, `tftp`).
- **MCP bridge approval gates.** `mcp_exec_command` and
  `mcp_call_tool` now prompt for approval before execution, matching
  the gate on `write_to_terminal` / `apply_patch`. Previously any
  MCP bridge tool could execute unprompted. `mcp_call_tool` also
  validates `tool_name` against `/^[a-zA-Z0-9_\-.]+$/`.
- **Secret scrubber.** New recursive redactor applied at tool-input
  logs and provider `sanitizeRequest` / `sanitizeResponse`. Catches
  Bearer tokens, OpenAI `sk-*`, Anthropic `sk-ant-*`, Google
  `AIza*`, AWS `AKIA*`/`ASIA*`, GitHub `ghp_`/`gho_`/etc., Slack
  `xox*-`, curl Authorization headers, named `api_key=` /
  `password=` assignments, and 40+ char hex blobs.

### Provider pipeline fixes
- **Tabby 422 "missing tool_call_id".** `transformMessages` was
  flattening every message to `{role, content}`, dropping
  `tool_calls` and `tool_call_id`. `chatStream` also ignored
  `delta.tool_calls` so tool calls from Tabby were silently
  dropped. Both fixed.
- **openai-compatible.service.ts:** same bug, same fix.
- **Ollama:** fallback branch in `transformMessages` was relabeling
  `system` → `assistant`. Now preserves user/system explicitly.
- **Anthropic stream abort wiring.** SDK `messages.stream()` now
  receives the AbortController signal so unsubscribe actually tears
  down the HTTP request. Also skips empty assistant `text` blocks.
- **Groq `content:null`** coerced to empty string.
- **withRetry no longer retries 4xx.** 401/422/404 bail
  immediately; respects `Retry-After` on 429.
- **apply_patch workdir false-positive.** Root and target now use
  the same `normalizeWorkingDir` path. English error message; new-
  file patches auto-create parent dirs. CRLF-file + LF-patch no
  longer fails context matching.

### Agent-loop safety
- **tool_use_id alignment.** Tool results always bind
  `tool_use_id = toolCall.id` before history append.
- **Stream timeout.** Both loops race against a hard deadline so a
  silent upstream can't wedge the Promise forever.
- **Empty-round retry cap.** "Text but no tool calls" capped at 1
  retry with a one-shot nudge; second empty round terminates.
- **Ping-pong detection.** Detects A→B→A→B→A cycles the same-call-N×
  rule missed. Default `repeatThreshold` lowered 5 → 3.
- **Tool-output truncation.** Over ~10KB trimmed to first 8KB +
  last 2KB + elision marker before hitting history.
- **Context compression.** At 40+ messages, middle collapses into
  one summary system message. Non-destructive. Tunable via
  `agentCompressionEnabled` / `Trigger` / `KeepTail`.
- **Retry-hint dedup.** Identical system hints no longer stack.

### UX / observability
- **Debug panel.** New bug-icon toggle in the sidebar header — a
  compact inspector showing provider/model/token estimate, orphaned
  tool_use_ids, and per-message rows with role / tokens / tool ids
  / preview. Orphan rows highlighted red.
- **Settings UI for agent knobs.** Compression trigger + keep-tail
  + master switch now editable in the chat settings pane.
- **One-click retry** bar above the input when the agent terminates
  on a transient failure (stream stalled, empty-round cap, ping-
  pong, network 5xx). Does NOT appear for auth/validation errors.
- **Approval modal hardening.** Esc resolves to deny; buttons
  disable after first click.
- **Draggable sidebar header** + close guard on active agent runs.

### Tool hardening
- **`write_to_terminal` input validator** rejects non-string,
  empty, >2000 chars, >3 newlines, or Markdown-code-fence-wrapped
  commands. Fails at dispatch with a clear error.
- **Tool descriptions rewritten** so small models pick `list_files`
  / `read_file` for "list the scripts" / "what does X say" instead
  of writing hallucinated output to the terminal.
- **`read_file` 5MB size cap** so runaway reads can't OOM the
  renderer.
- **`git_add` refuses flag-shaped args (`-*`) and pathspec magic
  (`:*`). `git_commit` caps message length and rejects control
  chars.

### Infrastructure
- **57-test jest suite** across 4 specs covering risk patterns,
  `transformMessages` round-tripping, `withRetry` 4xx handling, and
  history compression. Runs in ~5 seconds.
- **Tests gate the build.** `npm run build` runs
  `jest && webpack && build-fix`; `build:skip-tests` as escape
  hatch. CI Lint job also runs the suite so regressions fail at
  push.

### Help
- New sections under "AI Agent" covering the debug panel, the
  compression config keys, and the regression tests.

---

## [1.0.39] - Tabby Provider Integration

### Added
- **Tabby AI Provider Support**: Integrated TabbyML self-hosted AI coding assistant
  - New `TabbyProviderService` with OpenAI-compatible API format
  - Support for chat, streaming, command generation, and explanation
  - Bearer token authentication for secure connections
  - Default configuration: `http://localhost:8080` with 16384 token context window
  - UI configuration in provider settings with documentation link
  - Full integration with existing provider management system

### Documentation
- **README Updates**: Added Tabby to supported providers list and feature overview
- **Configuration Guide**: Added Tabby setup instructions with server installation steps
- **CHANGELOG**: Documented Tabby provider integration in v1.0.39

---

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
