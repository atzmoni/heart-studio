// Picture rate: the frame rate and the flow of time follow the music, the way a live AI VJ draws a new picture on the beat
// and holds it in between (idea from vrch.io's AI VJ and their ComfyUI microphone and BPM nodes; written from scratch here).
//
// TimeWarp turns the music reading of every frame into a warped clock:
//   t      time that runs faster or slower with the music (rate), and can stop
//   tq     the same time, held between picture frames: frames step on the beat grid (div frames per beat), so the whole
//          heart moves at a musical frame rate instead of the screen's 60 fps
//   fIdx   picture frame counter, fPhase 0..1 inside the current frame, fps the frame rate now
// The page feeds tq to every effect (when "all effects" is on), holds the video between frames, slows or speeds it, and
// keeps a short history of the video (16 frames, one per picture frame) for the time effects 196-205. Each of those draws
// the past on the cut itself: every groove and every heart between grooves is its own moment in time.
// Works with the live microphone and offline: nothing here needs a network.

export const TW_MODES = [
  ["off", "כבוי · זמן רגיל"],
  ["beat", "פעימות · פריימים נעולים ל-BPM"],
  ["energy", "אנרגיה · שקט = פליפבוק, שיא = רציף"],
  ["stutter", "סטאטר · הקפאה על הקיק וקפיצה קדימה"],
  ["drop", "דרופ · האצה בבילדאפ, סלואו-מושן בדרופ"],
  ["vj", "AI VJ · תמונה חדשה בכל צעד"],
];
export const TW_DIVS = [1, 2, 4, 8, 16];
export const TW_DEFAULT = { mode: "beat", div: 4, amount: 70, morph: 35, all: true, video: true };
export const HIST_N = 16;

export class TimeWarp {
  constructor(o = {}) {
    this.o = { ...TW_DEFAULT, ...o };
    this.t = 0; this.tq = 0; this.rate = 1; this.fIdx = 0; this.fPhase = 0; this.fps = 60; this.div = this.o.div;
    this.newFrame = true; this.freeze = 0; this.kickPrev = 0; this.lastCell = null; this.out = this.state();
  }
  state() {
    return { warp: this.t, warpQ: this.tq, rate: this.rate, fps: this.fps, fPhase: this.fPhase, fIdx: this.fIdx % 65536, fDiv: this.div, morph: this.o.morph / 100 };
  }
  // f: Music.frame() (+ the reading of heart-react), dt in seconds. Returns the state above, and newFrame.
  frame(f, dt) {
    const o = this.o, amt = o.amount / 100, bps = Math.max(0.5, (f.bpm || 120) / 60), lv = f.levelS ?? f.level ?? 0;
    const beats = (f.beatN || 0) + (f.beat || 0);
    let rate = 1, div = o.div;
    switch (o.mode) {
      case "beat": rate = 1 + (bps / 2 - 1) * amt; break;                                  // 120 BPM = 1x
      case "energy": {
        rate = 1 + (0.25 + 1.6 * lv - 1) * amt;
        // quiet: one picture a beat; peaks: up to 16 a beat (the screen rate at most)
        const want = Math.round(Math.log2(1 + 15 * Math.min(1, lv * 1.3) * amt + (1 - amt) * 15));
        div = TW_DIVS[Math.max(0, Math.min(4, want))]; break;
      }
      case "stutter": {
        const k = f.kick || 0;
        if (k > 0.85 && this.kickPrev <= 0.85) this.freeze = (0.5 / bps) * (0.3 + amt);   // hold for up to half a beat
        this.kickPrev = k;
        if (this.freeze > 0) { this.freeze -= dt; rate = 0; if (this.freeze <= 0) this.t += (0.5 / bps) * amt; }  // then jump ahead
        break;
      }
      case "drop": {
        const d = f.drop || 0, b = f.build || 0, br = f.break || f.brk || 0;
        rate = 1 + b * 2.0 * amt; if (d > 0.3) rate = 1 - 0.85 * amt * Math.min(1, d); else if (br > 0.5) rate = 1 - 0.5 * amt;
        break;
      }
      case "vj": rate = 1 + (lv - 0.4) * amt; break;
    }
    this.rate += (rate - this.rate) * (o.mode === "stutter" ? 1 : 0.15);
    this.t += dt * this.rate;
    this.div = div;
    // Picture frames on the beat grid (the time reading follows the music clock, so a frame lands exactly on each beat).
    if (o.mode === "off") { this.newFrame = true; this.fIdx++; this.fPhase = 0; this.fps = 1 / Math.max(dt, 1 / 240); this.tq = this.t; }
    else {
      const cell = Math.floor(beats * div), ph = beats * div - cell;
      this.newFrame = cell !== this.lastCell && !(o.mode === "stutter" && this.freeze > 0);
      if (this.newFrame) { this.lastCell = cell; this.fIdx++; this.tq = this.t; }
      this.fPhase = ph; this.fps = bps * div;
    }
    this.out = this.state(); this.out.newFrame = this.newFrame; return this.out;
  }
}

