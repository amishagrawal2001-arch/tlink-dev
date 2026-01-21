# Quick Start Guide

## 🚀 Get Your Proxy Server Running in 5 Minutes

### Step 1: Setup (2 minutes)

```bash
cd proxy-server
npm install
cp .env.example .env
```

### Step 2: Add API Keys (1 minute)

Edit `.env` and add at least one API key:

```bash
GROQ_API_KEY=gsk_your_actual_key_here
```

Get a free Groq API key: https://console.groq.com

### Step 3: Test Locally (1 minute)

```bash
npm start
```

You should see:
```
🚀 Tlink AI Proxy Server running on port 3000
```

### Step 4: Test It (1 minute)

Open another terminal:

```bash
curl http://localhost:3000/health
```

Should return: `{"status":"ok",...}`

### Step 5: Deploy (Optional)

**Easiest: Railway**
1. Sign up: https://railway.app
2. Click "New Project" → "Deploy from GitHub"
3. Connect your repo
4. Add environment variables (copy from `.env`)
5. Deploy!

You'll get a URL like: `https://your-app.railway.app`

---

## 📝 Next: Integrate with Tlink

See `INTEGRATION.md` for how to connect Tlink to your proxy server.

---

## 🆘 Troubleshooting

**Port already in use?**
```bash
# Change port in .env
PORT=3001
```

**No API keys?**
- Groq: https://console.groq.com (free, fast)
- OpenAI: https://platform.openai.com (paid)
- Anthropic: https://console.anthropic.com (paid)

**Can't connect from Tlink?**
- Check CORS settings in `.env`
- Set `ALLOWED_ORIGINS=*` for testing
- Make sure proxy URL is correct in Tlink config
