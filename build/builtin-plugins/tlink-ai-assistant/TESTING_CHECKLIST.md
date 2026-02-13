# Testing Checklist - tlink-ai-assistant Plugin

**Date**: 2026-01-16  
**Status**: Ready for Manual Testing

## Pre-Testing Verification ✅

- [x] Plugin builds successfully
- [x] All inline templates converted to templateUrl
- [x] HTML loader configured correctly in webpack
- [x] Plugin registered as builtin plugin
- [x] Main application rebuilt

## Manual Testing Steps

### Step 1: Start Tlink Application
```bash
cd /Users/surajsharma/Tlink
npm start
# or
yarn start
```

**Expected**: Application starts without errors

**Check**:
- [ ] No Angular bootstrapping errors in console
- [ ] No template parsing errors
- [ ] Plugin loads successfully (check console for "Loading ai-assistant")

### Step 2: Verify Plugin Loading
**Action**: Open DevTools (F12 or Cmd+Option+I) and check console

**Expected Console Messages**:
- `Loading ai-assistant: /Users/surajsharma/Tlink/tlink-ai-assistant/dist/index.js`
- No errors related to `charCodeAt` or template parsing

**Check**:
- [ ] Plugin appears in console loading messages
- [ ] No template parsing errors
- [ ] No module loading errors

### Step 3: Access Settings UI
**Action**: 
1. Open Tlink Settings (gear icon or Ctrl/Cmd + ,)
2. Look for "AI Assistant" in settings menu

**Expected**: 
- AI Assistant section appears in settings
- All settings tabs are accessible

**Check**:
- [ ] "AI Assistant" appears in settings menu
- [ ] Can navigate to AI Assistant settings
- [ ] General Settings tab loads
- [ ] Provider Configuration tab loads
- [ ] Security Settings tab loads
- [ ] Context Settings tab loads
- [ ] Data Management tab loads
- [ ] MCP Settings tab loads (if applicable)

### Step 4: Configure AI Provider
**Action**:
1. Go to AI Assistant → Provider Configuration
2. Select a provider (e.g., OpenAI, Anthropic)
3. Enter API key (if available)
4. Save configuration

**Expected**:
- Provider configuration UI loads
- Can enter API keys
- Configuration saves successfully

**Check**:
- [ ] Provider list displays correctly
- [ ] Can select a provider
- [ ] API key input field works
- [ ] Save button works
- [ ] Configuration persists after restart

### Step 5: Test AI Assistant Sidebar
**Action**:
1. Look for AI Assistant button/icon in UI (toolbar or left dock)
2. Click to open AI Assistant sidebar

**Expected**:
- AI Assistant sidebar opens
- UI displays correctly
- No rendering errors

**Check**:
- [ ] AI Assistant button/icon visible
- [ ] Sidebar opens on click
- [ ] Sidebar UI renders correctly
- [ ] No console errors when opening sidebar

### Step 6: Test Basic Chat Functionality
**Action**:
1. Open AI Assistant sidebar
2. Type a test message: "Hello, can you respond?"
3. Send message

**Expected**:
- Message sends successfully
- AI response received (if API key configured)
- Messages display correctly

**Check**:
- [ ] Can type in input field
- [ ] Send button works
- [ ] Message appears in chat
- [ ] Loading indicator shows while waiting
- [ ] AI response received (if provider configured)
- [ ] Messages format correctly

### Step 7: Test Terminal Integration
**Action**:
1. Open a terminal tab
2. Use AI Assistant: "List all files in current directory"
3. Verify command generation

**Expected**:
- AI generates appropriate command (e.g., `ls`)
- Command is correctly formatted

**Check**:
- [ ] Command generation works
- [ ] Generated command is correct
- [ ] Can explain commands
- [ ] Terminal context detected

## Known Issues to Watch For

1. **Template Parsing Errors**: Should be fixed, but watch for any `charCodeAt` errors
2. **Module Loading Errors**: Check for any missing dependencies
3. **Provider Initialization**: Some providers may require specific configuration
4. **UI Rendering**: Check for any CSS/styling issues

## Success Criteria

- [ ] Plugin loads without errors
- [ ] Settings UI is accessible
- [ ] At least one AI provider can be configured
- [ ] Basic chat functionality works
- [ ] Terminal integration works (command generation at minimum)

## Next Steps After Testing

1. Document any bugs found
2. Fix critical issues
3. Test advanced features (Agent mode, MCP integration)
4. Continue with Chinese text removal (if needed)

## Testing Notes

- **API Keys**: Some tests require valid API keys
- **Network**: Some features require internet connection
- **Performance**: Monitor for any performance issues
- **Memory**: Watch for memory leaks during extended use
