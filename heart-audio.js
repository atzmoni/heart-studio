// Music for the heart show. Two ways to follow the music:
//  - a loaded track is analysed in full before it plays (onsets, tempo, a beat grid that follows tempo drift, downbeats, energy,
//    drops and breakdowns), so the lights hit the beat exactly, with no detection delay, and the show can plan ahead;
//  - a microphone (or a track still being analysed) is followed live: onsets, kick, a phase-locked beat clock.
// Either way every frame gives the same features: beat phase, beat count, bar phase, bands, level, kick and onset envelopes.
// A MIDI clock from the DJ software, when one is running, drives the beat clock instead (24 ticks a beat, sample exact).
// Signal path: source -> input gain (sensitivity) -> beat analyser, and -> 8-channel splitter -> one high-resolution
// analyser per heart half, each fed by the input channel chosen for that half (or the mix), for the ring engine.

// ---------- FFT ----------
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], j = i + k + len / 2;
        const vr = re[j] * cr - im[j] * ci, vi = re[j] * ci + im[j] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[j] = ur - vr; im[j] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
const pause = () => new Promise(r => setTimeout(r, 0));
const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const pct = (a, p) => { const b = Float32Array.from(a).sort(); return b[Math.min(b.length - 1, Math.floor(p * b.length))] || 0; };

