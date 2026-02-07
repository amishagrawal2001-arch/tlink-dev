# Testing Guide: Copilot-Like Features

## 📋 Overview

Your AI assistant now has 13 new code-aware tools. Here's how to test them step-by-step, from easiest to most complex.

---

## 🚀 Quick Start Testing (5 minutes)

### Step 1: Build the Project

```bash
cd tlink-ai-assistant
npm run build
# or
yarn build
```

### Step 2: Start Tlink Terminal

Launch Tlink with your AI assistant plugin enabled.

### Step 3: Open the AI Chat

Use your hotkey or click to open the AI assistant sidebar.

---

## ✅ Test Level 1: Fallback Features (No VS Code Integration Required)

These tools work immediately because they use Node.js filesystem APIs as fallbacks.

### Test 1: Get Project Info

**What it tests:** `get_project_info` tool with fallback implementation

**How to test:**
1. Open AI chat
2. Type: **"What type of project is this? Show me the dependencies."**

**Expected AI behavior:**
- AI calls `get_project_info` tool
- Returns project type (Node.js/JavaScript)
- Lists dependencies from package.json
- Shows available npm scripts

**Success criteria:**
```
=== Project Information ===
Type: Node.js / JavaScript
Workspace: /Users/your-path/tlink-dev

Configuration Files:
  - package.json
  - tsconfig.json

Dependencies:
  Production:
    - @angular/animations
    - @angular/common
    - rxjs
    ...
```

---

### Test 2: Search Code Content

**What it tests:** `search_code_content` with filesystem fallback

**How to test:**
1. Type: **"Search for all files that import 'LoggerService'"**

**Expected AI behavior:**
- AI calls `search_code_content` with pattern "LoggerService"
- Returns matching files with line numbers

**Success criteria:**
```
=== Search Results ===
Pattern: LoggerService
Found: 15 match(es)

📄 src/services/core/ai-assistant.service.ts
   Line 19: import { LoggerService } from '../core/logger.service';

📄 src/services/terminal/terminal-tools.service.ts
   Line 3: import { LoggerService } from '../core/logger.service';
...
```

---

### Test 3: Find Files

**What it tests:** `find_files` with glob pattern matching

**How to test:**
1. Type: **"Find all TypeScript service files"**

**Expected AI behavior:**
- AI calls `find_files` with pattern like "**/*service.ts"
- Returns list of matching files

**Success criteria:**
```
=== File Search Results ===
Pattern: **/*service.ts
Found: 25 file(s)

📄 src/services/core/ai-assistant.service.ts
📄 src/services/core/logger.service.ts
📄 src/services/terminal/terminal-tools.service.ts
...
```

---

## ⚠️ Test Level 2: With VS Code Integration (Requires Extension Handler)

These tests require implementing the VS Code extension host handler first.

### Before Testing Level 2:

**YOU MUST IMPLEMENT:** The extension host handler that listens for messages from the webview.

