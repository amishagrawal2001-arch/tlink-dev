/**
 * UI 层流式事件类型定义
 * 
 * 设计原则：
 * - 前端无需关心工具执行细节，只需渲染
 * - 所有内容已过滤/转义，可直接使用
 * - 类型安全，结构清晰
 */

// ============================================================================
// 基础类型
// ============================================================================

/**
 * UI 事件类型枚举
 */
export type UIEventType =
    | 'text'           // AI 文本输出
    | 'tool_start'     // 工具开始（显示加载状态）
    | 'tool_complete'  // 工具完成（显示结果）
    | 'tool_error'     // 工具错误
    | 'round_divider'  // 轮次分隔线
    | 'agent_done'     // Agent 完成
    | 'error';         // 系统错误

/**
 * 工具分类
 */
export type ToolCategory =
    | 'terminal'    // 终端操作
    | 'browser'     // 浏览器 MCP
    | 'file'        // 文件操作
    | 'network'     // 网络请求
    | 'system'      // 系统控制
    | 'other';      // 其他

/**
 * Agent 完成原因
 */
export type AgentDoneReason =
    | 'task_complete'
    | 'no_tools'
    | 'summarizing'
    | 'repeated_tool'
    | 'high_failure_rate'
    | 'timeout'
    | 'max_rounds'
    | 'user_cancel'
    | 'no_progress';

/**
 * 工具错误类型
 */
export type ToolErrorType =
    | 'execution'   // 执行错误
    | 'timeout'     // 超时
    | 'rejected'    // 用户拒绝
    | 'unknown';    // 未知错误

// ============================================================================
// 工具输出格式
// ============================================================================

/**
 * 工具输出显示格式
 * 已过滤/转义，前端可直接渲染
 */
export interface ToolOutputDisplay {
    /** 输出格式类型 */
    format: 'text' | 'code' | 'table' | 'json' | 'hidden';
    /** 已转义的安全内容 */
    content: string;
    /** 代码语言（format='code' 时使用） */
    language?: string;
    /** 是否被截断 */
    truncated: boolean;
    /** 原始长度 */
    originalLength: number;
    /** 简短摘要 */
    summary?: string;
}

// ============================================================================
// UI 流事件定义
// ============================================================================

/**
 * UI 流事件基类
 */
export interface UIStreamEvent {
    type: UIEventType;
    timestamp: number;
}

/**
 * 文本事件 - AI 的流式文本输出
 */
export interface UITextEvent extends UIStreamEvent {
    type: 'text';
    /** 增量文本内容 */
    content: string;
    /** 是否是完整段落 */
    isComplete?: boolean;
}

/**
 * 工具开始事件
 */
export interface UIToolStartEvent extends UIStreamEvent {
    type: 'tool_start';
    /** 工具调用 ID */
    toolId: string;
    /** 工具原始名称 */
    toolName: string;
    /** 工具友好显示名称 */
    toolDisplayName: string;
    /** 工具图标 */
    toolIcon: string;
    /** 工具分类 */
    toolCategory: ToolCategory;
}

/**
 * 工具完成事件
 */
export interface UIToolCompleteEvent extends UIStreamEvent {
    type: 'tool_complete';
    /** 工具调用 ID */
    toolId: string;
    /** 工具原始名称 */
    toolName: string;
    /** 执行耗时（毫秒） */
    duration: number;
    /** 是否成功 */
    success: boolean;
    /** 格式化后的输出 - 已过滤/转义，前端可直接渲染 */
    output: ToolOutputDisplay;
}

/**
 * 工具错误事件
 */
export interface UIToolErrorEvent extends UIStreamEvent {
    type: 'tool_error';
    /** 工具调用 ID */
    toolId: string;
    /** 工具原始名称 */
    toolName: string;
    /** 错误消息 */
    errorMessage: string;
    /** 错误类型 */
    errorType: ToolErrorType;
}

/**
 * 轮次分隔事件
 */
export interface UIRoundDividerEvent extends UIStreamEvent {
    type: 'round_divider';
    /** 轮次编号 */
    roundNumber: number;
}

