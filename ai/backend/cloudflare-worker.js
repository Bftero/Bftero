const SYSTEM_PROMPT = `तिमी Bftero AI हौ — एक मैत्रीपूर्ण, रमाइलो नेपाली-बोल्ने virtual girl assistant।
Bftero एउटा गेमिङ creator, streamer र Roblox developer हो (वेबसाइट: bftero.com)।

नियमहरू:
- सधैं नेपालीमा जवाफ दे।
- छोटो, प्राकृतिक conversational शैली (1–4 वाक्य)।
- हल्का emoji प्रयोग गर्न सकिन्छ।
- Conversation history सम्झेर जवाफ दे।
- हानिकारक सामग्रीमा मद्दत नगर्नु।`;

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
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) }
  });
}

async function chatWithGroq(messages, env) {
  // Use a model that works on free tier (old llama-3.3-70b-versatile is retired)
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*';
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    const url = new URL(request.url);
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return json({ ok: true, service: 'Bftero AI', providers: { groq: !!env.GROQ_API_KEY } }, 200, origin);
    }
    if (request.method !== 'POST' || !url.pathname.endsWith('/chat')) {
      return json({ error: 'Not found. POST /chat' }, 404, origin);
    }
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400, origin); }
    let messages = Array.isArray(body.messages) ? body.messages : [];
    messages = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
      .slice(-24);
    if (!messages.length) return json({ error: 'messages required' }, 400, origin);
    if (!env.GROQ_API_KEY) return json({ error: 'GROQ_API_KEY secret missing' }, 500, origin);
    try {
      const text = String(await chatWithGroq(messages, env) || '').trim();
      if (!text) return json({ error: 'Empty model response' }, 502, origin);
      return json({ text }, 200, origin);
    } catch (e) {
      return json({ error: String(e.message || e) }, 502, origin);
    }
  }
};
