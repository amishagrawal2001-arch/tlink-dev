# How AI Assistant Uses Bundled Ollama

## Answer: Yes, but indirectly!

The AI Assistant **does use the same Ollama binary** stored in `extras-ollama/mac/ollama`, but it connects to it **via HTTP API**, not directly.

---

## How It Works

### 1. Tlink Starts Bundled Ollama (Automatic)

When Tlink starts, it automatically launches the bundled Ollama:

**Location:** `app/lib/index.ts` (line 128)
```typescript
app.on('ready', async () => {
    ensureBundledOllama()  // ← Starts bundled Ollama automatically
    // ... rest of initialization
})
```

**What happens:**
- `ensureBundledOllama()` finds the binary at `extras-ollama/mac/ollama`
- Checks if Ollama is already running on `127.0.0.1:11434`
- If not running, starts it: `spawn(binary, ['serve'])`
- Ollama server runs on `http://127.0.0.1:11434` (or `localhost:11434`)

### 2. AI Assistant Connects via HTTP API

The AI Assistant plugin connects to Ollama **via HTTP requests**, not by calling the binary directly:

**Location:** `tlink-ai-assistant/src/services/providers/ollama-provider.service.ts`

```typescript
// AI Assistant makes HTTP requests to Ollama API
const url = `${cleanBaseURL}/api/chat`;  // e.g., http://localhost:11434/api/chat
const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
});
```

**Default Configuration:**
- **Base URL:** `http://localhost:11434` (native API)
- **Alternative:** `http://localhost:11434/v1` (OpenAI-compatible API)

---

## Current Status

Based on your system:

### ✅ Bundled Ollama is Running

```bash
# Process 1: Main Ollama server
/Users/surajsharma/Tlink/extras-ollama/mac/ollama serve

# Process 2: Model runner (when processing requests)
/Users/surajsharma/Tlink/extras-ollama/mac/ollama runner --model ...
```

### ✅ AI Assistant Configuration

- **Provider:** Ollama (Local)
- **Base URL:** `http://localhost:11434`
- **Model:** `llama3.1:8b`
- **Connection:** HTTP API to bundled Ollama server

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Tlink Application                     │
│                                                          │
│  ┌──────────────────┐         ┌──────────────────────┐ │
│  │  app/lib/ollama  │         │  AI Assistant Plugin │ │
│  │                  │         │                      │ │
│  │ ensureBundled    │         │  OllamaProvider      │ │
│  │ Ollama()         │         │  Service             │ │
│  │                  │         │                      │ │
│  │  ↓ spawns        │         │  ↓ HTTP requests     │ │
│  └────────┬─────────┘         └──────────┬───────────┘ │
│           │                               │              │
│           │                               │              │
└───────────┼───────────────────────────────┼──────────────┘
            │                               │
            │                               │
            ▼                               ▼
    ┌───────────────┐              ┌───────────────┐
    │  Ollama       │              │  Ollama       │
    │  Binary       │              │  HTTP API    │
    │               │              │              │
    │ extras-ollama│◄──────────────┤ localhost:   │
    │ /mac/ollama  │   HTTP        │ 11434        │
    └───────────────┘              └───────────────┘
```

---

## Key Points

### 1. **Same Binary, Different Access Methods**

- **Tlink Core** (`app/lib/ollama.ts`): 
  - Directly executes the binary: `spawn(binary, ['serve'])`
  - Manages the Ollama process lifecycle

- **AI Assistant Plugin** (`ollama-provider.service.ts`):
  - Connects via HTTP: `fetch('http://localhost:11434/api/chat')`
  - No direct binary access

### 2. **Process Lifecycle**

```
1. Tlink starts
   ↓
2. ensureBundledOllama() called
   ↓
3. Finds binary: extras-ollama/mac/ollama
   ↓
4. Checks if Ollama already running (probes http://127.0.0.1:11434)
   ↓
5. If not running, spawns: ollama serve
   ↓
6. Ollama server starts on localhost:11434
   ↓
7. AI Assistant connects via HTTP API
```

### 3. **Configuration Flow**

**AI Assistant Settings:**
- Base URL: `http://localhost:11434` (default)
- Model: `llama3.1:8b` (configured in settings)

**Tlink Core:**
- Binary: `extras-ollama/mac/ollama` (auto-detected)
- Host: `127.0.0.1:11434` (default, from `TLINK_OLLAMA_HOST`)
- Models: `~/Library/Application Support/Tlink/ollama/` (user data)

---

## Verification

### Check if Bundled Ollama is Running

```bash
# Check processes
ps aux | grep ollama | grep -v grep

# Should show:
# /Users/surajsharma/Tlink/extras-ollama/mac/ollama serve
# /Users/surajsharma/Tlink/extras-ollama/mac/ollama runner ...
```

### Check AI Assistant Connection

```bash
# Test the API endpoint the AI Assistant uses
curl http://localhost:11434/api/tags

# Should return your models (e.g., llama3.1:8b)
```

### Check Binary Location

```bash
# Verify the binary exists
ls -lh /Users/surajsharma/Tlink/extras-ollama/mac/ollama

# Check version (if binary supports --version)
/Users/surajsharma/Tlink/extras-ollama/mac/ollama --version
```

---

## Important Notes

### 1. **Single Instance**

- Only **one Ollama server** runs on `localhost:11434`
- If you have a system Ollama running, Tlink's bundled Ollama won't start (it detects existing instance)
- The AI Assistant connects to **whichever Ollama is running** on that port

### 2. **Model Storage**

- Models are stored in: `~/Library/Application Support/Tlink/ollama/`
- Models persist across Ollama updates
- Both bundled and system Ollama can use the same models directory (if configured)

### 3. **Port Conflict**

If port `11434` is already in use:
- Tlink's bundled Ollama won't start
- AI Assistant will connect to the existing Ollama instance
- This could be a system Ollama or another bundled instance

### 4. **Updating Bundled Ollama**

When you update `extras-ollama/mac/ollama`:
- **Restart Tlink** to use the new binary
- The AI Assistant will automatically use the new version (same HTTP API)
- No changes needed in AI Assistant configuration

---

## Summary

✅ **Yes, the AI Assistant uses the same Ollama binary** (`extras-ollama/mac/ollama`)

**How:**
1. Tlink automatically starts the bundled Ollama as a server
2. AI Assistant connects to it via HTTP API (`http://localhost:11434`)
3. Both use the same binary, but access it differently:
   - **Tlink Core**: Direct execution (`spawn`)
   - **AI Assistant**: HTTP API (`fetch`)

**Current Status:**
- ✅ Bundled Ollama: Running from `extras-ollama/mac/ollama`
- ✅ AI Assistant: Connected via `http://localhost:11434`
- ✅ Version: 0.13.5
- ✅ Model: `llama3.1:8b`

---

## Related Files

- `app/lib/ollama.ts` - Tlink's Ollama management (starts bundled binary)
- `app/lib/index.ts` - Calls `ensureBundledOllama()` on app start
- `tlink-ai-assistant/src/services/providers/ollama-provider.service.ts` - AI Assistant's HTTP client
- `extras-ollama/mac/ollama` - The bundled Ollama binary
