# Using Copilot/Code Completion in Tlink AI

This guide explains how to enable and use AI-powered code completion (similar to GitHub Copilot) in Tlink AI's code editor.

## Option 1: Install tabby-copilot Plugin

Tlink AI supports the `tabby-copilot` plugin, which provides AI-powered code completion similar to VS Code's GitHub Copilot.

### Installation Steps:

1. **Open Settings**
   - Click on the Settings icon in the app
   - Navigate to **Plugins** section

2. **Search for Copilot Plugin**
   - In the "Available" tab, search for `copilot` or `tabby-copilot`
   - If the plugin is available on npm, it will appear in the list

3. **Install the Plugin**
   - Click the "Get" button next to the `tabby-copilot` plugin
   - Wait for installation to complete
   - Restart the app when prompted

4. **Configure the Plugin**
   - After restart, the plugin should be active
   - Check the plugin settings if available in the Settings > Plugins > Installed section

### Manual Installation (if not available in UI):

If the plugin doesn't appear in the plugin manager, you can install it manually:

1. **Open Plugins Directory**
   - Go to Settings > Plugins
   - Click "Plugins folder" button
   - This opens the plugins directory in your file manager

2. **Install via npm**
   ```bash
   cd ~/.config/tlink/plugins  # or the plugins directory shown
   npm install tabby-copilot
   ```

3. **Restart Tlink AI**
   - Close and reopen the app for the plugin to load

## Option 2: Enable Monaco Editor Built-in Code Completion

Monaco Editor (the same editor used in VS Code) has built-in code completion features that work automatically for supported languages.

### Features Available:

- **IntelliSense**: Automatic code completion for TypeScript, JavaScript, Python, and other languages
- **Hover Information**: Hover over code to see documentation
- **Parameter Hints**: See function parameters as you type
- **Quick Suggestions**: Suggestions appear as you type

### How to Use:

1. **Open Code Editor**
   - Create a new code editor tab or open an existing file

2. **Type Code**
   - Start typing in a supported language (TypeScript, JavaScript, Python, etc.)
   - Code completion suggestions will appear automatically

3. **Accept Suggestions**
   - Press `Tab` or `Enter` to accept a suggestion
   - Use `Ctrl+Space` (or `Cmd+Space` on Mac) to manually trigger suggestions
   - Use arrow keys to navigate suggestions

4. **View Documentation**
   - Hover over functions, variables, or types to see documentation
   - Parameter hints appear automatically when calling functions

### Supported Languages:

Monaco Editor provides IntelliSense for:
- TypeScript/JavaScript
- Python
- Java
- C/C++
- C#
- Go
- Rust
- HTML/CSS
- JSON
- And many more...

## Option 3: Use AI Chat for Code Assistance

Tlink AI includes a built-in AI Chat feature that can help with code:

1. **Open AI Chat**
   - Use the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
   - Type "AI Chat" and select it
   - Or use the toolbar button if available

2. **Ask for Code Help**
   - Describe what you want to code
   - Ask for code completion suggestions
   - Request code explanations or improvements

3. **Copy Code to Editor**
   - Copy the generated code from the chat
   - Paste it into your code editor

## Troubleshooting

### Code Completion Not Working?

1. **Check Language Detection**
   - Ensure your file has the correct extension (e.g., `.ts`, `.js`, `.py`)
   - Monaco should auto-detect the language

2. **Verify Plugin Installation**
   - Go to Settings > Plugins > Installed
   - Check if `tabby-copilot` is listed and enabled

3. **Check Console for Errors**
   - Open Developer Tools (if available)
   - Look for any plugin loading errors

### Plugin Not Found?

If `tabby-copilot` is not available:

1. **Check npm Registry**
   - The plugin might be published under a different name
   - Search npm for "tabby-copilot" or "tlink-copilot"

2. **Alternative Plugins**
   - Look for other AI code completion plugins compatible with Tabby/Tlink
   - Check the plugin's `package.json` for `tabby-plugin` or `tlink-plugin` keyword

3. **Build Your Own**
   - See `HACKING.md` for plugin development guidelines
   - Create a custom copilot plugin using the AI Chat API

## Configuration

### Monaco Editor Settings

The code editor uses Monaco Editor with these default settings:
- **Word Wrap**: Configurable (off by default)
- **Minimap**: Configurable (off by default)
- **Font Size**: 14px (configurable)
- **Line Height**: 22px (configurable)

### Enhancing Code Completion

To improve code completion:

1. **Use TypeScript/JavaScript**
   - These languages have the best IntelliSense support
   - Add type annotations for better suggestions

2. **Open Project Folders**
   - Open folders containing your project
   - Monaco can provide better suggestions with project context

3. **Install Language Servers** (if supported)
   - Some plugins may add Language Server Protocol (LSP) support
   - This provides advanced code completion and error checking

## Additional Resources

- **Plugin Development**: See `HACKING.md` for creating custom plugins
- **Monaco Editor Docs**: https://microsoft.github.io/monaco-editor/
- **Tabby Plugin Examples**: Check npm for `tabby-*` plugins

## Notes

- The `tabby-copilot` plugin compatibility is mentioned in `app/src/plugins.ts`
- Tlink AI supports plugins with `tabby-`, `terminus-`, or `tlink-` prefixes
- Built-in Monaco Editor features work without any plugins
- AI Chat is always available as a fallback for code assistance
