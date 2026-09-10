# Bftero AI – Real LLM Backend

This makes Bftero AI work like ChatGPT: full conversation history + powerful model answers in Nepali.

**API keys never go in your website JavaScript.** They stay as secrets on Cloudflare.

## 1. Get a free API key (pick one)

### Option A – Groq (recommended: fast + free)
1. Go to https://console.groq.com
2. Create account → API Keys → Create key
3. Copy the key

### Option B – Google Gemini (good Nepali)
1. Go to https://aistudio.google.com/apikey
2. Create API key
3. Copy the key

## 2. Deploy Cloudflare Worker

```bash
# Install wrangler once
npm install -g wrangler

# Login
npx wrangler login

# Go to this backend folder
cd ai/backend

# Put your secret (pick ONE)
npx wrangler secret put GROQ_API_KEY
# paste key, Enter

# OR for Gemini:
# npx wrangler secret put GEMINI_API_KEY

# Deploy
npx wrangler deploy
```

After deploy you get a URL like:
`https://bftero-ai.YOUR_NAME.workers.dev`

Test in browser:
`https://bftero-ai.YOUR_NAME.workers.dev/health`

## 3. Connect the website

Edit `ai/config/ai-config.js` on your site:

```js
apiEndpoint: 'https://bftero-ai.YOUR_NAME.workers.dev',
```

Upload that file to GitHub / your host.

## 4. Done

Open https://www.bftero.com/ai.html  
Talk — she now uses the real LLM and remembers the chat until you press Clear Chat.

## Security
- Never put GROQ_API_KEY or GEMINI_API_KEY in HTML/JS on bftero.com
- Only in Cloudflare Worker secrets
- Worker only accepts POST /chat and returns text

## Optional: custom domain
In Cloudflare dashboard → Workers → bftero-ai → Triggers → Add custom domain  
e.g. `ai-api.bftero.com`
