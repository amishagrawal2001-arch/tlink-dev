import { Injectable } from '@angular/core'
import { TerminalContext } from './terminalContext.service'

/**
 * Generated script result
 */
export interface GeneratedScript {
    /** Script content */
    content: string
    /** Script language/type */
    language: ScriptLanguage
    /** Script description */
    description: string
    /** Suggested filename */
    filename: string
    /** Confidence level (0-1) */
    confidence: number
    /** Script metadata */
    metadata?: {
        interpreter?: string
        dependencies?: string[]
        estimatedRuntime?: string
        requiresRoot?: boolean
    }
}

/**
 * Supported script languages
 */
export type ScriptLanguage = 'bash' | 'zsh' | 'fish' | 'python' | 'powershell' | 'sh'

/**
 * Script generation options
 */
export interface ScriptGenerationOptions {
    /** Natural language description */
    description: string
    /** Target script language */
    language?: ScriptLanguage
    /** Include comments */
    includeComments?: boolean
    /** Include error handling */
    includeErrorHandling?: boolean
    /** Terminal context for script generation */
    context?: TerminalContext
    /** Additional context/prompt */
    additionalContext?: string
}

/**
 * Script template
 */
interface ScriptTemplate {
    id: string
    name: string
    description: string
    language: ScriptLanguage
    template: string
    variables?: string[]
}

@Injectable({ providedIn: 'root' })
export class ScriptGeneratorService {
    private scriptTemplates: ScriptTemplate[] = []

    constructor () {
        this.initializeTemplates()
    }

    /**
     * Generate a script from natural language description
     */
    async generateScript (options: ScriptGenerationOptions): Promise<GeneratedScript> {
        const {
            description,
            language = 'bash',
            includeComments = true,
            includeErrorHandling = true,
            context,
        } = options

        // Try to match against templates first
        const templateMatch = this.findMatchingTemplate(description, language)
        if (templateMatch) {
            return this.generateFromTemplate(templateMatch, description, context, includeComments, includeErrorHandling)
        }

        // Otherwise, use AI-based generation (return structure for AI to fill)
        // In a real implementation, this would call an AI service
        // For now, we'll return a structured prompt that can be used with the chat AI
        const suggestedFilename = this.generateFilename(description, language)
        const scriptStructure = this.generateScriptStructure(description, language, context, includeErrorHandling, includeComments)

        return {
            content: scriptStructure,
            language,
            description,
            filename: suggestedFilename,
            confidence: 0.7, // Medium confidence for AI-generated scripts
            metadata: {
                interpreter: this.getInterpreter(language),
                requiresRoot: this.detectRootRequirement(description),
            },
        }
    }

    /**
     * Generate script from template
     */
    private generateFromTemplate (
        template: ScriptTemplate,
        description: string,
        context?: TerminalContext,
        includeComments = true,
        includeErrorHandling = true,
    ): GeneratedScript {
        let content = template.template

        // Replace template variables with context values
        if (template.variables && context) {
            template.variables.forEach(variable => {
                const value = this.getContextValue(variable, context)
                content = content.replace(new RegExp(`\\{\\{${variable}\\}\\}`, 'g'), value || '')
            })
        }

        // Add error handling if requested
        if (includeErrorHandling && !content.includes('set -e')) {
            if (template.language === 'bash' || template.language === 'sh') {
                content = 'set -euo pipefail\n' + content
            }
        }

        // Add comments if requested
        if (includeComments && !content.startsWith('#!/')) {
            const shebang = this.getShebang(template.language)
            const commentPrefix = this.getCommentPrefix(template.language)
            content = `${shebang}\n${commentPrefix} ${template.description}\n${commentPrefix} Generated: ${new Date().toISOString()}\n\n${content}`
        }

        return {
            content,
            language: template.language,
            description: template.description,
            filename: this.generateFilename(description, template.language),
            confidence: 0.9, // High confidence for template-based scripts
            metadata: {
                interpreter: this.getInterpreter(template.language),
            },
        }
    }

