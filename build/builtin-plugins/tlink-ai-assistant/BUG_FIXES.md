# Bug Fixes - tlink-ai-assistant Plugin

## Template Parsing Error Fix

**Date**: 2026-01-16  
**Issue**: `TypeError: this.input.charCodeAt is not a function`  
**Status**: ✅ FIXED

### Problem
Angular's template parser was receiving `undefined` instead of a string when trying to parse component templates. This occurred because:
1. Large inline template strings were causing parsing issues
2. HTML templates weren't being processed correctly by webpack

### Root Cause
1. **Inline Templates**: Three components had large inline template strings (~200+ lines) which Angular's parser couldn't handle correctly
2. **Webpack Loader Order**: The HTML loader was configured but placed after the TypeScript loader, so `@ngtools/webpack` couldn't resolve `templateUrl` references properly

### Solution

#### 1. Converted Inline Templates to templateUrl
- **ai-sidebar.component.ts**: Extracted 205-line template to `ai-sidebar.component.html`
- **data-settings.component.ts**: Extracted 106-line template to `data-settings.component.html`
- **mcp-settings.component.ts**: Extracted 222-line template to `mcp-settings.component.html`

#### 2. Fixed Webpack Configuration
**File**: `webpack.plugin.config.mjs`

**Change**: Moved HTML loader rule to the top of the rules array (before TypeScript processing)

```javascript
module: {
    rules: [
        // HTML templates must be processed BEFORE TypeScript loader
        {
            test: /\.html$/,
            use: ['raw-loader'],
        },
        ...options.rules ?? [],
        // ... other rules including TypeScript loader
    ]
}
```

**Why**: `@ngtools/webpack` with `directTemplateLoading: false` needs HTML files to be processed by `raw-loader` before it processes TypeScript files that reference them via `templateUrl`.

### Files Changed
1. `tlink-ai-assistant/src/components/chat/ai-sidebar.component.ts` - Changed to `templateUrl`
2. `tlink-ai-assistant/src/components/chat/ai-sidebar.component.html` - New file
3. `tlink-ai-assistant/src/components/settings/data-settings.component.ts` - Changed to `templateUrl`
4. `tlink-ai-assistant/src/components/settings/data-settings.component.html` - New file
5. `tlink-ai-assistant/src/components/settings/mcp-settings.component.ts` - Changed to `templateUrl`
6. `tlink-ai-assistant/src/components/settings/mcp-settings.component.html` - New file
7. `webpack.plugin.config.mjs` - Fixed loader order

### Verification
- ✅ Plugin builds successfully
- ✅ Main application rebuilds successfully
- ✅ No template parsing errors in build output
- ⏳ Runtime testing pending (requires starting Tlink)

### Testing
To verify the fix:
1. Start Tlink application
2. Check console for plugin loading messages
3. Verify no `charCodeAt` errors appear
4. Test Settings UI accessibility
5. Test AI Assistant sidebar opening

### Related Issues
- Initial error occurred during Angular bootstrapping
- Error prevented plugin from loading
- Safe mode was triggered but still failed

### Prevention
- Use `templateUrl` instead of inline templates for large templates (>50 lines)
- Ensure webpack loaders are in correct order (HTML before TypeScript)
- Test template loading during development
