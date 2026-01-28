# How to Update Ollama Model

This guide explains how to update the Ollama model used by the AI Assistant.

## Method 1: Through Settings UI (Recommended)

### Step-by-Step Instructions

1. **Open Tlink Settings**
   - Click on the **Settings** icon in Tlink (gear icon)
   - Or use the keyboard shortcut (varies by platform)

2. **Navigate to AI Assistant Settings**
   - In the settings sidebar, find and click **"AI Assistant"**
   - This will open the AI Assistant settings page

3. **Open Provider Configuration**
   - Click on the **"Provider Configuration"** tab
   - You'll see a list of all available AI providers

4. **Find Ollama Provider**
   - Scroll down or look for **"Ollama (Local)"** in the provider list
   - Click on it to expand the configuration panel

5. **Update Model Name**
   - Find the **"Model"** field
   - The default value is `llama3.1`
   - **Change it to your installed model name**, for example:
     - `llama3.1:8b` (if you have the 8B variant)
     - `qwen2.5` (if you have Qwen installed)
     - `mistral` (if you have Mistral installed)
     - `llama3.2` (if you have a newer version)
     - Any other model you have installed

6. **Verify Base URL**
   - Make sure **Base URL** is set to: `http://localhost:11434`
   - (Without `/v1` for native API, or with `/v1` for OpenAI-compatible API)

7. **Save Configuration**
   - Click **"Save"** or the configuration will auto-save
   - The changes take effect immediately

### Visual Guide

```
Settings → AI Assistant → Provider Configuration
  └─ Ollama (Local)
      ├─ Base URL: http://localhost:11434
      ├─ Model: llama3.1:8b  ← Change this!
      └─ Context Window: 8192
```

---

## Method 2: Check Your Installed Ollama Models

Before updating, you should know which models you have installed:

### Using Terminal

```bash
# List all installed models
ollama list

# Example output:
# NAME            ID              SIZE    MODIFIED
# llama3.1:8b     abc123def456    4.7 GB  2 hours ago
# qwen2.5         789ghi012jkl    3.2 GB  1 day ago
```

### Using API

```bash
# Get list of models via API
curl http://localhost:11434/api/tags

# Example output:
# {
#   "models": [
#     {
#       "name": "llama3.1:8b",
#       "modified_at": "2024-01-15T10:30:00Z",
#       "size": 4720000000
#     }
#   ]
# }
```

---

## Common Model Names

Here are some common Ollama model names you might use:

| Model Name | Description |
|------------|-------------|
| `llama3.1` | Default Llama 3.1 model |
| `llama3.1:8b` | Llama 3.1 8B variant |
| `llama3.1:70b` | Llama 3.1 70B variant |
| `llama3.2` | Llama 3.2 (newer version) |
| `qwen2.5` | Qwen 2.5 model |
| `qwen2.5:7b` | Qwen 2.5 7B variant |
| `mistral` | Mistral model |
| `mistral:7b` | Mistral 7B variant |
| `codellama` | CodeLlama model |
| `phi3` | Phi-3 model |
| `gemma` | Gemma model |

---

## Troubleshooting

### Issue: Model Not Found (404 Error)

**Problem:** You get a 404 error when trying to use the model.

**Solution:**
1. **Verify the model is installed:**
   ```bash
   ollama list
   ```

2. **Check the exact model name:**
   - Model names are case-sensitive
   - Include the variant tag if present (e.g., `:8b`, `:7b`)
   - Use the exact name from `ollama list`

3. **Pull the model if missing:**
   ```bash
   ollama pull llama3.1:8b
   ```

### Issue: Model Name Mismatch

**Problem:** The model name in settings doesn't match your installed model.

**Solution:**
- Use the exact name from `ollama list`
- If your model is `llama3.1:8b`, set it exactly as `llama3.1:8b` (not `llama3.1` or `llama3.1-8b`)

### Issue: Ollama Not Running

**Problem:** Can't connect to Ollama service.

**Solution:**
1. **Check if Ollama is running:**
   ```bash
   curl http://localhost:11434/api/tags
   ```

2. **Start Ollama if not running:**
   - On macOS: Open Ollama app or run `ollama serve`
   - On Linux: `systemctl start ollama` or `ollama serve`
   - On Windows: Start Ollama service

---

## Example: Updating to llama3.1:8b

Based on your earlier setup, here's how to update to `llama3.1:8b`:

1. **Check your installed model:**
   ```bash
   ollama list
   # Should show: llama3.1:8b
   ```

2. **Open Tlink Settings:**
   - Settings → AI Assistant → Provider Configuration

3. **Find Ollama:**
   - Expand "Ollama (Local)"

4. **Update Model field:**
   - Change from: `llama3.1`
   - Change to: `llama3.1:8b`

5. **Verify Base URL:**
   - Should be: `http://localhost:11434`

6. **Save and test:**
   - The model will be used in the next chat request

---

## Quick Reference

**Settings Path:**
```
Tlink → Settings → AI Assistant → Provider Configuration → Ollama (Local) → Model
```

**Default Model:** `llama3.1`

**Your Model:** `llama3.1:8b` (based on your setup)

**Base URL:** `http://localhost:11434` (native API) or `http://localhost:11434/v1` (OpenAI-compatible)

---

## Additional Notes

- **Model names are case-sensitive** - Use exact casing from `ollama list`
- **Include variant tags** - If your model is `llama3.1:8b`, include the `:8b` part
- **Changes take effect immediately** - No restart needed
- **Multiple models** - You can switch between models anytime by changing the Model field
- **Model size** - Larger models (70B) require more RAM but provide better responses

---

## Need Help?

If you're still having issues:
1. Check the browser console for error messages
2. Verify Ollama is running: `curl http://localhost:11434/api/tags`
3. Check the model name matches exactly: `ollama list`
4. Try pulling the model again: `ollama pull <model-name>`