// ---------- offline analysis ----------
export async function analyzeTrack(buffer, onProgress = () => {}) {
  // Mono, down to ~22 kHz (enough for rhythm, twice as fast).
  const ch = buffer.numberOfChannels, len0 = buffer.length, sr0 = buffer.sampleRate, dec = sr0 >= 44100 ? 2 : 1;
  const sr = sr0 / dec, len = Math.floor(len0 / dec), x = new Float32Array(len);
  const data = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < len; i++) { let s = 0; for (let c = 0; c < ch; c++) for (let d = 0; d < dec; d++) s += data[c][i * dec + d]; x[i] = s / (ch * dec); }
  const N = 1024, hop = 256, frames = Math.max(1, Math.floor((len - N) / hop)), fps = sr / hop;
  const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  const binHz = sr / N, hiBin = Math.min(N / 2, Math.round(8000 / binHz)), bassBin = Math.max(2, Math.round(150 / binHz)), midBin = Math.round(2000 / binHz);
  const flux = new Float32Array(frames), bflux = new Float32Array(frames), rms = new Float32Array(frames);
  const bass = new Float32Array(frames), mid = new Float32Array(frames), high = new Float32Array(frames);
  let prev = new Float32Array(N / 2);
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let f = 0; f < frames; f++) {
    const o = f * hop; let e = 0;
    for (let i = 0; i < N; i++) { const v = x[o + i]; re[i] = v * win[i]; im[i] = 0; e += v * v; }
    rms[f] = Math.sqrt(e / N);
    fft(re, im);
    let fl = 0, bf = 0, b = 0, m = 0, h = 0;
    const cur = new Float32Array(N / 2);
    for (let k = 1; k < N / 2; k++) {
      const mag = Math.hypot(re[k], im[k]), lm = Math.log1p(100 * mag);
      cur[k] = lm;
      const dlt = lm - prev[k];
      if (k < hiBin && dlt > 0) fl += dlt;
      if (k <= bassBin) { if (dlt > 0) bf += dlt; b += mag; } else if (k < midBin) m += mag; else h += mag;
    }
    prev = cur; flux[f] = fl; bflux[f] = bf; bass[f] = b; mid[f] = m; high[f] = h;
    if (f % 2000 === 0) { onProgress(0.7 * f / frames); await pause(); }
  }
  // Onset strength: flux above its local average, divided by its spread.
  const W = Math.round(fps * 0.25), on = new Float32Array(frames);
  let acc = 0; const pre = new Float64Array(frames + 1);
  for (let i = 0; i < frames; i++) pre[i + 1] = pre[i] + flux[i];
  for (let i = 0; i < frames; i++) { const a = Math.max(0, i - W), b = Math.min(frames, i + W + 1); on[i] = Math.max(0, flux[i] - (pre[b] - pre[a]) / (b - a)); acc += on[i] * on[i]; }
  const sd = Math.sqrt(acc / frames) || 1; for (let i = 0; i < frames; i++) on[i] /= sd;
  onProgress(0.75); await pause();

  // Tempo: autocorrelation of the onset strength, weighted towards 120 BPM (log-Gaussian), between 60 and 200 BPM.
  const lagMin = Math.floor(fps * 60 / 200), lagMax = Math.ceil(fps * 60 / 60), ac = new Float32Array(lagMax + 2);
  for (let L = lagMin - 1; L <= lagMax + 1; L++) { let s = 0; for (let i = L; i < frames; i++) s += on[i] * on[i - L]; ac[L] = s / (frames - L); }
  let best = lagMin, bestV = -1;
  for (let L = lagMin; L <= lagMax; L++) {
    const bpm = 60 * fps / L, w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    if (ac[L] * w > bestV) { bestV = ac[L] * w; best = L; }
  }
  const y0 = ac[best - 1], y1 = ac[best], y2 = ac[best + 1], dd = y0 - 2 * y1 + y2;
  const period = best + (dd ? 0.5 * (y0 - y2) / dd : 0);
  const bpm = 60 * fps / period;
  onProgress(0.8); await pause();

  // Beat grid: dynamic programming (Ellis 2007) - each beat is an onset whose distance to the previous beat stays close to the period.
  const score = new Float32Array(frames), back = new Int32Array(frames).fill(-1), alpha = 400;
  for (let t = 0; t < frames; t++) {
    const a = Math.max(0, Math.floor(t - 2 * period)), b = Math.floor(t - period / 2);
    let m = 0, mi = -1;
    for (let tau = a; tau <= b; tau++) { const v = score[tau] - alpha * Math.pow(Math.log((t - tau) / period), 2); if (v > m || mi < 0) { m = v; mi = tau; } }
    score[t] = on[t] + (mi >= 0 ? Math.max(0, m) : 0); back[t] = mi >= 0 && m > 0 ? mi : -1;
  }
  let end = frames - 1, ev = -Infinity;
  for (let t = Math.max(0, Math.floor(frames - 2 * period)); t < frames; t++) if (score[t] > ev) { ev = score[t]; end = t; }
  const bf = []; for (let t = end; t >= 0; t = back[t]) { bf.push(t); if (back[t] < 0) break; }
  bf.reverse();
  // Extend the grid to the start of the track with the period, so the clock runs before the first detected beat.
  while (bf.length && bf[0] - period > 0) bf.unshift(bf[0] - period);
  // Dance music often has hats on the off-beat that out-shout the kick: if the kick sits between the grid's beats, shift by half.
  const near = (arr, f) => { let m = 0; for (let j = Math.max(0, Math.round(f) - 2); j <= Math.min(frames - 1, Math.round(f) + 2); j++) m = Math.max(m, arr[j]); return m; };
  let onB = 0, offB = 0;
  for (let i = 0; i + 1 < bf.length; i++) { onB += near(bflux, bf[i]); offB += near(bflux, (bf[i] + bf[i + 1]) / 2); }
  if (offB > onB * 1.25) for (let i = 0; i < bf.length; i++) bf[i] += (i + 1 < bf.length ? bf[i + 1] - bf[i] : period) / 2;
  const tOf = f => (f * hop + N / 2) / sr;
  const beats = bf.map(tOf);
  onProgress(0.9); await pause();

  // Downbeats: the beat phase (of 4) with the strongest kick.
  const ph = [0, 0, 0, 0];
  bf.forEach((f, i) => { const k = Math.round(f); for (let j = Math.max(0, k - 2); j <= Math.min(frames - 1, k + 2); j++) ph[i % 4] += bflux[j]; });
  const downbeat = ph.indexOf(Math.max(...ph));

  // Energy per beat, normalised to the loud part of the track.
  const eb = beats.map((t, i) => {
    const a = Math.floor(bf[i]), b = Math.max(a + 1, Math.floor(bf[i + 1] ?? bf[i] + period));
    let s = 0, c = 0; for (let f = a; f < Math.min(b, frames); f++) { s += rms[f]; c++; } return c ? s / c : 0;
  });
  const top = pct(eb, 0.95) || 1, energy = eb.map(v => Math.min(1, v / top));
  // Drops (energy jumps up at a bar) and breakdowns (falls away).
  const events = []; let last = -99;
  for (let i = downbeat; i < energy.length; i += 4) {
    if (i < 8 || i + 8 > energy.length) continue;
    const before = mean(energy.slice(i - 8, i)), after = mean(energy.slice(i, i + 8));
    if (i - last < 16) continue;
    if (after > 0.6 && after > before * 1.45) { events.push({ beat: i, t: beats[i], type: "drop" }); last = i; }
    else if (after < 0.45 && after < before * 0.6) { events.push({ beat: i, t: beats[i], type: "break" }); last = i; }
  }
  // Overview for the timeline: peaks and a smoothed loudness per pixel column.
  const cols = 1600, peaks = new Float32Array(cols), loud = new Float32Array(cols);
  for (let c = 0; c < cols; c++) {
    const a = Math.floor(c * len / cols), b = Math.floor((c + 1) * len / cols); let m = 0;
    for (let i = a; i < b; i += 4) m = Math.max(m, Math.abs(x[i]));
    peaks[c] = m;
    const fa = Math.floor(c * frames / cols), fb = Math.max(fa + 1, Math.floor((c + 1) * frames / cols));
    let s = 0; for (let f = fa; f < fb && f < frames; f++) s += rms[f]; loud[c] = s / (fb - fa);
  }
  const lt = pct(loud, 0.95) || 1; for (let c = 0; c < cols; c++) loud[c] = Math.min(1, loud[c] / lt);
  onProgress(1);
  return { duration: buffer.duration, bpm, beats, downbeat, energy, events, peaks, loud };
}

