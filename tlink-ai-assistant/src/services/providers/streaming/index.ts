// Barrel for the shared streaming utilities. Providers should import
// from this index, not the individual files, so the module surface
// stays stable.

export { parseSseStream } from './sse-parser'
export type { SseChunk, ParseSseOptions } from './sse-parser'
export { OpenAiToolCallAccumulator } from './openai-tool-accumulator'
export { AnthropicToolCallAccumulator } from './anthropic-tool-accumulator'
