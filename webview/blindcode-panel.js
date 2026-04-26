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

  // ─── Audio Visualizer ─────────────────────────────────────────────
  const visualizerCanvas = document.getElementById('visualizer');
  let visualizerActive = false;
  let analyser = null;
  let dataArray = null;
  let canvasCtx = null;

  async function startVisualizer() {
    if (visualizerActive || !visualizerCanvas) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      
      // Force 16kHz sample rate for AssemblyAI
      const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      if (!audioCtx) audioCtx = ctx;

      const source = ctx.createMediaStreamSource(stream);
      
      // Visualizer
      analyser = ctx.createAnalyser();
      analyser.fftSize = 64; 
      source.connect(analyser);
      
      const bufferLength = analyser.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
      canvasCtx = visualizerCanvas.getContext('2d');
      visualizerCanvas.style.display = 'block';
      visualizerActive = true;
      
      drawVisualizer();

      // Audio Capture for AssemblyAI Streaming (PCM 16-bit)
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      source.connect(processor);
      processor.connect(ctx.destination);

      processor.onaudioprocess = (e) => {
        const float32Array = e.inputBuffer.getChannelData(0);
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
          let s = Math.max(-1, Math.min(1, float32Array[i]));
          int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Convert to Base64 string
        const buffer = new Uint8Array(int16Array.buffer);
        let binary = '';
        for (let i = 0; i < buffer.byteLength; i++) {
          binary += String.fromCharCode(buffer[i]);
        }
        const base64 = window.btoa(binary);
        
        vscode.postMessage({ type: 'audioStreamChunk', data: base64 });
      };

    } catch (err) {
      console.warn("[BlindCode] Could not start Web Audio visualizer/capture:", err);
    }
  }

  function drawVisualizer() {
    if (!visualizerActive) return;
    requestAnimationFrame(drawVisualizer);
    
    analyser.getByteFrequencyData(dataArray);
    
    // Clear canvas
    canvasCtx.fillStyle = '#1e1e1e';
    canvasCtx.fillRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
    
    const barWidth = (visualizerCanvas.width / dataArray.length) * 2.5;
    let barHeight;
    let x = 0;
    
    for (let i = 0; i < dataArray.length; i++) {
      // Scale height to fit canvas
      barHeight = (dataArray[i] / 255) * visualizerCanvas.height;
      
      // Dynamic color based on frequency/height
      canvasCtx.fillStyle = `rgb(${barHeight + 100}, 200, 100)`;
      canvasCtx.fillRect(x, visualizerCanvas.height - barHeight, barWidth, barHeight);
      
      x += barWidth + 1;
    }
  }

  // ─── Message Handler ──────────────────────────────────────────────
  const volumeBar = document.getElementById('volume-bar');
  const micIndicator = document.getElementById('mic-indicator');

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
      case 'showResponse':
        if (responseEl) responseEl.textContent = msg.text;
        break;
      case 'micReady':
        if (statusEl) statusEl.textContent = '🟢 Mic Active';
        if (micLabel) micLabel.textContent = '🎤 Listening — speak now!';
        if (micLabel) micLabel.style.color = '#4ec94e';
        if (micIndicator) micIndicator.classList.add('active');
        // Native mic is handled by backend, no startVisualizer() needed here
        break;
      case 'micLevel':
        if (volumeBar) {
          volumeBar.style.width = msg.level + '%';
          // Dim the bar if level is low, brighten if high
          volumeBar.style.opacity = 0.3 + (msg.level / 100) * 0.7;
        }
        break;
      case 'configure':
        if (msg.volume !== undefined) volume = msg.volume;
        break;
    }
  });

  // ─── Command Button Clicks ────────────────────────────────────────
  document.querySelectorAll('.bc-cmd-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const cmd = btn.getAttribute('data-cmd');
      if (cmd) {
        if (transcriptEl) transcriptEl.textContent = '🖱️ "' + cmd + '"';
        vscode.postMessage({ type: 'buttonCommand', command: cmd });
        // Visual feedback
        btn.style.transform = 'scale(0.95)';
        btn.style.opacity = '0.7';
        setTimeout(function () {
          btn.style.transform = '';
          btn.style.opacity = '';
        }, 200);
      }
    });
  });

  // ─── Init ─────────────────────────────────────────────────────────
  if (statusEl) statusEl.textContent = '⏳ Starting mic...';
  if (micLabel) micLabel.textContent = '🔄 System microphone loading...';
  vscode.postMessage({ type: 'ready' });
})();
