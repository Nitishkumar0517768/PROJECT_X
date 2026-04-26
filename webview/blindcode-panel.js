/**
 * BlindCode Webview Script — v3
 * Display-only + Spatial Audio.
 * Mic is handled by system-level PowerShell process (not webview).
 */
(function () {
  const vscode = acquireVsCodeApi();

  // ─── State ────────────────────────────────────────────────────────
  let audioCtx = null;
  let volume = 0.6;

  const statusEl = document.getElementById('status');
  const micLabel = document.getElementById('mic-label');
  const transcriptEl = document.getElementById('transcript');
  const responseEl = document.getElementById('response');

  // ─── Audio Context (spatial audio tones) ──────────────────────────
  function getAudioContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playTone(frequency, stereo, duration, texture, vol) {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const panNode = ctx.createStereoPanner();

    switch (texture) {
      case 'error':
        osc.type = 'square';
        gainNode.gain.setValueAtTime(vol * 0.4, now);
        break;
      case 'warning':
        osc.type = 'triangle';
        gainNode.gain.setValueAtTime(vol * 0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);
        break;
      case 'comment':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency * 2, now);
        gainNode.gain.setValueAtTime(vol * 0.25, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.5);
        break;
      case 'function':
        osc.type = 'sine';
        gainNode.gain.setValueAtTime(vol * 0.5, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        break;
      case 'move':
        osc.type = 'sine';
        gainNode.gain.setValueAtTime(vol * 0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.03);
        break;
      default:
        osc.type = 'sine';
        gainNode.gain.setValueAtTime(vol * 0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);
    }

    if (texture !== 'comment') osc.frequency.setValueAtTime(frequency, now);
    panNode.pan.setValueAtTime(stereo, now);
    osc.connect(gainNode).connect(panNode).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  // ─── Message Handler ──────────────────────────────────────────────
  window.addEventListener('message', function (event) {
    const msg = event.data;
    switch (msg.type) {
      case 'playTone':
        playTone(msg.frequency, msg.stereo, msg.duration, msg.texture, msg.volume || volume);
        break;
      case 'speak':
        if (responseEl) responseEl.textContent = '🤖 ' + msg.text;
        break;
      case 'showTranscript':
        if (transcriptEl) transcriptEl.textContent = msg.text;
        break;
      case 'configure':
        if (msg.volume !== undefined) volume = msg.volume;
        break;
    }
  });

  // ─── Init ─────────────────────────────────────────────────────────
  if (statusEl) statusEl.textContent = 'Starting system mic...';
  if (micLabel) micLabel.textContent = 'System microphone loading...';
  vscode.postMessage({ type: 'ready' });
})();
