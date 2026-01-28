# How to Install and Manage Multiple Ollama Models

Yes! **You can install multiple Ollama models** and switch between them easily. This guide shows you how.

---

## ✅ Yes, Multiple Models Are Supported

Ollama allows you to:
- ✅ Install multiple models simultaneously
- ✅ Keep all models on your system
- ✅ Switch between models in Tlink settings
- ✅ Use different models for different tasks

**Storage:** Each model is stored separately, so you can have as many as your disk space allows.

---

## Current Status

**Your Current Setup:**
- **Installed Models:** 1 (`llama3.1:8b`)
- **Total Size:** ~4.7 GB

---

## How to Install Multiple Models

### Step 1: Install Additional Models

You can install multiple models using the same `ollama pull` command:

```bash
# Using Tlink's bundled Ollama
/Users/surajsharma/Tlink/extras-ollama/mac/ollama pull qwen2.5:7b
/Users/surajsharma/Tlink/extras-ollama/mac/ollama pull mistral:7b
/Users/surajsharma/Tlink/extras-ollama/mac/ollama pull codellama:13b
/Users/surajsharma/Tlink/extras-ollama/mac/ollama pull tinyllama
```

**Or if Ollama CLI is in PATH:**
```bash
ollama pull qwen2.5:7b
ollama pull mistral:7b
ollama pull codellama:13b
ollama pull tinyllama
```

### Step 2: Verify All Models Are Installed

```bash
# List all installed models
curl http://localhost:11434/api/tags

# Pretty print
curl -s http://localhost:11434/api/tags | python3 -m json.tool
```

**Example Output:**
```json
{
  "models": [
    {
      "name": "llama3.1:8b",
      "size": 4920753328,
      "details": {"parameter_size": "8.0B"}
    },
    {
      "name": "qwen2.5:7b",
      "size": 4400000000,
      "details": {"parameter_size": "7.0B"}
    },
    {
      "name": "mistral:7b",
      "size": 4100000000,
      "details": {"parameter_size": "7.0B"}
    }
  ]
}
```

### Step 3: Switch Between Models in Tlink

1. **Open Tlink** → **Settings** → **AI Assistant** → **Provider Configuration**
2. **Find "Ollama (Local)"** and expand it
3. **Change the "Model" field** to any installed model:
   - `llama3.1:8b`
   - `qwen2.5:7b`
   - `mistral:7b`
   - `codellama:13b`
   - Any other installed model
4. **Save** (auto-saves)

**That's it!** The change takes effect immediately.

---

## Managing Multiple Models

### List All Installed Models

```bash
# Quick list
curl -s http://localhost:11434/api/tags | grep -o '"name":"[^"]*"' | cut -d'"' -f4

# Detailed list with sizes
curl -s http://localhost:11434/api/tags | python3 -c "
import sys, json
data = json.load(sys.stdin)
for m in data.get('models', []):
    size_gb = m.get('size', 0) / (1024**3)
    params = m.get('details', {}).get('parameter_size', 'unknown')
    print(f\"{m['name']:20} {params:>8} {size_gb:>6.1f} GB\")
"
```

### Check Model Sizes

```bash
# Total size of all models
curl -s http://localhost:11434/api/tags | python3 -c "
import sys, json
data = json.load(sys.stdin)
total = sum(m.get('size', 0) for m in data.get('models', []))
print(f'Total size: {total / (1024**3):.1f} GB')
"
```

### Remove a Model (Free Up Space)

```bash
# Delete a model you no longer need
/Users/surajsharma/Tlink/extras-ollama/mac/ollama rm llama3.1:8b

# Or if Ollama CLI is in PATH
ollama rm llama3.1:8b
```

**Note:** This permanently deletes the model. You'll need to re-download it if you want it again.

---

## Recommended Model Combinations

### Option 1: Speed + Quality (Recommended)

Install one fast model and one quality model:

```bash
# Fast model for quick responses
ollama pull tinyllama          # ~700MB, very fast

# Quality model for better responses
ollama pull llama3.1:8b       # ~4.7GB, good quality (you have this)
```

**Use Cases:**
- `tinyllama` - Quick questions, simple tasks
- `llama3.1:8b` - Complex questions, better quality

### Option 2: General Purpose + Code

Install one general model and one code model:

```bash
# General purpose
ollama pull llama3.1:8b        # ~4.7GB (you have this)

# Code-specific
ollama pull codellama:13b       # ~7.3GB, excellent for code
```

**Use Cases:**
- `llama3.1:8b` - General chat, questions
- `codellama:13b` - Code generation, debugging

### Option 3: Multiple Quality Levels

Install models of different sizes:

```bash
# Small (fast)
ollama pull phi3:mini          # ~2.3GB

# Medium (balanced)
ollama pull qwen2.5:7b         # ~4.4GB

# Large (high quality)
ollama pull llama3.1:70b       # ~40GB (if you have space)
```

**Use Cases:**
- `phi3:mini` - Quick responses
- `qwen2.5:7b` - Daily use
- `llama3.1:70b` - Important/complex tasks

---

## Storage Considerations

### Model Sizes Reference