// The time effects. Each is drawn on the cut: grooves (h.groove), the hearts between them (h.stripe) and the contour (h.edge).
export const TIME_FX = [
  [196, "מכונת זמן · כל תעלה רגע אחר", "⏳", 1, "fxTmRings"],
  [197, "פליפבוק לב", "📖", 2, "fxTmFlip"],
  [198, "סליט-סקאן מהמרכז", "🎞️", 1, "fxTmSlit"],
  [199, "פיצול זמן RGB", "🌈", 2, "fxTmChroma"],
  [200, "הקפאה בתעלות", "🧊", 2, "fxTmFreeze"],
  [201, "לופ סטאטר", "🔁", 3, "fxTmLoop"],
  [202, "סולם קצבים · כל טבעת קצב משלה", "🪜", 1, "fxTmLadder"],
  [203, "קדימה ואחורה", "↔️", 1, "fxTmPing"],
  [204, "גל זמן מהקיק", "🌊", 2, "fxTmRipple"],
  [205, "AI VJ · ציור מחדש על הפעימה", "🤖", 1, "fxTmVj"],
];
export const isTime = id => id >= 196 && id <= 205;

export const TIME_BANK = { g: "time", title: "קצב תמונה · זמן לפי המוזיקה", fx: TIME_FX, glsl: `
// ---------- picture rate (heart-tempo.js) ----------
vec2 tmUV(vec2 p) { vec2 uv = p / S - 0.5; if (uVidAspect > 1.0) uv.x /= uVidAspect; else uv.y *= uVidAspect; return clamp(uv + 0.5, 0.004, 0.996); }
vec3 tmTile(vec2 uv, float k) { int j = (uHistHead - int(k) + 64) % 16; return texture(uHist, (vec2(float(j % 4), float(j / 4)) + uv) * 0.25).rgb; }
// A generated picture, a new one for each seed (what the AI VJ would draw): a folded flow in the show's colours.
float tmFb(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s / 0.875; }
vec3 tmGen(vec2 p, float seed) {
  vec2 o = vec2(hash11(seed * 1.37), hash11(seed * 2.11 + 4.0)) * 40.0, q = p * (0.010 + 0.012 * hash11(seed + 9.0)) + o;
  float n = tmFb(q + tmFb(q * 1.7 + 3.1) * (1.5 + 1.5 * hash11(seed + 3.0)));
  return pal(n * 1.6 + hash11(seed + 5.0)) * (0.25 + 1.1 * smoothstep(0.3, 0.8, n));
}
// The picture k frames ago: the video history when there is one, else the generated picture of that frame.
vec3 tmSrc(vec2 p, float k) {
  if (uHistN > 1 && uVidOn > 0.5) {
    float kc = clamp(k, 0.0, float(uHistN - 1)), k0 = floor(kc);
    vec2 uv = tmUV(p); return mix(tmTile(uv, k0), tmTile(uv, min(k0 + 1.0, float(uHistN - 1))), kc - k0);
  }
  float s = floor(uFIdx - k), m = smoothstep(0.0, max(uMorph, 0.001), uFPhase);
  vec3 c = tmGen(p, s);
  if (m < 1.0) c = mix(tmGen(p, s - 1.0), c, m);   // morph in from the previous picture only at the start of a frame
  return c;
}
float tmNew() { return exp(-uFPhase * 7.0); }                          // a flash at each new picture frame
vec3 tmCut(H h, vec3 c, float gl) {                                    // put a picture on the cut
  return c * (h.stripe * (0.55 + 0.5 * uLevelS) + h.groove * (0.9 + gl)) + pal(uWarp * 0.05) * h.edge * (0.3 + 0.7 * tmNew());
}
vec3 fxTmRings(H h) {            // every groove and heart band is a different moment: the outer the ring, the further back
  float r = ringIdx(h), k = r * (0.5 + 1.5 * uBassS);
  return tmCut(h, tmSrc(h.p, k), kk() * 0.8);
}
vec3 fxTmFlip(H h) {             // a flipbook: the picture steps on the beat grid, the cut flashes every new page
  vec3 c = floor(tmSrc(h.p, 0.0) * 5.0 + 0.5) / 5.0;                  // printed look
  float page = mod(uFIdx + ringIdx(h), 2.0);                           // alternate rings change on alternate pages
  vec3 o = c * (h.stripe * (0.5 + 0.5 * page) + h.groove * 1.2);
  return o + vec3(1.0) * h.groove * tmNew() * (0.4 + uLevelS) + vec3(1.0) * h.edge * tmNew();
}
vec3 fxTmSlit(H h) {             // slit-scan: the past flows outward from the centre of the rings
  float k = h.rad * (6.0 + 9.0 * uLevelS);
  return tmCut(h, tmSrc(h.p, k), uHighS);
}
vec3 fxTmChroma(H h) {           // red now, green and blue from earlier frames; the bass pulls them apart
  float d = 1.0 + 5.0 * uBassS + 3.0 * kk();
  vec3 c = vec3(tmSrc(h.p, 0.0).r, tmSrc(h.p, d).g, tmSrc(h.p, d * 2.0).b);
  return tmCut(h, c * 1.15, 0.5);
}
vec3 fxTmFreeze(H h) {           // on each beat some grooves freeze the picture of that beat, the others keep playing
  float r = ringIdx(h), frozen = step(0.55, hash21(vec2(r, uBeatN)));
  float k = frozen * min(15.0, floor(uBeat * uFDiv));
  vec3 c = tmSrc(h.p, k);
  return tmCut(h, mix(c, vec3(dot(c, vec3(0.3, 0.6, 0.1))) * vec3(0.7, 0.9, 1.2), frozen * 0.6), frozen * 0.7);
}
vec3 fxTmLoop(H h) {             // the last few frames repeat like a scratched record; the loop length follows the energy
  float L = uLevelS > 0.55 ? 2.0 : (uLevelS > 0.3 ? 4.0 : 8.0), k = L - 1.0 - mod(uFIdx, L);
  k += mod(ringIdx(h), 2.0) * L * 0.5;
  return tmCut(h, tmSrc(h.p, k), kk());
}
vec3 fxTmLadder(H h) {           // every ring has its own frame rate: the inner heart every frame, then every 2, 4, 8
  float r = ringIdx(h), every = exp2(mod(r, 4.0)), k = mod(uFIdx, every);
  float on = 0.6 + 0.8 * specAt(r / ringN());
  return tmCut(h, tmSrc(h.p, k) * on, step(k, 0.5) * 0.8);
}
vec3 fxTmPing(H h) {             // the left half plays the past forwards, the right half backwards (two separate channels)
  float tri = abs(mod(uFIdx, 30.0) - 15.0), k = h.side < 0.5 ? tri : 15.0 - tri;
  return tmCut(h, tmSrc(h.p, k), 0.4 * kk());
}
vec3 fxTmRipple(H h) {           // each kick sends a wave of the past out through the rings
  float w = uBeat * 1.4, d = abs(h.rad - w), k = 10.0 * exp(-d * 9.0) * (0.3 + kk());
  vec2 q = h.p + h.gD * exp(-d * 12.0) * 3.0 * uBassS;
  return tmCut(h, tmSrc(q, k), exp(-d * 10.0));
}
vec3 fxTmVj(H h) {               // AI VJ: a new picture on every step of the grid, morphing in; with video it redraws the video
  vec3 g = tmSrc(h.p, 0.0);
  if (uVidOn > 0.5) {
    vec3 v = uHistN > 1 ? tmTile(tmUV(h.p), 0.0) : video(h.p);
    float l = dot(v, vec3(0.3, 0.6, 0.1));
    vec3 gen = tmGen(h.p, uFIdx), m = vec3(smoothstep(0.0, max(uMorph, 0.001), uFPhase));
    if (m.x < 1.0) gen = mix(tmGen(h.p, uFIdx - 1.0), gen, m.x);
    g = mix(gen * (0.4 + 1.2 * l), pal(floor(l * 4.0) / 4.0 + uFIdx * 0.13) * l * 1.4, 0.5);
  }
  return tmCut(h, g, kk() * 0.6);
}
` };
