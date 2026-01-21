# Integrating Proxy Server with Tlink

## Step 1: Deploy Your Proxy Server

Follow instructions in `DEPLOYMENT.md` to deploy your proxy server. You'll get a URL like:
- `https://your-proxy.railway.app`
- `https://your-proxy.onrender.com`
- `https://api.yourdomain.com`

## Step 2: Update Tlink Configuration

### Option A: Add as New Provider (Recommended)

Edit `tlink-ai-assistant/src/providers/tlink/ai-config.provider.ts`:

```typescript
defaults = {
    aiAssistant: {
        defaultProvider: 'ollama', // Keep local as default
        providers: {
            // ... existing providers ...
            
            // Add your proxy as a new provider
            'tlink-cloud': {
                apiKey: '', // Not needed - proxy handles auth
                model: 'auto', // Proxy selects best model
                baseURL: 'https://your-proxy.railway.app/v1' // Your proxy URL
            }
        }
    }
}
```

### Option B: Replace OpenAI Compatible

If you want to use your proxy as the "OpenAI Compatible" provider:

```typescript
openaiCompatible: {
    apiKey: '', // Not needed
    model: 'auto',
    baseURL: 'https://your-proxy.railway.app/v1' // Your proxy URL
}
```

## Step 3: Update Provider Types

Edit `tlink-ai-assistant/src/types/provider.types.ts`:

```typescript
export const PROVIDER_DEFAULTS: { [key: string]: ProviderConfig } = {
    // ... existing providers ...
    
    'tlink-cloud': {
        baseURL: 'https://your-proxy.railway.app/v1',
        model: 'auto',
        maxTokens: 1000,
        temperature: 0.7,
        timeout: 30000,
        retries: 3,
        contextWindow: 8192,
        authConfig: { type: 'none' } // No API key needed
    }
};
```

## Step 4: Test Integration

1. **Rebuild Tlink:**
   ```bash
   cd tlink-ai-assistant
   npm run build
   ```

2. **Open Tlink Settings:**
   - Go to AI Assistant settings
   - Select "Tlink Cloud" (or your proxy provider name)
   - No API key needed!

3. **Test a query:**
   - Send a message in AI Assistant
   - Check proxy server logs to see request

## Step 5: User Experience

### For Free Users (Default):
- Uses local Ollama
- No configuration needed
- Works offline

### For Premium Users (Optional):
- Can switch to "Tlink Cloud"
- Better performance
- More models available
- Requires subscription (you manage this)

## Monitoring

Check your proxy server logs to see:
- Request volume
- Which providers are being used
- Error rates
- Response times

## Troubleshooting

### Issue: "Provider not available"
- Check proxy server is running
- Verify URL is correct
- Check CORS settings in proxy

### Issue: "Rate limit exceeded"
- User hit rate limit
- Increase limits in proxy config
- Or implement user authentication for higher limits

### Issue: "Connection refused"
- Proxy server is down
- Check deployment status
- Verify firewall/security groups
