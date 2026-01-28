# Tlink AI Assistant Plugin

A powerful Tlink terminal AI assistant plugin that supports multiple AI providers, providing intelligent command generation, explanation, and security validation features.

## 🌟 Features

### Core Features
- **Multiple AI Provider Support** - Supports OpenAI, Anthropic, Minimax, GLM, Ollama, vLLM, and more
- **Intelligent Command Generation** - Natural language to terminal command conversion with high accuracy
- **Command Explanation** - Detailed explanations of command meanings and usage
- **Error Fixing** - Automatic error analysis and repair suggestions
- **Terminal Awareness** - Real-time terminal state perception
- **Smart Agent Tool Call Loop** - Supports multi-round automatic tool calling with intelligent termination detection
- **MCP Server Support** - Extends AI tool capabilities through Model Context Protocol

### Security Features
- **Multi-Level Risk Assessment** - Automatic identification of dangerous commands (Low/Medium/High/Critical risk)
- **User Consent Management** - 30-day consent persistence
- **Password Protection** - High-risk commands require password verification
- **Security Mode** - Automatically blocks extremely dangerous operations

### Tlink Integration
- **Settings Page** - Dedicated configuration tab
- **Toolbar Button** - One-click access to AI assistant
- **Hotkey Support** - Customizable shortcuts + intelligent terminal context awareness
- **Theme Support** - 6 themes: Follow system, Light, Dark, Pixel Retro, Cyber Tech, Parchment
- **Context Menu** - Right-click quick actions
- **Data Management** - File storage, import/export, migration tools

## 🚀 Supported AI Providers

### Cloud Service Providers

| Provider | Default Endpoint | Default Model | Features |
|----------|-----------------|---------------|----------|
| **OpenAI** | `https://api.openai.com/v1` | GPT-4 | Comprehensive features, stable performance |
| **Anthropic** | `https://api.anthropic.com` | Claude-3-Sonnet | High security, strong reasoning capabilities |
| **Minimax** | `https://api.minimaxi.com/anthropic` | MiniMax-M2 | Optimized for code |
| **GLM** | `https://open.bigmodel.cn/api/anthropic` | GLM-4.6 | Chinese optimized, supports dual mode |

#### GLM Dual Mode Support

The GLM provider supports two API formats and automatically selects based on Base URL:

| Mode | Base URL | Endpoint | Technical Implementation |
|------|----------|----------|-------------------------|
| **Anthropic Compatible** | `https://open.bigmodel.cn/api/anthropic` | `/v1/messages` | Anthropic SDK |
| **OpenAI Compatible** | `https://open.bigmodel.cn/api/paas/v4` | `/chat/completions` | Axios (responseType: 'text') |

**Auto Detection**: Automatically selects mode based on Base URL:
- Contains `/anthropic` → Uses Anthropic SDK
- Others → Uses Axios (OpenAI format)

**Browser Compatibility**: Fixed `responseType: 'stream'` compatibility issues in browser environments.

### Local/Self-Hosted Providers

| Provider | Default Endpoint | Default Model | Features |
|----------|-----------------|---------------|----------|
| **Ollama** | `http://localhost:11434/v1` | llama3.1 | Local execution, no API key required |
| **vLLM** | `http://localhost:8000/v1` | Llama-3.1-8B | High-performance inference framework |
| **OpenAI Compatible** | Custom | Custom | Compatible with DeepSeek, OneAPI and other third-party sites, supports disabling streaming response |

## vLLM with Tlink AI Assistant (What / Where / Who / When / How)

### What
In Tlink AI Assistant, vLLM is a local provider that speaks the OpenAI-compatible Chat Completions API. The assistant calls `POST /v1/chat/completions` with your configured model.

### Where
Run vLLM on a machine you control (local workstation, on-prem server, or private VM). Tlink connects to `http://<host>:8000/v1`.

### Who
Use vLLM with Tlink AI Assistant if you need:
- Local inference with low latency
- Full control of prompts and data
- An OpenAI-compatible endpoint for the assistant

### When
Choose vLLM when GPU capacity is available and you want self-hosted inference instead of a cloud provider.

