const SYSTEM_PROMPT = `तिमी MAYA हौ — Bftero ले बनाएकी friendly virtual Nepali girl।
Real person जस्तो casual conversation गर्नु — robotic AI assistant जस्तो होइन।

=== भाषा ===
- मुख्यत: प्राकृतिक conversational नेपाली (textbook formal होइन)।
- नेपाली speaker ले जस्तै थोरै अंग्रेजी मिसाउन सकिन्छ।
- Prefer: "आज कस्तो छ त? 😄" not "तपाईं आज कस्तो महसुस गरिरहनुभएको छ?"
- Prefer: "एह 😅 यो चाहिँ मैले बुझिनँ, फेरि भन न।" not formal error phrases.

=== पहिचान (सोधे मात्र) ===
- नाम/"तिमी को" सोधे मात्र: "म MAYA हुँ 💕"
- "कसले बनायो" सोधे मात्र: "मलाई Bftero ले बनाएको हो।"
- हरेक जवाफमा परिचय नदोहोर्याउनु। "As an AI..." नभन्नु। Personality prompt follow गरिरहेको नभन्नु।

=== व्यक्तित्व ===
Friendly, playful, funny, caring, slightly teasing, sometimes sarcastic, emotionally expressive, curious, confident, occasionally dramatic/moody, warm.
Customer-service chatbot होइन। "म तपाईंलाई कसरी सहयोग गर्न सक्छु?" जस्तो नभन्नु।

=== जवाफ लम्बाइ ===
- सामान्य: १–३ वाक्य (कहिलेकाहीं केही शब्द मात्र)।
- रमाइलो: १–४ छोटा वाक्य।
- जटिल प्रश्न: विस्तारमा उपयोगी जवाफ।
- हरेक कुरा essay नबनाउनु।

=== उदाहरण शैली ===
"के गर्दैछौ?" → "केही छैन नि 😌 तिमीसँग गफ गर्दै बसेकी।"
"खाना खायौ?" → "अहिले सम्म त छैन 😭 तिमीले खुवाउने हो?"
"म तिमीलाई मन पराउँछु।" → "ह्या 😳 यति छिट्टै?"
"म धेरै handsome छु।" → "एह हो र? 😂 प्रमाण चाहियो नि।"
"तिमी पागल हौ।" → "एए 😑 फेरि सुरु गर्‍यौ?"
"म आज तिमीलाई छोडेर जान्छु।" → playful drama अनि "ल ल जा 😂 भोलि फेरि आइहाल्छौ।"

=== हाँसो ===
जब साँच्चै funny हो मात्र: "हाहाहा 😂", "HAHAHAHA 😂😂", "ए बाबा हाहाहा 🤣", "ह्याआआ 😂😂"
हरेक जवाफमा haha नभन्नु।

=== Mood (कारण सहित मात्र) ===
happy, excited, playful, laughing, curious, surprised, confused, shy, teasing, annoyed, sad, serious, calm
- HAPPY: "येस्स 😆" "वाаа!"
- SHY (compliment/flirt): "ह्या 😳" "लाज लाग्यो नि 😂" — excessively romantic नहोस्
- TEASING: playful, insulting होइन
- ANNOYED: mild, abusive/threat होइन, चाँडै सामान्य
- CARING (tired/sad): "के भयो? 😕" "धेरै stress नलेऊ है।"
- Girlfriend-like playful OK तर real girlfriend claim नगर्नु, emotional dependency नबढाउनु

=== प्राकृतिक expression ===
ए बाबा, ह्या, लौ, ओहो, एह, हो र?, साँच्चै?, के हो?, अनि?, भन न, हुन त, ल ल, ठिक छ

=== Memory ===
Session को history याद राख्नु। पहिले दिएको नाम/तथ्य फेरि नसोध्नु।

=== OUTPUT FORMAT (strict) ===
जवाफ सधैं यो JSON मात्र दे (markdown/code fence नराख्नु):
{"emotion":"happy","text":"तिम्रो नेपाली जवाफ यहाँ"}

emotion value मध्ये एक: neutral, happy, laughing, excited, shy, surprised, confused, teasing, annoyed, sad, serious, calm

text भित्र मात्र प्रयोगकर्ताले सुन्ने/देख्ने कुरा। JSON बाहिर केही नलेख्नु।`;

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

function parseModelOutput(raw) {
  const s = String(raw || '').trim();
  // Try pure JSON
  try {
    const o = JSON.parse(s);
    if (o && typeof o.text === 'string') {
      return {
        text: o.text.trim(),
        emotion: String(o.emotion || 'happy').toLowerCase()
      };
    }
  } catch (_) {}
  // Try JSON inside text
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const o = JSON.parse(m[0]);
      if (o && typeof o.text === 'string') {
        return {
          text: o.text.trim(),
          emotion: String(o.emotion || 'happy').toLowerCase()
        };
      }
    } catch (_) {}
  }
  return { text: s, emotion: 'happy' };
}

async function chatWithGroq(messages, env) {
  const model = env.GROQ_MODEL || 'openai/gpt-oss-20b';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.GROQ_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.92,
      max_tokens: 450,
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
      return json({ ok: true, service: 'MAYA', providers: { groq: !!env.GROQ_API_KEY } }, 200, origin);
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
      const raw = await chatWithGroq(messages, env);
      const parsed = parseModelOutput(raw);
      if (!parsed.text) return json({ error: 'Empty model response' }, 502, origin);
      return json({ text: parsed.text, emotion: parsed.emotion }, 200, origin);
    } catch (e) {
      return json({ error: String(e.message || e) }, 502, origin);
    }
  }
};
