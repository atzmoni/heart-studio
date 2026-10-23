// Sound-reactive engine, built like a TouchDesigner audio chain:
//   Audio Device In -> Audio Filter (one band per channel) -> Analyze -> Math (gain, range, curve) -> Lag (attack / release)
//   -> Trigger -> Export.
// Each channel is a frequency band of one input (the mix, or one channel of a multi-channel sound card) and has two outputs:
//   env  - the band's level, 0..1, after gain, noise gate, dynamic range, curve and attack / release;
//   trig - a pulse on every onset of the band (or every time it crosses a threshold), with its own hold and decay.
// Exports send channels to the inputs every effect reads (kick, hit, bass, mid, high, level, spectrum), modulations send them
// to show parameters (brightness, hue, speed...), and each layer of the layer stack can be driven by a channel of its own.

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const FFT = 4096;   // 11.7 Hz bins at 48 kHz: enough to keep a kick band (40-120 Hz) apart from the bass line

export const COLORS = ["#ff4f7b", "#ffb347", "#f2e35c", "#7cf29c", "#35d0ba", "#5fb6ff", "#a98bff", "#ff8ce0", "#e6ebf2", "#ff7a5c", "#9cff7a", "#7ad3ff"];
export const TRIG = { off: "בלי טריגר", onset: "התקפה (Onset)", level: "חציית סף" };
export const OUTS = { env: "עוצמה (env)", trig: "פולס (trig)" };
// The inputs every effect already reads, in the order of the export table.
export const EXPORTS = { kick: "קיק · פולס ראשי", hit: "מכה · פולס משני", bass: "בס", mid: "אמצע", high: "גבוהים", level: "עוצמה כללית" };
// Show parameters a channel can move. add: base + depth x value; mul: base x (1 - depth + depth x value), so depth 100% means
// the parameter only opens with the music.
export const TARGETS = {
  master: { name: "בהירות", kind: "mul" }, intensity: { name: "עוצמת תגובה", kind: "add", span: 100 },
  hue: { name: "גוון", kind: "add", span: 180 }, speed: { name: "מהירות", kind: "add", span: 200 },
  outline: { name: "קונטור לבן", kind: "add", span: 100 }, vidmix: { name: "וידאו על הלב", kind: "add", span: 100 },
  engmix: { name: "מנוע הטבעות מעל", kind: "add", span: 100 },
};
// The trance reading, offered next to the channels wherever a channel can be picked.
export const TRANCE = { breath: "נשימה · עוצמה איטית", pump: "טראנס · פאמפ", build: "טראנס · בילדאפ", drop: "טראנס · דרופ", brk: "טראנס · ברייקדאון" };
export const BLENDS = { screen: "Screen · מאיר", add: "Add · חיבור", lighten: "Max · הבהיר מביניהם", over: "Over · מעל", multiply: "Multiply · מכפיל", subtract: "Subtract · מחסר" };
export const MASKS = { all: "כל הלב", grooves: "תעלות בלבד", hearts: "לבבות בלבד", contour: "קונטור", left: "חצי שמאל", right: "חצי ימין", inner: "חצי פנימי", outer: "חצי חיצוני", seam: "תפר",
  partsEven: "חלקים זוגיים", partsOdd: "חלקים אי-זוגיים", partsIn: "חלקים במרכז", partsOut: "חלקים בחוץ" };   // the parts: elements of separate parts
export const MASK_ID = Object.fromEntries(Object.keys(MASKS).map((k, i) => [k, i]));

const ch = (id, name, lo, hi, o = {}) => ({ id, name, lo, hi, src: -1, gain: 0, auto: true, range: 24, gate: -100, curve: 1.2,
  attack: 10, release: 160, trig: "off", sens: 60, tlevel: 60, hold: 140, decay: 220, min: 0, max: 100, inv: false, mute: false, ...o });
