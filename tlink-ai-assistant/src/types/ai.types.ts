/**
 * AI-related type definitions
 */

// Message role
export enum MessageRole {
    USER = 'user',
    ASSISTANT = 'assistant',
    SYSTEM = 'system',
    TOOL = 'tool'      // Tool result role (required by some AI providers)
}

// Chat message
export interface ChatMessage {
    id: string;
    role: MessageRole;
    content: string;
    timestamp: Date;
    metadata?: Record<string, any>;
    // UI rendering blocks (for structured rendering of tool calls)
    uiBlocks?: Array<{
        type: 'text' | 'tool' | 'divider' | 'status';
        id?: string;
        name?: string;
        icon?: string;
        status?: 'executing' | 'success' | 'error';
        content?: string;
        output?: {
            format: 'text' | 'code' | 'table' | 'json' | 'hidden';
            content: string;
            language?: string;
            truncated: boolean;
            originalLength: number;
            summary?: string;
        };
        duration?: number;
        errorMessage?: string;
        round?: number;
        text?: string;
        detail?: string;
        rounds?: number;
    }>;
    // Tool call related fields (for Agent loop and message conversion)
    toolCalls?: Array<{
        id: string;
        name: string;
        input?: Record<string, any>;
    }>;
    // Tool result related fields (for transformMessages to identify)
    toolResults?: Array<{
        tool_use_id: string;
        name?: string;
        content: string;
        is_error?: boolean;
    }>;
    tool_use_id?: string;  // Simple tool ID identifier
    // Summary marker (for context compression)
    isSummary?: boolean;
}

// Chat request
export interface ChatRequest {
    messages: ChatMessage[];
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    stream?: boolean;
    model?: string;
    intent?: string; // optional routing hint (e.g., code, translate, vision, audio)
    tools?: any[];  // Tool definition list
    enableTools?: boolean;  // Whether to enable tool calls
}

// Chat response
export interface ChatResponse {
    message: ChatMessage;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

// Command request
export interface CommandRequest {
    naturalLanguage: string;
    context?: {
        currentDirectory?: string;
        operatingSystem?: string;
        shell?: string;
        environment?: Record<string, string>;
    };
    constraints?: {
        maxLength?: number;
        allowedCommands?: string[];
        forbiddenCommands?: string[];
    };
}

// Command response
export interface CommandResponse {
    command: string;
    explanation: string;
    confidence: number; // 0-1
    alternatives?: {
        command: string;
        explanation: string;
        confidence: number;
    }[];
}

// Explain request
export interface ExplainRequest {
    command: string;
    context?: {
        currentDirectory?: string;
        operatingSystem?: string;
    };
}

// Explain response
export interface ExplainResponse {
    explanation: string;
    breakdown: {
        part: string;
        description: string;
    }[];
    examples?: string[];
}

// Analysis request
export interface AnalysisRequest {
    output: string;
    command: string;
    exitCode?: number;
    context?: {
        timestamp?: Date;
        workingDirectory?: string;
    };
}

// Analysis response
export interface AnalysisResponse {
    summary: string;
    insights: string[];
    issues?: {
        severity: 'warning' | 'error' | 'info';
        message: string;
        suggestion?: string;
    }[];
    success: boolean;
}

// Provider capability
export enum ProviderCapability {
    CHAT = 'chat',
    COMMAND_GENERATION = 'command_generation',
    COMMAND_EXPLANATION = 'command_explanation',
    REASONING = 'reasoning',
    FUNCTION_CALL = 'function_call',
    STREAMING = 'streaming'
}

// Health status
export enum HealthStatus {
    HEALTHY = 'healthy',
    DEGRADED = 'degraded',
    UNHEALTHY = 'unhealthy'
}

// Validation result
export interface ValidationResult {
    valid: boolean;
    errors?: string[];
    warnings?: string[];
}

// ============================================================================
// Context Engineering Related Type Definitions
// ============================================================================

// API message interface (supports compression markers)
export interface ApiMessage {
    role: 'user' | 'assistant' | 'system' | 'tool' | 'function';
    content: string | ContentBlock[];
    ts: number;  // Timestamp (milliseconds)