### How (Setup)
1) Start the vLLM OpenAI-compatible server:
```bash
python -m vllm.entrypoints.openai.api_server \
  --model mistralai/Mistral-7B-Instruct-v0.3 \
  --host 0.0.0.0 \
  --port 8000
```
2) Verify the API works:
```bash
curl -i http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"mistralai/Mistral-7B-Instruct-v0.3","messages":[{"role":"user","content":"ping"}],"stream":false}'
```
3) Configure Tlink AI Assistant:
   - Open Tlink settings -> AI Assistant -> Local Providers
   - Select **vLLM (Local)**
   - Base URL: `http://<host>:8000/v1`
   - Model: must match a name from `GET /v1/models`
   - API Key: optional (only if your vLLM server enforces auth)
4) Save config and select vLLM as the active provider.

Notes:
- Keep the model name in Tlink in sync with the vLLM server.
- If the server is remote, ensure the host and port are reachable from the Tlink machine.

## 🔌 MCP Server Support

### What is MCP?

MCP (Model Context Protocol) is an open protocol proposed by Anthropic that allows AI models to communicate with external tools and services. Through MCP servers, you can extend the AI assistant's capabilities to access more tools and data sources.

### Supported Transport Types

| Transport Type | Use Case | Configuration |
|----------------|----------|---------------|
| **Stdio** | Local processes | command, args, env, cwd |
| **SSE** | Remote servers | url, headers |
| **HTTP** | HTTP services | url, headers, session management |

### Configuring MCP Servers

1. Open Tlink settings → AI Assistant → **MCP Server** tab
2. Click **Add Server** button
3. Select transport type and fill in configuration:
   - **Stdio**: Enter command, arguments, environment variables, and working directory
   - **SSE/HTTP**: Enter server URL and request headers
4. Enable **Auto Connect** option, server will automatically connect on startup
5. Click **Connect** button to test connection

### Example: Adding a Local MCP Server

```json
{
    "name": "filesystem",
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
    "env": {},
    "cwd": "/home/user",
    "enabled": true,
    "autoConnect": true
}
```

### Available MCP Tools

After connecting to an MCP server, the AI assistant will automatically discover and use tools provided by the server. Tool names follow the format `mcp_{serverId}_{toolName}`.

### Advanced Features

#### Timeout Management
Each MCP server can be configured with request timeout:
```json
{
    "name": "myserver",
    "timeout": 60000,
    ...
}
```
- **Default Timeout**: 30 seconds
- **Range**: 1 second ~ 5 minutes

#### Auto Retry
Automatically retries when tool calls fail:
- **Max Retry Count**: 3 times
- **Retry Delay**: Incremental delay (1s → 2s → 3s)
- **Logging**: Each retry has log output

#### Call Logging
System records all tool call history:
- **Retention Count**: Maximum 1000 entries
- **Recorded Content**: clientId, toolName, arguments, result, success, duration, timestamp
- **Statistics**: Supports querying call statistics (total/success/failure/average duration)

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection timeout | Increase `timeout` configuration value |
| Tool call failure | Check server logs, enable retry mechanism |
| Frequent disconnections | Confirm server URL or command configuration is correct |

## 📦 Installation

### Install from Source
```bash
cd tlink-ai-assistant
npm install
npm run build
```

### Enable in Tlink
1. Open Tlink settings
2. Navigate to "Plugins" tab
3. Find "AI Assistant" plugin and enable it
4. Restart Tlink

## ⚙️ Configuration

