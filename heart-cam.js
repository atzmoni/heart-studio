// Live camera on the heart: the camera (or any loaded video) is redrawn in real time as stained glass, comic, neon lines,
// thermal, engraving along the rings... Inspired by the "neural in real time" reel: a person in front of the camera shown
// on the wall as a vivid stained-glass portrait. Everything is drawn on the cut: the lead lines fall on the grooves
// (h.groove), the glass on the hearts between them (h.stripe) and the contour (h.edge) glows. Runs on the GPU, offline.

export const CAM_FX = [
  [206, "ויטראז' חי · מצלמה כזכוכית צבעונית", "🪟", 1, "fxCamGlass"],
  [207, "ויטראז' לבבות · הזכוכית נחתכת בתעלות", "❤️‍🔥", 1, "fxCamGlassCut"],
  [208, "קומיקס פופ-ארט", "💥", 2, "fxCamPop"],
  [209, "קווי ניאון מהמצלמה", "🖍️", 1, "fxCamNeon"],
  [210, "מצלמה תרמית", "🌡️", 1, "fxCamThermal"],
  [211, "פסיפס פיקסלים על הבס", "🧩", 2, "fxCamPixel"],
  [212, "מראה · שני חצאים", "🪞", 1, "fxCamMirror"],
  [213, "חריטה בטבעות הלב", "〰️", 0, "fxCamEngrave"],
  [214, "ציור שמן", "🎨", 0, "fxCamOil"],
  [215, "רנטגן · נגטיב על הקיק", "☢️", 2, "fxCamXray"],
];
export const isCam = id => id >= 206 && id <= 215;