    // Compression-related metadata
    isSummary?: boolean;        // Whether this is a summary message
    condenseId?: string;        // Summary ID
    condenseParent?: string;    // Which summary compressed this
    summaryMeta?: {             // Summary metadata
        originalMessageCount: number;
        tokensCost: number;
        compressionRatio: number;
    };

    // Truncation-related metadata
    isTruncationMarker?: boolean;  // Whether this is a truncation marker
    truncationId?: string;         // Truncation ID
    truncationParent?: string;     // Which truncation hid this
}

// Content block type (for supporting tool calls)
export interface ContentBlock {
    type: 'text' | 'tool_use' | 'tool_result';
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, any>;
    tool_use_id?: string;
    content?: string;
}

// Token usage statistics
export interface TokenUsage {
    input: number;        // Input token count
    output: number;       // Output token count
    cacheRead: number;    // Cache read token count
    cacheWrite: number;   // Cache write token count
}

// Session state
export interface SessionState {
    id: string;
    messages: ApiMessage[];
    tokens: TokenUsage;
    createdAt: number;    // Creation timestamp (milliseconds)
    updatedAt: number;    // Update timestamp (milliseconds)
    checkpoints: string[]; // Checkpoint ID list
}

// Context management configuration
export interface ContextConfig {
    maxContextTokens: number;      // Maximum context window size
    reservedOutputTokens: number;  // Reserved output token count
    compactThreshold: number;      // Compression trigger threshold (0-1)
    pruneThreshold: number;        // Pruning trigger threshold (0-1)
    messagesToKeep: number;        // Number of recent messages to keep
    bufferPercentage: number;      // Safety buffer percentage
    summaryPrompt?: string;        // Custom summary prompt
}

// Default configuration
export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
    maxContextTokens: 200000,
    reservedOutputTokens: 16000,
    compactThreshold: 0.85,
    pruneThreshold: 0.70,
    messagesToKeep: 3,
    bufferPercentage: 0.10,
    summaryPrompt: 'Summarize the following conversation in one sentence, preserving key information and user intent:'
};
export interface CompactionResult {
    success: boolean;
    messages: ApiMessage[];
    summary?: string;
    condenseId?: string;
    tokensSaved: number;
    cost: number;  // API call cost
    error?: string;
}

// Pruning result
export interface PruneResult {
    pruned: boolean;
    tokensSaved: number;
    partsCompacted: number;
}

// Truncation result
export interface TruncationResult {
    messages: ApiMessage[];
    truncationId: string;
    messagesRemoved: number;
}

// Extended ChatMessage with compression marker support
export interface ExtendedChatMessage extends ChatMessage {
    // Compression-related metadata (optional)
    isSummary?: boolean;        // Whether this is a summary message
    condenseId?: string;        // Summary ID
    condenseParent?: string;    // Which summary compressed this

    // Truncation-related metadata (optional)
    isTruncationMarker?: boolean;  // Whether this is a truncation marker
    truncationId?: string;         // Truncation ID
    truncationParent?: string;     // Which truncation hid this

    // Token usage statistics (optional)
    tokenUsage?: TokenUsage;
}

// Compressed checkpoint data interface
export interface CompressedCheckpointData {
    compressed: boolean;
    compressionRatio: number;
    originalSize: number;
    compressedSize: number;
    messages?: ApiMessage[]; // Optional, for immediate access
    messagesJson: string; // Compressed JSON string
}

// Checkpoint interface
export interface Checkpoint {
    id: string;
    sessionId: string;
    messages: ApiMessage[];
    summary: string;
    createdAt: number;  // Timestamp (milliseconds)
    tokenUsage: TokenUsage;
    compressedData?: CompressedCheckpointData; // Compressed data (optional)

    // Additional fields
    tags?: string[];      // Tag list
    isArchived?: boolean; // Whether archived
}

// ============================================================================
// Streaming Response Related Type Definitions
// ============================================================================

