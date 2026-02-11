# Available MCP Servers & Tools in Tlink

## Overview
Tlink implements a Model Context Protocol (MCP) server that provides tools for terminal command execution, SSH session management, and VSCode integration. The MCP server is built using the official `@modelcontextprotocol/sdk` and exposed via SSE (Server-Sent Events) transport.

---

## MCP Server Infrastructure

### Main MCP Service
- **Class**: `McpService` (located in `builtin-plugins/tabby-vscode-agent/src/services/mcpService.ts`)
- **Server Name**: "Tabby"
- **Version**: 1.0.0
- **Transport**: SSE (Server-Sent Events) over HTTP

### Server Endpoints
- **Health Check**: `GET /health` - Returns "OK"
- **SSE Connection**: `GET /sse` - Establishes SSE connection for MCP protocol
- **Message Handler**: `POST /messages` - Handles SSE messages with `sessionId` query parameter
- **Tool API**: `POST /api/tool/{toolName}` - Direct HTTP access to tools

---

## Available Tool Categories

### 1. **Execution Tools** (ExecToolCategory)
Category Name: `exec`

#### Tools:

##### a) **get_ssh_session_list**
- **Description**: Returns a list of all available terminal sessions (SSH and local) with their IDs and status information
- **Parameters**: None (empty schema)
- **Returns**: 
  ```typescript
  Array<{
    id: string;
    title: string;
    customTitle: string;
    hasActivity: boolean;
    hasFocus: boolean;
  }>
  ```
- **Use Cases**: Find available terminal sessions before executing commands, determine which terminal is currently focused

##### b) **exec_command**
- **Description**: Execute a shell command in a terminal session and return the command output, exit code, and shell prompt
- **Parameters**:
  ```typescript
  {
    command: string;           // The shell command to execute
    tabId?: string;            // Optional: ID of terminal tab (uses current if not provided)
    commandExplanation?: string; // Optional: Explanation of what the command does
  }
  ```
- **Returns**:
  ```typescript
  {
    output: string;            // Command output (truncated to 250 lines if longer)
    promptShell: string;       // The shell prompt (e.g., "user@host:~$")
    exitCode: number;          // Command exit code (0 = success)
    aborted: boolean;          // Whether command was aborted
    outputId: string;          // ID for retrieving full output
    message?: string;          // Optional truncation/status message
  }
  ```
- **Features**:
  - Automatic retry up to 3 times on execution failures
  - Output truncation to prevent context overflow
  - Unique output ID for pagination
  - Command explanation tracking

##### c) **get_command_output**
- **Description**: Retrieve the full or paginated output of a previously executed command using its outputId
- **Parameters**:
  ```typescript
  {
    outputId: string;          // Unique ID from exec_command
    startLine?: number;        // Starting line (1-based, default: 1)
    maxLines?: number;         // Max lines to return (default: 250, max: 1000)
  }
  ```
- **Returns**:
  ```typescript
  {
    command: string;           // Original command text
    output: string;            // Paginated command output
    promptShell: string;       // Shell prompt
    exitCode: number;          // Command exit code
    aborted: boolean;          // Whether command was aborted
    pagination: {
      startLine: number;       // Starting line of this page
      endLine: number;         // Ending line of this page
      totalLines: number;      // Total lines in complete output
      part: number;            // Current page number
      totalParts: number;      // Total number of pages
      maxLines: number;        // Maximum lines per page
    }
  }
  ```
- **Use Cases**: Retrieve complete output of long-running commands, paginate through large outputs

##### d) **get_terminal_buffer**
- **Description**: Retrieve the current content (text buffer) of a terminal session with options to specify line ranges
- **Parameters**:
  ```typescript
  {
    tabId: string;             // ID of the terminal tab
    startLine?: number;        // Starting line from bottom (1-based, default: 1)
    endLine?: number;          // Ending line from bottom (default: -1 for all, max 200)
  }
  ```
- **Returns**:
  ```typescript
  {
    lines: string[];           // Array of text lines from terminal
    totalLines: number;        // Total lines in buffer
    startLine: number;         // Starting line number requested
    endLine: number;           // Ending line number returned
  }
  ```
- **Limitations**: 
  - Maximum 200 lines per request
  - ANSI color codes stripped
  - Long lines may be wrapped/truncated

##### e) **open_copilot**
- **Description**: Opens the VSCode Copilot chat window
- **Parameters**: None (empty schema)
- **Returns**: Confirmation message
- **Use Cases**: Launch Copilot chat from terminal automation

---

### 2. **VSCode Tools** (VSCodeToolCategory)
Category Name: `vscode`

#### Tools:

