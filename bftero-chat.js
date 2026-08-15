/* ===== BFTЕRO CHAT START ===== */
/**
 * BFTЕRO Chat Lobby — independent module
 *
 * SETUP (Supabase):
 * 1) Create a free project at https://supabase.com
 * 2) Project Settings → API → copy Project URL + anon public key
 * 3) Paste them into BFTERO_CHAT_CONFIG below
 * 4) Run the SQL in BFTERO_CHAT_SQL (comments at bottom of this file) in Supabase SQL Editor
 * 5) Enable Realtime for tables: chat_messages, private_messages (Database → Replication)
 *
 * Security: only use the public anon key. NEVER put the service_role key in the frontend.
 */
(function () {
  'use strict';

  // Safe storage (avoids SecurityError in sandboxed iframes)
  const __memStore = {};
  function safeGetItem(k) {
    try { return window.safeGetItem(k); } catch (e) { return __memStore[k] || null; }
  }
  function safeSetItem(k, v) {
    try { window.safeSetItem(k, v); } catch (e) { __memStore[k] = String(v); }
  }

  // ========== CONFIG — paste your Supabase public credentials ==========
  const BFTERO_CHAT_CONFIG = {
    supabaseUrl: 'https://cwlocgnpquxyikuovfqn.supabase.co', // e.g. 'https://xxxx.supabase.co'
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3bG9jZ25wcXV4eWlrdW92ZnFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3ODIwOTksImV4cCI6MjEwMjM1ODA5OX0.6qmV5fsX06lCVR08luggeayxSH_78J_u9Mf9gkDJIfI', // public publishable key
    globalRoomId: 'bftero-global',
    maxMessageLen: 300,
    maxMessages: 100,
    maxNameLen: 20,
    rateLimitCount: 5,
    rateLimitWindowMs: 10000,
  };

  const EMOJIS = ['😂','🤣','😭','💀','🤡','🗿','🔥','❤️','👍','👀','😎','🎮','🎯','🚀','💰','👑','😈','🤔','🫡','✨','🎉','💬','🟢','⚫'];

  const LS = {
    name: 'bftero_chat_name',
    uid: 'bftero_chat_uid',
    mutedUsers: 'bftero_chat_muted_users',
    blocked: 'bftero_chat_blocked',
    sound: 'bftero_chat_sound',
    notif: 'bftero_chat_notif',
    muteNotifUsers: 'bftero_chat_mute_notif',
  };

  function uid() {
    return 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  function lsGet(k, f) {
    try {
      const v = safeGetItem(k);
      return v == null ? f : JSON.parse(v);
    } catch {
      return f;
    }
  }
  function lsSet(k, v) {
    try {
      safeSetItem(k, JSON.stringify(v));
    } catch (_) {}
  }
  function sanitizeName(s) {
    return String(s || '')
      .replace(/[<>&"'`\\/]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, BFTERO_CHAT_CONFIG.maxNameLen);
  }
  function sanitizeMsg(s) {
    return String(s || '')
      .replace(/[<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, BFTERO_CHAT_CONFIG.maxMessageLen);
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function timeStr(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  // State
  let supabase = null;
  let configured = false;
  let myId = safeGetItem(LS.uid) || '';
  if (!myId) {
    myId = uid();
    safeSetItem(LS.uid, myId);
  }
  let myName = '';
  try {
    myName = safeGetItem(LS.name) || '';
  } catch (_) {}
  let joined = false;
  let onlineCount = 0;
  let onlineMap = {};
  let presenceChannel = null;
  let messagesChannel = null;
  let privateChannel = null;
  let typingChannel = null;
  let currentView = 'join'; // join | global | private | online
  let privatePeer = null; // { id, name }
  let sendTimes = [];
  let lastSentText = '';
  let lastSentAt = 0;
  let typingUsers = {};
  let typingTimer = null;
  let soundOn = lsGet(LS.sound, false);
  let notifOn = lsGet(LS.notif, true);
  let mutedUsers = new Set(lsGet(LS.mutedUsers, []));
  let blockedUsers = new Set(lsGet(LS.blocked, []));
  let muteNotifUsers = new Set(lsGet(LS.muteNotifUsers, []));

  // DOM refs
  let els = {};

  function isBlocked(id) {
    return blockedUsers.has(id);
  }
  function isMuted(id) {
    return mutedUsers.has(id);
  }
  function persistSets() {
    lsSet(LS.mutedUsers, [...mutedUsers]);
    lsSet(LS.blocked, [...blockedUsers]);
    lsSet(LS.muteNotifUsers, [...muteNotifUsers]);
    lsSet(LS.sound, soundOn);
    lsSet(LS.notif, notifOn);
  }

  function toast(title, body, onClick) {
    if (!els.toast) return;
    els.toast.innerHTML = '<b>' + escapeHtml(title) + '</b><br>' + escapeHtml(body || '');
    els.toast.classList.add('show');
    els.toast.onclick = () => {
      els.toast.classList.remove('show');
      if (typeof onClick === 'function') onClick();
    };
    clearTimeout(toast._t);
    toast._t = setTimeout(() => els.toast.classList.remove('show'), 4500);
  }

  function playPing() {
    if (!soundOn) return;
    try {
      const ctx = playPing._ctx || (playPing._ctx = new (window.AudioContext || window.webkitAudioContext)());
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.value = 0.03;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      o.stop(ctx.currentTime + 0.12);
    } catch (_) {}
  }

  function rateLimited() {
    const now = Date.now();
    sendTimes = sendTimes.filter((t) => now - t < BFTERO_CHAT_CONFIG.rateLimitWindowMs);
    if (sendTimes.length >= BFTERO_CHAT_CONFIG.rateLimitCount) return true;
    sendTimes.push(now);
    return false;
  }

  function updateFabStatus() {
    if (!els.fabStatus) return;
    if (onlineCount > 0) {
      els.fabStatus.classList.remove('is-empty');
      els.fabStatus.innerHTML = '🟢 <strong>' + onlineCount + ' online</strong>';
    } else {
      els.fabStatus.classList.add('is-empty');
      els.fabStatus.innerHTML = '⚫ <strong>Nobody online</strong>';
    }
    if (els.headerStatus) {
      if (onlineCount === 0) els.headerStatus.textContent = '🗿 Nobody is here... call your squad.';
      else if (onlineCount === 1) els.headerStatus.textContent = '👀 Someone is waiting for you...';
      else if (onlineCount >= 5) els.headerStatus.textContent = '🔥 BFTЕRO LOBBY IS GOING CRAZY! · ' + onlineCount + ' online';
      else els.headerStatus.textContent = '🟢 ' + onlineCount + ' people online';
    }
  }

  function setBadge(n) {
    if (!els.badge) return;
    if (n > 0) {
      els.badge.textContent = n > 99 ? '99+' : String(n);
      els.badge.classList.add('show');
    } else {
      els.badge.classList.remove('show');
    }
  }

  // ---------- UI build ----------
  function buildUI() {
    if (document.getElementById('bfteroChatRoot')) return;

    const root = document.createElement('div');
    root.id = 'bfteroChatRoot';
    root.innerHTML = `
      <div class="bftero-chat-fab" id="bfteroChatFab">
        <button type="button" class="bftero-chat-fab-btn" id="bfteroChatFabBtn" aria-label="Open Bftero Chat">
          <span class="bftero-chat-badge" id="bfteroChatBadge">0</span>
          <span class="bftero-chat-fab-title">💬 BFTЕRO CHAT</span>
          <span class="bftero-chat-fab-status is-empty" id="bfteroChatFabStatus">⚫ <strong>Nobody online</strong></span>
        </button>
      </div>
      <div class="bftero-chat-overlay" id="bfteroChatOverlay" aria-hidden="true">
        <div class="bftero-chat-panel" id="bfteroChatPanel" role="dialog" aria-label="Bftero Chat">
          <div class="bftero-chat-header">
            <div class="bftero-chat-header-info">
              <h3 id="bfteroChatTitle">💬 BFTЕRO CHAT</h3>
              <p id="bfteroChatHeaderStatus">Connecting…</p>
            </div>
            <div class="bftero-chat-header-actions">
              <button type="button" class="bftero-chat-icon-btn" id="bfteroChatOnlineBtn" title="Online users">👥</button>
              <button type="button" class="bftero-chat-icon-btn" id="bfteroChatSoundBtn" title="Sound">🔇</button>
              <button type="button" class="bftero-chat-icon-btn" id="bfteroChatCloseBtn" title="Close" aria-label="Close">✕</button>
            </div>
          </div>
          <div class="bftero-chat-status-banner bftero-chat-hidden" id="bfteroChatBanner"></div>
          <div class="bftero-chat-body">
            <div class="bftero-chat-view active" id="bfteroChatViewJoin">
              <div class="bftero-chat-join">
                <h4>💬 Welcome to BFTЕRO CHAT</h4>
                <p>Choose your nickname — no email needed</p>
                <input type="text" id="bfteroChatNameInput" maxlength="20" placeholder="Enter your name" autocomplete="nickname">
                <div class="bftero-chat-join-error" id="bfteroChatJoinError"></div>
                <button type="button" class="bftero-chat-join-btn" id="bfteroChatJoinBtn">🎮 JOIN CHAT</button>
              </div>
            </div>
            <div class="bftero-chat-view" id="bfteroChatViewGlobal">
              <div class="bftero-chat-messages" id="bfteroChatMessages"></div>
              <div class="bftero-chat-typing" id="bfteroChatTyping"></div>
              <div class="bftero-chat-composer">
                <div class="bftero-chat-emoji-panel" id="bfteroChatEmojiPanel"></div>
                <div class="bftero-chat-composer-row">
                  <button type="button" class="bftero-chat-icon-btn" id="bfteroChatEmojiBtn" title="Emoji">😊</button>
                  <input type="text" class="bftero-chat-input" id="bfteroChatInput" maxlength="300" placeholder="Type a message..." autocomplete="off">
                  <button type="button" class="bftero-chat-send" id="bfteroChatSend" title="Send">➤</button>
                </div>
              </div>
            </div>
            <div class="bftero-chat-view" id="bfteroChatViewPrivate">
              <div class="bftero-chat-messages" id="bfteroChatPrivateMessages"></div>
              <div class="bftero-chat-composer">
                <div class="bftero-chat-composer-row">
                  <button type="button" class="bftero-chat-icon-btn" id="bfteroChatBackBtn" title="Back">←</button>
                  <input type="text" class="bftero-chat-input" id="bfteroChatPrivateInput" maxlength="300" placeholder="Private message..." autocomplete="off">
                  <button type="button" class="bftero-chat-send" id="bfteroChatPrivateSend" title="Send">➤</button>
                </div>
              </div>
            </div>
            <div class="bftero-chat-view" id="bfteroChatViewOnline">
              <div class="bftero-chat-online-list" id="bfteroChatOnlineList"></div>
            </div>
            <div class="bftero-chat-menu" id="bfteroChatMenu"></div>
          </div>
        </div>
      </div>
      <div class="bftero-chat-toast" id="bfteroChatToast"></div>
    `;
    document.body.appendChild(root);
    // Hide static fallback button once real chat UI is ready
    try {
      var fb = document.getElementById('bfteroChatFallbackFab');
      if (fb) fb.style.display = 'none';
    } catch (_) {}

    els = {
      fabBtn: document.getElementById('bfteroChatFabBtn'),
      fabStatus: document.getElementById('bfteroChatFabStatus'),
      badge: document.getElementById('bfteroChatBadge'),
      overlay: document.getElementById('bfteroChatOverlay'),
      panel: document.getElementById('bfteroChatPanel'),
      title: document.getElementById('bfteroChatTitle'),
      headerStatus: document.getElementById('bfteroChatHeaderStatus'),
      banner: document.getElementById('bfteroChatBanner'),
      closeBtn: document.getElementById('bfteroChatCloseBtn'),
      onlineBtn: document.getElementById('bfteroChatOnlineBtn'),
      soundBtn: document.getElementById('bfteroChatSoundBtn'),
      viewJoin: document.getElementById('bfteroChatViewJoin'),
      viewGlobal: document.getElementById('bfteroChatViewGlobal'),
      viewPrivate: document.getElementById('bfteroChatViewPrivate'),
      viewOnline: document.getElementById('bfteroChatViewOnline'),
      nameInput: document.getElementById('bfteroChatNameInput'),
      joinBtn: document.getElementById('bfteroChatJoinBtn'),
      joinError: document.getElementById('bfteroChatJoinError'),
      messages: document.getElementById('bfteroChatMessages'),
      privateMessages: document.getElementById('bfteroChatPrivateMessages'),
      typing: document.getElementById('bfteroChatTyping'),
      input: document.getElementById('bfteroChatInput'),
      send: document.getElementById('bfteroChatSend'),
      emojiBtn: document.getElementById('bfteroChatEmojiBtn'),
      emojiPanel: document.getElementById('bfteroChatEmojiPanel'),
      privateInput: document.getElementById('bfteroChatPrivateInput'),
      privateSend: document.getElementById('bfteroChatPrivateSend'),
      backBtn: document.getElementById('bfteroChatBackBtn'),
      onlineList: document.getElementById('bfteroChatOnlineList'),
      menu: document.getElementById('bfteroChatMenu'),
      toast: document.getElementById('bfteroChatToast'),
    };

    // Emoji panel
    els.emojiPanel.innerHTML = EMOJIS.map(
      (e) => '<button type="button" data-emoji="' + e + '">' + e + '</button>'
    ).join('');

    wireEvents();
    updateSoundBtn();
    if (myName) els.nameInput.value = myName;
  }

  function showView(name) {
    currentView = name;
    ['viewJoin', 'viewGlobal', 'viewPrivate', 'viewOnline'].forEach((k) => {
      els[k].classList.toggle('active', k === 'view' + name.charAt(0).toUpperCase() + name.slice(1) ||
        (name === 'join' && k === 'viewJoin') ||
        (name === 'global' && k === 'viewGlobal') ||
        (name === 'private' && k === 'viewPrivate') ||
        (name === 'online' && k === 'viewOnline'));
    });
    // fix active classes cleanly
    els.viewJoin.classList.toggle('active', name === 'join');
    els.viewGlobal.classList.toggle('active', name === 'global');
    els.viewPrivate.classList.toggle('active', name === 'private');
    els.viewOnline.classList.toggle('active', name === 'online');

    if (name === 'global') {
      els.title.textContent = '💬 BFTЕRO CHAT';
    } else if (name === 'private' && privatePeer) {
      els.title.textContent = '💬 ' + privatePeer.name;
    } else if (name === 'online') {
      els.title.textContent = '👥 ONLINE';
    } else {
      els.title.textContent = '💬 BFTЕRO CHAT';
    }
  }

  function hideFabs(hide) {
    try {
      var fab = document.getElementById('bfteroChatFab');
      var fb = document.getElementById('bfteroChatFallbackFab');
      if (fab) fab.style.display = hide ? 'none' : '';
      if (fb) fb.style.display = hide ? 'none' : 'none'; // always hide fallback after boot
    } catch (_) {}
  }

  function openChat() {
    els.overlay.classList.add('open');
    els.overlay.setAttribute('aria-hidden', 'false');
    hideFabs(true);
    setBadge(0);
    if (joined) showView(privatePeer ? 'private' : 'global');
    else showView('join');
  }

  function closeChat() {
    els.overlay.classList.remove('open');
    els.overlay.setAttribute('aria-hidden', 'true');
    els.menu.classList.remove('open');
    els.emojiPanel.classList.remove('open');
    hideFabs(false);
  }

  function updateSoundBtn() {
    els.soundBtn.textContent = soundOn ? '🔊' : '🔇';
    els.soundBtn.title = soundOn ? 'Sound ON' : 'Sound OFF';
  }

  function showBanner(msg) {
    if (!msg) {
      els.banner.classList.add('bftero-chat-hidden');
      els.banner.textContent = '';
      return;
    }
    els.banner.textContent = msg;
    els.banner.classList.remove('bftero-chat-hidden');
  }

  function appendMsg(container, msg, opts) {
    opts = opts || {};
    if (isBlocked(msg.sender_id) || isMuted(msg.sender_id)) return;

    const row = document.createElement('div');
    row.className = 'bftero-chat-msg' + (msg.sender_id === myId ? ' is-mine' : '');
    row.dataset.id = msg.id || '';

    const meta = document.createElement('div');
    meta.className = 'bftero-chat-msg-meta';

    const nameBtn = document.createElement('button');
    nameBtn.type = 'button';
    nameBtn.className = 'bftero-chat-msg-name';
    nameBtn.textContent = msg.sender_name || 'Player';
    nameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openUserMenu(msg.sender_id, msg.sender_name, e.clientX, e.clientY);
    });

    const time = document.createElement('span');
    time.className = 'bftero-chat-msg-time';
    time.textContent = timeStr(msg.created_at);

    meta.appendChild(nameBtn);
    meta.appendChild(time);

    if (msg.sender_id !== myId) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'bftero-chat-icon-btn bftero-chat-msg-actions';
      more.style.width = '24px';
      more.style.height = '24px';
      more.style.fontSize = '0.75rem';
      more.textContent = '⋮';
      more.addEventListener('click', (e) => {
        e.stopPropagation();
        openUserMenu(msg.sender_id, msg.sender_name, e.clientX, e.clientY, msg.id);
      });
      meta.appendChild(more);
    }

    const text = document.createElement('p');
    text.className = 'bftero-chat-msg-text';
    text.textContent = msg.message || '';

    row.appendChild(meta);
    row.appendChild(text);
    container.appendChild(row);

    // Keep DOM at max messages
    while (container.children.length > BFTERO_CHAT_CONFIG.maxMessages) {
      container.removeChild(container.firstChild);
    }
    if (!opts.noScroll) {
      container.scrollTop = container.scrollHeight;
    }
  }

  function openUserMenu(userId, userName, x, y, messageId) {
    if (userId === myId) return;
    const menu = els.menu;
    menu.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'bftero-chat-menu-title';
    title.textContent = '👤 ' + (userName || 'Player');
    menu.appendChild(title);

    const actions = [
      { label: '💬 Message', fn: () => openPrivate(userId, userName) },
      {
        label: muteNotifUsers.has(userId) ? '🔔 Unmute notifications' : '🔕 Mute notifications',
        fn: () => {
          if (muteNotifUsers.has(userId)) muteNotifUsers.delete(userId);
          else muteNotifUsers.add(userId);
          persistSets();
        },
      },
      {
        label: mutedUsers.has(userId) ? '🔊 Unmute user' : '🔇 Mute user',
        fn: () => {
          if (mutedUsers.has(userId)) mutedUsers.delete(userId);
          else mutedUsers.add(userId);
          persistSets();
        },
      },
      {
        label: blockedUsers.has(userId) ? '✅ Unblock' : '🚫 Block',
        fn: () => {
          if (blockedUsers.has(userId)) blockedUsers.delete(userId);
          else {
            blockedUsers.add(userId);
            toast('🚫 User blocked', userName || '');
          }
          persistSets();
        },
      },
      {
        label: '🚩 Report',
        fn: () => reportUser(userId, messageId),
      },
    ];
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = a.label;
      b.addEventListener('click', () => {
        menu.classList.remove('open');
        a.fn();
      });
      menu.appendChild(b);
    });

    const rect = els.panel.getBoundingClientRect();
    menu.style.left = Math.min(Math.max(8, x - rect.left - 20), rect.width - 200) + 'px';
    menu.style.top = Math.min(Math.max(48, y - rect.top), rect.height - 220) + 'px';
    menu.classList.add('open');
  }

  async function reportUser(userId, messageId) {
    const reason = window.prompt('Report reason:\nSpam / Harassment / Hate / Sexual / Scam / Other', 'Spam');
    if (!reason) return;
    if (!configured || !supabase) {
      toast('🚩 Report saved locally', 'Chat backend not connected');
      return;
    }
    try {
      await supabase.from('chat_reports').insert({
        reporter_id: myId,
        reported_id: userId,
        message_id: messageId || null,
        reason: sanitizeMsg(reason).slice(0, 80),
      });
      toast('🚩 Report submitted', 'Thanks — mods will review.');
    } catch (e) {
      toast('⚠️ Report failed', 'Please try later');
    }
  }

  function openPrivate(userId, userName) {
    if (isBlocked(userId)) {
      toast('🚫 User blocked', 'Unblock them first to message.');
      return;
    }
    privatePeer = { id: userId, name: userName || 'Player' };
    showView('private');
    els.headerStatus.textContent = '🔒 Private · only you two';
    loadPrivateMessages();
  }

  // ---------- Supabase ----------
  async function initSupabase() {
    const { supabaseUrl, supabaseAnonKey } = BFTERO_CHAT_CONFIG;
    if (!supabaseUrl || !supabaseAnonKey) {
      configured = false;
      showBanner('⚠️ Chat is temporarily unavailable. Add Supabase keys in bftero-chat.js');
      els.headerStatus.textContent = '⚠️ Chat offline (not configured)';
      return false;
    }
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
      configured = false;
      showBanner('⚠️ Chat library failed to load. Check your connection.');
      return false;
    }
    try {
      supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      configured = true;
      showBanner('');
      return true;
    } catch (e) {
      configured = false;
      showBanner('⚠️ Chat is temporarily unavailable.');
      return false;
    }
  }

  async function joinChat() {
    const name = sanitizeName(els.nameInput.value);
    if (!name || name.length < 2) {
      els.joinError.textContent = 'Name required (2–20 characters)';
      return;
    }
    myName = name;
    try {
      safeSetItem(LS.name, myName);
    } catch (_) {}
    els.joinError.textContent = '';
    joined = true;
    showView('global');
    els.headerStatus.textContent = '🎮 Welcome to the lobby!';
    updateFabStatus();

    if (!(await initSupabase())) {
      // Local-only fallback: allow UI but warn
      showBanner('📡 Live chat not connected — messages stay on this device only.');
      return;
    }

    await upsertPresence();
    await loadGlobalMessages();
    subscribeGlobal();
    subscribePresence();
    subscribePrivate();
  }

  async function upsertPresence() {
    if (!supabase) return;
    try {
      // Lightweight presence via realtime channel
      if (presenceChannel) {
        try {
          await supabase.removeChannel(presenceChannel);
        } catch (_) {}
      }
      presenceChannel = supabase.channel('bftero-presence', {
        config: { presence: { key: myId } },
      });
      presenceChannel
        .on('presence', { event: 'sync' }, () => {
          const state = presenceChannel.presenceState();
          onlineMap = {};
          Object.keys(state).forEach((key) => {
            const arr = state[key] || [];
            arr.forEach((p) => {
              if (p && p.user_id) onlineMap[p.user_id] = p;
            });
          });
          onlineCount = Object.keys(onlineMap).length;
          updateFabStatus();
          renderOnlineList();
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await presenceChannel.track({
              user_id: myId,
              display_name: myName,
              online_at: new Date().toISOString(),
            });
          }
        });
    } catch (e) {
      console.warn('Bftero chat presence', e);
    }
  }

  function renderOnlineList() {
    if (!els.onlineList) return;
    const ids = Object.keys(onlineMap);
    if (!ids.length) {
      els.onlineList.innerHTML = '<div class="bftero-chat-empty">⚫ Nobody online</div>';
      return;
    }
    els.onlineList.innerHTML = '';
    ids.forEach((id) => {
      if (isBlocked(id)) return;
      const p = onlineMap[id];
      const row = document.createElement('div');
      row.className = 'bftero-chat-online-item';
      row.innerHTML =
        '<span style="display:flex;align-items:center;gap:8px;"><span class="bftero-chat-dot"></span>' +
        escapeHtml(p.display_name || 'Player') +
        (id === myId ? ' (you)' : '') +
        '</span>';
      if (id !== myId) {
        row.addEventListener('click', () => openUserMenu(id, p.display_name, 200, 200));
      }
      els.onlineList.appendChild(row);
    });
  }

  async function loadGlobalMessages() {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id, room_id, sender_id, sender_name, message, created_at')
        .eq('room_id', BFTERO_CHAT_CONFIG.globalRoomId)
        .order('created_at', { ascending: false })
        .limit(BFTERO_CHAT_CONFIG.maxMessages);
      if (error) throw error;
      els.messages.innerHTML = '';
      const list = (data || []).reverse();
      if (!list.length) {
        els.messages.innerHTML = '<div class="bftero-chat-empty">🌎 GLOBAL ROOM<br>Be the first to say hi 👋</div>';
        return;
      }
      list.forEach((m) => appendMsg(els.messages, m, { noScroll: true }));
      els.messages.scrollTop = els.messages.scrollHeight;
    } catch (e) {
      console.warn(e);
      showBanner('⚠️ Database tables missing. Run the SQL in Supabase SQL Editor (see setup).');
    }
  }

  function subscribeGlobal() {
    if (!supabase) return;
    if (messagesChannel) {
      try {
        supabase.removeChannel(messagesChannel);
      } catch (_) {}
    }
    messagesChannel = supabase
      .channel('bftero-global-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: 'room_id=eq.' + BFTERO_CHAT_CONFIG.globalRoomId,
        },
        (payload) => {
          const m = payload.new;
          if (!m) return;
          if (els.messages.querySelector('.bftero-chat-empty')) els.messages.innerHTML = '';
          appendMsg(els.messages, m);
          if (m.sender_id !== myId && !isBlocked(m.sender_id) && !muteNotifUsers.has(m.sender_id)) {
            if (!els.overlay.classList.contains('open')) {
              setBadge((parseInt(els.badge.textContent, 10) || 0) + 1);
              if (notifOn) toast('💬 ' + (m.sender_name || 'Player'), m.message || '', openChat);
            }
            playPing();
          }
        }
      )
      .subscribe();
  }

  function conversationId(a, b) {
    return [a, b].sort().join('__');
  }

  async function loadPrivateMessages() {
    if (!supabase || !privatePeer) return;
    const cid = conversationId(myId, privatePeer.id);
    try {
      const { data, error } = await supabase
        .from('private_messages')
        .select('id, conversation_id, sender_id, sender_name, receiver_id, message, created_at')
        .eq('conversation_id', cid)
        .order('created_at', { ascending: false })
        .limit(BFTERO_CHAT_CONFIG.maxMessages);
      if (error) throw error;
      els.privateMessages.innerHTML = '';
      const list = (data || []).reverse();
      if (!list.length) {
        els.privateMessages.innerHTML = '<div class="bftero-chat-empty">No messages yet — say hi 👋</div>';
        return;
      }
      list.forEach((m) => appendMsg(els.privateMessages, m, { noScroll: true }));
      els.privateMessages.scrollTop = els.privateMessages.scrollHeight;
    } catch (e) {
      console.warn(e);
    }
  }

  function subscribePrivate() {
    if (!supabase) return;
    if (privateChannel) {
      try {
        supabase.removeChannel(privateChannel);
      } catch (_) {}
    }
    privateChannel = supabase
      .channel('bftero-private-' + myId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'private_messages' },
        (payload) => {
          const m = payload.new;
          if (!m) return;
          if (m.receiver_id !== myId && m.sender_id !== myId) return;
          if (isBlocked(m.sender_id)) return;
          const peerId = m.sender_id === myId ? m.receiver_id : m.sender_id;
          if (
            currentView === 'private' &&
            privatePeer &&
            privatePeer.id === peerId
          ) {
            if (els.privateMessages.querySelector('.bftero-chat-empty')) els.privateMessages.innerHTML = '';
            appendMsg(els.privateMessages, m);
          } else if (m.sender_id !== myId && !muteNotifUsers.has(m.sender_id)) {
            if (notifOn) {
              toast('💬 New message', (m.sender_name || 'Player') + ': ' + (m.message || ''), () => {
                openChat();
                openPrivate(m.sender_id, m.sender_name);
              });
            }
            if (!els.overlay.classList.contains('open')) {
              setBadge((parseInt(els.badge.textContent, 10) || 0) + 1);
            }
            playPing();
          }
        }
      )
      .subscribe();
  }

  async function sendGlobal() {
    const text = sanitizeMsg(els.input.value);
    if (!text) return;
    if (rateLimited()) {
      toast('🛑 Slow down bro 😂', "You're sending messages too fast.");
      return;
    }
    if (text === lastSentText && Date.now() - lastSentAt < 3000) {
      toast('😂 Bro, relax!', 'Same message too soon.');
      return;
    }
    lastSentText = text;
    lastSentAt = Date.now();
    els.input.value = '';
    els.emojiPanel.classList.remove('open');

    if (!configured || !supabase) {
      appendMsg(els.messages, {
        id: uid(),
        sender_id: myId,
        sender_name: myName,
        message: text,
        created_at: new Date().toISOString(),
      });
      return;
    }
    try {
      const { error } = await supabase.from('chat_messages').insert({
        room_id: BFTERO_CHAT_CONFIG.globalRoomId,
        sender_id: myId,
        sender_name: myName,
        message: text,
      });
      if (error) throw error;
      // Optional: prune old messages (best-effort; prefer DB trigger)
      pruneGlobal();
    } catch (e) {
      console.warn(e);
      toast('⚠️ Send failed', 'Try again later');
    }
  }

  async function sendPrivate() {
    if (!privatePeer) return;
    const text = sanitizeMsg(els.privateInput.value);
    if (!text) return;
    if (rateLimited()) {
      toast('🛑 Slow down bro 😂', "You're sending messages too fast.");
      return;
    }
    els.privateInput.value = '';
    if (!configured || !supabase) {
      appendMsg(els.privateMessages, {
        id: uid(),
        sender_id: myId,
        sender_name: myName,
        message: text,
        created_at: new Date().toISOString(),
      });
      return;
    }
    try {
      const { error } = await supabase.from('private_messages').insert({
        conversation_id: conversationId(myId, privatePeer.id),
        sender_id: myId,
        sender_name: myName,
        receiver_id: privatePeer.id,
        message: text,
      });
      if (error) throw error;
    } catch (e) {
      console.warn(e);
      toast('⚠️ Send failed', 'Try again later');
    }
  }

  async function pruneGlobal() {
    if (!supabase) return;
    try {
      // Best-effort client prune — prefer a DB function/trigger for production
      const { data } = await supabase
        .from('chat_messages')
        .select('id')
        .eq('room_id', BFTERO_CHAT_CONFIG.globalRoomId)
        .order('created_at', { ascending: false })
        .range(BFTERO_CHAT_CONFIG.maxMessages, BFTERO_CHAT_CONFIG.maxMessages + 50);
      if (data && data.length) {
        const ids = data.map((r) => r.id);
        await supabase.from('chat_messages').delete().in('id', ids);
      }
    } catch (_) {}
  }

  // Typing (ephemeral via broadcast — no DB writes)
  function emitTyping() {
    if (!presenceChannel || !joined) return;
    try {
      presenceChannel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { user_id: myId, display_name: myName, at: Date.now() },
      });
    } catch (_) {}
  }

  function wireTyping() {
    if (!presenceChannel) return;
    presenceChannel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (!payload || payload.user_id === myId) return;
      if (isBlocked(payload.user_id) || isMuted(payload.user_id)) return;
      typingUsers[payload.user_id] = { name: payload.display_name, at: Date.now() };
      renderTyping();
    });
    setInterval(() => {
      const now = Date.now();
      let changed = false;
      Object.keys(typingUsers).forEach((id) => {
        if (now - typingUsers[id].at > 2500) {
          delete typingUsers[id];
          changed = true;
        }
      });
      if (changed) renderTyping();
    }, 1000);
  }

  function renderTyping() {
    const names = Object.values(typingUsers).map((t) => t.name).filter(Boolean);
    if (!names.length) {
      els.typing.textContent = '';
      return;
    }
    if (names.length === 1) els.typing.textContent = names[0] + ' is typing... 👀';
    else els.typing.textContent = names[0] + ' and ' + (names.length - 1) + ' others are typing...';
  }

  function wireEvents() {
    els.fabBtn.addEventListener('click', openChat);
    els.closeBtn.addEventListener('click', closeChat);
    els.overlay.addEventListener('click', (e) => {
      if (e.target === els.overlay) closeChat();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.overlay.classList.contains('open')) closeChat();
    });
    els.panel.addEventListener('click', () => {
      els.menu.classList.remove('open');
    });

    els.joinBtn.addEventListener('click', joinChat);
    els.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinChat();
    });

    els.send.addEventListener('click', sendGlobal);
    els.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendGlobal();
      } else {
        clearTimeout(typingTimer);
        typingTimer = setTimeout(emitTyping, 200);
      }
    });

    els.privateSend.addEventListener('click', sendPrivate);
    els.privateInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendPrivate();
      }
    });

    els.emojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      els.emojiPanel.classList.toggle('open');
    });
    els.emojiPanel.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-emoji]');
      if (!btn) return;
      els.input.value = (els.input.value + btn.getAttribute('data-emoji')).slice(0, BFTERO_CHAT_CONFIG.maxMessageLen);
      els.input.focus();
    });

    els.onlineBtn.addEventListener('click', () => {
      if (currentView === 'online') showView(joined ? 'global' : 'join');
      else {
        showView('online');
        renderOnlineList();
      }
    });
    els.backBtn.addEventListener('click', () => {
      privatePeer = null;
      showView('global');
      updateFabStatus();
    });
    els.soundBtn.addEventListener('click', () => {
      soundOn = !soundOn;
      persistSets();
      updateSoundBtn();
    });

    window.addEventListener('online', () => {
      if (joined) showBanner('');
    });
    window.addEventListener('offline', () => {
      showBanner("📡 You're offline.");
    });
  }

  // Boot — does not touch existing site logic
  function boot() {
    try {
      buildUI();
      updateFabStatus();
      // Preload status if configured (optional presence without join)
      // Keep lightweight: only full connect after join
      if (!navigator.onLine) {
        showBanner("📡 You're offline.");
      }
    } catch (e) {
      console.warn('Bftero chat failed to init', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Expose minimal debug (optional)
  window.BfteroChat = {
    open: () => els.overlay && openChat(),
    close: () => els.overlay && closeChat(),
    config: BFTERO_CHAT_CONFIG,
  };
})();

/*
========== BFTERO_CHAT_SQL (run in Supabase SQL Editor) ==========

-- Global messages
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  sender_id text not null,
  sender_name text not null,
  message text not null check (char_length(message) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_room_created on public.chat_messages (room_id, created_at desc);

-- Private messages
create table if not exists public.private_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null,
  sender_id text not null,
  sender_name text not null,
  receiver_id text not null,
  message text not null check (char_length(message) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists private_messages_conv_created on public.private_messages (conversation_id, created_at desc);

-- Reports
create table if not exists public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id text not null,
  reported_id text,
  message_id text,
  reason text,
  created_at timestamptz not null default now()
);

-- Enable Realtime
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.private_messages;

-- Simple open policies for public lobby (tighten later with auth)
alter table public.chat_messages enable row level security;
alter table public.private_messages enable row level security;
alter table public.chat_reports enable row level security;

create policy "chat read" on public.chat_messages for select using (true);
create policy "chat insert" on public.chat_messages for insert with check (true);
create policy "chat delete own prune" on public.chat_messages for delete using (true);

create policy "pm read" on public.private_messages for select using (true);
create policy "pm insert" on public.private_messages for insert with check (true);

create policy "report insert" on public.chat_reports for insert with check (true);

-- Optional: auto-prune function (call via cron or trigger)
-- Keep latest 100 per room recommended via Edge Function / cron.

========== END SQL ==========
*/
/* ===== BFTЕRO CHAT END ===== */
