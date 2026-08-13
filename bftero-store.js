/**
 * BFtero data layer — scores, comments, polls
 * Uses localStorage by default (works offline).
 * Optional Firebase Firestore when window.BFTERO_FIREBASE is set in config.js
 *
 * Collections shape:
 *  scores:  { username, score, ts, hash }
 *  comments:{ username, text, ts, color }
 *  polls:   { id, question, options[{id,label,votes}], start, end }
 */
(function (global) {
  const MAX_COMMENTS = 100;
  const MAX_LEADERBOARD = 100;
  const SCORE_SALT = 'bftero-v1'; // soft anti-tamper (not cryptographic security)

  function sanitize(str, max) {
    return String(str || '')
      .replace(/[<>&"'`]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  function uid() {
    return 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function visitorId() {
    let id = localStorage.getItem('bf_vid');
    if (!id) {
      id = uid();
      localStorage.setItem('bf_vid', id);
    }
    return id;
  }

  function scoreHash(username, score, ts) {
    // Lightweight checksum — deters casual client edits
    const s = SCORE_SALT + '|' + username.toLowerCase() + '|' + score + '|' + ts;
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return String(h);
  }

  function lsGet(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  }

  function lsSet(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  // ---- Local adapters ----
  const Local = {
    async getScores() {
      const list = lsGet('bf_scores', []);
      return list
        .filter((x) => x && typeof x.score === 'number' && x.username)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_LEADERBOARD);
    },
    async submitScore(username, score) {
      username = sanitize(username, 16);
      score = Math.floor(Number(score));
      if (!username || username.length < 2) throw new Error('Username required (2–16 chars)');
      if (!Number.isFinite(score) || score < 0 || score > 500000) throw new Error('Invalid score');
      const ts = Date.now();
      const entry = { username, score, ts, hash: scoreHash(username, score, ts), vid: visitorId() };
      const list = lsGet('bf_scores', []);
      // Keep best score per username (case-insensitive)
      const idx = list.findIndex((x) => x.username.toLowerCase() === username.toLowerCase());
      if (idx >= 0) {
        if (score > list[idx].score) list[idx] = entry;
      } else {
        list.push(entry);
      }
      list.sort((a, b) => b.score - a.score);
      lsSet('bf_scores', list.slice(0, MAX_LEADERBOARD * 3));
      // personal best
      const pb = Number(localStorage.getItem('bf_personal_best') || 0);
      if (score > pb) localStorage.setItem('bf_personal_best', String(score));
      localStorage.setItem('bf_last_user', username);
      return entry;
    },
    async getComments() {
      return lsGet('bf_comments', []).slice(0, MAX_COMMENTS);
    },
    async postComment(username, text) {
      username = sanitize(username, 16);
      text = sanitize(text, 180);
      if (!username || username.length < 2) throw new Error('Username required');
      if (!text || text.length < 2) throw new Error('Comment required');
      // rate limit ~1 comment / 20s per visitor
      const last = Number(localStorage.getItem('bf_last_comment') || 0);
      if (Date.now() - last < 20000) throw new Error('Please wait a few seconds before posting again');
      const colors = ['#fef08a', '#bfdbfe', '#bbf7d0', '#fecaca', '#e9d5ff', '#fed7aa'];
      const entry = {
        id: uid(),
        username,
        text,
        ts: Date.now(),
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: (Math.random() * 6 - 3).toFixed(1),
      };
      let list = lsGet('bf_comments', []);
      list.unshift(entry);
      if (list.length > MAX_COMMENTS) list = list.slice(0, MAX_COMMENTS);
      lsSet('bf_comments', list);
      localStorage.setItem('bf_last_comment', String(Date.now()));
      return entry;
    },
    async getPoll() {
      let poll = lsGet('bf_poll', null);
      if (!poll) {
        poll = {
          id: 'week-' + getWeekKey(),
          question: 'What game should BFtero stream next?',
          options: [
            { id: 'roblox', label: '🎮 Roblox', votes: 0 },
            { id: 'minecraft', label: '⛏️ Minecraft', votes: 0 },
            { id: 'spiderman', label: '🕷️ Spider-Man', votes: 0 },
            { id: 'gta', label: '🚗 GTA', votes: 0 },
          ],
          start: Date.now(),
          end: Date.now() + 7 * 24 * 3600 * 1000,
        };
        lsSet('bf_poll', poll);
      }
      // rollover weekly
      if (poll.id !== 'week-' + getWeekKey()) {
        const archive = lsGet('bf_poll_archive', []);
        archive.unshift(poll);
        lsSet('bf_poll_archive', archive.slice(0, 20));
        poll = {
          id: 'week-' + getWeekKey(),
          question: 'What game should BFtero stream next?',
          options: [
            { id: 'roblox', label: '🎮 Roblox', votes: 0 },
            { id: 'minecraft', label: '⛏️ Minecraft', votes: 0 },
            { id: 'spiderman', label: '🕷️ Spider-Man', votes: 0 },
            { id: 'gta', label: '🚗 GTA', votes: 0 },
          ],
          start: Date.now(),
          end: Date.now() + 7 * 24 * 3600 * 1000,
        };
        lsSet('bf_poll', poll);
        localStorage.removeItem('bf_voted_' + poll.id);
      }
      return poll;
    },
    async vote(optionId) {
      const poll = await Local.getPoll();
      const key = 'bf_voted_' + poll.id;
      if (localStorage.getItem(key)) throw new Error('You already voted this week');
      const opt = poll.options.find((o) => o.id === optionId);
      if (!opt) throw new Error('Invalid option');
      opt.votes += 1;
      lsSet('bf_poll', poll);
      localStorage.setItem(key, optionId);
      return poll;
    },
    hasVoted(pollId) {
      return localStorage.getItem('bf_voted_' + pollId) || null;
    },
  };

  function getWeekKey() {
    const d = new Date();
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
    return d.getFullYear() + '-W' + week;
  }

  const Store = {
    visitorId,
    sanitize,
    getPersonalBest() {
      return Number(localStorage.getItem('bf_personal_best') || 0);
    },
    getLastUsername() {
      return localStorage.getItem('bf_last_user') || '';
    },
    async getScores() {
      return Local.getScores();
    },
    async submitScore(username, score) {
      return Local.submitScore(username, score);
    },
    async getRank(username) {
      const scores = await Local.getScores();
      const i = scores.findIndex((x) => x.username.toLowerCase() === String(username).toLowerCase());
      return i >= 0 ? i + 1 : null;
    },
    async getComments() {
      return Local.getComments();
    },
    async postComment(username, text) {
      return Local.postComment(username, text);
    },
    async getPoll() {
      return Local.getPoll();
    },
    async vote(optionId) {
      return Local.vote(optionId);
    },
    hasVoted(pollId) {
      return Local.hasVoted(pollId);
    },
    async getStats() {
      const scores = await Local.getScores();
      const top = scores[0] ? scores[0].score : 0;
      const players = scores.length;
      return { topScore: top, players };
    },
  };

  global.BfteroStore = Store;
})(window);