const on = o => ({ trig: "onset", attack: 0, release: 120, curve: 1.5, ...o });
export const PRESETS = {
  dj: { name: "DJ · 8 ערוצים", ch: [
    ch("kick", "קיק", 40, 120, on({ range: 18, hold: 220 })), ch("bass", "בס", 60, 250), ch("lowmid", "גוף", 250, 800),
    ch("snare", "סנר / קלאפ", 1800, 5000, on({ range: 20, hold: 160 })), ch("mid", "אמצע / קול", 800, 2500),
    ch("hats", "היי-האט", 7000, 16000, on({ range: 18, hold: 70, decay: 120, sens: 55 })), ch("air", "אוויר", 4000, 16000),
    ch("level", "עוצמה", 30, 16000, { range: 30, release: 400, curve: 1 }),
  ], exp: { kick: ["kick", "trig"], hit: ["snare", "trig"], bass: ["bass", "env"], mid: ["mid", "env"], high: ["air", "env"], level: ["level", "env"] } },
  b3: { name: "3 פסים", ch: [
    ch("low", "נמוכים", 20, 250, { trig: "onset", hold: 200 }), ch("mid", "אמצע", 250, 4000), ch("high", "גבוהים", 4000, 16000, { trig: "onset", hold: 90 }),
  ], exp: { kick: ["low", "trig"], hit: ["high", "trig"], bass: ["low", "env"], mid: ["mid", "env"], high: ["high", "env"], level: ["mid", "env"] } },
  b5: { name: "5 פסים", ch: [
    ch("sub", "סאב", 20, 60), ch("bass", "בס", 60, 250, { trig: "onset", hold: 200 }), ch("mid", "אמצע", 250, 2000),
    ch("pres", "נוכחות", 2000, 6000, { trig: "onset", hold: 120 }), ch("bril", "ברק", 6000, 16000),
  ], exp: { kick: ["bass", "trig"], hit: ["pres", "trig"], bass: ["bass", "env"], mid: ["mid", "env"], high: ["bril", "env"], level: ["mid", "env"] } },
  voice: { name: "קול ושירה", ch: [
    ch("kick", "קיק", 40, 120, on({ hold: 220 })), ch("bass", "בס", 60, 250), ch("voice", "קול", 300, 3400, { range: 20, attack: 40, release: 300 }),
    ch("sib", "שורקות (ס/ש)", 5000, 9000, on({ hold: 120 })), ch("level", "עוצמה", 30, 16000, { range: 30, release: 400, curve: 1 }),
  ], exp: { kick: ["kick", "trig"], hit: ["sib", "trig"], bass: ["bass", "env"], mid: ["voice", "env"], high: ["sib", "env"], level: ["voice", "env"] } },
  stereo: { name: "כבל · ערוץ לכל צד", ch: [
    ch("lk", "שמאל · קיק", 40, 120, on({ src: 0, hold: 220 })), ch("lv", "שמאל · עוצמה", 30, 16000, { src: 0, range: 30 }),
    ch("rk", "ימין · קיק", 40, 120, on({ src: 1, hold: 220 })), ch("rv", "ימין · עוצמה", 30, 16000, { src: 1, range: 30 }),
    ch("hi", "גבוהים", 4000, 16000, { trig: "onset", hold: 90 }),
  ], exp: { kick: ["lk", "trig"], hit: ["rk", "trig"], bass: ["lv", "env"], mid: ["rv", "env"], high: ["hi", "env"], level: ["lv", "env"] } },
};

export function defaults() {
  const p = PRESETS.dj;
  return {
    on: true, boost: 150, punch: 50, speed: 50, preset: "dj", sel: p.ch[0].id,
    ch: p.ch.map(c => ({ ...c })),
    exp: Object.fromEntries(Object.entries(p.exp).map(([k, [id, out]]) => [k, { ch: id, out, amt: 100 }])),
    spec: { gain: 120, floor: 10, curve: 130 },
    mods: [{ tgt: "master", ch: "breath", out: "env", depth: 30 }],
    layers: [
      { on: false, fx: 23, blend: "screen", op: 80, mask: "all", drive: "kick", depth: 100, out: "trig" },
      { on: false, fx: 13, blend: "add", op: 60, mask: "grooves", drive: "hats", depth: 100, out: "trig" },
      { on: false, fx: 9, blend: "lighten", op: 70, mask: "contour", drive: "snare", depth: 0, out: "env" },
    ],
  };
}

