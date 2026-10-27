// TouchDesigner-style liquid for the heart: a feedback simulation, after the audio-reactive "viscous liquid" networks built in
// TouchDesigner (Audio Device In -> Analyze -> Math "snare" -> Export, driving a TOP chain of Feedback, Displace, Blur and a fire
// Lookup, with Geo, Camera, Light and Render for a 3D height map). Written from scratch for the heart.
//
// How it runs: every frame one extra pass simulates the liquid in heart space (a square texture over the 240 x 240 cm box, so
// every texel is a fixed spot on the heart, not on the projector). The pass reads last frame's texture, moves it (curl-noise
// flow, a push across the rings, zoom and twist about each part's centre), blurs it a little (viscosity), lets it cool, and
// pours in new heat from the music: heartbeat waves (a lub and a dub on every hit), blooms, the grooves, the contour walls...
// The show pass then reads the texture at each pixel's spot on the heart and cuts it to the real grooves, the hearts between
// them and the contour, through a fire lookup (or the show palette, or green), with veins, chromatic split, zoom blur or a lit
// 3D height map. So the liquid moves freely but the light only ever lands on the cut.
//
// Texture channels: r = heat, g = sparks, b = height (slow heat, for the 3D look and the veins).

// Parameters, in the order of the uniform arrays. Simulation (uTd[16]) then look (uTdO[8]).
export const TD_SIM = ["src", "gain", "decay", "zoom", "rot", "flow", "nscale", "nspeed", "push", "visc", "mirror", "react", "bright", "gamma", "wave", "spark"];
export const TD_LOOK = ["ramp", "chroma", "zblur", "look", "gG", "sG", "edge", "vein"];
export const TD_DEFAULT = {
  src: 0, gain: 1, decay: 0.9, zoom: 0.6, rot: 0, flow: 1, nscale: 1, nspeed: 0.3, push: 0.3, visc: 0.3, mirror: 0, react: 0.8,
  bright: 1, gamma: 1, wave: 0.9, spark: 0,
  ramp: 0, chroma: 0, zblur: 0, look: 0, gG: 1.4, sG: 0.55, edge: 0.3, vein: 1,
};
// Sources of heat, by number (TD_DEFAULT.src).
export const TD_SOURCES = ["פעימות לב · גלים מהמרכז", "בועות על כל מכה", "התעלות לפי הספקטרום", "קירות אש · הקונטור", "לבה · רעש חי", "ניצוצות מהמרכז", "משאבה · הלב הפנימי", "וידאו"];
export const TD_RAMPS = ["אש", "צבעי ההופעה", "ירוק"];
export const TD_LOOKS = ["לבה", "ורידים", "תלת-ממד"];