### 1. Set API Keys
1. Open Tlink settings → AI Assistant
2. Select AI provider
3. Enter API key (local services like Ollama don't require keys)
4. Select model
5. Save settings

### 2. Configure Security Options
- **Password Protection**: Enable password verification for high-risk commands
- **Consent Expiration**: Set user consent save duration (default 30 days)
- **Auto Approval**: Automatically execute low-risk commands

### 4. Theme Settings
Supports 6 visual themes:
| Theme | Description |
|-------|-------------|
| Follow System | Automatically matches OS theme |
| Light Theme | Classic light interface |
| Dark Theme | Dark background eye-protection mode |
| Pixel Retro | 8-bit pixel style |
| Cyber Tech | Cyberpunk tech style |
| Parchment | Retro paper texture light theme |

### 5. Custom Hotkeys
Default hotkeys:
- `Ctrl-Shift-A`: Open AI assistant chat
- `Ctrl-Shift-G`: Generate/Optimize command
- `Ctrl-Shift-E`: Explain command

## 🎯 Usage Guide

### Chat Mode
1. Click the AI assistant icon in the toolbar
2. Enter your question in the chat box
3. AI will answer your question

### Hotkeys

| Hotkey | Function | Description |
|--------|----------|-------------|
| `Ctrl+Shift+A` | Open/Close AI Assistant | Toggle sidebar display |
| `Ctrl+Shift+G` | Generate/Optimize Command | Intelligently senses terminal selection, command history, and context |
| `Ctrl+Shift+E` | Explain Command | Intelligently senses terminal selection or recently executed command |

### Intelligent Terminal Awareness
Hotkey functions automatically obtain context from the terminal:
- **Selected Text**: Uses currently selected text as input
- **Command History**: Automatically reads recently executed commands
- **Terminal Output**: Gets recent terminal output as reference context

### Command Generation (Ctrl+Shift+G)
**Method 1: Select Text**
1. Select text or command in terminal
2. Press `Ctrl+Shift+G`
3. Sidebar automatically opens and fills prompt
4. AI generates optimized command

**Method 2: Based on Context**
1. No need to select text
2. Press `Ctrl+Shift+G`
3. AI reads terminal's recent history and output
4. Generates command suitable for current scenario

### Command Explanation (Ctrl+Shift+E)
**Method 1: Select Text**
1. Select command in terminal
2. Press `Ctrl+Shift+E`
3. AI provides detailed explanation of each part of the command

**Method 2: Explain History Command**
1. No need to select text
2. Press `Ctrl+Shift+E`
3. AI automatically reads recently executed command and explains it

### Error Fixing
1. When command execution fails
2. AI automatically detects error
3. Provides repair suggestions
4. Generates repair command

## 🔒 Security Mechanism

### Risk Levels
- **Low Risk** (Green): Safe commands, e.g., `ls`, `cat`, `grep`
- **Medium Risk** (Yellow): System query commands, e.g., `ps`, `df`, `find`
- **High Risk** (Orange): System modification commands, e.g., `chmod`, `mv`, `rm`
- **Critical Risk** (Red): Dangerous commands, e.g., `rm -rf /`, `fork(`

### Protection Measures
1. **Pattern Matching**: Automatically identifies dangerous command patterns
2. **User Confirmation**: Medium and high-risk commands require confirmation
3. **Password Verification**: Critical risk commands require password
4. **Consent Persistence**: Remembers user's choices (30 days)

## 📁 Data Management

### File Storage
Plugin data is stored in user-accessible directory:
- **Windows**: `%APPDATA%\tlink\plugins\tlink-ai-assistant\data`
- **Linux/macOS**: `$HOME/.config/tlink/plugins/tlink-ai-assistant/data`

### Storage Files
| File | Description |
|------|-------------|
| `memories.json` | AI memory data (short/medium/long-term) |
| `chat-sessions.json` | Chat session history |
| `checkpoints.json` | Context checkpoints |
| `config.json` | Plugin configuration |
| `consents.json` | User authorization records |
| `password.json` | Password hash |
| `context-config.json` | Context configuration |
| `auto-compact.json` | Auto-compact settings |

### Features
- **View Data Directory**: Open data storage directory in settings
- **Export All Data**: Export all data as JSON backup file
- **Import Data**: Restore data from backup file
- **Migrate Data**: Migrate from browser localStorage to file storage
- **Clear Data**: One-click clear all stored data

### Migration Notes
After upgrading from an older version, the system will detect old data in browser storage and prompt whether to migrate to the new file storage system.

## 🏗️ Project Architecture

### Tech Stack
- **Angular 15** - UI framework
- **TypeScript** - Type safety
- **Webpack 5** - Module bundling
- **RxJS** - Reactive programming

### Project Structure

```
tlink-ai-assistant/
├── src/
│   ├── index.ts                      # Angular main module
│   ├── types/                        # Type definitions
│   │   ├── ai.types.ts               # AI-related types (ChatRequest, ChatResponse, etc.)
│   │   ├── provider.types.ts         # Provider types + PROVIDER_DEFAULTS
│   │   ├── security.types.ts         # Security types
│   │   └── terminal.types.ts         # Terminal types
│   ├── services/                     # Service layer
│   │   ├── core/                     # Core services
│   │   │   ├── ai-assistant.service.ts
│   │   │   ├── ai-provider-manager.service.ts
│   │   │   ├── config-provider.service.ts
│   │   │   ├── logger.service.ts
│   │   │   └── toast.service.ts      # Toast notification service
│   │   ├── providers/                # AI provider implementations
│   │   │   ├── base-provider.service.ts    # Base class (with common methods)
│   │   │   ├── anthropic-provider.service.ts
│   │   │   ├── glm-provider.service.ts
│   │   │   ├── minimax-provider.service.ts
│   │   │   ├── ollama-provider.service.ts
│   │   │   ├── openai-compatible.service.ts
│   │   │   ├── openai-provider.service.ts
│   │   │   └── vllm-provider.service.ts
│   │   ├── security/                 # Security services
│   │   │   └── risk-assessment.service.ts
│   │   ├── mcp/                      # MCP protocol implementation
│   │   │   ├── mcp-message.types.ts       # MCP message type definitions
│   │   │   ├── mcp-client-manager.service.ts  # MCP client manager
│   │   │   └── transports/                # Transport layer implementation
│   │   │       ├── base-transport.ts      # Transport base class
│   │   │       ├── stdio-transport.ts     # Stdio transport
│   │   │       ├── sse-transport.ts       # SSE transport
│   │   │       └── http-transport.ts      # HTTP transport
│   │   └── terminal/                 # Terminal services
│   │       └── terminal-context.service.ts
│   ├── components/                   # UI components
│   │   ├── ai-sidebar.component.ts
│   │   ├── chat/                     # Chat components
│   │   ├── settings/                 # Settings components (includes mcp-settings)
│   │   ├── security/                 # Security components
│   │   ├── terminal/                 # Terminal components
│   │   └── common/                   # Common components
│   └── styles/                       # Style files
│       └── ai-assistant.scss
├── webpack.config.mjs                # Webpack configuration
├── tsconfig.json                     # TypeScript configuration
└── package.json                      # Dependency configuration
```

### Design Patterns

#### 1. Provider Pattern
```
IBaseAiProvider (Interface)
    ↑
    └── BaseAiProvider (Abstract class, contains common methods)
            ↑
            ├── OpenAiProviderService
            ├── AnthropicProviderService
            ├── MinimaxProviderService
            └── ...
```

#### 2. Configuration Unification
- All provider default configurations stored in `PROVIDER_DEFAULTS`
- Uses `ProviderConfigUtils` utility functions to process configuration
- Configuration automatically filled from unified default values

## 🔧 Development

### Build
```bash
npm run build      # Production build
npm run watch      # Development mode (auto recompile)
npm run clean      # Clean build files
```

### Adding New Provider
1. Add default values in `PROVIDER_DEFAULTS` in `provider.types.ts`
2. Create provider service class, inherit from `BaseAiProvider`
3. Implement necessary abstract methods
4. Register provider in `ai-provider-manager.service.ts`

## 📜 Changelog

For detailed changelog, see [CHANGELOG.md](CHANGELOG.md)

### Recent Version History

- **v1.0.38**: OpenAI Compatible Interface Agent Mode Tool Call Fix
  - **Bug Fix**: "AI indicated incomplete task but no tools called" error
  - **Root Cause**: Non-streaming fallback (disableStreaming) mode ignored `tool_calls`
  - **Fix**: Correctly parse and emit `tool_use_start` / `tool_use_end` events in non-streaming responses
  - **Affected Scenarios**: Using DeepSeek, OneAPI and other third-party sites that don't support streaming

- **v1.0.37**: Sidebar Title Bar Optimization - Cross-Platform UI Enhancement
  - **Bug Fix**: macOS system control buttons (red/yellow/green) blocked by sidebar
  - **New Component**: Branded title bar (AI Assistant logo + draggable area)
  - **Cross-Platform**: macOS 38px / Windows/Linux 32px height
  - **UI Enhancement**: Unified brand display, supports window dragging
  - **Technical Implementation**: Injected PlatformDetectionService for platform detection

- **v1.0.35**: OpenAI Compatible Site Streaming Response Fix (Fix #5)
  - **Bug Fix**: Issue #5 "Custom site cannot chat" - 400 error
  - **Root Cause**: openai-compatible provider forced `stream: true`, some third-party sites don't support it
  - **New Config**: `disableStreaming` configuration option (disable streaming response)
  - **New Template**: Added "OpenAI Compatible Site" configuration template in settings UI
  - **New Field Types**: Support for checkbox and number type field rendering
  - **Code Optimization**: `chatStream()` method detects config, automatically falls back to non-streaming requests
  - **User Guide**: If site doesn't support streaming, check "Disable Streaming Response"

- **v1.0.34**: GLM Provider Dual Mode Support
  - **Enhancement**: GLM supports two API formats (Anthropic compatible + OpenAI compatible)
  - **Technical Architecture**: Automatically selects implementation based on Base URL
    - `/api/anthropic` → Anthropic SDK (automatic SSE parsing)
    - `/api/paas/v4` → Axios (responseType: 'text' + manual parsing)
  - **Bug Fix**: Fixed `responseType: 'stream'` not supported in browser environment
  - **Core Refactoring**:
    - Added `detectApiMode()` method for automatic API mode detection
    - Added `chatWithAnthropicSdk()` / `chatWithAxios()` to separate implementations
    - Added `chatStreamWithAnthropicSdk()` / `chatStreamWithAxios()` for streaming
    - Unified response conversion methods `transformChatResponse()` / `transformOpenAIResponse()`
  - **Benefit**: Enhanced plugin robustness, supports more GLM API endpoint configurations

- **v1.0.30**: Configurable Agent Max Rounds (Fix #1)
  - **Bug Fix**: Issue #1 "Reached max rounds 30" - Users cannot customize max rounds limit
  - **New Config**: `agentMaxRounds` configuration option (default 50, range 10-200)
  - **New UI**: Added visual configuration interface in "Chat Settings → Chat Behavior"
  - **Code Optimization**: `ai-sidebar.component.ts` reads `maxRounds` from config, replacing hardcoded value
  - **Enhanced Detection**: Extended INCOMPLETE_PATTERNS and SUMMARY_PATTERNS regex patterns
  - **New i18n**: agentMaxRounds setting supports EN/CN/JP three languages

## 📝 API Documentation

### IBaseAiProvider Interface
```typescript
interface IBaseAiProvider {
    // Identity
    readonly name: string;
    readonly displayName: string;
    readonly capabilities: ProviderCapability[];
    readonly authConfig: AuthConfig;

    // Configuration & Status
    configure(config: ProviderConfig): void;
    getConfig(): ProviderConfig | null;
    isConfigured(): boolean;
    isEnabled(): boolean;

    // Core Features
    chat(request: ChatRequest): Promise<ChatResponse>;
    chatStream(request: ChatRequest): Observable<any>;
    generateCommand(request: CommandRequest): Promise<CommandResponse>;
    explainCommand(request: ExplainRequest): Promise<ExplainResponse>;
    analyzeResult(request: AnalysisRequest): Promise<AnalysisResponse>;

    // Health & Validation
    healthCheck(): Promise<HealthStatus>;
    validateConfig(): ValidationResult;

    // Information Query
    getInfo(): ProviderInfo;
    supportsCapability(capability: ProviderCapability): boolean;
}
```

### ProviderConfigUtils
```typescript
namespace ProviderConfigUtils {
    // Fill configuration with default values
    function fillDefaults(config: Partial<ProviderConfig>, providerName: string): ProviderConfig;

    // Check if configuration is complete
    function isConfigComplete(config: ProviderConfig): boolean;

    // Clone configuration (optionally mask API key)
    function cloneConfig(config: ProviderConfig, maskApiKey?: boolean): ProviderConfig;

    // Get known provider list
    function getKnownProviders(): string[];
}
```

## 🤝 Contributing

Contributions via Issues and Pull Requests are welcome!

### Development Guide
1. Fork this project
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details

## 🙏 Acknowledgments

- [Tlink](https://github.com/amishagrawal2001-arch/tlink) - Powerful terminal emulator
- [Anthropic](https://anthropic.com/) - Claude AI
- [Minimax](https://minimaxi.com/) - AI services
- [Zhipu AI](https://open.bigmodel.cn/) - GLM

---

**Note**: Before using this plugin, please ensure you understand the effects of the commands you execute. For dangerous commands, please backup important data!
