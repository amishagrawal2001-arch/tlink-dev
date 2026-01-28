# How to Check Which Ollama Model is Being Used

This guide shows multiple ways to check which Ollama model is currently configured and in use.

---

## Method 1: Check via Ollama API (Recommended)

### Check Installed Models

```bash
# Get all installed models
curl http://localhost:11434/api/tags

# Pretty print (if you have Python)
curl -s http://localhost:11434/api/tags | python3 -m json.tool
```

**Output Example:**
```json
{
    "models": [
        {
            "name": "llama3.1:8b",
            "model": "llama3.1:8b",
            "modified_at": "2025-12-30T08:53:40.398199349-08:00",
            "size": 4920753328,
            "details": {
                "parameter_size": "8.0B",
                "quantization_level": "Q4_K_M"
            }
        }
    ]
}
```

### Check Currently Running Model

```bash
# Check what model is currently loaded/running
ps aux | grep "ollama.*runner.*model" | grep -v grep
```

**Output Example:**
```
/Users/surajsharma/Tlink/extras-ollama/mac/ollama runner --model .../llama3.1:8b ...
```

---

## Method 2: Check via Ollama CLI (if available)

If you have Ollama CLI installed:

```bash
# List all installed models
ollama list

# Show details of a specific model
ollama show llama3.1:8b
```

**Note:** If you're using Tlink's bundled Ollama, the CLI might not be in your PATH. Use Method 1 instead.

---

## Method 3: Check in Tlink AI Assistant Settings

### Step-by-Step:

1. **Open Tlink**
2. **Go to Settings** (gear icon or `Cmd+,`)
3. **Navigate to:** `AI Assistant` → `Provider Configuration`
4. **Find "Ollama (Local)"** and expand it
5. **Check the "Model" field**

**Current Configuration:**
- **Model:** `llama3.1:8b` (or whatever you configured)
- **Base URL:** `http://localhost:11434`

---

## Method 4: Check via API During Chat

When you send a message in the AI Assistant, check the browser console or logs:

1. **Open Developer Tools** (`Cmd+Option+I` on macOS)
2. **Go to Console tab**
3. **Look for logs** like:
   ```
   Ollama API request { model: 'llama3.1:8b', ... }
   ```

---

## Method 5: Quick Command Reference

### One-liner to get model name:

```bash
# Get just the model name(s)
curl -s http://localhost:11434/api/tags | grep -o '"name":"[^"]*"' | cut -d'"' -f4

# Output: llama3.1:8b
```

### Check if a specific model is available:

```bash
# Check if llama3.1:8b is installed
curl -s http://localhost:11434/api/tags | grep -q "llama3.1:8b" && echo "Model found" || echo "Model not found"
```

---

## Understanding Model Names

### Model Name Format

Ollama model names can have different formats:

- **With tag:** `llama3.1:8b` (specific version/variant)
- **Without tag:** `llama3.1` (default/latest variant)
- **Full name:** `llama3.1:8b` (8 billion parameters, Q4_K_M quantization)

### Your Current Setup

Based on your system:
- **Installed Model:** `llama3.1:8b`
- **Model Size:** ~4.7 GB
- **Parameters:** 8.0B
- **Quantization:** Q4_K_M
- **Status:** ✅ Running

---

## Troubleshooting

### Issue: API returns empty models list

**Solution:**
```bash
# Check if Ollama is running
curl http://localhost:11434/api/version

# If not running, start it (Tlink should auto-start it)
```

### Issue: Model name mismatch

**Problem:** Tlink settings show `llama3.1` but installed model is `llama3.1:8b`

**Solution:**
1. Go to Tlink AI Assistant settings
2. Update the Model field to match exactly: `llama3.1:8b`
3. Save settings

### Issue: Model not found

**Problem:** API shows model exists, but Tlink can't use it

**Solution:**
1. Verify the exact model name (including tag)
2. Update Tlink settings to match exactly
3. Restart Tlink if needed

---

## Quick Reference Commands

```bash
# 1. List all installed models
curl http://localhost:11434/api/tags

# 2. Get just model names
curl -s http://localhost:11434/api/tags | grep -o '"name":"[^"]*"' | cut -d'"' -f4

# 3. Check Ollama version
curl http://localhost:11434/api/version

# 4. Check running processes
ps aux | grep ollama | grep -v grep

# 5. Test model with a simple request
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.1:8b",
  "prompt": "Hello",
  "stream": false
}'
```

---

## Summary

**Your Current Model:**
- **Name:** `llama3.1:8b`
- **Status:** ✅ Installed and Running
- **Location:** Configured in Tlink AI Assistant settings

**To Check:**
1. **Quick:** `curl http://localhost:11434/api/tags`
2. **Settings:** Tlink → Settings → AI Assistant → Provider Configuration → Ollama
3. **Running:** `ps aux | grep ollama`

---

## Related Guides

- [How to Update Ollama Model](./HOW_TO_UPDATE_OLLAMA_MODEL.md)
- [How Tlink Bundles Ollama](./HOW_TLINK_BUNDLES_OLLAMA.md)
- [Ollama Connection Explained](./OLLAMA_CONNECTION_EXPLAINED.md)
