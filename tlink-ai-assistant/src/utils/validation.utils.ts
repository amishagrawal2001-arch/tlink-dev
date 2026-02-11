/**
 * 验证工具类
 * 提供各种数据验证和格式检查功能
 */

/**
 * 验证API密钥格式
 */
export function validateApiKey(apiKey: string, provider: string): { valid: boolean; error?: string } {
    if (!apiKey || apiKey.trim().length === 0) {
        return { valid: false, error: 'API key must not be empty.' };
    }

    // 移除前后空格
    const trimmedKey = apiKey.trim();

    // 根据提供商验证格式
    switch (provider.toLowerCase()) {
        case 'openai':
            return validateOpenAiKey(trimmedKey);
        case 'anthropic':
            return validateAnthropicKey(trimmedKey);
        case 'minimax':
            return validateMinimaxKey(trimmedKey);
        case 'glm':
            return validateGlmKey(trimmedKey);
        case 'openai-compatible':
            return { valid: true };
        default:
            return { valid: true };
    }
}

/**
 * 验证OpenAI API密钥格式
 */
function validateOpenAiKey(key: string): { valid: boolean; error?: string } {
    // OpenAI密钥通常以 sk- 开头
    if (!key.startsWith('sk-')) {
        return { valid: false, error: 'OpenAI API key should start with sk-' };
    }

    if (key.length < 50) {
        return { valid: false, error: 'OpenAI API key is too short.' };
    }

    return { valid: true };
}

/**
 * 验证Anthropic API密钥格式
 */
function validateAnthropicKey(key: string): { valid: boolean; error?: string } {
    // Anthropic密钥通常以 sk-ant- 开头
    if (!key.startsWith('sk-ant-')) {
        return { valid: false, error: 'Anthropic API key should start with sk-ant-' };
    }

    if (key.length < 50) {
        return { valid: false, error: 'Anthropic API key is too short.' };
    }

    return { valid: true };
}

/**
 * 验证Deepseek (Minimax) API密钥格式
 */
function validateMinimaxKey(key: string): { valid: boolean; error?: string } {
    // Minimax密钥长度检查
    if (key.length < 20) {
        return { valid: false, error: 'Deepseek API key is too short.' };
    }

    return { valid: true };
}

/**
 * 验证GLM API密钥格式
 */
function validateGlmKey(key: string): { valid: boolean; error?: string } {
    // GLM密钥长度检查
    if (key.length < 20) {
        return { valid: false, error: 'GLM API key is too short.' };
    }

    return { valid: true };
}

/**
 * 验证URL格式
 */
export function validateUrl(url: string): { valid: boolean; error?: string } {
    if (!url || url.trim().length === 0) {
        return { valid: false, error: 'URL must not be empty.' };
    }

    try {
        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return { valid: false, error: 'URL must use HTTP or HTTPS.' };
        }
        return { valid: true };
    } catch {
        return { valid: false, error: 'Invalid URL format.' };
    }
}

/**
 * 验证模型名称
 */
export function validateModel(model: string, _provider: string): { valid: boolean; error?: string } {
    if (!model || model.trim().length === 0) {
        return { valid: false, error: 'Model name must not be empty.' };
    }

    const trimmedModel = model.trim();

    // 验证模型名称格式
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmedModel)) {
        return { valid: false, error: 'Model name contains invalid characters.' };
    }

    // Note: 更完整的提供商特定验证请使用 validateProviderModel()

    return { valid: true };
}

/**
 * 验证温度参数
 */
export function validateTemperature(temperature: number): { valid: boolean; error?: string } {
    if (typeof temperature !== 'number' || isNaN(temperature)) {
        return { valid: false, error: 'Temperature must be a valid number.' };
    }

    if (temperature < 0 || temperature > 2) {
        return { valid: false, error: 'Temperature must be between 0 and 2.' };
    }

    return { valid: true };
}

/**
 * 验证最大令牌数
 */