export class React {
  constructor(music) {
    this.music = music; this.o = defaults(); this.st = new Map(); this.an = new Map(); this.last = 0; this.levelS = 0;
    this.n = 0;   // new channel ids
  }
  // Settings saved by an older or newer version: fill in what is missing, drop what is broken.
  load(saved) {
    const d = defaults(), o = { ...d, ...(saved || {}) };
    o.ch = Array.isArray(o.ch) && o.ch.length ? o.ch.map(c => ({ ...ch("x", "", 20, 20000), ...c })) : d.ch;
    o.exp = { ...d.exp, ...(o.exp || {}) }; o.spec = { ...d.spec, ...(o.spec || {}) };
    o.mods = Array.isArray(o.mods) ? o.mods : d.mods;
    o.layers = d.layers.map((l, i) => ({ ...l, ...(o.layers?.[i] || {}) }));
    if (!o.ch.some(c => c.id === o.sel)) o.sel = o.ch[0].id;
    this.o = o; return o;
  }
  preset(key) {
    const p = PRESETS[key]; if (!p) return;
    this.o.preset = key; this.o.ch = p.ch.map(c => ({ ...c })); this.o.sel = p.ch[0].id;
    for (const [k, [id, out]] of Object.entries(p.exp)) this.o.exp[k] = { ...this.o.exp[k], ch: id, out };
    this.st.clear();
  }
  add() {
    const s = this.chan(this.o.sel) || this.o.ch[0];
    let id; do id = "c" + ++this.n; while (this.o.ch.some(c => c.id === id));
    const c = { ...(s || ch(id, "", 100, 1000)), id, name: (s?.name || "ערוץ") + " 2", mute: false };
    this.o.ch.push(c); this.o.sel = id; return c;
  }
  remove(id) {
    if (this.o.ch.length < 2) return;
    this.o.ch = this.o.ch.filter(c => c.id !== id); this.st.delete(id);
    if (this.o.sel === id) this.o.sel = this.o.ch[0].id;
  }
  chan(id) { return this.o.ch.find(c => c.id === id); }
  has(id) { return id in TRANCE || !!this.chan(id); }
  color(id) { const i = this.o.ch.findIndex(c => c.id === id); return COLORS[(i < 0 ? 0 : i) % COLORS.length]; }

  // One analyser per input: the mix, or a channel of the sound card through the music's splitter. Made when first needed,
  // and kept: the music routes every source (track, video, microphone, cable) through the same input node.
  analyser(src) {
    const m = this.music; if (!m.ctx || !m.input) return null;
    let a = this.an.get(src); if (a) return a;
    a = m.ctx.createAnalyser(); a.fftSize = FFT; a.smoothingTimeConstant = 0; a.minDecibels = -140; a.maxDecibels = 0;
    if (src < 0) m.input.connect(a); else m.split.connect(a, Math.min(7, src));
    a.buf = new Float32Array(a.frequencyBinCount); a.t = -1;
    this.an.set(src, a); return a;
  }
  // The latest spectrum of the mix in dB, for the spectrum view.
  spectrum() { const a = this.an.get(-1); return a && a.t >= 0 ? { buf: a.buf, hz: this.music.ctx.sampleRate / FFT } : null; }