export const CAM_BANK = { g: "cam", title: "מצלמה חיה · שידור על הלב עם אפקטים", fx: CAM_FX, glsl: `
// ---------- live camera (heart-cam.js) ----------
vec2 camUV(vec2 p) { vec2 uv = p / S - 0.5; if (uVidAspect > 1.0) uv.x /= uVidAspect; else uv.y *= uVidAspect; return clamp(uv + 0.5, 0.002, 0.998); }
// Without a camera: a slow generated portrait-like glow, so the effect still shows something while the camera starts.
vec3 camFake(vec2 uv) {
  vec2 q = uv * 3.0 + vec2(uTime * 0.07, -uTime * 0.05);
  float n = noise(q) * 0.6 + noise(q * 2.3 + 4.0) * 0.4, f = smoothstep(0.42, 0.1, length((uv - vec2(0.5, 0.45)) * vec2(1.25, 1.0)));
  return pal(n + uTime * 0.03) * (0.25 + 0.8 * f) * (0.5 + n);
}
vec3 camAt(vec2 uv) { return uVidOn > 0.5 ? texture(uVid, uv).rgb : camFake(uv); }
vec3 cam(vec2 p) { return camAt(camUV(p)); }
float camL(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec2 camPx() { return uVidOn > 0.5 ? 1.0 / vec2(textureSize(uVid, 0)) : vec2(1.0 / 320.0); }
// Edges of the picture (Sobel on brightness), r = step in camera pixels.
float camEdge(vec2 uv, float r) {
  vec2 d = camPx() * r;
  float tl = camL(camAt(uv + d * vec2(-1, -1))), t = camL(camAt(uv + d * vec2(0, -1))), tr = camL(camAt(uv + d * vec2(1, -1)));
  float l = camL(camAt(uv + d * vec2(-1, 0))), rr = camL(camAt(uv + d * vec2(1, 0)));
  float bl = camL(camAt(uv + d * vec2(-1, 1))), b = camL(camAt(uv + d * vec2(0, 1))), br = camL(camAt(uv + d * vec2(1, 1)));
  float gx = tr + 2.0 * rr + br - tl - 2.0 * l - bl, gy = bl + 2.0 * b + br - tl - 2.0 * t - tr;
  return length(vec2(gx, gy));
}
vec3 camSat(vec3 c, float s) { float l = camL(c); return max(mix(vec3(l), c, s), 0.0); }
// Voronoi cells: x = distance to the nearest centre, y = distance to the border, zw = the nearest cell's id.
vec4 camVor(vec2 x, float jit) {
  vec2 n = floor(x), f = fract(x), mg = vec2(0.0), mr = vec2(0.0); float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(i, j), o = vec2(hash21(n + g), hash21(n + g + 17.3)); o = 0.5 + jit * (o - 0.5);
    vec2 r = g + o - f; float d = dot(r, r); if (d < md) { md = d; mr = r; mg = g; }
  }
  float bd = 8.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(i, j), o = vec2(hash21(n + g), hash21(n + g + 17.3)); o = 0.5 + jit * (o - 0.5);
    vec2 r = g + o - f; if (dot(mr - r, mr - r) > 1e-5) bd = min(bd, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  return vec4(sqrt(md), bd, n + mg);
}
// The glass colour of one cell: the camera's colour at the cell, pushed to vivid stained-glass hues.
vec3 camGlassCol(vec3 v, vec2 id) {
  float l = camL(v), hr = hash21(id + 3.1);
  vec3 tint = pal(hr * 0.7 + l * 0.6 + uFlow * 0.3);
  vec3 c = mix(camSat(v, 2.2), tint * (0.35 + 1.1 * l), 0.45 + 0.25 * hr);
  return c * (0.55 + 1.1 * smoothstep(0.05, 0.75, l));
}
vec3 camLeadGlow(H h) { return vec3(1.0, 0.86, 0.95) * h.edge * (0.6 + 0.8 * kk()) + pal(uFlow) * h.groove * 0.15; }
vec3 fxCamGlass(H h) {          // the reel: the person as a stained-glass portrait; lead lines between the panes, the outline glows
  float cs = 9.0 - 3.0 * uBassS;                                       // pane size in cm, finer with the bass
  vec2 q = h.p / cs;
  vec4 v = camVor(q, 0.9);
  vec3 cc = cam((v.zw + 0.5) * cs), px = cam(h.p);
  vec3 glass = camGlassCol(mix(cc, px, 0.35), v.zw);
  vec2 uv = camUV(h.p);
  float e = camEdge(uv, 1.5), lead = smoothstep(0.09, 0.02, v.y) , ink = smoothstep(0.25, 0.6, e);
  float lit = smoothstep(0.35, 1.0, e) * (0.6 + uHighS);                // strong outlines of the figure glow white-pink
  glass *= (1.0 - 0.85 * lead) * (1.0 - 0.8 * ink);
  glass += vec3(1.0, 0.75, 0.95) * lit * (1.0 - lead) * 0.9;
  glass *= 0.75 + 0.35 * uLevelS + 0.35 * kk();
  return glass * (h.stripe + h.groove * 0.35) + camLeadGlow(h);
}
vec3 fxCamGlassCut(H h) {       // the panes follow the cut: every heart band is split into panes by angle, the grooves are the lead
  float r = ringIdx(h), segs = 10.0 + r * 4.0, a = atan(h.p.y - S * 0.55, h.p.x - S * 0.5) / 6.28318 + 0.5;
  float sx = floor(a * segs + hash11(r) * 3.0), id = r * 97.0 + sx;
  vec2 uv = camUV(h.p);
  vec3 v = cam(h.p), g = camGlassCol(mix(v, camAt(clamp(uv + (hash21(vec2(id, 2.0)) - 0.5) * 0.01, 0.0, 1.0)), 0.5), vec2(id, r));
  float bd = abs(fract(a * segs + hash11(r) * 3.0) - 0.5) * 2.0, lead = smoothstep(0.9, 0.97, bd);
  float e = smoothstep(0.25, 0.6, camEdge(uv, 1.5));
  g *= (1.0 - 0.85 * lead) * (1.0 - 0.7 * e) * (0.75 + 0.4 * uLevelS + 0.3 * kk());
  return g * h.stripe + vec3(0.9, 0.8, 1.0) * h.groove * (0.25 + 0.75 * kk() + 0.3 * uHighS) + camLeadGlow(h);
}
vec3 fxCamPop(H h) {            // comic: posterised colours, halftone dots and black ink; a new colour set on every beat
  vec2 uv = camUV(h.p); vec3 v = cam(h.p); float l = camL(v);
  float lev = floor(l * 4.0) / 3.0;
  vec3 col = pal(lev * 0.5 + hash11(uBeatN) * 0.5 + h.side * 0.25);
  vec2 g = fract(h.p / (2.2 + 1.5 * uBassS)) - 0.5; float dt = step(length(g), 0.5 * sqrt(1.0 - l));
  vec3 c = mix(col * 1.2, col * 0.35, dt * (1.0 - lev));
  c *= 1.0 - smoothstep(0.3, 0.55, camEdge(uv, 1.2));
  return c * (h.stripe + h.groove * 0.6) * (0.8 + 0.5 * kk()) + vec3(1.0) * h.edge * (0.5 + kk());
}
vec3 fxCamNeon(H h) {           // only the edges of the picture, as glowing neon in the palette, on black
  vec2 uv = camUV(h.p); float e = camEdge(uv, 1.0 + uBassS), e2 = camEdge(uv, 3.0);
  float line = smoothstep(0.18, 0.5, e), glow = smoothstep(0.1, 0.9, e2) * 0.5;
  vec3 c = pal(h.rad * 0.6 + uFlow * 0.5 + camL(cam(h.p)) * 0.4);
  return c * (line * 1.6 + glow) * (0.6 + 0.6 * uLevelS + kk() * 0.6) * (h.stripe + h.groove) + c * h.edge * 0.4;
}
vec3 fxCamThermal(H h) {        // a heat camera: brightness as heat, hotter with the music
  float t = clamp(camL(cam(h.p)) * (0.9 + 0.4 * uLevelS) + kk() * 0.15, 0.0, 1.0);
  vec3 c = t < 0.25 ? mix(vec3(0.0, 0.0, 0.15), vec3(0.3, 0.0, 0.6), t * 4.0)
         : t < 0.5 ? mix(vec3(0.3, 0.0, 0.6), vec3(0.95, 0.1, 0.2), (t - 0.25) * 4.0)
         : t < 0.75 ? mix(vec3(0.95, 0.1, 0.2), vec3(1.0, 0.7, 0.0), (t - 0.5) * 4.0)
         : mix(vec3(1.0, 0.7, 0.0), vec3(1.0, 1.0, 0.9), (t - 0.75) * 4.0);
  return c * (h.stripe + h.groove * 1.2) + c * h.edge * 0.5;
}
vec3 fxCamPixel(H h) {          // big pixels that get finer with the bass; each groove ring flashes on the kick
  float cs = mix(8.0, 2.5, uBassS);
  vec2 q = (floor(h.p / cs) + 0.5) * cs;
  vec3 c = camSat(cam(q), 1.5); vec2 f = abs(fract(h.p / cs) - 0.5);
  c *= 1.0 - 0.6 * smoothstep(0.42, 0.5, max(f.x, f.y));
  return c * (h.stripe + h.groove * (0.6 + kk())) + vec3(1.0) * h.edge * kk();
}
vec3 fxCamMirror(H h) {         // the left half shows the camera, the right half its mirror (or swapped on alternate bars)
  vec2 p = h.p; bool flip = mod(uBar, 2.0) < 1.0 ? h.side > 0.5 : h.side < 0.5;
  if (flip) p.x = S - p.x;
  vec3 c = camSat(cam(p), 1.4) * (0.8 + 0.4 * uLevelS);
  return c * (h.stripe + h.groove * 0.5) + pal(uFlow + h.side * 0.5) * (h.groove * (0.3 + kk()) + h.edge);
}
vec3 fxCamEngrave(H h) {        // engraving: the picture drawn as lines that run along the heart's rings; thicker where it is dark
  float l = camL(cam(h.p)), ln = abs(fract(h.rad * (36.0 + 12.0 * uBassS) - uTime * 0.2) - 0.5) * 2.0;
  float ink = smoothstep(l * 1.1, l * 1.1 + 0.12, ln);
  vec3 c = mix(vec3(1.0, 0.95, 0.85), pal(h.rad + uFlow * 0.3), 0.35) * ink;
  return c * (0.6 + 0.5 * uLevelS) * h.stripe + pal(uFlow) * h.groove * (0.3 + 0.7 * kk()) + vec3(1.0) * h.edge * 0.6;
}
vec3 fxCamOil(H h) {            // an oil painting: smoothed and posterised colours with brush strokes that flow with the music
  vec2 uv = camUV(h.p), px = camPx() * 3.0; vec3 s = vec3(0.0);
  float a = noise(h.p * 0.08 + uTime * 0.2) * 6.28;
  vec2 dir = vec2(cos(a), sin(a));
  for (int i = -3; i <= 3; i++) s += camAt(clamp(uv + dir * px * float(i), 0.0, 1.0));
  s /= 7.0; s = floor(camSat(s, 1.6) * 6.0 + 0.5) / 6.0;
  return s * (0.8 + 0.4 * uLevelS) * (h.stripe + h.groove * 0.4) + pal(uFlow) * h.groove * 0.3 + s * h.edge;
}
vec3 fxCamXray(H h) {           // x-ray: inverted, cold and split into colours; it flips back on every kick
  vec2 uv = camUV(h.p), d = vec2(0.004 + 0.012 * uBassS, 0.0);
  vec3 c = vec3(camAt(uv + d).r, camAt(uv).g, camAt(uv - d).b);
  vec3 neg = (1.0 - c) * vec3(0.55, 0.85, 1.2);
  vec3 o = mix(neg, camSat(c, 1.5), smoothstep(0.3, 0.9, kk()));
  o += vec3(0.6, 0.9, 1.0) * smoothstep(0.3, 0.7, camEdge(uv, 1.5)) * 0.6;
  return o * (h.stripe + h.groove * 0.8) + vec3(0.6, 0.9, 1.0) * h.edge;
}
` };