    /**
     * Find matching template for a description
     */
    private findMatchingTemplate (description: string, language: ScriptLanguage): ScriptTemplate | null {
        const lowerDesc = description.toLowerCase()
        return this.scriptTemplates.find(template => {
            if (template.language !== language) return false
            return template.name.toLowerCase().includes(lowerDesc) ||
                template.description.toLowerCase().includes(lowerDesc) ||
                template.id.toLowerCase().includes(lowerDesc)
        }) || null
    }

    /**
     * Generate script structure (basic shell script template)
     */
    private generateScriptStructure (
        description: string,
        language: ScriptLanguage,
        context?: TerminalContext,
        includeErrorHandling = true,
        includeComments = true,
    ): string {
        const shebang = this.getShebang(language)
        const commentPrefix = this.getCommentPrefix(language)
        const lines: string[] = []

        if (includeComments) {
            lines.push(shebang)
            lines.push(`${commentPrefix} ${description}`)
            lines.push(`${commentPrefix} Generated: ${new Date().toISOString()}`)
            if (context?.currentDirectory) {
                lines.push(`${commentPrefix} Target directory: ${context.currentDirectory}`)
            }
            lines.push('')
        } else {
            lines.push(shebang)
            lines.push('')
        }

        if (includeErrorHandling) {
            if (language === 'bash' || language === 'sh') {
                lines.push('set -euo pipefail')
            } else if (language === 'python') {
                lines.push('import sys')
            }
            lines.push('')
        }

        // Add context-based setup
        if (context) {
            if (context.currentDirectory && (language === 'bash' || language === 'sh')) {
                lines.push(`cd "${context.currentDirectory}" || exit 1`)
                lines.push('')
            }
        }

        // Placeholder for generated script content
        lines.push(`${commentPrefix} TODO: Add script logic based on: ${description}`)

        return lines.join('\n')
    }

    /**
     * Initialize script templates
     */
    private initializeTemplates (): void {
        this.scriptTemplates = [
            {
                id: 'git-status',
                name: 'Git Status Check',
                description: 'Check git repository status',
                language: 'bash',
                template: `#!/bin/bash
# Git Status Check Script
# Checks repository status and shows uncommitted changes

set -euo pipefail

cd "{{currentDirectory}}" || exit 1

echo "=== Git Repository Status ==="
git status

if [ -n "$(git status --porcelain)" ]; then
    echo ""
    echo "=== Uncommitted Changes ==="
    git diff --stat
    exit 1
else
    echo "Repository is clean"
    exit 0
fi
`,
                variables: ['currentDirectory'],
            },
            {
                id: 'file-backup',
                name: 'File Backup',
                description: 'Backup files with timestamp',
                language: 'bash',
                template: `#!/bin/bash
# File Backup Script
# Creates timestamped backup of specified files

set -euo pipefail

BACKUP_DIR="backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

{{fileList}}

echo "Backup completed: $BACKUP_DIR"
`,
                variables: ['fileList'],
            },
            {
                id: 'find-and-replace',
                name: 'Find and Replace',
                description: 'Find and replace text in files',
                language: 'bash',
                template: `#!/bin/bash
# Find and Replace Script
# Recursively find and replace text in files

set -euo pipefail

SEARCH_PATTERN="{{searchPattern}}"
REPLACE_PATTERN="{{replacePattern}}"
TARGET_DIR="${'{{currentDirectory}}' || '.'}"

find "$TARGET_DIR" -type f -name "{{filePattern}}" -exec sed -i '' "s/$SEARCH_PATTERN/$REPLACE_PATTERN/g" {} +

echo "Find and replace completed"
`,
                variables: ['searchPattern', 'replacePattern', 'currentDirectory', 'filePattern'],
            },
            {
                id: 'package-install',
                name: 'Package Installation',
                description: 'Install packages based on package manager',
                language: 'bash',
                template: `#!/bin/bash
# Package Installation Script
# Installs packages using the appropriate package manager

set -euo pipefail

PACKAGES="{{packages}}"

if command -v apt-get &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y $PACKAGES
elif command -v yum &> /dev/null; then
    sudo yum install -y $PACKAGES
elif command -v brew &> /dev/null; then
    brew install $PACKAGES
else
    echo "No supported package manager found"
    exit 1
fi

echo "Packages installed successfully"
`,
                variables: ['packages'],
            },
        ]
    }