  // Mean power of a band of one input, in dB (null before there is any sound path). Each analyser is read once a frame.
  band(src, lo, hi, nowMs) {
    const a = this.analyser(src); if (!a) return null;
    if (a.t !== nowMs) { a.getFloatFrequencyData(a.buf); a.t = nowMs; }
    const n = a.buf.length, hz = this.music.ctx.sampleRate / FFT, l = Math.min(lo, hi), h = Math.max(lo, hi);
    const k0 = clamp(Math.floor(l / hz), 1, n - 1), k1 = clamp(Math.ceil(h / hz), k0, n - 1);
    let p = 0; for (let k = k0; k <= k1; k++) p += Math.pow(10, Math.max(-140, a.buf[k]) / 10);
    return 10 * Math.log10(p / (k1 - k0 + 1) + 1e-14);
  }
  update(nowMs) {
    const now = nowMs / 1000, dt = clamp(now - (this.last || now), 0, 0.1); this.last = now;
    // The two simple controls scale every channel: punch narrows the dynamic range, speed shortens release and decay.
    const rangeK = Math.pow(2, (50 - this.o.punch) / 30), timeK = Math.pow(2, (50 - this.o.speed) / 25);
    for (const c of this.o.ch) {
      const s = this.st.get(c.id) || { db: -140, v: 0, env: 0, trig: 0, peak: -60, slow: 0, lastT: -9, armed: true, fired: 0, raw: 0 };
      this.st.set(c.id, s);
      const raw = this.band(c.src, c.lo, c.hi, nowMs);
      if (raw == null) { s.v = s.env = s.trig = 0; continue; }
      const db = raw + c.gain;
      s.db = db;
      // Math: the dynamic range is a window of `range` dB. Auto: its top follows the band's recent peak (falls 4 dB a second),
      // so quiet and loud songs both fill 0..1. Manual: the window starts at the noise gate.
      const range = Math.max(3, c.range * rangeK);
      s.peak = Math.max(db, s.peak - 4 * dt, c.gate + range);
      const top = c.auto ? s.peak : c.gate + range, floor = top - range;
      let v = db < c.gate ? 0 : clamp((db - floor) / range);
      v = Math.pow(v, Math.max(0.1, c.curve));
      if (c.inv) v = 1 - v;
      s.raw = v;
      // Lag: separate attack and release times, in milliseconds.
      const tau = (v > s.env ? c.attack : c.release * timeK) / 1000;
      s.env = tau <= 0 ? v : s.env + (v - s.env) * (1 - Math.exp(-dt / tau));
      // Trigger: an onset is a jump above the band's own short average; a level trigger fires on the way up through the threshold
      // and re-arms once the band falls 10% below it. Hold is the shortest gap between two pulses.
      s.slow += (v - s.slow) * (1 - Math.exp(-dt / 0.25));
      let fire = false;
      if (c.trig === "onset") fire = v - s.slow > 0.42 - c.sens * 0.0038 && v > 0.12;
      else if (c.trig === "level") { const t = c.tlevel / 100; if (s.armed && v >= t) { fire = true; s.armed = false; } else if (v < t - 0.1) s.armed = true; }
      if (fire && now - s.lastT >= c.hold / 1000) { s.trig = 1; s.lastT = now; s.fired = now; }
      else s.trig *= Math.exp(-dt / Math.max(0.01, c.decay * timeK / 1000));
      if (c.trig === "off") s.trig = 0;
      if (c.mute) { s.env = 0; s.trig = 0; }
    }
  }
  // A channel's output after its output range (min..max, in %).
  get(id, out = "env") {
    if (id in TRANCE) return this.tr ? { breath: this.lastF?.breath ?? 0, pump: this.lastF?.pump ?? 1, build: this.tr.build, drop: this.tr.drop, brk: this.tr.brk }[id] : 0;
    const c = this.chan(id), s = this.st.get(id); if (!c || !s) return 0;
    const v = out === "trig" ? s.trig : s.env;
    return (c.min + (c.max - c.min) * v) / 100;
  }