export function validateMaxTokens(maxTokens: number): { valid: boolean; error?: string } {
    if (typeof maxTokens !== 'number' || isNaN(maxTokens) || maxTokens <= 0) {
        return { valid: false, error: 'Max tokens must be a positive integer.' };
    }

    if (maxTokens > 32000) {
        return { valid: false, error: 'Max tokens cannot exceed 32000.' };
    }

    return { valid: true };
}

/**
 * 验证命令字符串
 */
export function validateCommand(command: string): { valid: boolean; error?: string } {
    if (!command || command.trim().length === 0) {
        return { valid: false, error: 'Command must not be empty.' };
    }

    const trimmed = command.trim();

    // 检查危险模式
    const dangerousPatterns = [
        /rm\s+-rf\s+\//,
        /sudo\s+rm/,
        />\s*\/dev\/null/,
        /chmod\s+777/,
        /dd\s+if=/,
        /fork\s*\(/,
        /\|\s*sh\b/,
        /\|\s*bash\b/,
        /\$\(/,
        /`[^`]*`/,
        /;\s*rm/,
        /&&\s*rm/
    ];

    for (const pattern of dangerousPatterns) {
        if (pattern.test(trimmed)) {
            return { valid: false, error: 'Potentially dangerous command detected.' };
        }
    }

    return { valid: true };
}

/**
 * 验证邮箱格式
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
    if (!email || email.trim().length === 0) {
        return { valid: false, error: 'Email must not be empty.' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { valid: false, error: 'Invalid email format.' };
    }

    return { valid: true };
}

/**
 * 验证密码强度
 */
export function validatePassword(password: string): { valid: boolean; error?: string; score: number } {
    if (!password || password.length === 0) {
        return { valid: false, error: 'Password must not be empty.', score: 0 };
    }

    let score = 0;
    const errors: string[] = [];

    // 长度检查
    if (password.length < 8) {
        errors.push('Password must be at least 8 characters.');
    } else {
        score += 20;
    }

    if (password.length >= 12) {
        score += 10;
    }

    // 字符类型检查
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    if (hasLower) score += 10;
    if (hasUpper) score += 10;
    if (hasNumber) score += 10;
    if (hasSpecial) score += 10;

    if (!hasLower) errors.push('Must include a lowercase letter.');
    if (!hasUpper) errors.push('Must include an uppercase letter.');
    if (!hasNumber) errors.push('Must include a number.');
    if (!hasSpecial) errors.push('Must include a special character.');

    // 常见密码检查
    const commonPasswords = ['password', '123456', 'qwerty', 'admin', 'letmein'];
    if (commonPasswords.includes(password.toLowerCase())) {
        return { valid: false, error: 'Password is too common.', score: 0 };
    }

    const valid = errors.length === 0 && score >= 40;
    return {
        valid,
        error: valid ? undefined : errors.join(', '),
        score: Math.min(score, 100)
    };
}

/**
 * 验证端口号
 */
export function validatePort(port: number): { valid: boolean; error?: string } {
    if (typeof port !== 'number' || isNaN(port) || !Number.isInteger(port)) {
        return { valid: false, error: 'Port must be an integer.' };
    }

    if (port < 1 || port > 65535) {
        return { valid: false, error: 'Port must be between 1 and 65535.' };
    }

    return { valid: true };
}

/**
 * 验证JSON格式
 */
export function validateJson(jsonString: string): { valid: boolean; error?: string; data?: any } {
    if (!jsonString || jsonString.trim().length === 0) {
        return { valid: false, error: 'JSON string must not be empty.' };
    }

    try {
        const data = JSON.parse(jsonString);
        return { valid: true, data };
    } catch (error) {
        return { valid: false, error: 'Invalid JSON format.' };
    }
}

/**
 * 验证文件路径
 */
export function validateFilePath(path: string): { valid: boolean; error?: string } {
    if (!path || path.trim().length === 0) {
        return { valid: false, error: 'File path must not be empty.' };
    }

    // 检查路径长度
    if (path.length > 260) {
        return { valid: false, error: 'File path is too long.' };
    }

    // 检查非法字符
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(path)) {
        return { valid: false, error: 'Path contains invalid characters.' };
    }

    return { valid: true };
}

// ==================== AI提供商特定验证 ====================

/**
 * AI提供商类型
 */
export type AIProviderType = 'openai' | 'anthropic' | 'minimax' | 'glm' | 'openai-compatible' | 'ollama' | 'ollama-cloud' | 'vllm';

/**
 * OpenAI模型列表
 */
export const OPENAI_MODELS = [
    'gpt-4',
    'gpt-4-turbo',
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-16k'
];

/**
 * Anthropic模型列表
 */
export const ANTHROPIC_MODELS = [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet-20240620',
    'claude-3-opus-20240229',
    'claude-3-haiku-20240307'
];

/**
 * GLM/智谱模型列表
 */
export const GLM_MODELS = [
    'glm-4',
    'glm-4-plus',
    'glm-4v',
    'glm-3-turbo'
];

/**
 * Deepseek/Minimax 模型列表
 */
export const MINIMAX_MODELS = [
    'MiniMax-M2',
    'MiniMax-M2-16k',
    'abab6.5s-chat',
    'abab6.5-chat',
    'abab5.5-chat'
];

/**
 * 验证AI提供商配置
 */
export function validateProviderConfig(
    provider: AIProviderType,
    config: {
        apiKey?: string;
        baseURL?: string;
        model?: string;
    }
): { valid: boolean; errors?: string[]; warnings?: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 验证API密钥
    if (!config.apiKey || config.apiKey.trim().length === 0) {
        errors.push('API key must not be empty.');
    } else {
        const keyValidation = validateProviderApiKey(provider, config.apiKey);
        if (!keyValidation.valid) {
            errors.push(keyValidation.error || 'Invalid API key format.');
        }
    }

    // 验证模型
    if (config.model) {
        const modelValidation = validateProviderModel(provider, config.model);
        if (!modelValidation.valid) {
            errors.push(modelValidation.error || 'Invalid model name.');
        } else if (modelValidation.warning) {
            warnings.push(modelValidation.warning);
        }
    } else {
        warnings.push(`No model specified; ${provider} will use its default model.`);
    }

    // 验证基础URL（对于需要自定义URL的提供商）
    if (needsCustomBaseURL(provider)) {
        if (!config.baseURL || config.baseURL.trim().length === 0) {
            warnings.push(`No base URL specified; using ${provider}'s default endpoint.`);
        } else {
            const urlValidation = validateUrl(config.baseURL);
            if (!urlValidation.valid) {
                errors.push(`Invalid base URL: ${urlValidation.error}`);
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined
    };
}

/**
 * 验证提供商API密钥格式
 */
export function validateProviderApiKey(
    provider: AIProviderType,
    apiKey: string
): { valid: boolean; error?: string } {
    const trimmedKey = apiKey.trim();

    switch (provider) {
        case 'openai':
            if (!trimmedKey.startsWith('sk-')) {
                return { valid: false, error: 'OpenAI API key should start with sk-' };
            }
            if (trimmedKey.length < 50) {
                return { valid: false, error: 'OpenAI API key is too short.' };
            }
            break;

        case 'anthropic':
            if (!trimmedKey.startsWith('sk-ant-')) {
                return { valid: false, error: 'Anthropic API key should start with sk-ant-' };
            }
            if (trimmedKey.length < 50) {
                return { valid: false, error: 'Anthropic API key is too short.' };
            }
            break;

        case 'minimax':
            if (trimmedKey.length < 20) {
                return { valid: false, error: 'Deepseek API key is too short.' };
            }
            // Minimax密钥通常以sk-开头
            if (!trimmedKey.startsWith('sk-')) {
                return { valid: false, error: 'Deepseek API key should start with sk-' };
            }
            break;

        case 'glm':
            if (trimmedKey.length < 20) {
                return { valid: false, error: 'GLM API key is too short.' };
            }
            break;

        case 'openai-compatible':
            // 兼容模式不验证具体格式
            if (trimmedKey.length < 10) {
                return { valid: false, error: 'API key is too short.' };
            }
            break;

        case 'ollama':
            // Ollama本地服务通常不需要API密钥
            break;

        case 'ollama-cloud':
            if (trimmedKey.length < 10) {
                return { valid: false, error: 'Ollama Cloud API key is too short.' };
            }
            break;

        case 'vllm':
            // vLLM可能有basic auth或无认证
            break;
    }

    return { valid: true };
}

/**
 * 验证提供商模型名称
 */
export function validateProviderModel(
    provider: AIProviderType,
    model: string
): { valid: boolean; error?: string; warning?: string } {
    const trimmedModel = model.trim();

    if (!trimmedModel) {
        return { valid: false, error: 'Model name must not be empty.' };
    }

    // 检查模型名称格式
    if (!/^[a-zA-Z0-9._-/]+$/.test(trimmedModel)) {
        return { valid: false, error: 'Model name contains invalid characters.' };
    }

    // 检查是否在已知模型列表中
    const isKnownModel = isKnownModelForProvider(provider, trimmedModel);
    if (!isKnownModel) {
        return {
            valid: true,
            warning: `Model "${trimmedModel}" is not in ${provider}'s official model list.`
        };
    }

    return { valid: true };
}

/**
 * 检查模型是否在提供商的已知模型列表中
 */
function isKnownModelForProvider(provider: AIProviderType, model: string): boolean {
    const normalizedModel = model.toLowerCase();

    switch (provider) {
        case 'openai':
            return OPENAI_MODELS.some(m => m.toLowerCase() === normalizedModel);

        case 'anthropic':
            return ANTHROPIC_MODELS.some(m => m.toLowerCase() === normalizedModel);

        case 'glm':
            return GLM_MODELS.some(m => m.toLowerCase() === normalizedModel);

        case 'minimax':
            return MINIMAX_MODELS.some(m => m.toLowerCase() === normalizedModel);

        case 'openai-compatible':
        case 'ollama':
        case 'ollama-cloud':
        case 'vllm':
            // 这些提供商支持自定义模型名称
            return true;

        default:
            return true;
    }
}

/**
 * 检查提供商是否需要自定义基础URL
 */
export function needsCustomBaseURL(provider: AIProviderType): boolean {
    return ['openai-compatible', 'ollama', 'ollama-cloud', 'vllm'].includes(provider);
}

/**
 * 获取提供商的默认基础URL
 */
export function getProviderDefaultBaseURL(provider: AIProviderType): string {
    switch (provider) {
        case 'openai':
            return 'https://api.openai.com/v1';

        case 'anthropic':
            return 'https://api.anthropic.com';

        case 'minimax':
            return 'https://api.deepseek.com';

        case 'glm':
            return 'https://open.bigmodel.cn/api/paas/v4';

        case 'openai-compatible':
            return '';

        case 'ollama':
            return 'http://localhost:11434';

        case 'ollama-cloud':
            return 'https://ollama.com/api';

        case 'vllm':
            return 'http://localhost:8000';

        default:
            return '';
    }
}

/**
 * 验证本地服务连接（用于Ollama、vLLM等本地提供商）
 */
export async function validateLocalServiceConnection(
    baseURL: string,
    timeout: number = 5000
): Promise<{ valid: boolean; error?: string; latency?: number }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const start = Date.now();
        const response = await fetch(`${baseURL}/models`, {
            method: 'GET',
            signal: controller.signal
        });
        const latency = Date.now() - start;

        clearTimeout(timeoutId);

        if (response.ok) {
            return { valid: true, latency };
        }

        return { valid: false, error: `Service returned status ${response.status}` };
    } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error) {
            if (error.name === 'AbortError') {
                return { valid: false, error: 'Connection timed out.' };
            }
            return { valid: false, error: error.message };
        }

        return { valid: false, error: 'Unable to connect to service.' };
    }
}
