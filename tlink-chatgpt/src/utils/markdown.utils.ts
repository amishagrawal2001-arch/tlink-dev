import { marked } from 'marked'

/**
 * Markdown rendering for the chat tab's assistant messages.
 *
 * Caller must sanitize. Chat-tab uses `DomSanitizer.bypassSecurityTrustHtml`
 * because marked's output already escapes user-typed code inside fenced
 * blocks; the residual risk is embedded `<script>` tags in plain
 * markdown prose which marked doesn't strip - an attacker who can make
 * the AI emit a script tag has bigger problems.
 *
 * Code blocks are wrapped in `.code-block-wrapper` with an inline action
 * toolbar (Copy / Run). The toolbar is plain HTML with
 * `data-chat-action` attributes; the chat tab component listens via a
 * single delegated click handler on `.assistant-prose`, so re-renders
 * during streaming do not require any DOM post-processing.
 */

// Shell-ish languages for which a "Run in terminal" button is offered.
// Anything else only gets Copy, because sending Python/JS source to a
// terminal does nothing useful.
const SHELL_LANGS = new Set([
    'bash', 'sh', 'shell', 'zsh', 'console', 'terminal', 'cmd', 'command',
    'powershell', 'ps', 'ps1', 'pwsh',
])

function escapeHtml (s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

function escapeAttr (s: string): string {
    return s.replace(/"/g, '&quot;')
}

function wrapCodeBlocks (html: string): string {
    // Open: <pre><code[class="language-xxx"]>  ->
    //   <div class="code-block-wrapper" data-lang="xxx">
    //       <div class="code-block-actions">...buttons...</div>
    //       <pre><code...>
    const opened = html.replace(
        /(<pre>)(<code(?:\s+class="(language-[\w+-]+)")?>)/g,
        // eslint-disable-next-line @typescript-eslint/max-params
        (_m, pre, codeOpen, langClass) => {
            const lang = (langClass ?? '').replace(/^language-/, '') || 'text'
            const runnable = SHELL_LANGS.has(lang.toLowerCase())
            return (
                `<div class="code-block-wrapper" data-lang="${escapeAttr(lang)}">`
                + '<div class="code-block-actions">'
                + '<button type="button" class="code-block-btn" data-chat-action="copy" title="Copy">Copy</button>'
                + (runnable
                    ? '<button type="button" class="code-block-btn code-block-btn-run" data-chat-action="run" title="Run in selected terminal">Run</button>'
                    : '')
                + '</div>'
                + pre + codeOpen
            )
        },
    )
    // Close: </code></pre> -> </code></pre></div>
    return opened.replace(/<\/code><\/pre>/g, '</code></pre></div>')
}

let configured = false
function configureMarkedOnce (): void {
    if (configured) { return }
    marked.setOptions({
        gfm: true,
        breaks: true,
    })
    configured = true
}

export function renderChatMarkdown (markdown: string): string {
    if (!markdown) { return '' }
    configureMarkedOnce()
    try {
        const html = marked.parse(markdown, { async: false })
        return wrapCodeBlocks(html)
    } catch {
        // Streaming partial markdown (unclosed fence) can throw mid-parse.
        // Fall back to escaped plain text; the next render swaps in the
        // formatted version once the fence closes.
        return escapeHtml(markdown)
    }
}