// The 20 ready effects. Each is a full setting of the simulation and the look, as in the reel: liquid, fire lookup, chromatic
// fringes, sparks, walls of fire, a 3D height map. [id, name, icon, energy class, settings]
const P = (o) => ({ ...TD_DEFAULT, ...o });
export const TD_FX = [
  [164, "לבה צמיגה", "🌋", 1, P({ src: 4, decay: 0.94, flow: 1.4, visc: 0.45, look: 1, push: 0, zoom: 0.2, react: 0.7 })],
  [165, "גלי פעימת לב", "💓", 1, P({ src: 0, decay: 0.9, push: 0.8, zoom: 0.8, flow: 0.6, wave: 0.8 })],
  [166, "לב בוער", "❤️‍🔥", 2, P({ src: 2, decay: 0.88, flow: 0.8, push: 0.4, gain: 1.2, look: 1 })],
  [167, "קירות אש", "🧱", 2, P({ src: 3, decay: 0.9, push: -0.9, zoom: -0.6, flow: 1.2, edge: 0.6 })],
  [168, "התפרצות ניצוצות", "🎆", 2, P({ src: 5, decay: 0.86, spark: 1, flow: 0.8, zoom: 0.4 })],
  [169, "גל צמיג", "🌊", 0, P({ src: 0, decay: 0.95, visc: 0.7, flow: 2.2, nscale: 0.6, nspeed: 0.15, wave: 0.6, push: 0.4 })],
  [170, "סנר בוער", "🔥", 2, P({ src: 1, decay: 0.9, flow: 1.2, visc: 0.4, look: 1 })],
  [171, "טופוגרפיה", "🗻", 1, P({ src: 4, decay: 0.95, flow: 1.2, visc: 0.55, look: 2, gG: 1.2, sG: 0.8 })],
  [172, "סדקים במגמה", "🌑", 1, P({ src: 4, decay: 0.93, flow: 1, look: 1, vein: 2.2, gamma: 1.6, bright: 0.8 })],
  [173, "עיוות כרומטי", "🌈", 2, P({ src: 1, decay: 0.9, chroma: 4, flow: 1.4, look: 1 })],
  [174, "זום בליץ", "💥", 3, P({ src: 0, decay: 0.88, zblur: 1, zoom: 1.4, push: 0.6, spark: 0.5 })],
  [175, "לבה ירוקה", "🧪", 1, P({ src: 4, ramp: 2, decay: 0.94, flow: 1.4, visc: 0.45, look: 1, chroma: 1.5 })],
  [176, "מערבולת מגמה", "🌀", 1, P({ src: 4, decay: 0.95, rot: 1.6, zoom: 0.5, flow: 0.8, look: 1 })],
  [177, "מראת לבה", "🦋", 1, P({ src: 1, decay: 0.92, mirror: 1, flow: 1.3, look: 1 })],
  [178, "עורקים", "🩸", 1, P({ src: 6, decay: 0.93, push: 1.4, flow: 0.5, visc: 0.2, look: 1, gG: 1.8, sG: 0.25 })],
  [179, "מטאורים", "☄️", 2, P({ src: 5, decay: 0.92, spark: 1, flow: 2, push: 0.5, chroma: 1.5 })],
  [180, "בועות מגמה", "🫧", 0, P({ src: 1, decay: 0.96, visc: 0.8, flow: 0.4, gain: 0.8, react: 0.4 })],
  [181, "עשן חם", "🌫️", 0, P({ src: 4, ramp: 1, decay: 0.97, visc: 0.8, gain: 0.5, flow: 1.8, nspeed: 0.12, react: 0.3, look: 0 })],
  [182, "וידאו מותך", "📽️", -1, P({ src: 7, decay: 0.85, flow: 1.2, visc: 0.3, chroma: 1.5 })],
  [183, "לבה בצבעי ההופעה", "🎨", 1, P({ src: 0, ramp: 1, decay: 0.93, flow: 1.4, look: 1, push: 0.5, spark: 0.3 })],
  // A real heart built into the element: the seam is the septum, the two top lobes the atria. It beats lub-dub with the music.
  [184, "לב אמיתי פועם", "🫀", 1, P({ src: 6, decay: 0.9, push: 1.3, flow: 0.4, visc: 0.2 }), "fxRealHeart"],
  [185, "לב אמיתי · ניאון", "💗", 1, P({ src: 6, ramp: 1, decay: 0.9, push: 1.3, flow: 0.4, visc: 0.2 }), "fxRealHeart"],
];
export const TD_PRESET = Object.fromEntries(TD_FX.map(([id, , , , o]) => [id, o]));
export const isTd = id => TD_PRESET[id] != null;

// Mechanisms: things the performer fires by hand (pad, keyboard, MIDI note through the workspace). Held = stays on.
// [key, icon, name, keyboard key, release seconds]
export const MECHS = [
  ["beat", "💓", "פעימה", "q", 0.3], ["shock", "💥", "גל הלם", "w", 0.6], ["freeze", "🧊", "הקפאה", "e", 0.8], ["twist", "🌀", "מערבולת", "r", 0.9],
  ["erupt", "🌋", "התפרצות", "y", 0.7], ["flash", "⚡", "הבזק", "u", 0.18], ["wipe", "🧽", "ניקוי", "i", 0.5], ["sparks", "🎆", "ניצוצות", "o", 0.3],
];

