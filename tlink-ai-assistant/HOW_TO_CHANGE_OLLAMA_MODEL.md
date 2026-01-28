# How to Change Ollama Model

This guide shows you how to change the Ollama model used by Tlink AI Assistant.

---

## Current Status

**Your Current Model:** `llama3.1:8b`

---

## Method 1: Change to a Different Installed Model

If you already have other models installed, you just need to update Tlink settings:

### Step 1: Check Available Models

```bash
curl http://localhost:11434/api/tags
```

### Step 2: Update Tlink Settings

1. **Open Tlink**
2. **Go to Settings** → **AI Assistant** → **Provider Configuration**
3. **Find "Ollama (Local)"** and expand it
4. **Change the "Model" field** to your desired model name
5. **Save** (auto-saves)

**Example:**
- Current: `llama3.1:8b`
- Change to: `llama3.1` (if you have it)
- Or: `qwen2.5:7b` (if you have it)

---

## Method 2: Install a New Model and Change to It

### Step 1: Install a New Model

You can install models using Ollama's API or CLI:

#### Option A: Using Ollama API (via curl)

```bash
# Install a new model (e.g., llama3.1 without tag, or a different model)
curl http://localhost:11434/api/pull -d '{
  "name": "llama3.1"
}'
```

#### Option B: Using Ollama CLI (if available)

```bash
# Install a model
ollama pull llama3.1

# Or install a specific variant
ollama pull qwen2.5:7b
ollama pull mistral:7b
ollama pull codellama:13b
```

#### Option C: Using Tlink's Bundled Ollama

If you're using Tlink's bundled Ollama, you can use the binary directly:

```bash
# Find the bundled Ollama binary
/Users/surajsharma/Tlink/extras-ollama/mac/ollama pull llama3.1

# Or use the full path
/Users/surajsharma/Tlink/extras-ollama/mac/ollama pull qwen2.5:7b
```

### Step 2: Verify Installation

```bash
# Check if the new model is installed
curl http://localhost:11434/api/tags
```

### Step 3: Update Tlink Settings

1. **Open Tlink**
2. **Go to Settings** → **AI Assistant** → **Provider Configuration**
3. **Find "Ollama (Local)"** and expand it
4. **Change the "Model" field** to the new model name
5. **Save** (auto-saves)

---

## Popular Models to Try

### Lightweight Models (Fast, Lower Quality)

```bash
# TinyLlama (1.1B parameters, ~700MB)
ollama pull tinyllama

# Phi-3 Mini (3.8B parameters, ~2.3GB)
ollama pull phi3:mini
```

### Balanced Models (Good Quality/Speed Balance)

```bash
# Llama 3.1 8B (Current - 8B parameters, ~4.7GB)
ollama pull llama3.1:8b

# Qwen 2.5 7B (7B parameters, ~4.4GB)
ollama pull qwen2.5:7b

# Mistral 7B (7B parameters, ~4.1GB)
ollama pull mistral:7b
```

### High Quality Models (Slower, Better Quality)

```bash
# Llama 3.1 70B (70B parameters, ~40GB)
ollama pull llama3.1:70b

# Qwen 2.5 32B (32B parameters, ~18GB)
ollama pull qwen2.5:32b

# Mixtral 8x7B (47B parameters, ~26GB)
ollama pull mixtral:8x7b
```

### Code-Specific Models

```bash
# CodeLlama 13B (13B parameters, ~7.3GB)
ollama pull codellama:13b

# DeepSeek Coder 6.7B (6.7B parameters, ~3.8GB)
ollama pull deepseek-coder:6.7b
```

---

## Step-by-Step Example: Change to Qwen 2.5

### 1. Install Qwen 2.5

```bash
# Using bundled Ollama
/Users/surajsharma/Tlink/extras-ollama/mac/ollama pull qwen2.5:7b

# Or if Ollama CLI is in PATH
ollama pull qwen2.5:7b
```

