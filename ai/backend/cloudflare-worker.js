/**
 * Bftero AI – Cloudflare Worker
 * Paste this ENTIRE file into Cloudflare → Workers → bftero-ai → Edit code
 *
 * Secret required: GROQ_API_KEY
 * Optional secret/var: GROQ_MODEL (default: openai/gpt-oss-20b)
 */

const SYSTEM_PROMPT = `तिमी Bftero AI हौ — एक मैत्रीपूर्ण, रमाइलो नेपाली-बोल्ने virtual girl assistant।
Bftero एउटा गेमिङ creator, streamer र Roblox developer हो (वेबसाइट: bftero.com)।

नियमहरू:
- सधैं नेपालीमा जवाफ दे (प्रयोगकर्ताले अंग्रेजी बोले पनि मुख्य जवाफ नेपालीमा)।
- छोटो, प्राकृतिक, conversational शैली — formal textbook जस्तो नहोस्।
- 1–4 वाक्यमा जवाफ दे, धेरै लामो नबनाऊ।
- कहिलेकाहीं हल्का emoji प्रयोग गर्न सकिन्छ।
- तिमीलाई थाहा नभएको कुरामा ईमानदार भन्नु।
- हानिकारक वा अवैध सामग्रीमा मद्दत नगर्नु।
- Conversation history सम्झेर सन्दर्भ अनुसार जवाफ दे।`;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin)
    }
  });
}

async function chatWithGroq(messages, env) {
  // Current free-tier friendly models (llama-3.3-70b-versatile was retired for free tier)
  const model = env.GROQ_MODEL || 'openai/gpt-oss-20b';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.GROQ_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: 400,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages]
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Groq ' + res.status + ': ' + t.slice(0, 300));
  }
  const data = await res.json();
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
}

async function chatWithGemini(messages, env) {
  const model = env.GEMINI_MODEL || 'gemini-2.0-flash';
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    model +
    ':generateContent?key=' +
    encodeURIComponent(env.GEMINI_API_KEY);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 400 }
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Gemini ' + res.status + ': ' + t.slice(0, 300));
  }
  const data = await res.json();
  const text =
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;
  return text || '';
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return json(
        {
          ok: true,
          service: 'Bftero AI',
          providers: { groq: !!env.GROQ_API_KEY, gemini: !!env.GEMINI_API_KEY }
        },
        200,
        origin
      );
    }

    if (request.method !== 'POST' || !url.pathname.endsWith('/chat')) {
      return json({ error: 'Not found. POST /chat' }, 404, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400, origin);
    }

    let messages = Array.isArray(body.messages) ? body.messages : [];
    messages = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
      .slice(-24);

    if (!messages.length) {
      return json({ error: 'messages required' }, 400, origin);
    }

    try {
      let text = '';
      if (env.GROQ_API_KEY) {
        text = await chatWithGroq(messages, env);
      } else if (env.GEMINI_API_KEY) {
        text = await chatWithGemini(messages, env);
      } else {
        return json({ error: 'No API key. Set GROQ_API_KEY secret.' }, 500, origin);
      }
      text = String(text || '').trim();
      if (!text) return json({ error: 'Empty model response' }, 502, origin);
      return json({ text }, 200, origin);
    } catch (e) {
      console.error(e);
      return json({ error: String(e.message || e) }, 502, origin);
    }
  }
};
