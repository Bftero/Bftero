/**
 * Bftero AI – engine
 * 1) Tries real LLM backend (apiEndpoint) with full chat history
 * 2) Falls back to local keyword replies if backend is offline / not set
 */
(function (global) {
  'use strict';

  const history = []; // { role: 'user'|'assistant', content: string }

  /* ---------- Local fallback (used when no API) ---------- */
  const localResponses = {
    greeting: [
      'नमस्ते! म Bftero AI हुँ। कस्तो छ आज? 😊',
      'हाइ! राम्रो छ? म तयार छु कुरा गर्न।',
      'नमस्कार! के सहयोग चाहियो?'
    ],
    howAreYou: [
      'म ठिक छु, धन्यवाद! तिमी कस्तो छौ?',
      'एकदम राम्रो! तिमीलाई कस्तो लागिरहेको छ?'
    ],
    aboutBftero: [
      'Bftero एउटा गेमिङ creator, streamer र Roblox developer हो।',
      'Bftero ले Roblox गेम, लाइभ स्ट्रिम र content बनाउँछ।'
    ],
    joke: [
      'एउटा जोक: कम्प्युटर किन चिसो हुन्छ? किनकि यसले Windows खुल्ला राख्छ! 😂'
    ],
    default: [
      'म सुनें। अहिले backend AI जोडिएको छैन — तर म तयार छु। अर्को कुरा सोध।',
      'ठीकै छ। जोक चाहियो? वा Bftero बारे सोध?'
    ]
  };

  function localIntent(text) {
    const t = (text || '').toLowerCase();
    if (/नमस्ते|नमस्कार|हाइ|hello|hi/.test(t)) return 'greeting';
    if (/कस्तो छ|how are you|ठीक/.test(t)) return 'howAreYou';
    if (/bftero|बफ्टेरो/.test(t)) return 'aboutBftero';
    if (/जोक|joke|funny/.test(t)) return 'joke';
    return 'default';
  }

  function localReply(text) {
    const intent = localIntent(text);
    const arr = localResponses[intent] || localResponses.default;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function emotionFromText(text) {
    const t = (text || '').toLowerCase();
    if (/😂|😄|जोक|हास्|रमाइलो|happy|great/.test(t)) return 'funny';
    if (/दुःख|sad|माफ|sorry/.test(t)) return 'sad';
    if (/!|अचम्म|wow|surprised/.test(t)) return 'surprised';
    if (/😊|नमस्ते|धन्यवाद|राम्रो/.test(t)) return 'happy';
    return 'neutral';
  }

  function pushHistory(role, content) {
    history.push({ role, content: String(content || '').trim() });
    const max = (window.BFTERO_AI_CONFIG && window.BFTERO_AI_CONFIG.maxHistory) || 16;
    // Keep last N messages (each turn is 1 message)
    while (history.length > max * 2) history.shift();
  }

  /**
   * Call remote LLM backend with full conversation history.
   * Backend must accept: { messages: [{role, content}, ...] }
   * and return: { text: string } or { reply: string } or OpenAI-style choices
   */
  async function callRemoteAPI(userText) {
    const endpoint = (window.BFTERO_AI_CONFIG && window.BFTERO_AI_CONFIG.apiEndpoint) || '';
    if (!endpoint) return null;

    const messages = history
      .filter((m) => m.content)
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }));

    // Ensure latest user message is included (pushHistory called before this)
    const res = await fetch(endpoint.replace(/\/$/, '') + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        language: 'ne'
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error('API ' + res.status + ' ' + errText.slice(0, 120));
    }

    const data = await res.json();
    if (data.text) return String(data.text);
    if (data.reply) return String(data.reply);
    if (data.message) return String(data.message);
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return String(data.choices[0].message.content || '');
    }
    throw new Error('Unexpected API response');
  }

  /**
   * Main entry – returns { text, emotion }
   */
  async function getResponse(userText) {
    const cleaned = String(userText || '').trim();
    if (!cleaned) {
      return { text: 'केही भन्नुस् न, म सुन्दैछु।', emotion: 'confused' };
    }

    pushHistory('user', cleaned);

    try {
      const remote = await callRemoteAPI(cleaned);
      if (remote && remote.trim()) {
        pushHistory('assistant', remote.trim());
        return { text: remote.trim(), emotion: emotionFromText(remote) };
      }
    } catch (e) {
      console.warn('Bftero AI remote failed, using local fallback', e);
    }

    // Local fallback
    const reply = localReply(cleaned);
    pushHistory('assistant', reply);
    return { text: reply, emotion: emotionFromText(reply) };
  }

  function clearHistory() {
    history.length = 0;
  }

  function getHistory() {
    return history.slice();
  }

  global.BfteroAIEngine = {
    getResponse,
    clearHistory,
    getHistory
  };
})(window);
