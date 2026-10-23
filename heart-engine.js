// The ring engine: the music played straight onto the heart, ring by ring. From the small heart in the centre outwards the
// parts alternate heart, groove, heart, groove ... (band 0, groove 1, band 1, groove 2 ...): 43 rings a half, and every ring
// is one musical channel - a slice of the spectrum, one semitone, a chord tone, or one MIDI note.
// The whole-heart elements stay global: the contour follows the overall loudness, the seam follows the beat.
// Each frame it writes one colour per channel into the renderer's engine row (premultiplied by its level).
import { CH_W } from "./heart-gl.js?v=1";

export const MODES = { spectrum: "ספקטרום (תדרים)", notes: "תווים (כל חצי טון טבעת)", chords: "אקורדים", midi: "MIDI", notesMidi: "תווים + MIDI" };
export const HALVES = { mirror: "שני החצאים זהים", stereo: "סטריאו: ערוץ לכל חצי", extend: "טווח כפול: שמאל נמוך, ימין גבוה" };
export const COLORS = { auto: "לפי המצב", palette: "פלטת ההופעה", notes: "גלגל התווים", heat: "חום (לפי עוצמה)", white: "לבן" };
export const NOTE = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export const noteName = m => NOTE[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const QUAL = [["", [0, 4, 7]], ["m", [0, 3, 7]], ["7", [0, 4, 7, 10]], ["maj7", [0, 4, 7, 11]], ["m7", [0, 3, 7, 10]], ["sus4", [0, 5, 7]], ["dim", [0, 3, 6]]];
// Pitch classes go round the colour wheel by fifths, so related keys get related colours.
const pcHue = pc => ((pc * 7) % 12) / 12;

export const DEFAULTS = {
  mode: "spectrum", halves: "mirror", color: "auto", dir: "in",   // "in": low notes / bass in the centre
  gain: 0, sens: 60, gate: -70, attack: 70, release: 35, contrast: 1.4,
  fMin: 30, fMax: 14000, base: 36,                                // base: MIDI note of the inner heart (36 = C2)
  intensity: 100, contour: true, seam: true, routeL: -1, routeR: -1,
  midiSplit: "mirror", drums: true,                               // MIDI channel 1 -> left half, 2 -> right ("split")
};

function hsv(h, s, v) { const f = n => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return [f(5), f(3), f(1)]; }
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
function palAt(pal, x) {
  x = ((x % 1) + 1) % 1 * pal.length; const i = Math.floor(x), f = x - i, a = hex(pal[i]), b = hex(pal[(i + 1) % pal.length]);
  return a.map((v, k) => v + (b[k] - v) * f);
}

export class Engine {
  constructor(music) {
    this.music = music;
    this.o = { ...DEFAULTS };
    this.N = 21; this.Q = 43;
    this.lv = [new Float32Array(130), new Float32Array(130)];      // smoothed level per ring per half
    this.raw = [new Float32Array(130), new Float32Array(130)];
    this.peak = [new Float32Array(130).fill(-60), new Float32Array(130).fill(-60)];
    this.midiLv = [new Float32Array(128), new Float32Array(128)]; this.held = [new Uint8Array(128), new Uint8Array(128)];
    this.sustain = false; this.pedalHeld = [new Uint8Array(128), new Uint8Array(128)];
    this.chroma = new Float32Array(12); this.chord = null; this.chordCand = null; this.chordCount = 0; this.flash = 0;
    this.out = new Uint8Array(CH_W * 4);
    this.levelL = 0; this.levelR = 0; this.gpeak = -40;
    this.midi = null; this.midiIn = "all"; this.lastMsg = "";
    this.onCC = null; this.onProgram = null; this.onDrum = null;
  }
  setRings(n) { this.N = n; this.Q = 2 * n + 1; }
  set(o) { Object.assign(this.o, o); this.music.setGain?.(this.o.gain); this.music.connectHalf?.(0, this.o.routeL); this.music.connectHalf?.(1, this.o.routeR); }

  // ---------- MIDI ----------
  async enableMidi() {
    if (!navigator.requestMIDIAccess) throw new Error("הדפדפן לא תומך ב-MIDI (צריך Chrome או Edge)");
    this.midi = await navigator.requestMIDIAccess({ sysex: false });
    const hook = () => { for (const inp of this.midi.inputs.values()) inp.onmidimessage = e => this.midiMsg(e.data, inp.id); };
    hook(); this.midi.onstatechange = () => { hook(); this.onPorts?.(); };
    return this.ports();
  }
  ports() { return this.midi ? [...this.midi.inputs.values()].map(i => ({ id: i.id, name: i.name || i.manufacturer || "MIDI" })) : []; }
  midiMsg(d, port) {
    if (this.midiIn !== "all" && port !== this.midiIn) return;
    const now = performance.now() / 1000, st = d[0];
    if (st === 0xF8) return this.music.clockTick(now);
    if (st === 0xFA || st === 0xFB) return this.music.clockStart(now);
    if (st === 0xFC) return this.music.clockStop();
    if (st >= 0xF0) return;
    const type = st & 0xF0, ch = (st & 0x0F) + 1, a = d[1], b = d[2];
    const sides = this.o.midiSplit === "split" ? (ch === 1 ? [0] : ch === 2 ? [1] : [0, 1]) : [0, 1];
    if (type === 0x90 && b > 0) {
      this.lastMsg = `ערוץ ${ch} · ${noteName(a)} · ${b}`;
      if (ch === 10 && this.o.drums) { this.onDrum?.(a, b); return; }
      for (const s of sides) { this.held[s][a] = 1; this.midiLv[s][a] = Math.max(this.midiLv[s][a], b / 127); }
    } else if (type === 0x80 || (type === 0x90 && b === 0)) {
      for (const s of sides) { this.held[s][a] = 0; if (this.sustain) this.pedalHeld[s][a] = 1; }
    } else if (type === 0xB0) {
      this.lastMsg = `ערוץ ${ch} · CC${a} = ${b}`;
      if (a === 64) { this.sustain = b >= 64; if (!this.sustain) for (const s of [0, 1]) this.pedalHeld[s].fill(0); }
      else if (a === 123 || a === 120) for (const s of [0, 1]) { this.held[s].fill(0); this.midiLv[s].fill(0); }
      this.onCC?.(ch, a, b);
    } else if (type === 0xC0) { this.lastMsg = `ערוץ ${ch} · תוכנית ${a}`; this.onProgram?.(ch, a); }
  }

  // ---------- analysis helpers ----------
  dbData(side) {
    const an = this.music.anS?.[side]; if (!an) return null;
    const b = (this.buf ||= [new Float32Array(an.frequencyBinCount), new Float32Array(an.frequencyBinCount)])[side];
    an.getFloatFrequencyData(b); return b;
  }
  // Power in dB between two frequencies (at least the nearest bin).
  bandDb(db, f0, f1) {
    const sr = this.music.ctx.sampleRate, n = db.length, bw = sr / 2 / n;
    let a = Math.max(1, Math.floor(f0 / bw)), b = Math.min(n - 1, Math.ceil(f1 / bw));
    if (b <= a) b = a + 1;
    let p = 0; for (let k = a; k < b; k++) p += Math.pow(10, db[k] / 10);
    return 10 * Math.log10(p + 1e-30);
  }

  // ---------- per frame ----------
  update(f, show) {
    const o = this.o, Q = this.Q, M = this.music;
    const mode = o.mode, live = !!M.ctx;
    const ext = o.halves === "extend", stereo = o.halves === "stereo";
    const span = ext ? Q * 2 : Q;
    const dbs = live ? [this.dbData(0), stereo ? this.dbData(1) : null] : [null, null];
    if (dbs[0] && !dbs[1]) dbs[1] = dbs[0];
    const rangeDb = 12 + (100 - o.sens) * 0.42, gate = o.gate;
    // Audio rings, both halves.
    const audioMode = mode === "spectrum" ? "spectrum" : mode === "midi" ? null : "notes";
    for (let s = 0; s < 2; s++) {
      const R = this.raw[s]; R.fill(0);
      const db = dbs[s]; if (!audioMode || !db) continue;
      if (audioMode === "spectrum") {
        for (let q = 0; q < Q; q++) {
          const j = ext ? q + s * Q : q, f0 = o.fMin * Math.pow(o.fMax / o.fMin, j / span), f1 = o.fMin * Math.pow(o.fMax / o.fMin, (j + 1) / span);
          const v = this.bandDb(db, f0, f1), P = this.peak[s];
          P[q] = Math.max(v, P[q] - 0.04, gate + 6);
          const ref = Math.max(P[q], this.gpeak - 24);
          R[q] = v < gate ? 0 : Math.max(0, Math.min(1, (v - (ref - rangeDb)) / rangeDb));
        }
      } else {
        // Semitones: each ring is one note. Spectral peaks (not bands) so a note never bleeds into its neighbours:
        // every peak is placed at its exact frequency (parabolic interpolation), then given to the nearest semitone.
        const nb = db.length, bw = M.ctx.sampleRate / 2 / nb, peaks = [];
        let mx = -200; for (let k = 2; k < nb; k++) if (db[k] > mx) mx = db[k];
        this.gpeak = Math.max(mx, this.gpeak - 0.05);
        const floor = Math.max(gate, this.gpeak - rangeDb * 1.6);
        const kLo = Math.max(2, Math.floor(25 / bw)), kHi = Math.min(nb - 3, Math.ceil(5000 / bw));
        for (let k = kLo; k <= kHi; k++) {
          const y = db[k]; if (y < floor || y <= db[k - 1] || y < db[k + 1] || y < db[k - 2] || y < db[k + 2]) continue;
          const y0 = db[k - 1], y2 = db[k + 1], d2 = y0 - 2 * y + y2, off = d2 ? 0.5 * (y0 - y2) / d2 : 0;
          peaks.push({ f: (k + off) * bw, db: y - 0.25 * (y0 - y2) * off, w: 1 });
        }
        // Harmonics: a peak at 2..6 times a stronger lower peak is mostly that note's overtone. Odd ones (3, 5) would add
        // false notes to the chord (the 3rd harmonic of B is an F#), so they are cut hardest; octaves keep more.
        for (const p of peaks) for (const q of peaks) {
          if (q.f >= p.f || q.db < p.db - 10) continue;
          const h = p.f / q.f, r = Math.round(h);
          if (r >= 2 && r <= 6 && Math.abs(h - r) < 0.015 * r) p.w = Math.min(p.w, r % 2 ? 0.15 : 0.55);
        }
        const note = new Float32Array(128).fill(-200);
        for (const p of peaks) {
          const m = 69 + 12 * Math.log2(p.f / 440), r = Math.round(m);
          if (Math.abs(m - r) > 0.42 || r < 0 || r > 127) continue;
          const v = p.db + 20 * Math.log10(p.w);
          if (v > note[r]) note[r] = v;
        }
        for (let q = 0; q < Q; q++) {
          const m = o.base + (ext ? q + s * Q : q), v = note[m];
          R[q] = m > 127 || v < floor ? 0 : Math.max(0, Math.min(1, (v - (this.gpeak - rangeDb)) / rangeDb));
        }
        if (s === 0) this.notesDb = note;
      }
    }
    // MIDI rings.
    const useMidi = mode === "midi" || mode === "notesMidi";
    const rel = Math.pow(0.5, 1 / Math.max(1, 3 + (100 - o.release) * 0.6));
    for (let s = 0; s < 2; s++) {
      const L = this.midiLv[s];
      for (let m = 0; m < 128; m++) if (!this.held[s][m] && !this.pedalHeld[s][m]) L[m] *= rel; else L[m] *= 0.9993;
      if (!useMidi) continue;
      for (let m = 0; m < 128; m++) {
        if (L[m] < 0.004) continue;
        let q = m - o.base - (ext ? s * Q : 0);
        if (ext && (q < 0 || q >= Q)) continue;
        while (q < 0) q += 12; while (q >= Q) q -= 12;      // fold notes outside the heart into its range
        this.raw[s][q] = Math.max(this.raw[s][q], L[m]);
      }
    }
    // Chords from the chroma of the notes heard (and played).
    if (mode === "chords" || mode === "notes" || mode === "notesMidi") this.detectChord(ext);
    // Smooth: attack and release per ring, then contrast.
    const att = 0.15 + o.attack / 100 * 0.85, relA = 0.02 + (100 - o.release) / 100 * 0.4;
    for (let s = 0; s < 2; s++) for (let q = 0; q < Q; q++) {
      const v = this.raw[s][q], L = this.lv[s];
      L[q] += (v - L[q]) * (v > L[q] ? att : relA);
    }
    this.flash *= 0.93;
    // Overall level per half for the contour.
    this.levelL += ((f.level || 0) - this.levelL) * 0.25; this.levelR = this.levelL;
    this.write(f, show);
  }

  detectChord(ext) {
    const o = this.o, Q = this.Q, c = this.chroma; c.fill(0);
    for (let s = 0; s < (ext ? 2 : 1); s++) for (let q = 0; q < Q; q++) c[(o.base + q + (ext ? s * Q : 0)) % 12] += this.raw[s][q];
    const sum = c.reduce((a, b) => a + b, 0);
    // The lowest clear note is usually the root: it gets a small bonus (helps C vs Am7, F vs Dm7 ...).
    this.bassPc = -1; for (let q = 0; q < Q; q++) if (this.raw[0][q] > 0.3) { this.bassPc = (o.base + q) % 12; break; }
    if (sum < 0.25) { this.chordCount = 0; return; }
    let best = null, bv = 0;
    const norm = Math.sqrt(c.reduce((a, b) => a + b * b, 0)) || 1;
    for (let r = 0; r < 12; r++) for (const [suf, iv] of QUAL) {
      let d = 0, tn = 0; iv.forEach((k, i) => { const w = i ? 0.85 : 1; d += c[(r + k) % 12] * w; tn += w * w; });
      const v = d / (norm * Math.sqrt(tn)) - (iv.length > 3 ? 0.03 : 0) + (r === this.bassPc ? 0.04 : 0);
      if (v > bv) { bv = v; best = { root: r, suf, iv, name: NOTE[r] + suf }; }
    }
    if (!best || bv < 0.62) return;
    if (this.chord && best.name === this.chord.name) { this.chordCount = 0; return; }
    if (this.chordCand?.name === best.name) this.chordCount++; else { this.chordCand = best; this.chordCount = 1; }
    if (this.chordCount >= 4) { this.chord = best; this.chordCount = 0; this.flash = 1; this.onChord?.(best); }
  }

  ringColor(s, q, v, show) {
    const o = this.o, Q = this.Q, pal = show.palette;
    let mode = o.color;
    if (mode === "auto") mode = o.mode === "spectrum" ? "palette" : "notes";
    const m = o.base + q + (o.halves === "extend" ? s * Q : 0);
    if (mode === "notes") return hsv(pcHue(m % 12), 0.85, 1);
    if (mode === "heat") return v < 0.5 ? [v * 2, v * 0.6, 0.05] : [1, 0.3 + (v - 0.5) * 1.4, (v - 0.5) * 1.6];
    if (mode === "white") return [1, 1, 1];
    return palAt(pal, q / Q * 0.85);
  }

  write(f, show) {
    const o = this.o, Q = this.Q, D = this.out, k = o.intensity / 100;
    D.fill(0);
    const put = (id, rgb, v) => { if (id < 0 || id >= CH_W) return; const i = id * 4; for (let c = 0; c < 3; c++) D[i + c] = Math.min(255, Math.round(rgb[c] * v * k * 255)); D[i + 3] = 255; };
    const chord = this.chord, chordMode = o.mode === "chords";
    for (let s = 0; s < 2; s++) for (let q = 0; q < Q; q++) {
      let v = this.lv[s][q];
      let rgb = this.ringColor(s, q, v, show);
      if (chordMode && chord) {
        // Chord view: every ring whose note is in the chord, across all octaves; the root strongest, the rest of the heart in the root's colour.
        const pc = (o.base + q + (o.halves === "extend" ? s * Q : 0)) % 12, iv = (pc - chord.root + 12) % 12;
        const inChord = chord.iv.includes(iv), c = this.chroma[pc];
        v = inChord ? (iv === 0 ? 1 : 0.7) * Math.min(1, 0.35 + c) : 0.06;
        rgb = hsv(pcHue(inChord ? pc : chord.root), inChord ? 0.8 : 0.6, 1);
        const front = (1 - this.flash) * Q; v += this.flash * Math.exp(-((q - front) ** 2) / 6) * 0.8;
      }
      v = Math.pow(Math.max(0, Math.min(1.2, v)), o.contrast);
      const r = o.dir === "out" ? Q - 1 - q : q;           // which ring: even = heart band r/2, odd = groove (r-1)/2
      put(r % 2 === 0 ? 136 + r + s : 8 + r - 1 + s, rgb, v);
    }
    // Whole-heart elements.
    const root = chord ? hsv(pcHue(chord.root), 0.7, 1) : palAt(show.palette, 0);
    if (o.contour) for (let s = 0; s < 2; s++) put(s, root, Math.min(1, 0.2 + this.levelL * 0.9 + (f.kick || 0) * 0.5));
    if (o.seam) put(2, [1, 1, 1], 0.15 + 0.85 * Math.exp(-(f.beat || 0) * 6));
  }

  // For the panel meter: level per ring per half, and the colour.
  snapshot(show) { return { Q: this.Q, lv: this.lv, color: (s, q, v) => this.ringColor(s, q, v, show) }; }
}