    /**
     * Get context value for template variable
     */
    private getContextValue (variable: string, context: TerminalContext): string {
        switch (variable) {
            case 'currentDirectory':
                return context.currentDirectory || '.'
            case 'gitBranch':
                return context.gitStatus?.branch || 'main'
            default:
                return ''
        }
    }

    /**
     * Generate filename from description
     */
    private generateFilename (description: string, language: ScriptLanguage): string {
        const sanitized = description
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 30)
        const extension = this.getFileExtension(language)
        return `${sanitized}.${extension}`
    }

    /**
     * Get file extension for language
     */
    private getFileExtension (language: ScriptLanguage): string {
        switch (language) {
            case 'bash':
            case 'sh':
                return 'sh'
            case 'zsh':
                return 'zsh'
            case 'fish':
                return 'fish'
            case 'python':
                return 'py'
            case 'powershell':
                return 'ps1'
            default:
                return 'sh'
        }
    }

    /**
     * Get shebang for language
     */
    private getShebang (language: ScriptLanguage): string {
        switch (language) {
            case 'bash':
                return '#!/bin/bash'
            case 'sh':
                return '#!/bin/sh'
            case 'zsh':
                return '#!/bin/zsh'
            case 'fish':
                return '#!/usr/bin/env fish'
            case 'python':
                return '#!/usr/bin/env python3'
            case 'powershell':
                return '#!/usr/bin/env pwsh'
            default:
                return '#!/bin/bash'
        }
    }

    /**
     * Get comment prefix for language
     */
    private getCommentPrefix (language: ScriptLanguage): string {
        switch (language) {
            case 'python':
                return '#'
            case 'powershell':
                return '#'
            default:
                return '#'
        }
    }

    /**
     * Get interpreter command for language
     */
    private getInterpreter (language: ScriptLanguage): string {
        switch (language) {
            case 'bash':
                return '/bin/bash'
            case 'sh':
                return '/bin/sh'
            case 'zsh':
                return '/bin/zsh'
            case 'fish':
                return '/usr/bin/fish'
            case 'python':
                return 'python3'
            case 'powershell':
                return 'pwsh'
            default:
                return '/bin/bash'
        }
    }

    /**
     * Detect if script requires root permissions
     */
    private detectRootRequirement (description: string): boolean {
        const rootKeywords = ['install', 'system', 'sudo', 'root', 'administrator', 'privileged']
        const lowerDesc = description.toLowerCase()
        return rootKeywords.some(keyword => lowerDesc.includes(keyword))
    }

    /**
     * Format script for AI prompt (for AI-based generation)
     */
    formatScriptPrompt (description: string, language: ScriptLanguage, context?: TerminalContext): string {
        const parts: string[] = [
            `Generate a ${language} script that: ${description}`,
        ]

        if (context) {
            if (context.currentDirectory) {
                parts.push(`Current directory: ${context.currentDirectory}`)
            }
            if (context.gitStatus) {
                parts.push(`Git branch: ${context.gitStatus.branch || 'unknown'}`)
            }
        }

        parts.push('')
        parts.push('Requirements:')
        parts.push('- Include proper error handling')
        parts.push('- Add helpful comments')
        parts.push('- Use best practices for the language')
        parts.push('- Make the script executable and portable')

        return parts.join('\n')
    }

    /**
     * Extract script from AI response
     */
    extractScriptFromResponse (response: string, language: ScriptLanguage): string | null {
        // Find all code blocks in the response
        const codeBlocks: Array<{ content: string, language: string, score: number }> = []
        
        // Match code blocks with language tags: ```python, ```bash, etc.
        const codeBlockRegex = /```(\w+)?\s*\n([\s\S]*?)```/g
        let match
        while ((match = codeBlockRegex.exec(response)) !== null) {
            const blockLanguage = (match[1] || '').toLowerCase()
            const content = match[2].trim()
            
            // Skip empty blocks
            if (!content) continue
            
            // Calculate score based on:
            // 1. Language match (higher score for matching language)
            // 2. Content completeness (has imports, functions, actual code)
            // 3. Length (prefer longer, more complete scripts)
            let score = 0
            
            // Language match bonus
            const languageMap: Record<string, ScriptLanguage[]> = {
                'python': ['python'],
                'bash': ['bash', 'sh'],
                'sh': ['bash', 'sh'],
                'shell': ['bash', 'sh'],
                'zsh': ['zsh'],
                'fish': ['fish'],
                'powershell': ['powershell'],
            }
            
            if (blockLanguage && languageMap[blockLanguage]?.includes(language)) {
                score += 100 // Strong language match
            } else if (!blockLanguage || blockLanguage === '') {
                // No language tag - check content for language indicators
                if (language === 'python' && (content.includes('import ') || content.includes('def ') || content.includes('from '))) {
                    score += 50
                } else if ((language === 'bash' || language === 'sh') && (content.includes('#!/bin/') || content.includes('$') || content.includes('echo '))) {
                    score += 50
                }
            }
            
            // Completeness indicators
            if (language === 'python') {
                if (content.includes('import ')) score += 20
                if (content.includes('def ') || content.includes('class ')) score += 20
                if (content.includes('if __name__')) score += 10
                if (content.split('\n').length > 5) score += 10 // Longer scripts are usually more complete
            } else if (language === 'bash' || language === 'sh') {
                if (content.includes('#!/')) score += 20
                if (content.includes('set -')) score += 10
                if (content.includes('function ') || content.includes('() {')) score += 20
                if (content.split('\n').length > 5) score += 10
            }
            
            // Strong penalty for explanatory text - these should not be selected
            const lowerContent = content.toLowerCase()
            if (lowerContent.includes('here\'s') || lowerContent.includes('example') || 
                lowerContent.includes('note:') || lowerContent.includes('however,') ||
                lowerContent.includes('before running') || lowerContent.includes('you\'ll need') ||
                lowerContent.startsWith('**') || lowerContent.includes('is not the recommended')) {
                score -= 100 // Heavy penalty - should not be selected
            }
            
            // Prefer blocks that start with imports/shebang (actual code)
            if (content.trim().startsWith('import ') || content.trim().startsWith('#!/') || content.trim().startsWith('from ')) {
                score += 30
            }
            
            // Additional validation: ensure it looks like actual code
            const hasCodeStructure = 
                (language === 'python' && (content.includes('import ') || content.includes('def ') || content.includes('='))) ||
                ((language === 'bash' || language === 'sh') && (content.includes('=') || content.includes('$') || content.includes('echo ')))
            
            if (!hasCodeStructure && content.split('\n').length < 5) {
                score -= 50 // Penalize blocks that don't look like code
            }
            
            codeBlocks.push({ content, language: blockLanguage, score })
        }
        
        // If we found code blocks, return the one with highest score
        if (codeBlocks.length > 0) {
            // Sort by score (highest first)
            codeBlocks.sort((a, b) => b.score - a.score)
            const bestMatch = codeBlocks[0]
            
            // Only return if score is reasonable (positive and looks like actual code)
            if (bestMatch.score > 30) {
                return bestMatch.content
            }
        }
        
        // Fallback: Try to extract between code markers (simpler regex)
        const markerRegex = /```(?:\w+)?\s*\n([\s\S]*?)```/g
        const markerMatches: string[] = []
        let markerMatch
        while ((markerMatch = markerRegex.exec(response)) !== null) {
            const content = markerMatch[1].trim()
            if (content && content.length > 20) { // Only consider substantial blocks
                markerMatches.push(content)
            }
        }
        
        if (markerMatches.length > 0) {
            // Return the longest match (usually most complete)
            markerMatches.sort((a, b) => b.length - a.length)
            return markerMatches[0]
        }

        // If no code blocks, try to find script-like content starting with shebang
        const lines = response.split('\n')
        let scriptStart = -1
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith('#!/')) {
                scriptStart = i
                break
            }
        }

        if (scriptStart >= 0) {
            // Find where the script ends (next empty line after substantial content, or end of response)
            let scriptEnd = lines.length
            for (let i = scriptStart + 1; i < lines.length; i++) {
                // Stop if we hit another code block marker or substantial explanatory text
                if (lines[i].trim().startsWith('```') || 
                    (lines[i].trim().length === 0 && i > scriptStart + 10)) {
                    scriptEnd = i
                    break
                }
            }
            return lines.slice(scriptStart, scriptEnd).join('\n').trim()
        }

        return null
    }
}

