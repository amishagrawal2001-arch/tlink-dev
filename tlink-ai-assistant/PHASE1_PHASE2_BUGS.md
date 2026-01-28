# Phase 1 & Phase 2 Bugs and Missing Items Report

## Critical Issues

### 1. Provider Directory Path Still References "tabby"
**Location**: `src/index.ts` lines 97-100
**Issue**: Imports still use `./providers/tabby/` path
**Fix Required**: 
- Option A: Rename directory `providers/tabby/` → `providers/tlink/`
- Option B: Keep directory but update imports to use correct path

**Files Affected**:
- `src/index.ts` (lines 97-100)
- Directory: `src/providers/tabby/` (should be `src/providers/tlink/`)

### 2. Storage Keys Still Use "tabby-ai-assistant" Prefix
**Location**: Multiple files
**Issue**: Storage keys and localStorage keys still use `tabby-ai-assistant-` prefix
**Files Affected**:
- `src/services/chat/chat-history.service.ts` (line 33): `'tabby-ai-assistant-chat-history'`
- `src/services/core/file-storage.service.ts` (lines 295-299): Multiple keys
- `src/components/settings/data-settings.component.ts` (line 443): Key checks
- `src/components/settings/data-settings.component.ts` (line 527): Backup filename

**Fix Required**: Replace all `tabby-ai-assistant-` with `tlink-ai-assistant-`

### 3. File Storage Paths Still Reference "tabby"
**Location**: `src/services/core/file-storage.service.ts` (line 85)
**Issue**: File paths still use `tabby/plugins/tabby-ai-assistant/data`
**Fix Required**: Change to `tlink/plugins/tlink-ai-assistant/data`

### 4. Variable Names Still Reference "tabby"
**Location**: Multiple files
**Issue**: Variable `tabbyConfig` should be `tlinkConfig` or just `config`
**Files Affected**:
- `src/components/settings/general-settings.component.ts` (line 62)
- `src/services/core/theme.service.ts` (line 224, 239, 635)

**Fix Required**: Rename `tabbyConfig` → `tlinkConfig` or use existing `config` variable

### 5. MCP Client Info Still Uses "tabby-ai-assistant"
**Location**: 
- `src/services/mcp/transports/http-transport.ts` (line 42)
- `src/services/mcp/mcp-client-manager.service.ts` (line 133)
**Issue**: Client name still set to `'tabby-ai-assistant'`
**Fix Required**: Change to `'tlink-ai-assistant'`

### 6. System Prompts Still Mention "Tabby"
**Location**: `src/services/providers/base-provider.service.ts` (line 625)
**Issue**: System prompt says "运行在 Tabby 终端中" (running in Tabby terminal)
**Fix Required**: Change to "running in Tlink terminal" or equivalent

### 7. Comments Still Reference "Tabby"
**Location**: Multiple files
**Issue**: Comments still mention Tabby instead of Tlink
**Files Affected**:
- `src/services/terminal/terminal-manager.service.ts` (line 248): "Tabby 使用 frontend.getSelection()"
- `src/services/terminal/terminal-context.service.ts` (lines 333, 445, 454): Multiple Tabby references
- `src/index.ts` (line 168): "Tabby Integration Providers"
- `src/components/terminal/ai-toolbar-button.component.ts` (line 6): "在Tabby工具栏显示"
- `src/components/chat/ai-sidebar.component.ts` (line 18): "支持 Tabby 主题"
- `src/services/core/theme.service.ts` (line 238): "监听 Tabby 主题变化"
- `src/services/core/theme.service.ts` (line 635): "获取 Tabby 当前的有效主题"
- `src/styles/ai-assistant.scss` (line 2): "Tabby AI Assistant 全局样式"

**Fix Required**: Replace all "Tabby" references with "Tlink" in comments

## Package Configuration Issues

### 8. package.json Repository URLs Still Point to "tabby-ai-assistant"
**Location**: `package.json` (lines 30-31)
**Issue**: Repository and homepage URLs still reference `tabby-ai-assistant`
**Current**:
```json
"repository": "https://github.com/zhangyang-crazy-one/tabby-ai-assistant",
"homepage": "https://github.com/zhangyang-crazy-one/tabby-ai-assistant"
```
**Fix Required**: Update to `tlink-ai-assistant` (or appropriate Tlink repository)

### 9. package.json Description Still Has Chinese Text
**Location**: `package.json` (line 4)
**Issue**: Description contains Chinese: "Tlink终端AI助手插件 - 支持多AI提供商..."
**Fix Required**: Translate to English or remove Chinese text

## Documentation Issues

### 10. README.md Still Has Tabby References
**Location**: `README.md`
**Issue**: README still mentions Tabby throughout
**Fix Required**: Replace all Tabby references with Tlink

### 11. i18n Translation Files Have Tabby References
**Location**: 
- `src/i18n/translations/en-US.ts` (line 63)
- `src/i18n/translations/zh-CN.ts` (line 63)
- `src/i18n/translations/ja-JP.ts` (line 63)
**Issue**: Translation strings mention "Tabby settings"
**Fix Required**: Change to "Tlink settings" (or keep if referring to actual Tabby settings compatibility)

## Summary

**Total Issues Found**: 11
- **Critical**: 7 (affect functionality)
- **Configuration**: 2 (package.json)
- **Documentation**: 2 (README, i18n)

**Priority Order**:
1. Fix provider directory path (affects imports)
2. Update storage keys (affects data persistence)
3. Update file paths (affects file storage)
4. Rename variables (code consistency)
5. Update MCP client info (API compatibility)
6. Update system prompts (user-facing)
7. Update comments (code documentation)
8. Update package.json (package metadata)
9. Update README.md (documentation)
10. Update i18n files (user-facing strings)
