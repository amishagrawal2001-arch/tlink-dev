import { marked } from 'marked'

/**
 * Shared markdown rendering for AI chat messages.
 *
 * Wraps `marked` with chat-specific defaults:
 *   - GFM (tables, strikethrough, task lists, autolinks)
 *   - breaks: true so single newlines in user-facing AI text become
 *     <br> rather than being collapsed (matches user expectation —
 *     "the AI used a newline, show one")
 *   - Code-block post-processing: each <pre><code class="language-x">
 *     gets wrapped in a custom envelope that the chat-message
 *     component renders code-actions (copy, run-in-terminal, save)
 *     against.
 *
 * Caller is responsible for sanitization. We use Angular's
 * DomSanitizer.bypassSecurityTrustHtml + a strict allowlist via the
 * existing chat-message rendering path; this helper does the
 * markdown→HTML transform only.
 */

let configured = false
function configureMarkedOnce (): void {
    if (configured) return
    marked.setOptions({
        gfm: true,
        breaks: true,
        // pedantic: false (default) — be tolerant of common variants
        // (e.g. "* item" vs "*item*") rather than strict CommonMark.
    })
    configured = true
}

/**
 * Convert a markdown string to HTML for chat rendering.
 * Synchronous wrapper around marked.parse — `breaks: true` keeps
 * the lib in sync mode.
 */
export function renderChatMarkdown (markdown: string): string {
    if (!markdown) return ''
    configureMarkedOnce()
    try {
        const html = marked.parse(markdown, { async: false }) as string
        return wrapCodeBlocks(html)
    } catch {
        // Bail to plain text on parse failure rather than rendering
        // raw markdown source. Edge: a partial code fence during
        // streaming where the closing ``` hasn't arrived yet — marked
        // can throw mid-parse. Returning the raw text here means
        // streaming users see the in-progress code as plain text
        // until the fence closes, then the next render swaps in
        // the formatted version.
        return escapeHtml(markdown)
    }
}

/**
 * Inject a `<div class="code-block-wrapper">` around each
 * `<pre><code>` block produced by marked. The chat-message component
 * renders Copy / Run-in-terminal / Save-as-file action buttons inside
 * each wrapper. The language class (e.g. `language-bash`) is
 * preserved so a downstream syntax highlighter can hook in later.
 *
 * Implemented as a simple regex pass rather than a marked renderer
 * extension because the renderer extension surface in marked v17
 * differs from v4 and we'd rather keep this version-agnostic.
 */
function wrapCodeBlocks (html: string): string {
    return html.replace(
        /(<pre>)(<code(?:\s+class="(language-[\w+-]+)")?>)/g,
        (_m, pre, codeOpen, langClass) => {
            const lang = (langClass || '').replace(/^language-/, '') || 'text'
            return `<div class="code-block-wrapper" data-lang="${escapeAttr(lang)}">${pre}${codeOpen}`
        }
    ).replace(/<\/code><\/pre>/g, '</code></pre></div>')
}

/** Minimal HTML escape for the parse-failure fallback path. */
function escapeHtml (s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

function escapeAttr (s: string): string {
    return s.replace(/"/g, '&quot;')
}