// Double or halve a beat grid when the tempo was caught at half or double speed.
export function regrid(a, factor) {
  const b = a.beats;
  if (factor === 2) { const out = []; b.forEach((t, i) => { out.push(t); if (i + 1 < b.length) out.push((t + b[i + 1]) / 2); }); return { ...a, beats: out, bpm: a.bpm * 2, downbeat: a.downbeat * 2, energy: out.map((_, i) => a.energy[i >> 1] ?? 0), events: a.events.map(e => ({ ...e, beat: e.beat * 2 })) }; }
  return { ...a, beats: b.filter((_, i) => i % 2 === 0), bpm: a.bpm / 2, downbeat: Math.floor(a.downbeat / 2), energy: a.energy.filter((_, i) => i % 2 === 0), events: a.events.map(e => ({ ...e, beat: Math.floor(e.beat / 2) })) };
}

// ---------- live ----------
const BANDS = 32;
export class Music {
  constructor() {
    this.ctx = null; this.an = null; this.sources = new WeakMap(); this.mic = null;
    this.el = null;               // media element now driving the music (audio or a video with its own soundtrack)
    this.analysis = null;         // beat grid of the loaded track
    this.offset = 0;              // seconds the lights run ahead of the sound (projector / sound system latency)
    this.mode = "none";           // "file" | "mic" | "none"
    this.spec = new Float32Array(BANDS); this.peakDb = new Float32Array(BANDS).fill(-60);
    this.kick = 0; this.hit = 0; this.level = 0; this.levelS = 0; this.levPeak = 0.05;
    this.bass = 0; this.mid = 0; this.high = 0;
    this.fluxHist = []; this.bassHist = []; this.lastOn = 0; this.lastKick = 0; this.kicks = [];
    this.period = 0.5; this.anchor = performance.now() / 1000; this.taps = []; this.lockBpm = false;
    this.mt = { media: 0, perf: 0 };
    this.routes = [-1, -1];       // input channel feeding each half's analyser (-1 = mix of all)
    this.inChannels = 2; this.deviceId = "";
    this.clock = { n: 0, last: 0, period: 0, on: false };   // MIDI clock
  }
  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: "interactive" });
    this.an = this.ctx.createAnalyser(); this.an.fftSize = 2048; this.an.smoothingTimeConstant = 0.55;
    this.input = this.ctx.createGain(); this.input.connect(this.an); this.setGain(this.gainDb || 0);
    this.split = this.ctx.createChannelSplitter(8); this.split.channelInterpretation = "discrete"; this.input.connect(this.split);
    // 16384-point analysers: 2.9 Hz bins at 48 kHz, fine enough to tell neighbouring semitones apart down to the bass.
    this.anS = [0, 1].map(() => { const a = this.ctx.createAnalyser(); a.fftSize = 16384; a.smoothingTimeConstant = 0; a.minDecibels = -130; a.maxDecibels = 0; return a; });
    this.routes.forEach((c, s) => this.connectHalf(s, c));
    this.freq = new Float32Array(this.an.frequencyBinCount); this.prevMag = new Float32Array(this.an.frequencyBinCount); this.td = new Float32Array(this.an.fftSize);
    const ny = this.ctx.sampleRate / 2, n = this.an.frequencyBinCount;
    this.edges = Array.from({ length: BANDS + 1 }, (_, i) => Math.max(1, Math.min(n - 1, Math.round(30 * Math.pow(16000 / 30, i / BANDS) / ny * n))));
    return this.ctx;
  }
  // Route a media element through the analyser and on to the speakers. A media element can only be wrapped once.
  attach(el) {
    this.ensure();
    if (this.micSrc) { this.micSrc.disconnect(); this.mic?.getTracks().forEach(t => t.stop()); this.micSrc = null; this.mic = null; }
    if (this.el && this.el !== el) this.sources.get(this.el)?.disconnect();
    let src = this.sources.get(el);
    if (!src) { src = this.ctx.createMediaElementSource(el); this.sources.set(el, src); }
    src.disconnect(); src.connect(this.input); src.connect(this.ctx.destination);
    this.el = el; this.mode = "file";
  }
  async analyse(file, onProgress) {
    this.ensure();
    const buf = await this.ctx.decodeAudioData(await file.arrayBuffer());
    this.analysis = await analyzeTrack(buf, onProgress);
    return this.analysis;
  }
  // Live input: the built-in microphone or a cable into a sound card (line in from the DJ mixer). All its channels come in raw.
  async useMic(deviceId = this.deviceId) {
    this.ensure();
    if (this.el) { this.el.pause(); this.sources.get(this.el)?.disconnect(); }
    if (this.micSrc) { this.micSrc.disconnect(); this.mic?.getTracks().forEach(t => t.stop()); }
    const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 8 } };
    if (deviceId) audio.deviceId = { exact: deviceId };
    this.mic = await navigator.mediaDevices.getUserMedia({ audio });
    this.deviceId = deviceId;
    this.inChannels = this.mic.getAudioTracks()[0]?.getSettings().channelCount || 2;
    this.micSrc = this.ctx.createMediaStreamSource(this.mic);
    this.micSrc.channelInterpretation = "discrete";
    this.micSrc.connect(this.input);
    this.el = null; this.mode = "mic"; this.analysis = null;
  }
  async inputs() {
    const d = await navigator.mediaDevices?.enumerateDevices?.() || [];
    return d.filter(x => x.kind === "audioinput").map(x => ({ id: x.deviceId, name: x.label || "כניסת קול" }));
  }
  setGain(db) { this.gainDb = db; if (this.input) this.input.gain.value = Math.pow(10, db / 20); }
  connectHalf(side, ch) {
    this.routes[side] = ch;
    if (!this.ctx) return;
    const a = this.anS[side];
    try { this.input.disconnect(a); } catch {}
    for (let o = 0; o < 8; o++) try { this.split.disconnect(a, o); } catch {}
    if (ch < 0) this.input.connect(a); else this.split.connect(a, ch);
  }

  // MIDI clock: 24 ticks a beat; Start resets to the first beat of a bar.
  clockTick(now) {
    const c = this.clock;
    if (c.last) { const d = now - c.last; if (d > 0.002 && d < 0.1) c.period = c.period ? c.period + (d - c.period) * 0.1 : d; }
    c.last = now; c.n++; c.on = true;
  }
  clockStart(now) { Object.assign(this.clock, { n: 0, last: now, on: true }); }
  clockStop() { this.clock.on = false; }
  resume() { return this.ctx?.state === "suspended" ? this.ctx.resume() : undefined; }

  // Smooth media clock: currentTime moves in coarse steps, so interpolate between them with the performance clock.
  time(now) {
    const el = this.el; if (!el) return 0;
    const ct = el.currentTime;
    if (el.paused) { this.mt = { media: ct, perf: now }; return ct; }
    const guess = this.mt.media + (now - this.mt.perf) * el.playbackRate;
    if (Math.abs(guess - ct) > 0.05 || ct < this.mt.media) this.mt = { media: ct, perf: now };
    else if (ct !== this.mt.lastCt) { this.mt = { media: guess + (ct - guess) * 0.1, perf: now }; }
    this.mt.lastCt = ct;
    return this.mt.media + (now - this.mt.perf) * el.playbackRate;
  }

  tap(now = performance.now() / 1000) {
    this.taps = this.taps.filter(t => now - t < 3).concat(now);
    if (this.taps.length >= 3) { const d = this.taps.slice(1).map((t, i) => t - this.taps[i]); this.period = mean(d); this.anchor = now; this.lockBpm = true; }
    else this.anchor = now;
  }

  // Everything the renderer needs for this frame.
  frame(nowMs) {
    const now = nowMs / 1000, out = { spec: this.spec };
    if (this.an) this.listen(now);
    out.kick = this.kick; out.hit = this.hit; out.bass = this.bass; out.mid = this.mid; out.high = this.high; out.level = this.level; out.levelS = this.levelS;
    const a = this.analysis, ck = this.clock;
    if (ck.on && ck.period && now - ck.last < 0.5) {
      const ticks = ck.n - 1 + Math.min(1, (now - ck.last) / ck.period), k = Math.floor(ticks / 24);
      out.beatN = k; out.beat = ticks / 24 - k; out.bpm = 60 / (ck.period * 24); out.t = this.el ? this.time(now) : now;
      out.grid = false; out.clock = true; out.energy = this.levelS; out.barBeat = ((k % 4) + 4) % 4;
    } else if (a && this.mode === "file" && this.el && a.beats.length > 1) {
      const t = this.time(now) + this.offset, b = a.beats, n = b.length;
      let lo = 0, hi = n - 1;
      if (t < b[0]) { const p = b[1] - b[0], k = Math.floor((t - b[0]) / p); out.beatN = k; out.beat = (t - b[0]) / p - k; }
      else if (t >= b[n - 1]) { const p = b[n - 1] - b[n - 2], k = Math.floor((t - b[n - 1]) / p); out.beatN = n - 1 + k; out.beat = (t - b[n - 1]) / p - k; }
      else { while (hi - lo > 1) { const m = (lo + hi) >> 1; if (b[m] <= t) lo = m; else hi = m; } out.beatN = lo; out.beat = (t - b[lo]) / (b[lo + 1] - b[lo]); }
      out.bpm = 60 / ((b[Math.min(n - 1, Math.max(1, out.beatN + 1))] - b[Math.min(n - 2, Math.max(0, out.beatN))]) || 0.5);
      out.t = t; out.grid = true;
      out.energy = a.energy[Math.max(0, Math.min(n - 1, out.beatN))] ?? this.levelS;
      out.barBeat = ((out.beatN - a.downbeat) % 4 + 4) % 4;
    } else {
      const x = (now - this.anchor) / this.period, k = Math.floor(x);
      out.beatN = k; out.beat = x - k; out.bpm = 60 / this.period; out.t = this.el ? this.time(now) : now; out.grid = false;
      out.energy = this.levelS; out.barBeat = ((k % 4) + 4) % 4;
    }
    out.bar = (out.barBeat + out.beat) / 4;
    return out;
  }

  listen(now) {
    const an = this.an; an.getFloatFrequencyData(this.freq); an.getFloatTimeDomainData(this.td);
    const f = this.freq, n = f.length, E = this.edges;
    // Bands with a slow per-band peak follower, so quiet and loud tracks both fill the range.
    let fl = 0, bfl = 0;
    const bassTop = E[Math.round(BANDS * 0.18)];
    for (let k = 1; k < n; k++) {
      const mag = Math.pow(10, Math.max(-100, f[k]) / 20), d = mag - this.prevMag[k];
      if (d > 0) { fl += d; if (k <= bassTop) bfl += d; }
      this.prevMag[k] = mag;
    }
    for (let b = 0; b < BANDS; b++) {
      let s = -Infinity; for (let k = E[b]; k <= Math.max(E[b], E[b + 1] - 1); k++) s = Math.max(s, f[k]);
      if (!isFinite(s)) s = -100;
      this.peakDb[b] = Math.max(s, this.peakDb[b] - 0.03, -70);
      const v = Math.max(0, Math.min(1, (s - (this.peakDb[b] - 42)) / 42));
      this.spec[b] = this.spec[b] * 0.4 + v * 0.6;
    }
    const avg = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += this.spec[i]; return s / (b - a); };
    this.bass = avg(0, 6); this.mid = avg(6, 20); this.high = avg(20, BANDS);
    let e = 0; for (let i = 0; i < this.td.length; i++) e += this.td[i] * this.td[i];
    const rms = Math.sqrt(e / this.td.length);
    this.levPeak = Math.max(rms, this.levPeak * 0.9995, 0.02);
    this.level = Math.min(1, rms / this.levPeak);
    this.levelS += (this.level - this.levelS) * (this.level > this.levelS ? 0.08 : 0.02);
    // Onsets: flux above mean + 1.5 sd of the last second.
    const H = this.fluxHist, B = this.bassHist; H.push(fl); B.push(bfl); if (H.length > 60) H.shift(); if (B.length > 60) B.shift();
    const th = (h, k) => { const m = mean(h), sd = Math.sqrt(mean(h.map(v => (v - m) ** 2))); return m + k * sd; };
    this.hit *= 0.86; this.kick *= 0.85;
    if (H.length > 20 && fl > th(H, 1.5) && now - this.lastOn > 0.11) { this.hit = 1; this.lastOn = now; }
    if (B.length > 20 && bfl > th(B, 1.6) && bfl > 1e-4 && now - this.lastKick > 0.24) { this.kick = 1; this.lastKick = now; this.onKick(now); }
  }

  // Live beat clock: tempo from the spacing of kicks, phase pulled towards each kick that lands near a predicted beat.
  onKick(now) {
    if (this.mode === "file" && this.analysis) return;
    this.kicks = this.kicks.filter(t => now - t < 10).concat(now);
    if (!this.lockBpm && this.kicks.length > 6) {
      const hist = new Map();
      for (let i = 1; i < this.kicks.length; i++) for (let j = Math.max(0, i - 4); j < i; j++) {
        let d = this.kicks[i] - this.kicks[j]; while (d > 0.75) d /= 2; while (d < 0.3) d *= 2;   // fold to 80..200 BPM
        const key = Math.round(d * 100); hist.set(key, (hist.get(key) || 0) + 1);
      }
      let bk = 50, bv = 0; for (const [k, v] of hist) { const s = v + (hist.get(k - 1) || 0) * 0.5 + (hist.get(k + 1) || 0) * 0.5; if (s > bv) { bv = s; bk = k; } }
      this.period += (bk / 100 - this.period) * 0.25;
    }
    const x = (now - this.anchor) / this.period, err = x - Math.round(x);
    if (Math.abs(err) < 0.25) this.anchor += err * this.period * 0.3;
  }
}