// The heartbeat and the mechanisms, from the music. A hit (the kick, or a sharp onset, as the reel's "snare" channel) starts a
// lub; a softer dub follows a third of a beat later. With no hits for a while, the music clock keeps a quiet heartbeat going.
export class TdDriver {
  constructor() {
    this.pulses = []; this.mech = new Float32Array(8); this.held = new Array(8).fill(false); this.ext = new Array(8).fill(0);
    this.on = false; this.lastHit = -9; this.dub = null; this.beatN = null; this.lub = 0; this.dubFire = 0; this.env = 0; this.t = 0;
  }
  add(kind, s) { this.pulses.unshift({ t0: this.t, s, kind, seed: Math.random() }); if (this.pulses.length > 6) this.pulses.length = 6; }
  beat(s, bpm) {
    this.add(0, s); this.lub = 1; this.lastHit = this.t;
    this.dub = { at: this.t + Math.min(0.3, Math.max(0.12, 60 / (bpm || 120) / 3)), s: s * 0.6 };
  }
  // Mechanisms: press / release (pads and keys) or a value from the workspace (0..1, fires on the way up through 0.5).
  press(i, on = true) {
    this.held[i] = on;
    if (!on) return;
    if (i === 0) this.beat(1, this.bpm); else if (i === 1) this.add(3, 1.6); else if (i === 7) this.add(2, 1);
    this.mech[i] = 1;
  }
  frame(f, t, ext) {
    const dt = Math.min(0.1, Math.max(0, t - this.t)); this.t = t; this.bpm = f.bpm; this.lub = 0; this.dubFire = 0;
    const k = Math.max(f.kick ?? 0, (f.hit ?? 0) * 0.9);
    if (k > 0.55 && !this.on && t - this.lastHit > 0.2) this.beat(Math.min(1, 0.45 + k * 0.55), f.bpm);
    this.on = k > 0.4;
    if (f.beatN != null && f.beatN !== this.beatN) { if (this.beatN != null && t - this.lastHit > 1.5 * 60 / (f.bpm || 120)) this.beat(0.45, f.bpm); this.beatN = f.beatN; }
    if (this.dub && t >= this.dub.at) { this.add(1, this.dub.s); this.dub = null; this.dubFire = 1; }
    for (let i = 0; i < 8; i++) {
      const v = Math.min(1, Math.max(0, ext?.[i] ?? 0));
      if (v >= 0.5 && this.ext[i] < 0.5) this.press(i, true), this.held[i] = false;
      this.ext[i] = v;
      this.mech[i] = this.held[i] ? 1 : Math.max(v, this.mech[i] * Math.exp(-dt / MECHS[i][4]));
    }
    this.pulses = this.pulses.filter(p => t - p.t0 < 3);
    const p = this.pulses.find(p => p.kind < 2); this.env = p ? p.s * Math.exp(-(t - p.t0) * 3) : 0;
  }
  // Uniform data: per pulse [age s, strength, kind, seed]; unused slots have strength 0.
  pulseData() {
    const a = new Float32Array(24);
    this.pulses.forEach((p, i) => a.set([this.t - p.t0, p.s, p.kind, p.seed], i * 4));
    return a;
  }
  uniforms(o) {
    const s = { ...TD_DEFAULT, ...o };
    return { td: Float32Array.from(TD_SIM, k => +s[k] || 0), look: Float32Array.from(TD_LOOK, k => +s[k] || 0), pulse: this.pulseData(), mech: this.mech };
  }
}

// ---------------- GLSL ----------------
// Shared by the simulation pass and the show pass (after FX_COMMON, so ringIdx, specAt, kk, fbm... are there).
const TD_COMMON = `
vec4 tdAt(vec2 p) { return texture(uFb, p / S); }
float tdEnv(float age) { return smoothstep(0.0, 0.1, age) * exp(-age * 2.6); }   // a viscous swell: soft in, slow out
vec2 tdRandPt(float s) { return uCenter + (vec2(hash11(s * 91.7), hash11(s * 13.3 + 4.1)) - 0.5) * S * vec2(0.62, 0.55) + vec2(0.0, S * 0.04); }
`;

