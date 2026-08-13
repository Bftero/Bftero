/**
 * BFTERO REACTION CHALLENGE — modular mini-game
 * Swap this file later to replace the game without rebuilding the site.
 */
(function (global) {
  const CFG = {
    roundMs: 45000,
    startSize: 72,
    minSize: 28,
    startTimeToHit: 1600,
    minTimeToHit: 550,
  };

  function createGame(root, opts) {
    const onScore = opts.onScore || (() => {});
    const onEnd = opts.onEnd || (() => {});
    let score = 0;
    let best = Number(localStorage.getItem('bf_personal_best') || 0);
    let running = false;
    let muted = localStorage.getItem('bf_mute') === '1';
    let targetEl = null;
    let hitTimer = null;
    let endTimer = null;
    let roundStart = 0;
    let audioCtx = null;

    const ui = {
      stage: root.querySelector('[data-stage]'),
      score: root.querySelector('[data-score]'),
      best: root.querySelector('[data-best]'),
      timer: root.querySelector('[data-timer]'),
      overlay: root.querySelector('[data-overlay]'),
      countdown: root.querySelector('[data-countdown]'),
      result: root.querySelector('[data-result]'),
      finalScore: root.querySelector('[data-final-score]'),
      finalBest: root.querySelector('[data-final-best]'),
      muteBtn: root.querySelector('[data-mute]'),
    };

    function beep(freq, dur, type) {
      if (muted) return;
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = type || 'square';
        o.frequency.value = freq;
        g.gain.value = 0.04;
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start();
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        o.stop(audioCtx.currentTime + dur);
      } catch (_) {}
    }

    function difficulty() {
      const t = Math.min(score / 40, 1);
      const size = CFG.startSize - (CFG.startSize - CFG.minSize) * t;
      const ttl = CFG.startTimeToHit - (CFG.startTimeToHit - CFG.minTimeToHit) * t;
      return { size, ttl };
    }

    function clearTarget() {
      if (hitTimer) clearTimeout(hitTimer);
      hitTimer = null;
      if (targetEl) {
        targetEl.remove();
        targetEl = null;
      }
    }

    function spawn() {
      if (!running) return;
      clearTarget();
      const { size, ttl } = difficulty();
      const stage = ui.stage;
      const rect = stage.getBoundingClientRect();
      const pad = size + 8;
      const x = Math.random() * Math.max(rect.width - pad, 10) + 4;
      const y = Math.random() * Math.max(rect.height - pad, 10) + 4;

      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'rx-target';
      el.setAttribute('aria-label', 'Hit target');
      el.style.width = size + 'px';
      el.style.height = size + 'px';
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.innerHTML = '<span></span>';
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        hit();
      });
      stage.appendChild(el);
      targetEl = el;

      hitTimer = setTimeout(() => {
        miss();
      }, ttl);
    }

    function hit() {
      if (!running) return;
      score += 1;
      ui.score.textContent = score;
      onScore(score);
      beep(880, 0.08, 'square');
      clearTarget();
      requestAnimationFrame(spawn);
    }

    function miss() {
      if (!running) return;
      beep(180, 0.12, 'sawtooth');
      clearTarget();
      // small penalty: brief flash then continue
      ui.stage.classList.add('rx-miss');
      setTimeout(() => ui.stage.classList.remove('rx-miss'), 120);
      spawn();
    }

    function tickTimer() {
      if (!running) return;
      const left = Math.max(0, CFG.roundMs - (Date.now() - roundStart));
      ui.timer.textContent = (left / 1000).toFixed(1) + 's';
      if (left <= 0) finish();
      else requestAnimationFrame(tickTimer);
    }

    function finish() {
      running = false;
      clearTarget();
      if (endTimer) clearTimeout(endTimer);
      if (score > best) {
        best = score;
        localStorage.setItem('bf_personal_best', String(best));
      }
      ui.best.textContent = best;
      ui.finalScore.textContent = score;
      ui.finalBest.textContent = best;
      ui.overlay.classList.add('show');
      ui.result.hidden = false;
      ui.countdown.hidden = true;
      beep(520, 0.15);
      setTimeout(() => beep(660, 0.2), 120);
      onEnd(score, best);
    }

    function countdownThenStart() {
      ui.overlay.classList.add('show');
      ui.result.hidden = true;
      ui.countdown.hidden = false;
      let n = 3;
      ui.countdown.textContent = '3';
      beep(400, 0.1);
      const iv = setInterval(() => {
        n -= 1;
        if (n > 0) {
          ui.countdown.textContent = String(n);
          beep(400, 0.1);
        } else if (n === 0) {
          ui.countdown.textContent = 'GO!';
          beep(700, 0.15);
        } else {
          clearInterval(iv);
          ui.overlay.classList.remove('show');
          startRound();
        }
      }, 700);
    }

    function startRound() {
      score = 0;
      ui.score.textContent = '0';
      ui.best.textContent = best;
      running = true;
      roundStart = Date.now();
      endTimer = setTimeout(finish, CFG.roundMs);
      tickTimer();
      spawn();
    }

    function restart() {
      clearTarget();
      if (endTimer) clearTimeout(endTimer);
      running = false;
      countdownThenStart();
    }

    if (ui.muteBtn) {
      ui.muteBtn.textContent = muted ? '🔇' : '🔊';
      ui.muteBtn.addEventListener('click', () => {
        muted = !muted;
        localStorage.setItem('bf_mute', muted ? '1' : '0');
        ui.muteBtn.textContent = muted ? '🔇' : '🔊';
      });
    }

    return {
      play: countdownThenStart,
      restart,
      getScore: () => score,
      getBest: () => best,
    };
  }

  global.BfteroGame = { createGame };
})(window);