##### a) **open_vscode_chat**
- **Description**: Opens VSCode chat window
- **Parameters**: None (empty schema)
- **Returns**: `{ success: true, message: "Command sent to open VSCode chat window" }`
- **Implementation**: Emits `mcp-run-command` event to VSCode with `workbench.action.chat.openInNewWindow` command

---

## Tool Registration System

### Architecture
1. **Tool Categories**: Implement `ToolCategory` interface
   ```typescript
   interface ToolCategory {
     name: string;
     mcpTools: McpTool<any>[];
   }
   ```

2. **Individual Tools**: Implement `McpTool<T>` interface
   ```typescript
   interface McpTool<T> {
     name: string;
     description: string;
     schema: z.ZodRawShape | {};  // Zod schema for parameters
     handler: (params: T, context: any) => Promise<any>;
   }
   ```

3. **Registration Flow**:
   - Tool categories registered in `McpService` constructor
   - Tools from each category registered with MCP server
   - HTTP endpoints automatically created via `configureToolEndpoints()`

---

## Usage Examples

### Via MCP Protocol (SSE)
1. Connect to `/sse` endpoint
2. Send messages through established SSE connection
3. Tools are invoked through standard MCP protocol

### Via Direct HTTP API
```bash
# List SSH sessions
curl -X POST http://localhost:PORT/api/tool/get_ssh_session_list

# Execute command
curl -X POST http://localhost:PORT/api/tool/exec_command \
  -H "Content-Type: application/json" \
  -d '{"command": "ls -la", "tabId": "0"}'

# Get command output
curl -X POST http://localhost:PORT/api/tool/get_command_output \
  -H "Content-Type: application/json" \
  -d '{"outputId": "abc123", "startLine": 1, "maxLines": 50}'
```

---

## Service Components

### Supporting Services
1. **McpLoggerService** - Logging for MCP operations
2. **CommandOutputStorageService** - Stores command outputs for retrieval
3. **CommandHistoryManagerService** - Manages command history
4. **DialogService** - UI dialogs for user interaction
5. **RunningCommandsManagerService** - Tracks active commands

### Shell Context
- **ShellContext** - Manages different shell types (bash, zsh, fish, etc.)
- **ShellStrategy** - Provides strategies for shell-specific operations

---

## Configuration

### MCP Service Configuration
- **Port**: Configured during initialization
- **Session Management**: Each SSE connection gets a unique `sessionId`
- **Transport**: SSE with fallback support for multiple connections
- **Logging**: Debug logging via `McpLoggerService`

### Tool Configuration
- Tools registered at service initialization
- Schemas validated using Zod
- HTTP endpoints created automatically

---

## Error Handling

- **Transport Errors**: Handled at SSE level
- **Tool Execution Errors**: Wrapped in 500 response with error message
- **Missing Sessions**: Returns 400 error with descriptive message
- **Validation Errors**: Schema validation via Zod

---

## Performance Considerations

1. **Output Truncation**: Large outputs automatically truncated to 250 lines
2. **Pagination**: Support for retrieving output in chunks (max 1000 lines)
3. **Session Management**: Active sessions tracked efficiently
4. **Command History**: Limited history maintained to prevent memory issues
5. **Concurrent Commands**: Multiple commands can run in different sessions

---

## Extension Points

### Adding New Tools
1. Create tool class extending `BaseToolCategory` or implementing `McpTool`
2. Implement `getTool()` method returning `McpTool<T>`
3. Register category in `McpService.constructor()`
4. HTTP endpoint automatically created

### Adding New Tool Categories
1. Create category implementing `ToolCategory` interface
2. Initialize tools in constructor
3. Register in `McpService.registerToolCategory()`

---

## Security Considerations

1. **Root Requirement**: Some operations (SSH, system commands) may require elevated privileges
2. **Input Validation**: Schema validation via Zod
3. **Session Isolation**: Each session maintains separate state
4. **Output Security**: Command outputs stored securely with timeout management
5. **Command Logging**: All commands logged for audit purposes

---

## Related Files

- **Main Service**: `builtin-plugins/tabby-vscode-agent/src/services/mcpService.ts`
- **Tool Category Base**: `builtin-plugins/tabby-vscode-agent/src/tools/base-tool-category.ts`
- **Execution Tools**: `builtin-plugins/tabby-vscode-agent/src/tools/terminal/`
- **VSCode Tools**: `builtin-plugins/tabby-vscode-agent/src/tools/terminal/vscode-tool.ts`
- **Type Definitions**: `builtin-plugins/tabby-vscode-agent/src/type/types.ts`

---

## Dependencies

- `@modelcontextprotocol/sdk` - Official MCP SDK
- `express` - HTTP server framework
- `zod` - Schema validation
- `rxjs` - Reactive programming
- `@xterm/addon-serialize` - Terminal serialization