See: [COPILOT_FEATURES_IMPLEMENTATION.md](COPILOT_FEATURES_IMPLEMENTATION.md#-what-needs-to-be-implemented)

---

### Test 4: Get Active Editor Context

**What it tests:** `get_active_editor_context` - Editor awareness

**How to test:**
1. Open a TypeScript file in your editor
2. Place cursor at a specific line
3. Select some code
4. Ask: **"What file am I currently working on?"**

**Expected AI behavior:**
- AI calls `get_active_editor_context`
- Returns current file, cursor position, selected text

**Success criteria:**
```
=== Active Editor Context ===
File: /path/to/your/file.ts
Language: typescript
Lines: 150
Cursor: Line 45, Column 12

=== Selected Text ===
function calculateTotal() {
    return items.reduce((sum, item) => sum + item.price, 0);
}

=== Context Around Cursor ===
--- Before ---
const items = getCartItems();

>>> CURSOR AT LINE 45 <<<

--- After ---
export default calculateTotal;
```

---

### Test 5: Get Editor Diagnostics

**What it tests:** `get_editor_diagnostics` - Error detection

**How to test:**
1. Open a file with TypeScript errors (or create some intentional errors)
2. Ask: **"What errors are in this file?"**

**Expected AI behavior:**
- AI calls `get_editor_diagnostics`
- Returns list of errors and warnings

**Success criteria:**
```
=== Diagnostics ===
File: src/utils/helper.ts
Total: 3 issue(s)

❌ Line 12, Col 5: Cannot find name 'processData'
   Code: 2304

⚠️ Line 25, Col 10: 'value' is declared but never used
   Code: 6133

❌ Line 42, Col 15: Type 'string' is not assignable to type 'number'
   Code: 2322
```

---

### Test 6: Insert at Cursor

**What it tests:** `insert_at_cursor` - Code insertion

**How to test:**
1. Open a file
2. Place cursor where you want to insert code
3. Ask: **"Add a console.log statement here"**

**Expected AI behavior:**
- AI calls `get_active_editor_context` to understand context
- AI calls `insert_at_cursor` with the code
- Code is inserted at cursor position

**Success criteria:**
- New code appears at your cursor position
- AI responds: `✅ Inserted 28 characters at cursor position`

---

### Test 7: Replace Selection

**What it tests:** `replace_selection` - Code replacement

**How to test:**
1. Select some code (e.g., an old variable name)
2. Ask: **"Rename this to 'userProfile'"**

**Expected AI behavior:**
- AI calls `get_active_editor_context` (sees selected text)
- AI calls `replace_selection` with new text
- Selected text is replaced

**Success criteria:**
- Selected text is replaced with new code
- AI responds: `✅ Replaced selection with 11 characters`

---

### Test 8: Search Symbols

**What it tests:** `search_symbols` - Symbol finding (LSP)

**How to test:**
1. Ask: **"Where is the function 'executeToolCall' defined?"**

**Expected AI behavior:**
- AI calls `search_symbols` with query="executeToolCall"
- Returns symbol location

**Success criteria:**
```
=== Symbol Search Results ===
Query: executeToolCall
Kind: all
Found: 1 symbol(s)

🔧 executeToolCall (method)
   Location: src/services/terminal/terminal-tools.service.ts:538
   Container: TerminalToolsService
```

---

### Test 9: Get Definition (LSP)

**What it tests:** `get_definition` - Jump to definition

**How to test:**
1. Open a file
2. Find a function call or variable usage
3. Ask: **"Where is this 'loggerService' defined?"** (provide file/line/char)

**Expected AI behavior:**
- AI calls `get_definition` with file path and position
- Returns definition location

**Success criteria:**
```
=== Definition ===
Search Location: src/services/core/ai-assistant.service.ts:18:17

📍 src/services/core/logger.service.ts:10:14
   export class LoggerService {
```

---

### Test 10: Get References (LSP)

**What it tests:** `get_references` - Find all usages

**How to test:**
1. Ask: **"Show me everywhere 'AiAssistantService' is used"**

**Expected AI behavior:**
- AI calls `search_symbols` to find the class
- AI calls `get_references` to find all usages
- Returns list of all files using it

**Success criteria:**
```
=== References ===
Symbol Location: src/services/core/ai-assistant.service.ts:36:14
Found: 8 reference(s)

📍 src/components/chat/ai-sidebar.component.ts:6:12
   import { AiAssistantService } from '../../services/core/ai-assistant.service';

📍 src/components/chat/ai-sidebar.component.ts:90:17
   private aiService: AiAssistantService,
...
```

---

## 🔧 Test Level 3: Complex Workflows

### Test 11: Fix Errors Workflow

**What it tests:** Multiple tools in sequence

**How to test:**
1. Open a file with errors
2. Ask: **"Fix the errors in this file"**

**Expected AI workflow:**
1. Calls `get_active_editor_context` → sees what file you're in
2. Calls `get_editor_diagnostics` → finds 3 errors
3. For each error:
   - Calls `get_definition` to understand types
   - Calls `apply_patch` or `replace_selection` to fix
4. Calls `get_editor_diagnostics` again → verifies no errors
5. Calls `task_complete`

**Success criteria:**
- All errors are fixed
- AI provides summary of what was fixed

---

### Test 12: Code Understanding Workflow

**What it tests:** Search and analysis tools

**How to test:**
1. Ask: **"How does authentication work in this project?"**

**Expected AI workflow:**
1. Calls `search_code_content` pattern="auth|login|authenticate"
2. Calls `search_symbols` query="login"
3. Calls `read_file` on auth-related files
4. Calls `get_project_info` to check for auth dependencies
5. Provides comprehensive explanation with file references

**Success criteria:**
- AI explains auth flow
- Provides file locations: `auth.service.ts:45`
- Lists related functions and classes

---

### Test 13: Add Feature Workflow

**What it tests:** Context-aware code generation

**How to test:**
1. Open a component file
2. Place cursor in a specific location
3. Ask: **"Add input validation here for email and password"**

**Expected AI workflow:**
1. Calls `get_active_editor_context` → sees cursor location
2. Calls `get_project_info` → checks if validation library exists
3. Calls `search_code_content` → finds existing validation patterns
4. Calls `insert_at_cursor` or `apply_patch` → adds validation code
5. Calls `task_complete`

**Success criteria:**
- Validation code is added at cursor location
- Code follows existing project patterns
- Imports are added if needed

---

## 🐛 Debugging Failed Tests

### "VS Code API not available"

**Problem:** Extension host handler not implemented

**Solution:**
```typescript
// In your VS Code extension, add:
import * as vscode from 'vscode';

// Listen for messages from webview
webviewView.webview.onDidReceiveMessage(async (message) => {
    if (message.type === 'vscode-command') {
        // Handle command
        const result = await handleCommand(message.command, message.data);

        // Send response back
        webviewView.webview.postMessage({
            type: 'vscode-response',
            requestId: message.requestId,
            response: result
        });
    }
});
```

---

### "No diagnostics found"

**Problem:** LSP not activated for this file type

**Solution:**
- Ensure language server is running (TypeScript/JavaScript/Python/etc.)
- Try opening the file in VS Code first to trigger LSP activation
- Check VS Code output panel for language server errors

---

### "Request timeout"

**Problem:** Message listener not responding

**Debug:**
1. Open browser dev tools (F12)
2. Check console for errors
3. Verify `postMessage` is being sent:
   ```javascript
   window.addEventListener('message', (event) => {
       console.log('Received message:', event.data);
   });
   ```

---

### "No active editor"

**Problem:** Editor integration not detecting active file

**Debug:**
1. Check if `vscode.window.activeTextEditor` is null
2. Try clicking in the editor to focus it
3. Verify webview can access VS Code API

---

## 📊 Test Checklist

Copy this checklist to track your testing progress:

### Fallback Tests (No VS Code integration needed)
- [ ] Test 1: Get project info ✅
- [ ] Test 2: Search code content ✅
- [ ] Test 3: Find files ✅

### VS Code Integration Tests (Requires extension handler)
- [ ] Test 4: Get active editor context
- [ ] Test 5: Get editor diagnostics
- [ ] Test 6: Insert at cursor
- [ ] Test 7: Replace selection
- [ ] Test 8: Search symbols
- [ ] Test 9: Get definition (LSP)
- [ ] Test 10: Get references (LSP)

### Complex Workflow Tests
- [ ] Test 11: Fix errors workflow
- [ ] Test 12: Code understanding workflow
- [ ] Test 13: Add feature workflow

---

## 🎯 Quick Test Script

Create this test file to verify tool availability:

**test-tools.md**
```markdown
# Tool Test Prompts

## Quick Tests
1. "What dependencies does this project have?"
2. "Search for all files that use 'Injectable'"
3. "Find all TypeScript files"

## Editor Tests (requires VS Code integration)
4. "What file am I working on?"
5. "What errors are in this file?"
6. "Add a comment here"

## Advanced Tests
7. "Where is executeToolCall defined?"
8. "Show me all references to LoggerService"
9. "Fix the errors in this code"
```

Copy these prompts and test them one by one!

---

## 📝 Expected Build Output

When you run `npm run build`, you should see these new files compiled:

```
dist/services/editor/editor-integration.service.js
dist/services/terminal/terminal-tools.service.js (updated)
dist/services/core/ai-assistant.service.js (updated)
```

If compilation fails, check for:
- TypeScript errors in new files
- Missing imports
- Service injection issues in Angular

---

## ✅ Success Metrics

Your implementation is working if:

1. **Build succeeds** without errors
2. **Fallback tests pass** (3/3)
   - Project info returns data
   - Code search finds results
   - File finder returns files
3. **VS Code tests pass** (7/7) ← After implementing extension handler
   - Editor context returns current file
   - Diagnostics show errors
   - Code insertion works
   - LSP tools return results
4. **Complex workflows complete** (3/3)
   - AI can fix errors end-to-end
   - AI can analyze codebase
   - AI can add features with context

---

## 🚀 Next Steps After Testing

Once tests pass:

1. **Performance optimization**
   - Add caching for repeated searches
   - Debounce frequent API calls

2. **Error handling improvements**
   - Better error messages
   - Retry logic for failed operations

3. **User experience**
   - Loading indicators during tool execution
   - Preview before applying changes

4. **Advanced features**
   - Inline suggestions (ghost text)
   - Multi-file refactoring
   - Test generation

---

## 📞 Need Help?

**If tests fail:**
1. Check browser console (F12) for JavaScript errors
2. Check TypeScript compilation errors
3. Verify Angular services are properly injected
4. Review [COPILOT_FEATURES_IMPLEMENTATION.md](COPILOT_FEATURES_IMPLEMENTATION.md) for troubleshooting

**Common issues:**
- **"Unknown tool"** → Tool not registered in switch statement
- **"Tool call has empty name"** → Invalid tool call format
- **"Cannot find service"** → Angular DI issue, check constructor injection
- **"postMessage is not a function"** → VS Code API not available

---

Happy testing! 🎉
