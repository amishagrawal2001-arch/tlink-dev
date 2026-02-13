# How to Update Ollama from Official Website

This guide explains how to update Ollama to the latest version from the official website.

## Official Ollama Website

**Website:** https://ollama.com  
**Download Page:** https://ollama.com/download  
**GitHub Releases:** https://github.com/ollama/ollama/releases

---

## Method 1: macOS - Official Installer (Recommended)

### Step-by-Step Instructions

1. **Visit the Official Website**
   - Go to: https://ollama.com/download
   - Or directly: https://ollama.com

2. **Download for macOS**
   - Click the **"Download for macOS"** button
   - The installer will download (usually `Ollama-darwin.zip` or `.dmg`)

3. **Install Ollama**
   - **If it's a `.dmg` file:**
     - Double-click the downloaded `.dmg` file
     - Drag `Ollama.app` to your `Applications` folder
   - **If it's a `.zip` file:**
     - Extract the zip file
     - Move `Ollama.app` to your `Applications` folder

4. **Stop Current Ollama Service**
   - If Ollama is running, you may need to stop it first:
     ```bash
     # Check if Ollama is running
     ps aux | grep ollama
     
     # Kill Ollama processes (if needed)
     pkill -f ollama
     ```

5. **Launch New Version**
   - Open `Ollama.app` from Applications
   - Or run from terminal:
     ```bash
     /Applications/Ollama.app/Contents/Resources/ollama serve
     ```

6. **Verify Update**
   ```bash
   curl http://localhost:11434/api/version
   # Should show the new version number
   ```

---

## Method 2: macOS - Homebrew (Alternative)

If you have Homebrew installed:

```bash
# Update Homebrew
brew update

# Upgrade Ollama
brew upgrade ollama

# Or install if not already installed
brew install ollama
```

---

## Method 3: Manual Binary Update

1. **Download Latest Binary**
   - Visit: https://github.com/ollama/ollama/releases
   - Download the latest `ollama-darwin` binary for your architecture (Apple Silicon or Intel)

2. **Replace Current Binary**
   ```bash
   # Backup current binary (if needed)
   cp /Users/surajsharma/Tlink/extras-ollama/mac/ollama /Users/surajsharma/Tlink/extras-ollama/mac/ollama.backup
   
   # Replace with new binary
   # (Download location depends on where you saved it)
   cp ~/Downloads/ollama-darwin /Users/surajsharma/Tlink/extras-ollama/mac/ollama
   
   # Make it executable
   chmod +x /Users/surajsharma/Tlink/extras-ollama/mac/ollama
   ```

3. **Restart Ollama**
   - Stop current Ollama service
   - Start it again with the new binary

---

## Check Current Version

Before updating, check your current version:

```bash
# Via API (if Ollama is running)
curl http://localhost:11434/api/version

# Output: {"version":"0.13.5"}
```

**Your Current Version:** 0.13.5

---

## Check Latest Version

To see what the latest version is:

1. **Visit GitHub Releases:**
   - https://github.com/ollama/ollama/releases
   - Look for the latest release tag (e.g., `v0.13.5`, `v0.14.0`, etc.)

2. **Or check via API (if you have access):**
   ```bash
   curl https://api.github.com/repos/ollama/ollama/releases/latest | grep tag_name
   ```

---

## Important Notes

### Your Current Setup

Based on your system:
- **Current Version:** 0.13.5
- **Ollama Location:** `/Users/surajsharma/Tlink/extras-ollama/mac/ollama`
- **This appears to be bundled with Tlink**

### Considerations

1. **Bundled Ollama:**
   - Your Ollama is located in Tlink's extras folder
   - This might be a bundled version that Tlink manages
   - Updating it manually might affect Tlink's integration

2. **System Ollama vs Bundled:**
   - If you install from the official website, it will install to `/Applications/Ollama.app`
   - This creates a system-wide installation
   - Tlink might continue using its bundled version

3. **Recommended Approach:**
   - **Option A:** Install official Ollama to `/Applications` and ensure Tlink uses it
   - **Option B:** Wait for Tlink to update its bundled Ollama version
   - **Option C:** Manually replace the bundled binary (more risky)

---

## After Updating

1. **Verify the Update:**
   ```bash
   curl http://localhost:11434/api/version
   ```

2. **Check Your Models:**
   ```bash
   curl http://localhost:11434/api/tags
   # Your models should still be there
   ```

3. **Test with Tlink:**
   - Open Tlink AI Assistant
   - Try sending a message
   - Verify it works with the updated Ollama

---

## Troubleshooting

### Issue: Ollama Won't Start After Update

**Solution:**
```bash
# Check if port 11434 is in use
lsof -i :11434

# Kill any old Ollama processes
pkill -f ollama

# Start Ollama again
/Applications/Ollama.app/Contents/Resources/ollama serve
```

### Issue: Models Not Found After Update

**Solution:**
- Models are stored in: `~/Library/Application Support/ollama/models`
- They should persist across updates
- If missing, re-pull them:
  ```bash
  ollama pull llama3.1:8b
  ```

### Issue: Tlink Still Using Old Version

**Solution:**
- Check Tlink's Ollama path configuration
- Update Tlink's Ollama base URL if needed
- Restart Tlink application

---

## Quick Update Commands

```bash
# 1. Check current version
curl http://localhost:11434/api/version

# 2. Stop Ollama (if running)
pkill -f ollama

# 3. Download latest (visit https://ollama.com/download)

# 4. Install new version

# 5. Start Ollama
/Applications/Ollama.app/Contents/Resources/ollama serve

# 6. Verify new version
curl http://localhost:11434/api/version
```

---

## Links

- **Official Website:** https://ollama.com
- **Download Page:** https://ollama.com/download
- **GitHub Releases:** https://github.com/ollama/ollama/releases
- **Documentation:** https://github.com/ollama/ollama/blob/main/docs/README.md

---

## Current Status

- **Your Version:** 0.13.5
- **Latest Version:** Check https://github.com/ollama/ollama/releases
- **Status:** Running ✅
- **Model:** llama3.1:8b (installed and working)