| Model | Size | Parameters | Use Case |
|-------|------|------------|----------|
| `tinyllama` | ~700MB | 1.1B | Fast, simple tasks |
| `phi3:mini` | ~2.3GB | 3.8B | Fast, decent quality |
| `qwen2.5:7b` | ~4.4GB | 7B | Balanced |
| `mistral:7b` | ~4.1GB | 7B | Balanced |
| `llama3.1:8b` | ~4.7GB | 8B | Good quality (current) |
| `codellama:13b` | ~7.3GB | 13B | Code tasks |
| `llama3.1:70b` | ~40GB | 70B | High quality |
| `qwen2.5:32b` | ~18GB | 32B | Very high quality |

### Disk Space Planning

**Example:** If you install 3 models:
- `llama3.1:8b` (4.7GB) - Current
- `qwen2.5:7b` (4.4GB) - Add
- `codellama:13b` (7.3GB) - Add
- **Total:** ~16.4 GB

**Recommendation:** Keep 2-3 models that serve different purposes.

---

## Switching Models in Tlink

### Quick Switch

1. **Settings** → **AI Assistant** → **Provider Configuration**
2. **Ollama (Local)** → **Model** field
3. **Type or select** the model name
4. **Save** (auto-saves)

### Model Name Format

Use the **exact name** from the API:
- ✅ `llama3.1:8b` (with tag)
- ✅ `qwen2.5:7b` (with tag)
- ❌ `llama3.1` (without tag, might not work if you have tagged version)

---

## Best Practices

### 1. Start with 2-3 Models

Don't install too many at once. Start with:
- One fast model (for quick tasks)
- One quality model (for important tasks)
- One specialized model (if needed, e.g., code)

### 2. Use Descriptive Names

The model name includes the tag (e.g., `:8b`), which helps identify variants.

### 3. Monitor Disk Space

```bash
# Check available disk space
df -h

# Check total model size
curl -s http://localhost:11434/api/tags | python3 -c "
import sys, json
data = json.load(sys.stdin)
total = sum(m.get('size', 0) for m in data.get('models', []))
print(f'Total models size: {total / (1024**3):.1f} GB')
"
```

### 4. Remove Unused Models

If you're not using a model, remove it to free space:
```bash
ollama rm <model-name>
```

---

## Example Workflow

### Scenario: You want both fast and quality models

**Step 1: Install a fast model**
```bash
/Users/surajsharma/Tlink/extras-ollama/mac/ollama pull tinyllama
```

**Step 2: Verify both models**
```bash
curl http://localhost:11434/api/tags
# Should show: llama3.1:8b and tinyllama
```

**Step 3: Switch in Tlink**
- For quick tasks: Set Model to `tinyllama`
- For quality: Set Model to `llama3.1:8b`

**Step 4: Use as needed**
- Switch models based on your needs
- No need to reinstall - just change the setting!

---

## Troubleshooting

### Issue: Model Not Showing in Tlink

**Problem:** Installed model doesn't appear in Tlink settings

**Solution:**
1. Verify exact model name: `curl http://localhost:11434/api/tags`
2. Use the **exact name** (including tag) in Tlink settings
3. Restart Tlink if needed

### Issue: Running Out of Disk Space

**Solution:**
```bash
# List all models with sizes
curl -s http://localhost:11434/api/tags | python3 -c "
import sys, json
data = json.load(sys.stdin)
for m in data.get('models', []):
    size_gb = m.get('size', 0) / (1024**3)
    print(f\"{m['name']:25} {size_gb:>6.1f} GB\")
"

# Remove unused models
ollama rm <model-name>
```

### Issue: Model Download Fails

**Possible Causes:**
- Network issues
- Insufficient disk space
- Ollama not running

**Solution:**
```bash
# Check Ollama is running
curl http://localhost:11434/api/version

# Check disk space
df -h

# Retry download
ollama pull <model-name>
```

---

## Quick Reference

### Install Multiple Models
```bash
/Users/surajsharma/Tlink/extras-ollama/mac/ollama pull model1
/Users/surajsharma/Tlink/extras-ollama/mac/ollama pull model2
/Users/surajsharma/Tlink/extras-ollama/mac/ollama pull model3
```

### List All Models
```bash
curl http://localhost:11434/api/tags
```

### Switch Model in Tlink
1. Settings → AI Assistant → Provider Configuration
2. Ollama (Local) → Model field
3. Change to desired model name
4. Save

### Remove a Model
```bash
ollama rm <model-name>
```

---

## Summary

✅ **Yes, you can install multiple Ollama models!**

**Benefits:**
- Switch between models based on needs
- Use fast models for quick tasks
- Use quality models for important tasks
- Keep specialized models (e.g., code) for specific use cases

**Current Setup:**
- **Installed:** 1 model (`llama3.1:8b`)
- **Can add:** As many as your disk space allows

**Recommended:** Start with 2-3 models that serve different purposes.

---

## Related Guides

- [How to Change Ollama Model](./HOW_TO_CHANGE_OLLAMA_MODEL.md)
- [How to Check Ollama Model](./HOW_TO_CHECK_OLLAMA_MODEL.md)
- [How to Update Ollama Model](./HOW_TO_UPDATE_OLLAMA_MODEL.md)
