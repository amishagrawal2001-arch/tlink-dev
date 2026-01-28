# How to Modify AI Provider Settings

This guide explains how to configure and modify AI providers in the Tlink AI Assistant plugin.

## Accessing AI Provider Settings

1. **Open Tlink Application**
2. **Navigate to Settings**
   - Click on the **Settings** icon in the left sidebar
   - Or use the keyboard shortcut: `Ctrl+Shift+,` (Windows/Linux) or `Cmd+,` (Mac)

3. **Open AI Assistant Settings**
   - In the settings sidebar, find and click on **"AI Assistant"**
   - The AI Assistant settings page will open

4. **Go to AI Providers Tab**
   - Click on the **"AI Providers"** tab at the top of the settings page
   - You'll see two sections:
     - **Cloud Providers** (require API keys)
     - **Local Providers** (run locally, no API key needed)

## Modifying Cloud Providers

### Supported Cloud Providers:
- **OpenAI** - GPT-4, GPT-3.5, etc.
- **Anthropic Claude** - Claude 3 models
- **Minimax** - MiniMax AI models
- **GLM (ChatGLM)** - Zhipu AI ChatGLM models
- **OpenAI Compatible** - Third-party services (DeepSeek, OneAPI, etc.)

### Steps to Configure:

1. **Find the Provider**
   - Scroll to the **Cloud Providers** section
   - Find the provider you want to configure (e.g., OpenAI, Anthropic)

2. **Expand the Provider Card**
   - Click on the provider card to expand it
   - The configuration form will appear

3. **Configure Provider Settings**
   - **Display Name** (optional): Custom name for the provider
   - **Enable/Disable**: Toggle switch to enable or disable the provider
   - **API Key** (required): Enter your API key
     - For OpenAI: Should start with `sk-`
     - For Anthropic: Should start with `sk-ant-`
     - The system will validate the format automatically
   - **Base URL** (optional): API endpoint URL
     - Defaults are provided for each provider
   - **Model** (optional): Model name to use
     - Examples: `gpt-4`, `gpt-3.5-turbo`, `claude-3-sonnet-20240229`
   - **Context Window** (optional): Maximum context tokens
     - Defaults: GPT-4 (128000), Claude 3 (200000)

4. **Save Configuration**
   - Click the **"Save Config"** button
   - A success message will confirm the save

5. **Test Connection** (optional)
   - Click the **"Test Connection"** button
   - The system will verify the API key and connection

## Modifying Local Providers

### Supported Local Providers:
- **Ollama** - Local LLM service
- **vLLM** - Production-ready local LLM service

### Steps to Configure:

1. **Find the Provider**
   - Scroll to the **Local Providers** section
   - Find the provider you want to configure (e.g., Ollama, vLLM)

2. **Expand the Provider Card**
   - Click on the provider card to expand it
   - The configuration form will appear

3. **Configure Provider Settings**
   - **Display Name** (optional): Custom name for the provider
   - **Enable/Disable**: Toggle switch to enable or disable the provider
   - **Base URL** (required): Local service URL
     - Ollama default: `http://localhost:11434/v1`
     - vLLM default: `http://localhost:8000/v1`
   - **Model** (optional): Model name or path
     - Ollama: `llama3.1`, `qwen2.5`, `mistral`
     - vLLM: HuggingFace model path (e.g., `meta-llama/Llama-3.1-8B`)
   - **API Key** (vLLM only, optional): If your vLLM service requires authentication
   - **Context Window** (optional): Maximum context tokens
     - Default: 8192 for local providers

4. **Check Connection Status**
   - The provider card shows online/offline status
   - Green "Online" = Service is running and accessible
   - Red "Offline" = Service is not running or unreachable

5. **Save Configuration**
   - Click the **"Save Config"** button
   - A success message will confirm the save

6. **Test Connection** (optional)
   - Click the **"Detect Service"** button
   - The system will check if the local service is running

## Setting Default Provider

1. **Go to General Settings Tab**
   - Click on the **"General"** tab in AI Assistant settings

2. **Select Default Provider**
   - In the **"Default AI Provider"** section
   - Click on the provider card you want to use as default
   - The selected provider will be highlighted

3. **Provider is Now Default**
   - The selected provider will be used for all AI Assistant interactions
   - You can see "Current provider: [Provider Name]" in the header

## Switching Providers

### Method 1: From Settings
1. Go to **General Settings** tab
2. Click on a different provider card in the **Default AI Provider** section

### Method 2: From Chat Interface
1. Open the AI Assistant sidebar (Ctrl+Shift+A)
2. Click the **settings/gear icon** in the header
3. Select a different provider from the list

## Troubleshooting

### API Key Issues
- **Invalid Format**: Check that your API key matches the expected format
  - OpenAI: Must start with `sk-`
  - Anthropic: Must start with `sk-ant-`
- **Empty API Key**: Make sure you've entered the API key before saving
- **Wrong API Key**: Verify the key is correct and has not expired

### Connection Issues
- **Cloud Providers**: 
  - Check your internet connection
  - Verify the API key is valid
  - Check if the service is experiencing outages
- **Local Providers**:
  - Ensure the local service is running
  - Verify the Base URL is correct
  - Check firewall settings if connection fails

### Provider Not Appearing
- Make sure you've saved the configuration
- Check that the provider is enabled (toggle switch is on)
- Refresh the settings page

## Advanced Configuration

### OpenAI Compatible Services
For services like DeepSeek, OneAPI, or other OpenAI-compatible APIs:

1. Select **"OpenAI Compatible"** provider
2. Enter your **API Key**
3. Set **Base URL** to the service endpoint
   - Example: `https://api.deepseek.com/v1`
4. Set **Model** name
   - Example: `deepseek-chat`
5. **Disable Streaming** (if the service doesn't support it)
   - Check the "Disable Streaming" checkbox
6. Set **Context Window** according to the model's limits

### Custom Display Names
You can set custom display names for providers:
1. Expand the provider card
2. Enter a name in the **"Display Name"** field
3. Save the configuration
4. The custom name will appear in the provider list

## Best Practices

1. **Test Before Using**: Always test the connection after configuring a provider
2. **Keep API Keys Secure**: Never share your API keys
3. **Use Appropriate Models**: Choose models that fit your use case
   - For simple tasks: Use smaller/faster models
   - For complex tasks: Use larger/more capable models
4. **Monitor Usage**: Keep track of API usage to avoid unexpected costs
5. **Set Context Limits**: Configure context windows appropriately to balance performance and capability

## Keyboard Shortcuts

- **Open Settings**: `Ctrl+Shift+,` (Windows/Linux) or `Cmd+,` (Mac)
- **Open AI Assistant**: `Ctrl+Shift+A` (Windows/Linux) or `Cmd+Shift+A` (Mac)
- **Switch Provider**: Use the provider switcher in the AI Assistant sidebar

## Need Help?

If you encounter issues:
1. Check the console for error messages
2. Verify your API keys are correct
3. Ensure local services are running (for local providers)
4. Check the plugin logs in the Advanced Settings tab