  // Replace the frame's music features with the exported channels. A channel left empty keeps the built-in analysis.
  apply(f) {
    if (!this.o.on) return f;
    const b = this.o.boost / 100;
    for (const k of Object.keys(EXPORTS)) {
      const e = this.o.exp[k]; if (!e || !this.has(e.ch)) continue;
      f[k] = this.get(e.ch, e.out) * e.amt / 100 * b;
    }
    this.trance(f); this.lastF = f;
    this.levelS += (f.level - this.levelS) * (f.level > this.levelS ? 0.08 : 0.02);
    f.levelS = this.levelS;
    const sp = this.o.spec, g = sp.gain / 100, fl = sp.floor / 100, cu = sp.curve / 100, out = this.specOut ||= new Float32Array(32);
    for (let i = 0; i < 32; i++) out[i] = clamp(Math.pow(clamp((f.spec[i] - fl) / (1 - fl)), cu) * g * b, 0, 1.5);
    f.spec = out;
    return f;
  }
  // Trance reading, from the kick and high exports and the beat clock (TouchDesigner users build the same thing from
  // Trigger, Count and Lag CHOPs):
  //   pump  - sidechain: 0 on each kick, back to 1 over half a beat (squared, like a compressor's release);
  //   brk   - breakdown: no kick for two bars while the music goes on;
  //   build - in a breakdown, the highs rising against their long average and the hits getting denser;
  //   drop  - a flash when the kick comes back after a breakdown (or at a drop the track analysis found), fading over 1.5 s.
  trance(f) {
    const now = this.last, tr = this.tr ||= { kick: -9, hits: [], fast: 0, slow: 0, brk: 0, build: 0, drop: 0, t: null };
    const dt = 1 / 60, period = 60 / Math.max(60, Math.min(200, f.bpm || 128));
    const kc = this.o.exp.kick?.ch, hc = this.o.exp.hit?.ch, ks = this.st.get(kc), hs = this.st.get(hc);
    const kicked = ks ? ks.fired === now : f.kick > 0.95;
    if (hs && hs.fired === now) tr.hits.push(now);
    tr.hits = tr.hits.filter(t => now - t < 2);
    const hi = f.high ?? 0;
    tr.fast += (hi - tr.fast) * 0.03; tr.slow += (hi - tr.slow) * 0.003;
    const gap = now - tr.kick, inBreak = gap > period * 8 && (f.level ?? 0) > 0.08;
    tr.brk += ((inBreak ? 1 : 0) - tr.brk) * 0.05;
    const rise = Math.max(0, Math.min(1, (tr.fast - tr.slow) / (tr.slow + 0.05) * 1.5)), dens = Math.min(1, tr.hits.length / 12);
    tr.build += ((tr.brk > 0.5 ? Math.min(1, rise * 0.6 + dens * 0.6) : 0) - tr.build) * 0.04;
    let drop = kicked && tr.brk > 0.5;
    const a = this.music.analysis;
    if (a?.events && f.grid && tr.t != null) for (const e of a.events) if (e.type === "drop" && e.t > tr.t && e.t <= f.t) drop = true;
    tr.t = f.t;
    if (kicked) tr.kick = now;
    tr.drop = drop ? 1 : tr.drop * Math.exp(-dt / 1.5);
    if (drop) { tr.brk = 0; tr.build = 0; }
    // Breath: the music's loudness through a slow, eased follower (in about a bar, out over two), so the heart breathes with
    // the song instead of flickering with it.
    const lv = Math.min(1, f.level ?? 0); tr.breath ??= 0;
    tr.breath += (lv - tr.breath) * (1 - Math.exp(-dt / (lv > tr.breath ? period * 1.2 : period * 2.5)));
    f.breath = tr.breath * tr.breath * (3 - 2 * tr.breath);
    const p = Math.min(1, (now - tr.kick) / (period * 0.5));
    f.pump = p * p; f.brk = tr.brk; f.build = tr.build; f.drop = tr.drop;
  }
  // Show parameters after the modulations: base values in the sliders' own units.
  modulate(base) {
    const out = { ...base };
    if (!this.o.on) return out;
    for (const m of this.o.mods) {
      const t = TARGETS[m.tgt]; if (!t || !m.depth || !this.has(m.ch)) continue;
      const v = this.get(m.ch, m.out), d = m.depth / 100;
      if (t.kind === "mul") out[m.tgt] *= d >= 0 ? 1 - d + d * v : 1 + d * v;
      else out[m.tgt] += d * v * t.span;
    }
    return out;
  }
  // The audio a layer reacts to: its drive channel as every input (kick and hit from the pulse, the rest from the level),
  // and its opacity, opened by the drive channel by `depth`.
  layer(l, f) {
    const c = this.has(l.drive), b = this.o.boost / 100;
    let op = l.op / 100, s = f;
    if (c && this.o.on) {
      const env = this.get(l.drive, "env") * b, trig = this.get(l.drive, "trig") * b;
      s = { ...f, kick: trig || env, hit: trig, bass: env, mid: env, high: env, level: env };
      const d = l.depth / 100; op *= 1 - d + d * clamp(this.get(l.drive, l.out) * b);
    }
    return { s, op };
  }
}
