# Testing Guide for tlink-ai-assistant Plugin

## Testing Status

**Last Updated**: 2026-01-16
**Plugin Version**: 1.0.38
**Build Status**: ✅ SUCCESS

## Pre-Testing Checklist

- [x] Plugin builds successfully
- [x] Dependencies installed
- [x] Webpack version compatibility resolved
- [ ] Plugin loads in Tlink
- [ ] Settings UI accessible
- [ ] AI providers initialize
- [ ] Basic chat functionality works
- [ ] Terminal integration works

## Testing Plan

### Phase 1: Build Verification ✅
- [x] Verify build completes without errors
- [x] Check output files generated (`dist/index.js`)
- [x] Verify source map generated
- [x] Check build size (target: < 3MB)

**Status**: ✅ PASSED
- Build successful
- Output: `dist/index.js` (2.5MB)
- Source map: `dist/index.js.map` (4.0MB)

### Phase 2: Plugin Loading
- [ ] Verify plugin loads in Tlink without errors
- [ ] Check for console errors/warnings
- [ ] Verify plugin appears in plugin manager (if applicable)
- [ ] Check Angular module initialization

**How to Test**:
1. Start Tlink application
2. Check browser/Electron console for errors
3. Verify plugin module loads correctly
4. Check for any missing dependencies

### Phase 3: Settings UI
- [ ] Verify settings tab is accessible
- [ ] Check general settings page loads
- [ ] Verify provider configuration UI
- [ ] Test MCP settings (if applicable)
- [ ] Test security settings
- [ ] Test context settings
- [ ] Test data management settings

**How to Test**:
1. Open Tlink settings
2. Navigate to "AI Assistant" section
3. Verify all settings tabs are accessible
4. Test saving/loading settings
5. Verify default values

### Phase 4: AI Provider Initialization
- [ ] Test OpenAI provider initialization
- [ ] Test Anthropic provider initialization
- [ ] Test GLM provider initialization
- [ ] Test Minimax provider initialization
- [ ] Test Ollama provider initialization (if applicable)
- [ ] Verify provider switching works
- [ ] Test provider health checks

**How to Test**:
1. Configure API keys in settings
2. Test each provider initialization
3. Verify provider status indicators
4. Test switching between providers

### Phase 5: Basic Chat Functionality
- [ ] Verify chat sidebar opens
- [ ] Test sending a simple message
- [ ] Verify AI response received
- [ ] Test message display/formatting
- [ ] Test chat history persistence
- [ ] Test chat export functionality
- [ ] Test chat clearing

**How to Test**:
1. Open AI Assistant sidebar
2. Send a test message: "Hello, can you respond?"
3. Verify response is received
4. Check message formatting
5. Close and reopen sidebar to verify history persists

### Phase 6: Terminal Integration
- [ ] Test terminal context detection
- [ ] Test command generation from natural language
- [ ] Test command explanation
- [ ] Test terminal output analysis
- [ ] Verify terminal tools work correctly

**How to Test**:
1. Open a terminal tab in Tlink
2. Use AI Assistant to generate a command
3. Verify command is correctly formatted
4. Test command explanation feature
5. Test output analysis

### Phase 7: Advanced Features
- [ ] Test Agent mode (multi-turn tool calls)
- [ ] Test MCP server integration (if configured)
- [ ] Test security features (risk assessment, password protection)
- [ ] Test context management (compression, checkpoints)
- [ ] Test streaming responses
- [ ] Test error handling

**How to Test**:
1. Enable Agent mode in settings
2. Test complex queries requiring tool calls
3. Verify tool execution and results
4. Test error scenarios (invalid commands, API errors)

## Known Issues

### Build Warnings (Non-blocking)
1. **Sass @import deprecation**: Sass `@import` rules are deprecated. Should migrate to `@use` syntax.
2. **Unused TypeScript files**: Some files are marked as unused but may be conditionally imported.

### Potential Issues to Watch For
1. **Missing dependencies**: Ensure all external dependencies are installed
2. **Version conflicts**: Watch for RxJS/webpack version mismatches
3. **Chinese text in UI**: Some Chinese text may still appear in UI (can be addressed later)
4. **API key configuration**: Ensure API keys are properly configured before testing

## Testing Commands

### Build Test
```bash
cd tlink-ai-assistant
npm run build
```

### Unit Tests (if configured)
```bash
npm test
```

### Manual Testing Steps
1. Start Tlink application
2. Check console for initialization messages
3. Open AI Assistant sidebar
4. Configure a provider in settings
5. Test basic chat functionality
6. Test terminal integration

## Test Environment

- **OS**: macOS (darwin 24.2.0)
- **Node**: v25.2.1
- **NPM**: (check with `npm --version`)
- **Tlink**: (version from parent directory)
- **Webpack**: 5.86.0 (from parent)

## Success Criteria

- ✅ Plugin builds without errors
- ⏳ Plugin loads in Tlink without errors
- ⏳ Settings UI is accessible and functional
- ⏳ At least one AI provider works end-to-end
- ⏳ Basic chat functionality works
- ⏳ Terminal integration works (command generation at minimum)

## Next Steps

1. Test plugin loading in Tlink
2. Test settings UI accessibility
3. Configure at least one AI provider
4. Test basic chat functionality
5. Test terminal integration
6. Document any issues found
7. Fix critical bugs
8. Resume Chinese text removal (optional, can be done incrementally)