// The simulation pass. gl_FragCoord is a texel of the heart-space texture; heart() maps it to cm through uInvHL, which the
// renderer sets to a plain scale for this pass.
export const TD_SIM_GLSL = TD_COMMON + `
float tdWaves(H h) {
  float c = 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 P = uPulse[i]; if (P.y <= 0.0 || P.z > 1.5 && P.z < 2.5) continue;
    float R = P.x * uTd[14] * (P.z > 2.5 ? 1.6 : 1.0), d = (h.rad - R) / (P.z > 2.5 ? 0.08 : 0.05);
    c += exp(-d * d) * P.y * exp(-P.x * 1.2) * (P.z > 0.5 && P.z < 1.5 ? 0.8 : 1.0);
  }
  return c * 0.35;
}
float tdBlooms(H h) {
  float c = 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 P = uPulse[i]; if (P.y <= 0.0 || P.z > 1.5) continue;
    vec2 q = h.p - tdRandPt(P.w + P.z * 0.37); float r = 10.0 + 22.0 * hash11(P.w * 7.1) * P.y;
    float w = fbm(q * 0.06 + P.w * 9.0) * 14.0;
    c += smoothstep(r, r * 0.25, length(q) + w - 7.0) * tdEnv(P.x) * P.y;
  }
  return c * 0.22;
}
float tdSparks(H h) {
  float c = 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 P = uPulse[i]; if (P.y <= 0.0 || P.x > 1.4) continue;
    if (!(P.z > 1.5 && P.z < 2.5) && uTd[15] < 0.01 && int(uTd[0] + 0.5) != 5) continue;
    vec2 o = hash11(P.w * 3.3) < 0.5 ? h.pc : tdRandPt(P.w);
    for (int j = 0; j < 16; j++) {
      float fj = float(j), a = P.w * TAU + fj * TAU / 16.0 + hash11(fj + P.w * 31.0) * 0.4, sp = 40.0 + 90.0 * hash11(fj * 1.7 + P.w);
      vec2 at = o + vec2(cos(a), sin(a)) * sp * P.x * (1.0 - 0.3 * P.x) + vec2(0.0, 25.0 * P.x * P.x);
      c += exp(-dot2(h.p - at) / 3.0) * (1.0 - P.x / 1.4);
    }
  }
  return c * max(uTd[15], 0.6);
}
float tdInject(H h) {
  int src = int(uTd[0] + 0.5);
  float lv = 0.6 + 0.6 * uLevelS + 0.4 * uBuild, c = 0.0, w = tdWaves(h);
  if (src == 0) c = w * 1.6;
  else if (src == 1) c = tdBlooms(h) + w * 0.3 * uTd[11];
  else if (src == 2) c = h.groove * pow(specAt(ringIdx(h) / ringN()), 1.5) * 0.08 + w * h.groove * 1.4;
  else if (src == 3) c = (smoothstep(7.0, 0.0, h.d) * (0.03 + 0.25 * kk()) + h.seam * 0.15 * kk()) + w * 0.4 * uTd[11];
  else if (src == 4) {
    float t = uTime * uTd[7] * uSpeed, n = 1.0 - abs(fbm(h.p * 0.012 * uTd[6] + vec2(t, -t * 0.7)) * 2.0 - 1.0);
    c = smoothstep(0.88 - 0.12 * uLevelS - 0.2 * kk(), 1.0, n) * 0.035 + w * 0.6 * uTd[11];
  }
  else if (src == 5) c = w * 0.3;
  else if (src == 6) { float core = 1.0 - smoothstep(0.08, 0.2, h.rad); for (int i = 0; i < 6; i++) if (uPulse[i].y > 0.0 && uPulse[i].z < 1.5) c += core * tdEnv(uPulse[i].x) * uPulse[i].y * 0.35; }
  else if (src == 7) c = dot(video(h.p), vec3(0.3, 0.5, 0.2)) * 0.12 + w * 0.4 * uTd[11];
  return c * lv;
}
void main() {
  H h = heart(gl_FragCoord.xy);
  vec2 p = h.p, c = h.pc;
  float tx = S / uTdN, fr = uTdDt * 60.0, t = uTime * uTd[7] * uSpeed;
  // Flow: curl of a slow noise field (divergence free, so the liquid swirls instead of piling up), stronger with the bass.
  vec2 np = p * 0.01 * uTd[6]; float e = 0.6;
  float n1 = noise(np + vec2(0.0, e) + t) + 0.5 * noise(np * 2.3 + vec2(0.0, e) - t), n2 = noise(np - vec2(0.0, e) + t) + 0.5 * noise(np * 2.3 - vec2(0.0, e) - t);
  float n3 = noise(np + vec2(e, 0.0) + t) + 0.5 * noise(np * 2.3 + vec2(e, 0.0) - t), n4 = noise(np - vec2(e, 0.0) + t) + 0.5 * noise(np * 2.3 - vec2(e, 0.0) - t);
  vec2 vel = vec2(n1 - n2, n4 - n3) * uTd[5] * (0.6 + uTd[11] * (uBassS + 0.8 * kk())) * 1.2;
  vel += h.gP * uTd[8] * (0.35 + uTd[11] * (0.5 * uLevelS + 0.5 * kk())) + h.gP * uMech[1] * 2.5;
  // Feedback transform about the part's centre: zoom, twist (and the shock and twist mechanisms).
  float z = (uTd[3] * (0.6 + 0.6 * uTd[11] * kk()) + 5.0 * uMech[1] - 3.0 * uMech[6]) * 0.003, a = (uTd[4] + 4.0 * uMech[3]) * 0.003;
  vec2 d = p - c; d = mat2(cos(a), -sin(a), sin(a), cos(a)) * d * (1.0 - z * fr);
  vec2 q = c + d - vel * fr;
  if (uTd[10] > 0.5 && p.x > S * 0.5) q.x = S - q.x;
  vec4 P0 = tdAt(q);
  vec4 bl = (tdAt(q + vec2(tx, 0.0) * 1.5) + tdAt(q - vec2(tx, 0.0) * 1.5) + tdAt(q + vec2(0.0, tx) * 1.5) + tdAt(q - vec2(0.0, tx) * 1.5)) * 0.25;
  vec4 F = mix(P0, bl, uTd[9]);
  float keep = pow(clamp(mix(uTd[2], 1.0, uMech[2]), 0.0, 1.0), fr) * (1.0 - 0.3 * uMech[6]);
  float heat = F.r * keep, sp = F.g * pow(0.88, fr) * (1.0 - 0.3 * uMech[6]);
  float pour = (1.0 - uMech[2]) * fr;
  heat += tdInject(h) * uTd[1] * pour;
  heat += uMech[4] * smoothstep(0.35, 0.8, fbm(p * 0.025 + uTime * 0.6)) * 0.25 * pour;     // eruption: the whole heart boils over
  sp += tdSparks(h) * pour;
  float hgt = mix(F.b, heat, 0.12 * fr);
  float inside = smoothstep(-6.0, -2.0, h.d);
  o = vec4(min(heat, 3.0), min(sp, 3.0), min(hgt, 3.0), 1.0) * inside;
}
`;

