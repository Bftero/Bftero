/**
 * Bftero AI – main controller
 * SpeechRecognition (ne-NP) + SpeechSynthesis + local engine + VRM
 */
(function () {
  'use strict';

  const CFG = window.BFTERO_AI_CONFIG || {};
  const S = CFG.strings || {};

  const state = {
    status: 'idle', // idle | listening | thinking | speaking
    muted: localStorage.getItem('bf_ai_mute') === '1',
    recognition: null,
    lastUser: '',
    lastAi: '',
    supported: true
  };

  // DOM
  const $ = (sel) => document.querySelector(sel);
  const statusEl = $('#aiStatus');
  const userTextEl = $('#aiUserText');
  const aiTextEl = $('#aiResponseText');
  const micBtn = $('#aiMicBtn');
  const muteBtn = $('#aiMuteBtn');
  const clearBtn = $('#aiClearBtn');
  const stage = $('#aiCharacterStage');
  const loadingEl = $('#aiLoading');

  function setStatus(s) {
    state.status = s;
    if (!statusEl) return;
    const map = {
      idle: S.ready || 'नमस्ते! मलाई नेपालीमा जे पनि सोध्नुस् 😊',
      listening: S.listening || 'सुन्दैछु... 👂',
      thinking: S.thinking || 'सोच्दैछु... 🤔',
      speaking: S.speaking || 'बोल्दैछु... 🗣️'
    };
    statusEl.textContent = map[s] || map.idle;
    if (micBtn) {
      micBtn.classList.toggle('listening', s === 'listening');
      micBtn.classList.toggle('busy', s === 'thinking' || s === 'speaking');
      micBtn.disabled = s === 'thinking' || s === 'speaking';
    }
  }

  function showUser(text) {
    if (userTextEl) userTextEl.textContent = text || '—';
  }
  function showAi(text) {
    if (aiTextEl) aiTextEl.textContent = text || '—';
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderChatHistory(list) {
    const box = document.getElementById('aiChatHistory');
    if (!box) return;
    const items = list || (window.BfteroAIEngine && window.BfteroAIEngine.getHistory()) || [];
    if (!items.length) {
      box.innerHTML = '<p class="ai-hist-empty">अहिलेसम्म कुराकानी छैन — Tap to Talk थिच्नुहोस्</p>';
      return;
    }
    box.innerHTML = items.map((m) => {
      const who = m.role === 'user' ? 'तिमी' : 'MAYA';
      const cls = m.role === 'user' ? 'user' : 'ai';
      return '<div class="ai-hist-row ' + cls + '"><span class="ai-hist-who">' + who + '</span><p>' + escapeHtml(m.content) + '</p></div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  window.__mayaOnHistoryChange = function (list) {
    renderChatHistory(list);
  };


  /* ---------- Speech Recognition ---------- */
  function initRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      state.supported = false;
      setStatus('idle');
      if (statusEl) statusEl.textContent = 'Speech recognition not supported in this browser. Use Chrome / Edge.';
      return null;
    }
    const rec = new SR();
    rec.lang = CFG.recognitionLang || 'ne-NP';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onstart = () => setStatus('listening');
    rec.onend = () => {
      if (state.status === 'listening') setStatus('idle');
    };
    rec.onerror = (e) => {
      console.warn('SR error', e.error);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setStatus('idle');
        showAi(S.micDenied || 'Microphone permission is required.');
      } else if (e.error === 'no-speech' || e.error === 'aborted') {
        setStatus('idle');
        showAi(S.noSpeech || 'माफ गर्नुहोस्, मैले राम्रोसँग सुन्न सकिनँ।');
      } else {
        setStatus('idle');
      }
    };
    rec.onresult = (ev) => {
      const text = (ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript) || '';
      if (!text.trim()) {
        setStatus('idle');
        showAi(S.noSpeech);
        return;
      }
      state.lastUser = text.trim();
      showUser(state.lastUser);
      processUser(state.lastUser);
    };
    return rec;
  }

  function startListening() {
    if (state.status === 'listening' || state.status === 'thinking' || state.status === 'speaking') return;
    if (!state.recognition) state.recognition = initRecognition();
    if (!state.recognition) return;
    try {
      state.recognition.start();
    } catch (e) {
      console.warn(e);
      setStatus('idle');
    }
  }

  /* ---------- TTS ---------- */
  function pickVoice() {
    const voices = speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    const score = (v) => {
      const n = (v.name + ' ' + v.lang).toLowerCase();
      let s = 0;
      if (/female|woman|girl|zira|susan|samantha|veena|neerja|heera|hemkala|google हिन्दी|google हिंदी/i.test(n)) s += 5;
      if (/hi-in|hindi|ne-np|nepali/i.test(n)) s += 4;
      if (/en-in|indian/i.test(n)) s += 2;
      if (/male|david|mark|ravi/i.test(n)) s -= 5;
      return s;
    };
    const sorted = voices.slice().sort((a, b) => score(b) - score(a));
    return sorted[0] || voices[0];
  }

  function speak(text, emotion) {
    return new Promise((resolve) => {
      if (state.muted || !window.speechSynthesis) {
        resolve();
        return;
      }
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'hi-IN'; // better female coverage; still speaks Nepali text
      // Teen-girl style: higher pitch, natural speed
      const emo = emotion || 'happy';
      if (emo === 'funny') { u.rate = 1.08; u.pitch = 1.45; }
      else if (emo === 'angry') { u.rate = 1.12; u.pitch = 1.15; }
      else if (emo === 'sad') { u.rate = 0.88; u.pitch = 1.2; }
      else if (emo === 'surprised') { u.rate = 1.1; u.pitch = 1.5; }
      else { u.rate = 1.0; u.pitch = 1.35; }
      const voice = pickVoice();
      if (voice) u.voice = voice;

      u.onstart = () => {
        setStatus('speaking');
        if (window.BfteroVRM) window.BfteroVRM.speakStart(emotion);
      };
      u.onend = () => {
        if (window.BfteroVRM) window.BfteroVRM.speakEnd();
        setStatus('idle');
        resolve();
      };
      u.onerror = () => {
        if (window.BfteroVRM) window.BfteroVRM.speakEnd();
        setStatus('idle');
        resolve();
      };

      // Simple lip-sync approximation while speaking (no real audio buffer from TTS)
      let lipIv = null;
      u.onstart = (function (orig) {
        return function () {
          orig && orig();
          if (window.BfteroVRM) {
            lipIv = setInterval(() => {
              if (window.BfteroVRM) {
                const open = 0.2 + Math.random() * 0.55;
                window.BfteroVRM.setMouth(open);
              }
            }, 90);
          }
        };
      })(u.onstart);

      const oldEnd = u.onend;
      u.onend = function () {
        if (lipIv) clearInterval(lipIv);
        if (window.BfteroVRM) window.BfteroVRM.setMouth(0);
        oldEnd && oldEnd();
      };

      speechSynthesis.speak(u);
    });
  }

  /* ---------- Core conversation ---------- */
  async function processUser(text) {
    setStatus('thinking');
    showAi('…');
    // Tiny delay so UI feels natural
    await new Promise(r => setTimeout(r, 280 + Math.random() * 400));

    let result;
    try {
      result = window.BfteroAIEngine
        ? await window.BfteroAIEngine.getResponse(text)
        : { text: 'म तयार छु।', emotion: 'happy' };
      // getResponse may return a Promise in older builds
      if (result && typeof result.then === 'function') result = await result;
    } catch (e) {
      console.warn(e);
      result = { text: S.apiFail || 'अहिले समस्या भयो।', emotion: 'sad' };
    }

    state.lastAi = result.text;
    showAi(result.text);
    await speak(result.text, result.emotion);
  }

  /* ---------- UI events ---------- */
  function bind() {
    if (micBtn) {
      micBtn.addEventListener('click', () => {
        if (state.status === 'idle') startListening();
      });
    }
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        state.muted = !state.muted;
        localStorage.setItem('bf_ai_mute', state.muted ? '1' : '0');
        muteBtn.textContent = state.muted ? (S.muteOn || '🔇 Voice Off') : (S.muteOff || '🔊 Voice On');
        if (state.muted) speechSynthesis.cancel();
      });
      muteBtn.textContent = state.muted ? (S.muteOn || '🔇 Voice Off') : (S.muteOff || '🔊 Voice On');
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (window.BfteroAIEngine) window.BfteroAIEngine.clearHistory();
        showUser('—');
        showAi('—');
        setStatus('idle');
        speechSynthesis.cancel();
        if (window.BfteroVRM) window.BfteroVRM.speakEnd();
      });
    }
  }

  /* ---------- Boot ---------- */
  async function boot() {
    bind();
    setStatus('idle');
    showUser('—');
    showAi(S.ready || 'नमस्ते! म MAYA हुँ 😊');
    renderChatHistory();

    // Load voices
    if (window.speechSynthesis) {
      speechSynthesis.getVoices();
      speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
    }

    // Character
    if (stage && window.BfteroVRM) {
      if (loadingEl) loadingEl.style.display = 'flex';
      const ok = await window.BfteroVRM.init(stage);
      if (loadingEl) loadingEl.style.display = 'none';
      if (!ok) {
        stage.innerHTML = '<div class="ai-fallback-avatar">👩‍💻</div>';
      }
    } else if (loadingEl) {
      loadingEl.style.display = 'none';
    }

    // Pre-warm recognition permission on first interaction only
  }

  // Wait for DOM + config + engine
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
