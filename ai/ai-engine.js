/**
 * MAYA – engine with persistent chat history
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'maya_chat_history_v1';
  let history = loadHistory();

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
        .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
        .slice(-40);
    } catch {
      return [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-40)));
    } catch (_) {}
  }

  const localResponses = {
    greeting: ['नमस्ते! म MAYA हुँ 💕 तिम्रो दिन कस्तो बित्यो?'],
    default: ['म सुनें… अहिले backend जोडिएन। फेरि प्रयास गर न?']
  };

  function localReply(text) {
    const t = (text || '').toLowerCase();
    if (/नमस्ते|हाइ|hello/.test(t)) return localResponses.greeting[0];
    return localResponses.default[0];
  }

  function emotionFromText(text) {
    const t = (text || '').toLowerCase();
    if (/हाहा|😂|😄|😆|जोक|हास्|रमाइलो|मजा/.test(t)) return 'funny';
    if (/रिसा|रिस|😠|😡|होइन|हुन्न|छोड/.test(t)) return 'angry';
    if (/दुःख|😢|😭|माफ|sorry|उदास/.test(t)) return 'sad';
    if (/अचम्म|😲|wow|के भन्या|साच्चै/.test(t)) return 'surprised';
    if (/😊|💕|नमस्ते|धन्यवाद|राम्रो|माया|खुसी/.test(t)) return 'happy';
    return 'happy';
  }

  function pushHistory(role, content) {
    const c = String(content || '').trim();
    if (!c) return;
    history.push({ role, content: c });
    const max = (window.BFTERO_AI_CONFIG && window.BFTERO_AI_CONFIG.maxHistory) || 16;
    while (history.length > max * 2) history.shift();
    saveHistory();
    // Notify UI
    if (typeof global.__mayaOnHistoryChange === 'function') {
      try { global.__mayaOnHistoryChange(history.slice()); } catch (_) {}
    }
  }

  async function callRemoteAPI() {
    const endpoint = (window.BFTERO_AI_CONFIG && window.BFTERO_AI_CONFIG.apiEndpoint) || '';
    if (!endpoint) return null;

    const messages = history
      .filter((m) => m.content && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => ({ role: m.role, content: m.content }));

    const res = await fetch(endpoint.replace(/\/$/, '') + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, language: 'ne' })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error('API ' + res.status + ' ' + errText.slice(0, 150));
    }

    const data = await res.json();
    let text = '';
    if (data.text) text = String(data.text);
    else if (data.reply) text = String(data.reply);
    else if (data.message) text = String(data.message);
    else if (data.choices && data.choices[0] && data.choices[0].message) {
      text = String(data.choices[0].message.content || '');
    } else {
      throw new Error('Unexpected API response');
    }
    const emotion = data.emotion ? String(data.emotion).toLowerCase() : null;
    return { text, emotion };
  }

  function mapEmotion(e) {
    const x = String(e || '').toLowerCase();
    if (x === 'laughing' || x === 'funny') return 'funny';
    if (x === 'annoyed' || x === 'angry') return 'angry';
    if (x === 'shy' || x === 'happy' || x === 'excited' || x === 'playful' || x === 'teasing' || x === 'calm') return 'happy';
    if (x === 'sad') return 'sad';
    if (x === 'surprised' || x === 'confused') return 'surprised';
    return emotionFromText(e) || 'happy';
  }

  async function getResponse(userText) {
    const cleaned = String(userText || '').trim();
    if (!cleaned) {
      return { text: 'केही भन्नुस् न, म सुन्दैछु।', emotion: 'confused' };
    }

    pushHistory('user', cleaned);

    try {
      const remote = await callRemoteAPI();
      if (remote && remote.text && remote.text.trim()) {
        const text = remote.text.trim();
        pushHistory('assistant', text);
        return {
          text,
          emotion: mapEmotion(remote.emotion) || emotionFromText(text)
        };
      }
    } catch (e) {
      console.warn('MAYA remote failed, local fallback', e);
    }

    const reply = localReply(cleaned);
    pushHistory('assistant', reply);
    return { text: reply, emotion: emotionFromText(reply) };
  }

  function clearHistory() {
    history.length = 0;
    saveHistory();
    if (typeof global.__mayaOnHistoryChange === 'function') {
      try { global.__mayaOnHistoryChange([]); } catch (_) {}
    }
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