// Streaming event type
export interface StreamEvent {
    type: 'text_delta' | 'tool_use_start' | 'tool_use_delta' | 'tool_use_end' | 'tool_result' | 'tool_error' | 'message_end' | 'error';
    // Text delta
    textDelta?: string;
    // Tool call (only when complete)
    toolCall?: {
        id: string;
        name: string;
        input: any;
    };
    // Tool result (tool_result event)
    result?: {
        tool_use_id: string;
        content: string;
        is_error?: boolean;
    };
    // Error message
    error?: string;
    // Final message (when message_end)
    message?: ChatMessage;
}

// ============================================================================
// Agent Loop Related Type Definitions
// ============================================================================

// Tool call interface
export interface ToolCall {
    id: string;
    name: string;
    input: any;
}

// Tool result interface
export interface ToolResult {
    tool_use_id: string;
    name?: string;        // Tool name
    content: string;
    is_error?: boolean;
}

// Agent event type
export type AgentEventType =
    | 'text_delta'           // Text delta
    | 'tool_use_start'       // Tool start
    | 'tool_use_end'         // Tool call end (collecting parameters)
    | 'tool_executing'       // Tool executing
    | 'tool_executed'        // Tool execution complete (with result)
    | 'tool_error'           // Tool execution error
    | 'round_start'          // New round start
    | 'round_end'            // Round end
    | 'agent_complete'       // Agent loop complete
    | 'error';               // Error

// Agent streaming event
export interface AgentStreamEvent {
    type: AgentEventType;

    // text_delta event
    textDelta?: string;

    // Tool-related events
    toolCall?: {
        id: string;
        name: string;
        input: any;
    };

    // tool_executed/tool_error event
    toolResult?: {
        tool_use_id: string;
        content: string;
        is_error?: boolean;
        duration?: number;
    };

    // round_start/round_end event
    round?: number;

    // agent_complete event
    reason?: TerminationReason;
    totalRounds?: number;
    terminationMessage?: string;  // Optional termination detail message

    // error event
    error?: string;

    // message_end reserved
    message?: ChatMessage;
}

// Agent loop configuration
export interface AgentLoopConfig {
    maxRounds?: number;           // Maximum rounds, default 15
    timeoutMs?: number;           // Default 120000 (2 minutes)
    repeatThreshold?: number;     // Default 3 times
    failureThreshold?: number;    // Default 2 times
    enableTaskComplete?: boolean; // Default true
    onRoundStart?: (round: number) => void;
    onRoundEnd?: (round: number) => void;
    onAgentComplete?: (reason: string, totalRounds: number) => void;
}

// ============================================================================
// Intelligent Agent Termination Related Type Definitions
// ============================================================================

// Termination reason enumeration
export type TerminationReason =
    | 'task_complete'      // AI actively calls task_complete tool
    | 'no_tools'           // No tool calls in this round
    | 'mentioned_tool'     // AI mentioned tool but didn't call
    | 'summarizing'        // Detected AI is summarizing
    | 'repeated_tool'      // Repeated calls to same tool
    | 'high_failure_rate'  // Consecutive failure rate too high
    | 'timeout'            // Total timeout
    | 'max_rounds'         // Reached maximum rounds (safety fallback)
    | 'user_cancel'        // User cancelled
    | 'no_progress'        // No progress made in recent rounds
    | 'tool_success';      // Tool executed successfully, task finished

// Agent state tracking
export interface AgentState {
    currentRound: number;
    startTime: number;
    toolCallHistory: ToolCallRecord[];
    lastAiResponse: string;
    isActive: boolean;
}

// Tool call record
export interface ToolCallRecord {
    name: string;
    input: any;
    inputHash: string;  // For fast comparison
    success: boolean;
    timestamp: number;
}

// Termination detection result
export interface TerminationResult {
    shouldTerminate: boolean;
    reason: TerminationReason;
    message?: string;
}

// Extended ToolResult with task completion marker
export interface ExtendedToolResult extends ToolResult {
    isTaskComplete?: boolean;  // Special marker: task_complete tool call
}
