/* No-network communication.
   1. QR BURST  : screen-to-camera packets (message, location, full plan sync). Range ~1 m, silent.
   2. SONIC LINK: data-over-sound modem, speaker -> microphone, 16-tone FSK. Range ~3-8 m, through doors.
   3. LIGHT     : Morse code with the screen and the camera torch. Range: line of sight, hundreds of metres at night.
   Satellite messengers / LoRa mesh radios need extra hardware; packets are queued (store & forward) for them. */
(function () {
  const DR = window.DR;
  const cm = DR.comms = {};

  // ---------- packets ----------
  // DR1|type|from|time|lat,lng|payload     type: M message, L location, S SOS, P plan sync
  cm.packet = (type, text = '', withLoc = true) => {
    const s = DR.state, me = DR.person(s.me).name;
    const loc = withLoc ? `${s.pos[0].toFixed(5)},${s.pos[1].toFixed(5)}` : '';
    return ['DR1', type, me, Math.round(s.clock), loc, text.replace(/\|/g, '/')].join('|');
  };
  cm.planPacket = () => {
    const s = DR.state;
    const p = {
      rv: s.rendezvous ? [s.rendezvous.lat.toFixed(5), s.rendezvous.lng.toFixed(5), s.rendezvous.name] : null,
      th: s.threats.map(t => [t.type, +t.lat.toFixed(5), +t.lng.toFixed(5), Math.round(t.r), Math.round(t.ts)]),
      pl: Object.entries(s.places).slice(-25).map(([id, v]) => [id, v.stock, Math.round(v.seen)]),
      rt: s.route ? s.route.profile : null,
    };
    return cm.packet('P', JSON.stringify(p));
  };
  cm.receive = (raw, channel) => {
    const parts = String(raw).split('|');
    if (parts[0] === 'DRID') { DR.ui.onIdScanned(raw); return true; }
    if (parts[0] !== 'DR1' || parts.length < 6) { DR.ui.toast('Not a Dead Reckoning packet'); return false; }
    const [, type, from, ts, loc, ...rest] = parts;
    const text = rest.join('|');
    const s = DR.state;
    const ll = loc ? loc.split(',').map(Number) : null;
    if (ll && from !== DR.person(s.me).name) s.friend = { name: from, lat: ll[0], lng: ll[1], ts: +ts };
    if (type === 'P') {
      try {
        const p = JSON.parse(text);
        if (p.rv) s.rendezvous = { lat: +p.rv[0], lng: +p.rv[1], name: p.rv[2], by: from };
        for (const [type2, lat, lng, r, t] of p.th || []) {
          if (!s.threats.some(x => Math.abs(x.lat - lat) < 1e-4 && Math.abs(x.lng - lng) < 1e-4))
            s.threats.push({ id: DR.uid(), type: type2, lat, lng, r, vlat: 0, vlng: 0, ts: t, src: from });
        }
        for (const [id, stock, seen] of p.pl || []) {
          const cur = s.places[id];
          if (!cur || cur.seen < seen) s.places[id] = { stock, seen, by: from };
        }
      } catch (e) { DR.ui.toast('Plan packet damaged'); return false; }
      s.msgs.push({ id: DR.uid(), dir: 'in', ch: channel, from, text: `Plan synced: ${JSON.parse(text).th.length} threats, rendezvous, store updates`, ts: s.clock });
      DR.emit('threats'); DR.emit('places');
    } else {
      s.msgs.push({ id: DR.uid(), dir: 'in', ch: channel, from, text: type === 'L' ? 'Shared location' : text, ts: s.clock, loc: ll, sos: type === 'S' });
      if (type === 'S') DR.sentinel.alert('danger', `SOS from ${from}! Their location is on the map.`);
    }
    DR.emit('comms'); DR.emit('marks');
    DR.ui.toast(`📥 ${channel}: packet from ${from}`);
    if (navigator.vibrate && !s.silent) navigator.vibrate([60, 40, 60]);
    return true;
  };
  cm.logOut = (ch, text, sos) => {
    DR.state.msgs.push({ id: DR.uid(), dir: 'out', ch, from: DR.person(DR.state.me).name, text, ts: DR.state.clock, sos });
    DR.emit('comms');
  };

  // ---------- QR ----------
  cm.drawQR = (canvas, text) => {
    const qr = qrcode(0, 'L');
    qr.addData(unescape(encodeURIComponent(text)));
    qr.make();
    const n = qr.getModuleCount(), cell = Math.max(3, Math.floor(300 / n));
    canvas.width = canvas.height = n * cell;
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect(c * cell, r * cell, cell, cell);
  };
  let scanStream = null, scanRaf = 0;
  cm.startScan = async (video, onText) => {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = scanStream; await video.play();
    const det = 'BarcodeDetector' in window ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
    const cv = document.createElement('canvas'), g = cv.getContext('2d', { willReadFrequently: true });
    let lastText = null;
    const loop = async () => {
      if (!scanStream) return;
      if (video.readyState >= 2) {
        let text = null;
        if (det) { try { const r = await det.detect(video); if (r[0]) text = r[0].rawValue; } catch (e) {} }
        if (!text) {
          cv.width = video.videoWidth; cv.height = video.videoHeight;
          g.drawImage(video, 0, 0);
          const img = g.getImageData(0, 0, cv.width, cv.height);
          const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (r) text = r.data;
        }
        // onText returns true to keep scanning (multi-frame streams)
        if (text && text !== lastText) {
          lastText = text;
          let t = text; try { t = decodeURIComponent(escape(text)); } catch (e) {}
          if (!onText(t)) { cm.stopScan(); return; }
        }
      }
      scanRaf = requestAnimationFrame(loop);
    };
    loop();
  };
  cm.stopScan = () => { cancelAnimationFrame(scanRaf); if (scanStream) scanStream.getTracks().forEach(t => t.stop()); scanStream = null; };

  // ---------- SONIC LINK (data over sound) ----------
  const F0 = 1800, DF = 110, F_REP = 3600, F_START = 1400, F_END = 3850, SYM = 0.085;
  const toneFreqs = [...Array(16)].map((_, i) => F0 + i * DF).concat([F_REP, F_START, F_END]); // ids 0-15 data, 16 rep, 17 start, 18 end
  let actx = null;
  const ctx = () => (actx = actx || new (window.AudioContext || window.webkitAudioContext)());
  cm.sonicEncode = text => {
    const bytes = Array.from(new TextEncoder().encode(text)).slice(0, 96);
    const data = [bytes.length, ...bytes, bytes.reduce((a, b) => (a + b) & 255, 0)];
    const syms = [17];
    let last = 17;
    for (const b of data) for (const nib of [b >> 4, b & 15]) {
      const id = nib === last ? 16 : nib;
      syms.push(id); last = id === 16 ? -1 : nib;  // after REP the next equal nibble is sent as itself
    }
    syms.push(18);
    return syms;
  };
  cm.sonicSend = async text => {
    const ac = ctx(); await ac.resume();
    const syms = cm.sonicEncode(text);
    const osc = ac.createOscillator(), gain = ac.createGain();
    osc.type = 'sine'; osc.connect(gain); gain.connect(ac.destination);
    let t = ac.currentTime + 0.05;
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.6, t + 0.02);
    syms.forEach((s, i) => { osc.frequency.setValueAtTime(toneFreqs[s], t); t += s === 17 ? 0.32 : s === 18 ? 0.22 : SYM; });
    gain.gain.setValueAtTime(0.6, t); gain.gain.linearRampToValueAtTime(0, t + 0.03);
    osc.start(); osc.stop(t + 0.05);
    return new Promise(r => { osc.onended = r; });
  };
  cm.sonicDuration = text => 0.32 + 0.22 + (cm.sonicEncode(text).length - 2) * SYM;
  let listen = null;
  cm.sonicListen = async (onPacket, onLevel) => {
    const ac = ctx(); await ac.resume();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const src = ac.createMediaStreamSource(stream), an = ac.createAnalyser();
    an.fftSize = 4096; an.smoothingTimeConstant = 0; src.connect(an);
    const buf = new Float32Array(an.frequencyBinCount), hz = ac.sampleRate / an.fftSize;
    const bins = toneFreqs.map(f => Math.round(f / hz));
    let cand = -1, candN = 0, cur = -1, collecting = false, nibs = [], lastNib = -1, lastAt = 0;
    const finish = () => {
      collecting = false;
      const bytes = []; for (let i = 0; i + 1 < nibs.length; i += 2) bytes.push((nibs[i] << 4) | nibs[i + 1]);
      const n = bytes[0];
      if (bytes.length >= n + 2) {
        const body = bytes.slice(1, n + 1), sum = body.reduce((a, b) => (a + b) & 255, 0);
        if (sum === bytes[n + 1]) { onPacket(new TextDecoder().decode(new Uint8Array(body))); return; }
      }
      onPacket(null);
    };
    const timer = setInterval(() => {
      an.getFloatFrequencyData(buf);
      const mags = bins.map(b => Math.max(buf[b - 1], buf[b], buf[b + 1]));
      let best = 0; for (let i = 1; i < mags.length; i++) if (mags[i] > mags[best]) best = i;
      const sorted = mags.slice().sort((a, b) => b - a);
      const tone = mags[best] > -80 && mags[best] - sorted[1] > 9 ? best : -1;
      if (onLevel) onLevel(mags, tone);
      if (tone < 0) { candN = 0; return; }
      if (tone === cand) candN++; else { cand = tone; candN = 1; }
      if (candN !== 2 || tone === cur) return;   // need two consecutive reads, and a change
      cur = tone; lastAt = performance.now();
      if (tone === 17) { collecting = true; nibs = []; lastNib = -1; return; }
      if (!collecting) return;
      if (tone === 18) { finish(); return; }
      const nib = tone === 16 ? lastNib : tone;
      nibs.push(nib); lastNib = nib;
    }, 14);
    const watchdog = setInterval(() => { if (collecting && performance.now() - lastAt > 1500) { collecting = false; cur = -1; } }, 300);
    listen = { stop: () => { clearInterval(timer); clearInterval(watchdog); stream.getTracks().forEach(t => t.stop()); src.disconnect(); listen = null; } };
    return listen;
  };
  cm.sonicStop = () => listen && listen.stop();

  // ---------- LIGHT: Morse via screen + torch ----------
  const MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
    0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.' };
  cm.morse = text => text.toUpperCase().split('').map(c => c === ' ' ? '/' : MORSE[c] || '').join(' ');
  let torchTrack = null, strobeOn = false;
  const torch = async on => {
    try {
      if (!torchTrack && on) {
        const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        torchTrack = st.getVideoTracks()[0];
      }
      if (torchTrack) await torchTrack.applyConstraints({ advanced: [{ torch: on }] });
    } catch (e) { torchTrack = null; }
  };
  cm.strobe = async (text, el, loop = true) => {
    strobeOn = true;
    const U = 220, seq = [];
    for (const ch of cm.morse(text)) {
      if (ch === '.') seq.push([1, U], [0, U]);
      else if (ch === '-') seq.push([1, 3 * U], [0, U]);
      else if (ch === ' ') seq.push([0, 2 * U]);
      else if (ch === '/') seq.push([0, 4 * U]);
    }
    seq.push([0, 7 * U]);
    torch(false).catch(() => {});
    do {
      for (const [on, ms] of seq) {
        if (!strobeOn) break;
        el.classList.toggle('lit', !!on); torch(!!on);
        await new Promise(r => setTimeout(r, ms));
      }
    } while (loop && strobeOn);
    el.classList.remove('lit'); torch(false);
  };
  cm.stopStrobe = () => { strobeOn = false; if (torchTrack) { torchTrack.stop(); torchTrack = null; } };

  // ---------- loud siren (only when you WANT attention) ----------
  let siren = null;
  cm.siren = on => {
    if (!on) { if (siren) { siren.stop(); siren = null; } return; }
    const ac = ctx(); ac.resume();
    const o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = 900; lfo.frequency.value = 0.8; lg.gain.value = 350;
    lfo.connect(lg); lg.connect(o.frequency); o.connect(g); g.gain.value = 0.25; g.connect(ac.destination);
    o.start(); lfo.start();
    siren = { stop: () => { o.stop(); lfo.stop(); } };
  };

  // ---------- voice for SENTINEL (offline voices on most phones) ----------
  cm.say = text => {
    if (!DR.state.voice || DR.state.silent || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text.replace(/[^\w\s.,:'-]/g, ''));
    u.rate = 1.02; u.pitch = 0.9; u.volume = 0.8;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  };
})();
