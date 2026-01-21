# Deploying Tlink AI Proxy Server

## Option 1: Railway (Recommended - Easiest)

1. **Sign up:** https://railway.app
2. **Create new project:**
   ```bash
   railway login
   railway init
   ```
3. **Add environment variables:**
   - Go to project settings → Variables
   - Add all variables from `.env.example`
4. **Deploy:**
   ```bash
   railway up
   ```
5. **Get URL:** Railway provides a URL like `https://your-app.railway.app`

**Cost:** Free tier available, then ~$5/month

---

## Option 2: Render

1. **Sign up:** https://render.com
2. **Create new Web Service:**
   - Connect your GitHub repo
   - Build command: `npm install`
   - Start command: `npm start`
3. **Add environment variables** in dashboard
4. **Deploy:** Automatic on git push

**Cost:** Free tier available, then ~$7/month

---

## Option 3: Heroku

1. **Install Heroku CLI:**
   ```bash
   brew install heroku/brew/heroku
   ```
2. **Create app:**
   ```bash
   heroku create tlink-ai-proxy
   ```
3. **Set environment variables:**
   ```bash
   heroku config:set GROQ_API_KEY=your_key
   heroku config:set OPENAI_API_KEY=your_key
   # ... etc
   ```
4. **Deploy:**
   ```bash
   git push heroku main
   ```

**Cost:** Free tier discontinued, ~$7/month

---

## Option 4: AWS EC2 / DigitalOcean

1. **Create VM instance** (Ubuntu 22.04)
2. **SSH into server:**
   ```bash
   ssh user@your-server-ip
   ```
3. **Install Node.js:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
4. **Clone and setup:**
   ```bash
   git clone your-repo-url
   cd proxy-server
   npm install
   cp .env.example .env
   nano .env  # Edit with your keys
   ```
5. **Run with PM2:**
   ```bash
   npm install -g pm2
   pm2 start src/server.js --name tlink-proxy
   pm2 save
   pm2 startup  # Auto-start on reboot
   ```
6. **Setup Nginx reverse proxy** (optional):
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

**Cost:** ~$5-10/month (DigitalOcean), ~$10-20/month (AWS)

---

## Option 5: Docker (Any Platform)

1. **Build image:**
   ```bash
   docker build -t tlink-ai-proxy .
   ```

2. **Run container:**
   ```bash
   docker run -d \
     -p 3000:3000 \
     --env-file .env \
     --name tlink-proxy \
     tlink-ai-proxy
   ```

3. **Deploy to:**
   - Railway (supports Docker)
   - Render (supports Docker)
   - AWS ECS
   - Google Cloud Run
   - Azure Container Instances

---

## Environment Variables Setup

Create `.env` file with:

```bash
PORT=3000
NODE_ENV=production

# At least one API key required
GROQ_API_KEY=gsk_...
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
PROVIDER_STRATEGY=round-robin
ALLOWED_ORIGINS=*
```

---

## Testing Your Deployment

1. **Health check:**
   ```bash
   curl https://your-proxy-url.com/health
   ```

2. **Test chat endpoint:**
   ```bash
   curl -X POST https://your-proxy-url.com/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{
       "model": "llama-3.1-8b-instant",
       "messages": [{"role": "user", "content": "Hello"}],
       "stream": true
     }'
   ```

---

## Monitoring

### Add Logging (Optional)

Install `winston`:
```bash
npm install winston
```

Update `src/server.js`:
```javascript
import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

// Use logger instead of console.log
```

### Uptime Monitoring

- **UptimeRobot:** https://uptimerobot.com (free)
- **Pingdom:** https://pingdom.com
- Set up to ping `/health` endpoint every 5 minutes

---

## Cost Estimation

### Server Hosting:
- Railway/Render: $5-10/month
- AWS/DigitalOcean: $5-20/month

### API Usage (depends on traffic):
- Groq: Very cheap (~$0.10 per 1M tokens)
- OpenAI: ~$0.50-2.00 per 1M tokens
- Anthropic: ~$3-15 per 1M tokens

**Example:** 1000 users, 10 requests/day each = 10,000 requests/day
- Average: 500 tokens/request = 5M tokens/day
- Groq cost: ~$0.50/day = ~$15/month
- **Total: ~$20-35/month**

---

## Security Best Practices

1. **Use HTTPS:** Always use SSL/TLS (Railway/Render provide automatically)
2. **Rate Limiting:** Already implemented per IP
3. **API Key Rotation:** Rotate keys monthly
4. **Monitor Usage:** Set up alerts for unusual traffic
5. **Backup Config:** Keep `.env` backed up securely

---

## Scaling

If you get high traffic:

1. **Horizontal Scaling:**
   - Deploy multiple instances
   - Use load balancer (Railway/Render handle this)

2. **Caching:**
   - Cache common responses
   - Reduce API calls

3. **Queue System:**
   - Use Redis + Bull for request queuing
   - Prevents overload

4. **CDN:**
   - Use Cloudflare for static assets
   - Reduce server load
