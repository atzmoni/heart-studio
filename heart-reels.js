// Three effects drawn from three reels the user collected (2026-11-08), each rebuilt for the cut of the heart and the music clock.
// Written from scratch here, from the look of each reel only:
//   220  "only when the light hits me": a dark blue room, a moving flashlight, and wherever it lands the heart turns into a
//        bright cyan point cloud with vertical scan streaks (the grooves light up as solid lines inside the beam).
//   221  neon bubbles: round blobs of flat neon colour (green, cyan, yellow, magenta, red) pop in at random places on the beat,
//        swell and shrink away; on hits a bubble splits into red, green and blue copies like a glitch.
//   222  audio pulse ring: a dim golden ring (the heart's contour) catches fire in clumps that follow the spectrum, and a
//        glowing orb in the middle bounces with the kick.
// Like every bank they only use the heart reading (h.groove, h.stripe, h.edge) and the music uniforms, so they run offline
// with the live microphone.

export const REELS_FX = [
  [220, "רק כשהאור פוגע · ענן נקודות", "🔦", 1, "fxRlLight"],
  [221, "בועות ניאון", "🫧", 2, "fxRlBubbles"],
  [222, "טבעת פולס זהובה", "🔥", 2, "fxRlRing"],
];

export const REELS_BANK = { g: "reels", title: "מהסרטונים · אור, בועות ניאון וטבעת פולס", fx: REELS_FX, glsl: `
// ---------- effects from the reels (heart-reels.js) ----------
// 220: a flashlight sweeps the dark heart; under it every heart between grooves becomes a cyan dot matrix with scan streaks.
vec2 rlBeam(float k) {           // the flashlight: a slow wander, faster with the music, and a jump on every kick
  float t = uTime * (0.22 + 0.25 * uLevelS) + k * 3.7 + floor(clockB() / 2.0) * 0.9 * step(0.6, kk());
  return vec2(S * 0.5 + S * 0.32 * sin(t * 1.3 + k), S * 0.48 + S * 0.26 * sin(t * 0.9 + 1.7 + k * 2.0));
}
vec3 fxRlLight(H h) {
  vec2 b0 = rlBeam(0.0), b1 = rlBeam(5.0);
  float R = S * (0.17 + 0.1 * uBassS + 0.06 * kk());
  // the lit shape is not a clean disc: it breaks into a ragged silhouette like a body caught by the light
  float rag = (fbm(h.p * 0.035 + vec2(0.0, uTime * 0.3)) - 0.5) * R * 1.1;
  float l0 = 1.0 - smoothstep(R * 0.55, R, length(h.p - b0) + rag);
  float l1 = (1.0 - smoothstep(R * 0.4, R * 0.8, length(h.p - b1) + rag)) * smoothstep(0.25, 0.6, uLevelS);
  float lit = clamp(l0 + l1, 0.0, 1.0);
  // the point cloud: a fine dot grid (about 1.6 cm) and vertical streaks that run down the columns
  vec2 c = h.p / 1.6, f = fract(c) - 0.5;
  float dotM = 1.0 - smoothstep(0.18, 0.36, length(f));
  float col = floor(c.x), streak = smoothstep(0.55, 0.95, noise(vec2(col * 0.37, h.p.y * 0.02 - uTime * (0.6 + 2.0 * uHighS))));
  float twinkle = 0.6 + 0.4 * hash21(floor(c) + floor(uTime * 10.0));
  vec3 cyan = hueShift(vec3(0.15, 0.9, 1.0), uHue), deep = hueShift(vec3(0.02, 0.03, 0.16), uHue);
  vec3 cloud = cyan * (dotM * twinkle * 1.2 + streak * 0.7) * lit;
  vec3 dark = deep * (0.6 + 0.4 * dotM) + cyan * dotM * 0.05;   // the room: navy, the dots barely there
  vec3 o = (dark + cloud) * h.stripe;
  o += (deep * 1.5 + cyan * (lit * (1.3 + kk() * 0.6) + 0.06)) * h.groove;   // grooves: solid lines in the beam
  o += cyan * h.edge * (0.15 + 0.85 * lit);
  return o;
}

// 221: neon bubbles pop in on the beat at random places, swell and shrink away; on hits they split into R, G and B.
vec3 rlNeon(float s) {
  int i = int(floor(hash11(s * 3.3) * 5.0));
  vec3 c = i == 0 ? vec3(0.2, 1.0, 0.35) : i == 1 ? vec3(0.1, 0.95, 1.0) : i == 2 ? vec3(1.0, 0.95, 0.1) : i == 3 ? vec3(1.0, 0.1, 0.75) : vec3(1.0, 0.25, 0.12);
  return hueShift(c, uHue);
}
vec3 fxRlBubbles(H h) {
  vec3 o = vec3(0.0);
  float gl = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i), len = 1.0 + mod(fi, 3.0);                  // each slot lives 1, 2 or 3 beats
    float tb = clockB() / len + fi * 0.37, n = floor(tb), a = fract(tb), s = n * 13.1 + fi * 7.7;
    vec2 c = vec2(0.12 + 0.76 * hash11(s), 0.12 + 0.76 * hash11(s + 1.9)) * S;
    float env = smoothstep(0.0, 0.12, a) * (1.0 - smoothstep(0.55, 1.0, a));   // pop in fast, shrink away
    float R = S * (0.05 + 0.13 * hash11(s + 4.2)) * env * (0.8 + 0.4 * uBassS);
    if (R < 0.5) continue;
    vec3 c3 = rlNeon(s);
    // glitch: on a hit some bubbles split into three offset colour channels
    float sp = step(0.55, hash11(s + 8.0)) * clamp(uHit + kk() * 0.5, 0.0, 1.0) * R * 0.35;
    vec2 off = vec2(cos(s), sin(s)) * sp;
    vec3 m = vec3(1.0 - smoothstep(R - 1.2, R + 1.2, length(h.p - c - off)),
                  1.0 - smoothstep(R - 1.2, R + 1.2, length(h.p - c)),
                  1.0 - smoothstep(R - 1.2, R + 1.2, length(h.p - c + off)));
    vec3 col = sp > 0.5 ? m * mix(c3, vec3(1.0), 0.35) : c3 * m.g;
    float soft = 0.75 + 0.25 * smoothstep(R, 0.0, length(h.p - c));   // flat neon with a slightly brighter middle
    o = max(o, col * soft);
    gl = max(gl, m.g);
  }
  vec3 base = pal(0.6) * 0.04;
  return (base + o) * h.stripe * (0.85 + 0.3 * uLevelS)
       + (o * 0.6 + vec3(1.0) * gl * (0.35 + 0.65 * kk())) * h.groove     // grooves cut through the bubbles as bright lines
       + (o + vec3(0.25)) * h.edge * 0.8;
}

// 222: the contour is a dim golden ring that catches fire in clumps (one clump per slice of the spectrum), and an orb in the
// middle swells and bounces with the kick. The fire stays on the outer rings and bleeds inwards with the energy.
vec3 rlFire(float x) { x = clamp(x, 0.0, 1.6); return hueShift(vec3(1.0, 0.42, 0.08) * x + vec3(0.0, 0.35, 0.3) * max(x - 0.6, 0.0) * 1.4, uHue); }
vec3 fxRlRing(H h) {
  vec2 q = h.p - uCenter;
  float ang = atan(q.y, q.x) / TAU + 0.5, N = 28.0, cell = floor(ang * N), fa = fract(ang * N);
  // the clump in this slice: its loudness from the spectrum, a flicker of its own, and a ragged flame shape along the ring
  float e = 0.28 + specAt(fract(cell / N * 2.0)) * (0.6 + 0.8 * uLevelS) + kk() * 0.4;   // a low flame even in silence
  float fl = 0.55 + 0.45 * noise(vec2(cell * 1.7, uTime * 6.0));
  float on = step(0.35, hash21(vec2(cell, floor(clockB())))) * smoothstep(0.15, 0.5, e);
  float shape = smoothstep(0.5, 0.1, abs(fa - 0.5 + 0.15 * sin(uTime * 3.0 + cell))) * (0.6 + 0.6 * noise(h.p * 0.25 + uTime * 2.0));
  float reach = 0.06 + 0.22 * e;                                    // how far in from the contour the fire reaches (0..1 of rad)
  float depth = exp(-(1.0 - h.rad) / reach);
  float fire = on * shape * fl * e * depth * 1.8;
  // the orb: a fiery ball near the centre, pushed down on each kick and springing back
  vec2 oc = uCenter + vec2(0.0, S * 0.12 * kk() * (1.0 - uPump));
  float oR = S * (0.035 + 0.02 * uBassS + 0.03 * kk()), od = length(h.p - oc);
  float orb = (1.0 - smoothstep(oR * 0.6, oR, od + (noise(h.p * 0.3 + uTime * 3.0) - 0.5) * oR * 0.5)) * 1.3 + exp(-od / (oR * 1.4)) * 0.5;
  vec3 dim = hueShift(vec3(0.16, 0.09, 0.03), uHue) * (0.4 + 0.6 * h.rad);   // warm dark room, lighter near the ring
  vec3 o = (dim * 0.35 + rlFire(fire) + rlFire(orb)) * h.stripe;
  o += (dim * 0.8 + rlFire(fire * 1.4 + orb * 0.8)) * h.groove;
  o += (hueShift(vec3(0.55, 0.38, 0.15), uHue) * 0.35 + rlFire(on * shape * fl * e * 1.6)) * h.edge;   // the ring itself
  return o;
}
` };