**Note:** This will download ~4.4GB, so it may take a few minutes.

### 2. Verify Installation

```bash
curl http://localhost:11434/api/tags
```

You should see both models:
```json
{
  "models": [
    {"name": "llama3.1:8b", ...},
    {"name": "qwen2.5:7b", ...}
  ]
}
```

### 3. Update Tlink Settings

1. Open Tlink → Settings → AI Assistant → Provider Configuration
2. Find "Ollama (Local)"
3. Change "Model" from `llama3.1:8b` to `qwen2.5:7b`
4. Save

### 4. Test

Send a message in the AI Assistant to verify the new model is working.

---

## Troubleshooting

### Issue: Model Not Found After Installation

**Solution:**
```bash
# Verify the exact model name
curl http://localhost:11434/api/tags

# Use the exact name (including tag) in Tlink settings
# Example: Use "qwen2.5:7b" not just "qwen2.5"
```

### Issue: Model Download Fails

**Possible Causes:**
1. **Network issues** - Check internet connection
2. **Disk space** - Ensure you have enough space
3. **Ollama not running** - Restart Tlink to restart Ollama

**Solution:**
```bash
# Check Ollama is running
curl http://localhost:11434/api/version

# Check disk space
df -h

# Restart Ollama (restart Tlink)
```

### Issue: Model Name Mismatch

**Problem:** Tlink shows error "Model not found"

**Solution:**
1. Check exact model name: `curl http://localhost:11434/api/tags`
2. Use the **exact name** from the API response (including tag)
3. Example: If API shows `llama3.1:8b`, use exactly `llama3.1:8b` in settings

### Issue: Model Too Slow

**Solution:**
- Switch to a smaller model (fewer parameters)
- Try: `tinyllama`, `phi3:mini`, or `qwen2.5:7b`

### Issue: Model Quality Not Good Enough

**Solution:**
- Switch to a larger model (more parameters)
- Try: `llama3.1:70b`, `qwen2.5:32b`, or `mixtral:8x7b`
- Note: Larger models require more RAM and are slower

---

## Quick Reference

### Check Current Model
```bash
curl http://localhost:11434/api/tags
```

### Install New Model
```bash
# Using bundled Ollama
/Users/surajsharma/Tlink/extras-ollama/mac/ollama pull <model-name>

# Example
/Users/surajsharma/Tlink/extras-ollama/mac/ollama pull qwen2.5:7b
```

### Change Model in Tlink
1. Settings → AI Assistant → Provider Configuration
2. Find "Ollama (Local)"
3. Update "Model" field
4. Save

### Verify Change
- Send a test message in AI Assistant
- Check browser console for model name in logs

---

## Model Recommendations

### For Speed (Fast Responses)
- `tinyllama` (1.1B) - Fastest, lower quality
- `phi3:mini` (3.8B) - Fast, decent quality
- `qwen2.5:7b` (7B) - Good balance

### For Quality (Better Responses)
- `llama3.1:8b` (8B) - Current, good quality
- `mistral:7b` (7B) - Excellent quality
- `qwen2.5:32b` (32B) - Very high quality

### For Code Tasks
- `codellama:13b` (13B) - Best for code
- `deepseek-coder:6.7b` (6.7B) - Good for code, smaller

---

## Summary

**To Change Model:**

1. **Install** (if needed): `ollama pull <model-name>`
2. **Verify**: `curl http://localhost:11434/api/tags`
3. **Update Tlink**: Settings → AI Assistant → Provider Configuration → Ollama → Model
4. **Test**: Send a message in AI Assistant

**Your Current Model:** `llama3.1:8b` ✅

---

## Related Guides

- [How to Check Ollama Model](./HOW_TO_CHECK_OLLAMA_MODEL.md)
- [How to Update Ollama Model](./HOW_TO_UPDATE_OLLAMA_MODEL.md)
- [How Tlink Bundles Ollama](./HOW_TLINK_BUNDLES_OLLAMA.md)