/**
 * Agent 完成事件
 */
export interface UIAgentDoneEvent extends UIStreamEvent {
    type: 'agent_done';
    /** 完成原因 */
    reason: AgentDoneReason;
    /** 原因文本描述 */
    reasonText: string;
    /** 原因图标 */
    reasonIcon: string;
    /** 总轮数 */
    totalRounds: number;
    /** 完成摘要 */
    summary?: string;
    /**
     * Cumulative token usage across all rounds of the agent loop.
     * Pulled from the underlying AgentStreamEvent.usage which is
     * populated by the loop's per-round message_end accumulator.
     * Surfaced here so the chat-interface can render a cost / token
     * footer on the AI message bubble. Optional — older provider /
     * config combinations may not emit usage stats.
     */
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

/**
 * 错误事件
 */
export interface UIErrorEvent extends UIStreamEvent {
    type: 'error';
    /** 错误消息 */
    error: string;
}

/**
 * 所有 UI 流事件的联合类型
 */
export type AnyUIStreamEvent =
    | UITextEvent
    | UIToolStartEvent
    | UIToolCompleteEvent
    | UIToolErrorEvent
    | UIRoundDividerEvent
    | UIAgentDoneEvent
    | UIErrorEvent;

// ============================================================================
// UI 渲染块类型（用于消息的结构化渲染）
// ============================================================================

/**
 * UI 渲染块类型
 */
export type UIBlockType = 'text' | 'tool' | 'divider' | 'status';

/**
 * 工具状态
 */
export type ToolStatus = 'executing' | 'success' | 'error';

/**
 * 文本渲染块
 */
export interface UITextBlock {
    type: 'text';
    content: string;
}

/**
 * 工具渲染块
 */
export interface UIToolBlock {
    type: 'tool';
    /** 工具调用 ID */
    id: string;
    /** 工具显示名称 */
    name: string;
    /** 工具图标 */
    icon: string;
    /** 工具分类 */
    category?: ToolCategory;
    /** 当前状态 */
    status: ToolStatus;
    /** 执行耗时（毫秒） */
    duration?: number;
    /** 格式化后的输出 */
    output?: ToolOutputDisplay;
    /** 错误消息 */
    errorMessage?: string;
}

/**
 * 分隔线渲染块
 */
export interface UIDividerBlock {
    type: 'divider';
    /** 轮次编号 */
    round: number;
}

/**
 * 状态渲染块
 */
export interface UIStatusBlock {
    type: 'status';
    /** 状态图标 */
    icon: string;
    /** 状态文本 */
    text: string;
    /** 轮次数 */
    rounds?: number;
    /** 详细信息 */
    detail?: string;
}

/**
 * 所有 UI 渲染块的联合类型
 */
export type AnyUIBlock =
    | UITextBlock
    | UIToolBlock
    | UIDividerBlock
    | UIStatusBlock;

// ============================================================================
// 常量定义
// ============================================================================

/**
 * Agent 完成原因映射
 */
export const AGENT_DONE_REASONS: Record<AgentDoneReason, { text: string; icon: string }> = {
    'task_complete': { text: 'Task completed', icon: '✅' },
    'no_tools': { text: 'Execution completed', icon: '✅' },
    'summarizing': { text: 'Summary completed', icon: '✅' },
    'repeated_tool': { text: 'Repeated operation detected', icon: '⚠️' },
    'high_failure_rate': { text: 'Multiple failures', icon: '⚠️' },
    'timeout': { text: 'Execution timeout', icon: '⏱️' },
    'max_rounds': { text: 'Maximum rounds reached', icon: '⚠️' },
    'user_cancel': { text: 'User cancelled', icon: '🛑' },
    'no_progress': { text: 'No progress made', icon: '⚠️' },
};

/**
 * 工具分类图标映射
 */
export const TOOL_CATEGORY_ICONS: Record<ToolCategory, string> = {
    'terminal': '💻',
    'browser': '🌐',
    'file': '📁',
    'network': '🔗',
    'system': '⚙️',
    'other': '🔧',
};