// The show pass: one function for all 20 effects; their settings come in as uniforms.
export const TD_BANK = { g: "td", title: "טאץ' דיזיינר · לבה צמיגה ופעימות לב", fx: TD_FX.map(([id, name, ico, e, , fn]) => [id, name, ico, e, fn || "fxTd"]), glsl: TD_COMMON + `
vec3 tdRamp(float x, int r) {
  x = max(x, 0.0);
  if (r == 1) return mix(mix(mix(vec3(0.0), pal(0.0) * 0.5, smoothstep(0.0, 0.3, x)), pal(0.3), smoothstep(0.25, 0.7, x)), vec3(1.0), smoothstep(0.9, 1.7, x));
  if (r == 2) return mix(mix(mix(vec3(0.0), vec3(0.0, 0.22, 0.12), smoothstep(0.0, 0.25, x)), vec3(0.1, 0.9, 0.55), smoothstep(0.2, 0.7, x)), vec3(0.85, 1.0, 0.95), smoothstep(0.75, 1.5, x));
  vec3 c = mix(vec3(0.0), vec3(0.35, 0.0, 0.0), smoothstep(0.0, 0.2, x));
  c = mix(c, vec3(0.85, 0.08, 0.0), smoothstep(0.15, 0.45, x));
  c = mix(c, vec3(1.0, 0.45, 0.0), smoothstep(0.4, 0.75, x));
  c = mix(c, vec3(1.0, 0.82, 0.25), smoothstep(0.7, 1.1, x));
  return mix(c, vec3(1.0, 1.0, 0.92), smoothstep(1.05, 1.6, x));
}
float tdHeat(vec4 F) { return pow(max(F.r, 0.0), uTd[13]) * uTd[12]; }
vec3 fxTd(H h) {
  vec2 p = h.p; float tx = S / uTdN;
  int ramp = int(uTdO[0] + 0.5), look = int(uTdO[3] + 0.5);
  vec4 F = tdAt(p);
  float zb = uTdO[2] * (0.25 + kk() + uMech[1]);                       // zoom blur towards the part's centre on the hits
  if (zb > 0.02) { vec4 acc = F; for (int i = 1; i < 7; i++) acc += tdAt(h.pc + (p - h.pc) * (1.0 - zb * 0.035 * float(i))); F = acc / 7.0; }
  float heat = tdHeat(F);
  float hx = tdAt(p + vec2(tx, 0.0)).b - tdAt(p - vec2(tx, 0.0)).b, hy = tdAt(p + vec2(0.0, tx)).b - tdAt(p - vec2(0.0, tx)).b;
  vec3 col;
  if (look == 1) col = tdRamp(heat * 0.7 + length(vec2(hx, hy)) * 9.0 * uTdO[7], ramp);              // veins: bright rims on every blob
  else if (look == 2) {                                                                              // 3D: the heat as a lit height map
    vec3 n = normalize(vec3(-hx * 14.0, -hy * 14.0, 1.0)), L = normalize(vec3(-0.5, -0.6, 0.65));
    float df = max(dot(n, L), 0.0), sp = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);
    col = vec3(0.6) * (0.12 + 0.88 * df) * smoothstep(0.02, 0.35, F.b) + vec3(sp * 0.7) + tdRamp(heat, ramp) * 0.45;
  } else col = tdRamp(heat, ramp);
  if (uTdO[1] > 0.0) {                                                                               // chromatic split, wider on the hits
    vec2 o = normalize(p - h.pc + 1e-3) * uTdO[1] * (1.0 + 2.0 * kk());
    col = vec3(tdRamp(tdHeat(tdAt(p + o)), ramp).r, col.g, max(col.b, tdRamp(tdHeat(tdAt(p - o)), ramp).b * 1.3));
  }
  col += tdRamp(0.9 + F.g, ramp) * min(F.g, 1.5);                                                   // sparks
  col += vec3(1.0) * uMech[5] * (h.groove + h.edge);                                                 // flash
  return col * (h.groove * uTdO[4] + (h.stripe + h.rim) * uTdO[5]) + tdRamp(1.2, ramp) * h.edge * uTdO[6] * (0.3 + kk() + heat * 0.5);
}
// ---- a real heart, built into the element ----
// Front view in element units u (x -0.5..0.5 from the seam, y 0 top .. 1 tip): the seam is the septum with the anterior artery
// on it, the two top lobes are the atria (right atrium on the viewer's left), the ventricles fill the rest down to the apex,
// the great vessels rise inside the cleft and the coronary artery runs in the groove between atria and ventricles.
// Every lub squeezes the ventricles towards the apex and pushes a flush of blood up the vessels; the dub lights the atria.
float rhBeat(int k) { float c = 0.0; for (int i = 0; i < 6; i++) { vec4 P = uPulse[i]; if (P.y > 0.0 && (int(P.z + 0.5) == k || k == 0 && P.z > 2.5)) c += smoothstep(0.0, 0.04, P.x) * exp(-P.x * 5.0) * P.y; } return min(c, 1.5); }
float rhSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
float rhAv(float x) { return 0.36 + 0.5 * x * x; }                         // the groove between atria and ventricles
vec3 fxRealHeart(H h) {
  float lub = rhBeat(0), dub = rhBeat(1), t = uTime;
  vec2 apex = vec2(S * 0.5, S * 0.92), q = apex + (h.p - apex) / (1.0 - 0.06 * lub);   // systole: the muscle draws towards the apex
  vec2 u = vec2(q.x / S - 0.5, q.y / S);
  float yav = rhAv(u.x), atr = smoothstep(0.012, -0.012, u.y - yav);
  // Muscle: fibres that spiral round the ventricles, and the softer wall of the atria.
  float fib = 0.55 + 0.45 * sin((u.x * 1.4 * sign(u.x + 1e-4) + u.y * 0.9) * 140.0 + fbm(u * 9.0) * 5.0);
  vec3 muscle = mix(vec3(0.26, 0.02, 0.035), vec3(0.72, 0.11, 0.12), fib * fib) * (1.0 - atr) + mix(vec3(0.4, 0.06, 0.12), vec3(0.7, 0.16, 0.24), fib) * atr;
  muscle *= 1.0 + 0.9 * lub * (1.0 - atr) + 0.7 * dub * atr;                // the flush of each beat
  float fat = exp(-pow((u.y - yav) / 0.03, 2.0)) * 0.7;                      // fat along the groove, as on a real heart
  vec3 col = mix(muscle, vec3(0.85, 0.7, 0.35), fat * 0.45);
  // Vessels: distance in element units, and how far along each one the blood has come.
  float lx = 0.012 * sin(u.y * 11.0);
  float dA = abs(u.x - lx) + step(u.y, yav) * 9.0 + step(0.9, u.y) * (u.y - 0.9) * 4.0, along = u.y;   // anterior artery on the septum
  for (int i = 0; i < 6; i++) {                                                 // its branches over both ventricles
    float fi = float(i), y0 = yav + 0.05 + fi * 0.075, sx = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
    float d = rhSeg(u, vec2(lx, y0), vec2(sx * (0.2 + 0.05 * hash11(fi)), y0 + 0.17 + 0.04 * hash11(fi + 3.0)));
    if (d < dA) { dA = d * 1.3; along = y0 + length(u - vec2(lx, y0)); }
  }
  float dC = abs(u.y - yav) + 0.004;                                           // the coronary artery round the groove
  if (dC < dA) { dA = dC; along = yav + abs(u.x); }
  float dAo = rhSeg(u, vec2(0.02, yav - 0.02), vec2(0.08, 0.18)) - 0.034;      // aorta and pulmonary trunk rising in the cleft
  float dPu = rhSeg(u, vec2(-0.035, yav - 0.01), vec2(-0.09, 0.19)) - 0.03;
  float dVc = rhSeg(u, vec2(-0.27, 0.13), vec2(-0.25, yav - 0.03)) - 0.022;     // the vena cava into the right atrium
  float art = 1.0 - smoothstep(0.004, 0.011, dA), big = 1.0 - smoothstep(0.0, 0.006, min(dAo, dPu)), vein = 1.0 - smoothstep(0.0, 0.006, dVc);
  float rim = exp(-abs(min(dAo, dPu)) * 220.0) + exp(-abs(dVc) * 220.0);
  // Blood: a wave runs out along the arteries after every lub, and up the great vessels.
  float wave = 0.0; for (int i = 0; i < 6; i++) { vec4 P = uPulse[i]; if (P.y > 0.0 && P.z < 0.5) wave += exp(-pow((along - (yav + P.x * 1.2)) / 0.05, 2.0)) * exp(-P.x * 2.0) * P.y; }
  float flowA = 0.6 + 0.4 * sin(along * 60.0 - t * 6.0);
  vec3 blood = vec3(1.0, 0.22, 0.12) * (0.6 + 0.45 * flowA + 1.6 * wave), veinC = vec3(0.22, 0.2, 0.7) * (0.7 + 0.5 * dub);
  col *= 1.0 - 0.65 * exp(-pow((dA - 0.012) / 0.004, 2.0));                    // a dark edge, so every artery stands out of the muscle
  col = mix(col, blood, art); col = mix(col, vec3(0.8, 0.12, 0.12) * (0.6 + 1.2 * lub), big); col = mix(col, veinC, vein);
  col += vec3(1.0, 0.85, 0.8) * rim * 0.3;
  // Light over the heart's dome and its cut grooves, so it reads as a solid organ; the liquid adds a glow of blood.
  vec3 lit = litMat(h, col, normalize(vec3(-0.4, -0.6, 0.7)), 40.0 + 12.0 * lub, 0.9, 30.0, 0.25);
  float heat = tdHeat(tdAt(h.p));
  lit += vec3(0.9, 0.05, 0.03) * heat * 0.35 * (art + big);
  if (int(uTdO[0] + 0.5) == 1) {   // neon: only the outlines, the vessels and the groove, in the show's colours
    float ln = max(max(art, rim), exp(-abs(u.y - yav) * 300.0));
    lit = pal(along + uFlow) * ln * (0.5 + 1.2 * wave + 0.6 * lub) + pal(0.5 + uFlow) * (1.0 - atr) * lub * 0.25 + pal(0.0) * atr * dub * 0.3;
  }
  return lit * (h.groove * 1.3 + (h.stripe + h.rim) * 0.95 + h.seam * 1.1) + vec3(1.0, 0.4, 0.45) * h.edge * (0.25 + 0.8 * lub);
}
` };
