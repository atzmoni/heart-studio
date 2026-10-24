// 100 more effects for the heart (ids 64-163), in ten banks of ten. Each bank compiles as its own small shader program
// (see HeartGL), so the studio starts as fast as before and a bank is only built when one of its effects plays.
// Ideas taken from the effect families of the leading mapping and VJ tools (Resolume, MadMapper, HeavyM, TouchDesigner,
// Notch), then written from scratch for this heart: every effect draws on the parts of the real cut (grooves, the hearts
// between them, the contour, the seam) through the H struct of heart-gl.js, and every one listens to the music.
// Entries: [id, Hebrew name, icon, energy class (0 calm, 1 medium, 2 intense, 3 strobe-like), GLSL function].

// Helpers the new banks share. They come after the shared helpers of heart-gl.js, so ringIdx, specAt, nCut... are there.
export const FX_COMMON = `
float rk(H h) { return ringIdx(h) / ringN(); }            // 0 the inner heart .. 1 the outer ring
float kb() { return exp(-uBeat * 6.0); }                  // a short flash on every beat
// Voronoi: x = distance to the nearest cell border, y and z = two random values of the nearest cell.
vec3 vor(vec2 x) {
  vec2 n = floor(x), f = fract(x), mid = vec2(0.0); float md = 8.0, md2 = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j)), o = vec2(hash21(n + g), hash21(n + g + 17.3)), r = g + o - f; float d = dot(r, r);
    if (d < md) { md2 = md; md = d; mid = n + g; } else if (d < md2) md2 = d;
  }
  return vec3(sqrt(md2) - sqrt(md), hash21(mid), hash21(mid + 5.1));
}
// Hexagon cells: xy = position inside the cell, zw = the cell's centre (in cell units).
vec4 hexC(vec2 p) {
  vec2 r = vec2(1.0, 1.7320508), hr = r * 0.5, a = mod(p, r) - hr, b = mod(p - hr, r) - hr;
  vec2 g = dot(a, a) < dot(b, b) ? a : b; return vec4(g, p - g);
}
// Water caustics: bright folded lines from a warped double sine.
float caus(vec2 p, float t) {
  vec2 q = p + vec2(fbm(p + t * 0.3), fbm(p - t * 0.25 + 3.7)) * 1.6;
  float a = abs(sin(q.x * 2.1 + t) + sin(q.y * 1.9 - t * 0.8));
  return pow(max(1.0 - a * 0.6, 0.0), 6.0);
}
// A material lit over the heart's dome and its V cut grooves.
vec3 litMat(H h, vec3 base, vec3 L, float hm, float steep, float sh, float spk) {
  vec3 n = nMix(nDome(h, hm), nCut(h, steep));
  return base * (0.12 + 0.88 * dif(n, L)) * ao(h) + vec3(1.0) * spc(n, L, sh) * spk;
}
`;

export const FX_BANKS = [
  // ---------- mirrors and kaleidoscopes (Resolume Kaleidoscope, Mirror, Bendoscope, Tile, Stingy Sphere) ----------
  { g: "mirror", title: "מראות וקליידוסקופ", fx: [
    [64, "מראת פרפר", "🦋", 0, "fxKMirror"],
    [65, "קליידוסקופ לב", "🔯", 1, "fxKSeg"],
    [66, "אריחי לבבות", "💠", 1, "fxKTile"],
    [67, "בנדוסקופ", "🌀", 1, "fxKBend"],
    [68, "מראה מרובעת", "🪟", 2, "fxKQuad"],
    [69, "פריזמה", "🔺", 0, "fxKPrism"],
    [70, "טבעות מראה", "⭕", 1, "fxKRings"],
    [71, "כדור מראות", "🪩", 1, "fxKSphere"],
    [72, "מנדלה", "🏵️", 0, "fxKMandala"],
    [73, "מראת אינסוף", "♾️", 1, "fxKInf"],
  ], glsl: `
vec3 fxKMirror(H h) {            // a flowing picture mirrored on the seam like butterfly wings; the bass pushes it, the kick lights the grooves
  vec2 q = vec2(abs(h.p.x - S * 0.5), h.p.y); float t = uTime * 0.15 * uSpeed;
  float n = fbm(q * 0.02 + vec2(t, -t * 0.7) + uBassS * 0.6);
  vec3 col = pal(n * 1.4 + uFlow);
  return col * smoothstep(0.35, 0.75, n) * (h.stripe * (0.5 + 0.6 * uLevelS) + h.groove * (0.6 + 1.2 * kk())) + vec3(1.0) * h.seam * kb() + col * h.edge * 0.4;
}
vec3 fxKSeg(H h) {               // a kaleidoscope around the ring centre: 6, 8 or 10 mirrors, a new count every bar
  vec2 q = h.p - uCenter; float n = 6.0 + 2.0 * mod(floor(clockB() / 4.0), 3.0), seg = TAU / n;
  float a = abs(mod(atan(q.y, q.x) + clockB() * 0.08 * uSpeed, seg) - seg * 0.5);
  vec2 k = vec2(cos(a), sin(a)) * length(q) * 0.03;
  float v = sin(k.x * 3.0 + uTime * uSpeed) * sin(k.y * 5.0 - uTime * 0.7) + fbm(k + uTime * 0.1);
  vec3 col = pal(v * 0.5 + h.rad * 0.4 + uFlow);
  return col * (0.15 + 0.85 * smoothstep(0.1, 0.9, v)) * (h.stripe * 0.7 + h.groove * (0.8 + kk())) * (0.5 + 0.6 * uLevelS) + vec3(1.0) * h.edge * 0.3;
}
vec3 fxKTile(H h) {              // tiles of small mirrored hearts, each one beating with its own band of the spectrum; more tiles on the drop
  float n = uDrop > 0.3 ? 8.0 : 4.0 + 2.0 * step(0.5, fract(clockB() / 8.0));
  vec2 g = h.p / S * n, id = floor(g), f = fract(g) - 0.5;
  if (mod(id.x + id.y, 2.0) > 0.5) f.x = -f.x;
  float v = specAt(hash21(id)), sc = 0.36 + 0.12 * v + 0.05 * kk();
  vec2 hp = f / sc; hp.y = -hp.y + 0.55;
  float d = sdHeart(hp), m = 1.0 - smoothstep(0.0, 0.05, d), ln = exp(-abs(d) * 30.0);
  vec3 col = pal(hash21(id) + uFlow);
  return col * (m * (0.25 + 0.9 * v) * h.stripe + ln * h.groove * 1.4) + col * 0.04 * h.stripe + vec3(1.0) * h.edge * 0.35;
}
vec3 fxKBend(H h) {              // a bent kaleidoscope: eight mirrors twisted by the bass
  vec2 q = h.p - uCenter; float r = length(q) / S, tw = 2.0 + 6.0 * uBassS, n = 8.0;
  float a = atan(q.y, q.x) + r * tw - uTime * 0.3 * uSpeed; a = abs(mod(a, TAU / n) - TAU / n * 0.5);
  float v = 0.5 + 0.5 * sin(a * 18.0 + r * 30.0 - uTime * 2.0 * uSpeed);
  vec3 col = pal(r * 2.0 + a + uFlow);
  return col * v * v * (h.stripe * 0.7 + h.groove * 1.3) * (0.45 + 0.7 * uLevelS) + vec3(1.0) * h.groove * kb() * 0.3 + col * h.edge * 0.3;
}
vec3 fxKQuad(H h) {              // a four-way mirror (left-right on the seam, up-down on the ring centre); the colour turns every beat
  vec2 q = abs(h.p - uCenter); float T = clockB();
  float v = sin((q.x + q.y) * 0.12 - T * 1.5 * uSpeed) * sin(max(q.x, q.y) * 0.08 + T * 0.5), l = smoothstep(0.6, 0.95, abs(v));
  vec3 col = pal(floor(T) * 0.25 + (q.x - q.y) * 0.002);
  return col * l * (h.groove * 1.5 + h.stripe * 0.5) * (0.4 + 0.8 * uLevel) + pal(0.5) * h.stripe * 0.05 + vec3(1.0) * h.edge * kk() * 0.6;
}
vec3 fxKPrism(H h) {             // a mirrored picture split into red, green and blue; the highs split it further
  vec2 q = vec2(abs(h.p.x - S * 0.5), h.p.y) * 0.03, t = vec2(uTime * 0.2 * uSpeed, 0.0); float o = 0.05 + 0.4 * uHighS;
  vec3 c = smoothstep(0.35, 0.8, vec3(fbm(q + t + o), fbm(q + t), fbm(q + t - o)));
  return hueShift(c, uHue + uFlow) * (h.stripe * (0.5 + 0.6 * uLevelS) + h.groove * 1.2) + vec3(1.0) * h.edge * 0.3 * (0.5 + kk());
}
vec3 fxKRings(H h) {             // every ring reflects the next: a pattern runs along them in turn, mirrored on the seam, bright with its band
  float k = rk(h), dir = mod(ringIdx(h), 2.0) < 0.5 ? 1.0 : -1.0, u = abs(h.uc - 0.5) * 2.0;
  float v = 0.5 + 0.5 * sin(u * 18.85 + dir * clockB() * 1.5 * uSpeed + k * 6.0);
  vec3 col = pal(k * 0.7 + uFlow);
  return col * v * v * v * (0.25 + specAt(k)) * (h.groove * 1.5 + h.stripe * 0.6) + vec3(1.0) * h.edge * 0.3;
}
vec3 fxKSphere(H h) {            // a mirror ball turning over the dome, its facets glinting with the highs
  vec2 q = (h.p - uCenter) / (S * 0.55); float z = sqrt(max(1.0 - dot(q, q), 0.0));
  vec2 g = vec2(atan(q.x, max(z, 0.05)) + uTime * 0.25 * uSpeed, asin(clamp(q.y, -1.0, 1.0))) * 8.0, id = floor(g), f = fract(g) - 0.5;
  float on = step(0.75 - 0.5 * uHighS, hash21(id + floor(uTime * 6.0))), dv = 1.0 - smoothstep(0.15, 0.4, length(f));
  vec3 col = mix(pal(hash21(id) + uFlow), vec3(1.0), 0.5);
  return col * dv * (0.15 + on) * (0.3 + 0.7 * z) * (h.stripe * 0.8 + h.groove * 1.4) * (0.5 + 0.7 * uLevelS) + vec3(1.0) * h.edge * 0.25;
}
vec3 fxKMandala(H h) {           // a mandala of twelve petals growing out from the inner heart, opening with the breath
  vec2 q = h.p - uCenter; float a = atan(q.y, q.x), br = breathV(0.0);
  float pet = abs(cos(a * 6.0 + h.rad * 2.0)), lay = fract(h.rad * 5.0 - uTime * 0.1 * uSpeed);
  float m = exp(-abs(pet - lay * (0.6 + 0.4 * br)) * 14.0);
  vec3 col = pal(floor(h.rad * 5.0) * 0.2 + uFlow);
  return col * m * (h.stripe * 0.8 + h.groove * 1.5) * (0.4 + 0.6 * uBassS + 0.4 * kk()) + col * 0.05 * h.stripe + vec3(1.0) * h.edge * 0.3 * br;
}
vec3 fxKInf(H h) {               // an infinity mirror: copies of the contour sink inwards, each a little darker; faster in a build
  float z = h.dn * 6.0 + uTime * 0.4 * uSpeed * (1.0 + uBuild), f = fract(z), i = floor(z);
  float l = exp(-f * 10.0) + 0.4 * exp(-(1.0 - f) * 20.0);
  vec3 col = pal(i * 0.13 + uFlow) * pow(0.82, mod(i, 6.0));
  return col * l * (h.groove * 1.4 + h.stripe * 0.8) * (0.5 + 0.7 * uLevelS + kk() * 0.5) + vec3(1.0) * h.edge * 0.5;
}
` },

  // ---------- glitch and digital (Resolume Shift RGB, Twitch, LoRez, Fragment; MadMapper Noisy Barcode) ----------
  { g: "glitch", title: "גליץ' ודיגיטל", fx: [
    [74, "הסטת RGB", "🟥", 1, "fxGShift"],
    [75, "טוויץ'", "📳", 2, "fxGTwitch"],
    [76, "פיקסלים", "👾", 1, "fxGPix"],
    [77, "ברקוד רועש", "▥", 2, "fxGBar"],
    [78, "מסך CRT", "📺", 0, "fxGCRT"],
    [79, "שברים", "🪞", 2, "fxGFrag"],
    [80, "דאטה-מוש", "🧩", 1, "fxGMosh"],
    [81, "ספירה בינארית", "🔢", 1, "fxGBits"],
    [82, "קריעת שורות", "📼", 2, "fxGTear"],
    [83, "טרמינל", "⌨️", 1, "fxGTerm"],
  ], glsl: `
vec3 fxGShift(H h) {             // rings of light split into red, green and blue, wider on the kick and the highs
  float o = 0.02 + 0.08 * kk() + 0.05 * uHighS, T = clockB() * 2.0 * uSpeed;
  vec3 c = 0.5 + 0.5 * sin(vec3(h.rad + o, h.rad, h.rad - o) * 40.0 - T);
  return hueShift(c * c * c, uHue) * (h.groove * 1.4 + h.stripe * 0.6) * (0.5 + 0.7 * uLevel) + vec3(1.0) * h.edge * 0.3;
}
vec3 fxGTwitch(H h) {            // on the hits random rings jump sideways along themselves and flash white
  float r = ringIdx(h), seed = floor(uTime * 12.0), j = step(0.7, hash11(r + seed * 3.1)) * clamp(uHit, 0.0, 1.0);
  float u = fract(h.uc + j * (hash11(r * 7.0 + seed) - 0.5) * 0.4), v = step(0.5, fract(u * 12.0 + clockB() * 0.25 * uSpeed));
  vec3 col = mix(pal(rk(h) * 0.5 + uFlow), vec3(1.0), step(0.1, j));
  return col * (0.1 + 0.9 * v) * (h.groove * 1.3 + h.stripe * 0.5) * (0.4 + 0.7 * uLevel) + vec3(1.0) * h.edge * (0.2 + 0.8 * j);
}
vec3 fxGPix(H h) {               // the heart in big pixels; they get finer as the music builds
  float bs = mix(16.0, 3.0, clamp(uBuild + uLevelS * 0.5, 0.0, 1.0)), t = uTime * 0.3 * uSpeed;
  float n = fbm(floor(h.p / bs) * bs * 0.02 + vec2(t, -t)), q = floor(n * 6.0) / 6.0;
  return pal(q + uFlow) * (0.2 + 0.8 * q) * (h.stripe * 0.8 + h.groove * 1.2) * (0.5 + 0.6 * uLevelS + 0.4 * kk()) + vec3(1.0) * h.edge * 0.3;
}
vec3 fxGBar(H h) {               // a noisy barcode along every groove, flickering faster with the highs
  float r = ringIdx(h), cells = 60.0 + 40.0 * floor(hash11(r) * 3.0), t = floor(uTime * (6.0 + 18.0 * uHighS));
  float on = step(0.55, hash21(vec2(floor(h.s * cells), r + t * 0.37)));
  vec3 col = mix(pal(rk(h) + uFlow), vec3(1.0), 0.3 * uHighS);
  return col * on * (h.groove * 1.4 + h.stripe * 0.35) * (0.4 + 0.8 * uLevel) + vec3(1.0) * h.edge * kk() * 0.6;
}
vec3 fxGCRT(H h) {               // an old screen: scan lines and a rolling bright bar that lights the grooves on the kick
  float scan = 0.6 + 0.4 * sin(h.p.y * 3.0), y = fract(h.p.y / S - uTime * 0.15 * uSpeed) - 0.5, roll = exp(-y * y * 60.0);
  float n = fbm(vec2(h.p.x * 0.02, h.p.y * 0.005 + uTime * 0.2));
  vec3 col = pal(n + rk(h) * 0.3 + uFlow);
  return col * scan * (0.3 + 0.7 * n + roll) * (h.stripe * 0.7 + h.groove * 1.2) * (0.5 + 0.6 * uLevelS) + vec3(1.0) * roll * h.groove * kk() + vec3(1.0) * h.edge * 0.25;
}
vec3 fxGFrag(H h) {              // the heart cracks into shards that shift on every kick
  vec3 v = vor(h.p / 22.0), w = vor((h.p + (v.yz - 0.5) * 8.0 * kk()) / 22.0);
  float crack = 1.0 - smoothstep(0.0, 0.06, w.x);
  vec3 col = pal(w.y * 0.6 + uFlow);
  return col * (0.2 + 0.8 * step(0.4, w.z)) * h.stripe * (0.4 + 0.6 * uLevelS) + vec3(1.0) * crack * (0.3 + kk()) * (h.stripe + h.groove) + col * h.groove * 0.8 + vec3(1.0) * h.edge * 0.3;
}
vec3 fxGMosh(H h) {              // datamosh: blocks smear downwards, twice a beat, as much as the bass
  float t = floor(clockB() * 2.0); vec2 b = floor(h.p / 12.0);
  float r = hash21(b + t), smear = step(0.6, r) * (0.3 + uBassS);
  float n = fbm((h.p + vec2(0.0, smear * 40.0 * fract(uTime * 0.5 + r))) * 0.015 + t * 0.3);
  return pal(n * 1.5 + uFlow) * (0.15 + 0.85 * n) * (h.stripe * 0.8 + h.groove * 1.1) * (0.45 + 0.7 * uLevelS) + vec3(1.0) * h.groove * smear * kk() * 0.6 + vec3(1.0) * h.edge * 0.25;
}
vec3 fxGBits(H h) {              // every ring is a bit of a counter that counts the 16th notes
  float st = floor(clockB() * 4.0 * uSpeed), r = ringIdx(h), bit = mod(floor(st / exp2(mod(r, 10.0))), 2.0);
  return pal(r / ringN() + uFlow) * bit * (h.groove * 1.4 + h.stripe * 0.7) * (0.5 + 0.6 * uLevel) + vec3(1.0) * h.edge * 0.3 * kk();
}
vec3 fxGTear(H h) {              // rows tear sideways on the hits, like a broken tape
  float row = floor(h.p.y / 6.0), t = floor(uTime * 15.0), on = step(1.0 - 0.35 * clamp(uHit, 0.0, 1.0) - 0.05, hash21(vec2(row, t)));
  float x = h.p.x + on * (hash11(row + t) - 0.5) * 60.0, v = 0.5 + 0.5 * sin(x * 0.08 + h.p.y * 0.02 - uTime * uSpeed);
  vec3 col = mix(pal(v * 0.6 + uFlow), vec3(hash11(row), hash11(row + 1.0), hash11(row + 2.0)), on);
  return col * (0.3 + 0.7 * v) * (h.stripe * 0.6 + h.groove * 1.2) * (0.5 + 0.6 * uLevelS) + vec3(1.0) * h.edge * 0.3;
}
vec3 fxGTerm(H h) {              // signs scroll along every groove like text on a terminal, bright with its band
  float r = ringIdx(h), x = h.s * (40.0 + r * 3.0) - uTime * (1.0 + hash11(r) * 3.0) * uSpeed, id = floor(x), f = fract(x);
  float ch = hash21(vec2(id, r + floor(uTime * 3.0 + hash11(id) * 4.0))), glyph = step(0.3, ch) * step(0.15, f) * step(f, 0.85);
  vec3 col = mix(pal(0.3 + uFlow), vec3(1.0), step(0.95, ch));
  return col * glyph * (0.2 + specAt(r / ringN()) * 1.2) * (h.groove * 1.5 + h.stripe * 0.4) + vec3(1.0) * h.edge * 0.2;
}
` },

  // ---------- lines and lasers (HeavyM line and border effects, MadMapper Line and Laser FX) ----------
  { g: "lines", title: "קווים ולייזרים", fx: [
    [84, "ציור קו", "✏️", 1, "fxLTrace"],
    [85, "סורק אופקי", "📏", 1, "fxLScanH"],
    [86, "מניפה מהשקע", "🎐", 2, "fxLCleft"],
    [87, "רשת לייזר", "#️⃣", 2, "fxLGrid"],
    [88, "מרוץ מתאר", "🏎️", 2, "fxLRace"],
    [89, "מיתרים", "🎸", 1, "fxLString"],
    [90, "מנהרת קרניים", "🔆", 1, "fxLRadial"],
    [91, "קווקוו", "➖", 1, "fxLDash"],
    [92, "ספירלת לייזר", "➰", 1, "fxLSpiral"],
    [93, "הד מתאר", "〽️", 2, "fxLEcho"],
  ], glsl: `
vec3 fxLTrace(H h) {             // every groove draws itself along the contour over a bar, one after another, then a new colour
  float T = clockB() / 4.0 * uSpeed, k = rk(h), ph = fract(T) * 1.4 - k * 0.4;
  float drawn = step(h.uc, ph), head = exp(-abs(h.uc - ph) * 60.0);
  vec3 col = pal(k * 0.5 + floor(T) * 0.25 + uFlow);
  return col * (drawn * 0.8 + head * 2.0) * (h.groove * 1.4 + h.edge + h.sep) * (0.5 + 0.6 * uLevelS + 0.4 * kk()) + col * 0.03 * h.stripe;
}
vec3 fxLScanH(H h) {             // four level laser lines rise and fall at different speeds; where they cross a groove it lights up
  float T = clockB(); vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++) { float fi = float(i);
    float y = (0.5 + 0.5 * sin(T * TAU / (4.0 + fi * 2.0) * uSpeed + fi * 1.7)) * S, dy = (h.p.y - y) / (1.5 + 3.0 * kk());
    c += pal(fi * 0.25 + uFlow) * exp(-dy * dy); }
  return c * (h.groove * 1.6 + h.stripe * 0.25 + h.edge) * (0.5 + 0.7 * uLevel);
}
vec3 fxLCleft(H h) {             // a fan of beams out of the cleft at the top of the seam, more beams when it gets louder
  vec2 q = h.p - vec2(S * 0.5, uCleft); float a = atan(q.x, q.y);
  float n = 5.0 + floor(uLevelS * 6.0), x = a * n / 3.14159 + clockB() * 0.5 * uSpeed, d = (fract(x) - 0.5) / (0.04 + 0.06 * kk());
  return pal(floor(x) / n + uFlow) * exp(-d * d) * (h.groove * 1.6 + h.stripe * 0.25 + h.edge) * (0.5 + 0.7 * uLevel) + vec3(1.0) * h.seam * kb();
}
vec3 fxLGrid(H h) {              // two sets of diagonal laser lines sliding past each other; the crossings flash on the kick
  float T = clockB() * uSpeed, sp = 24.0;
  float a = abs(fract((h.p.x + h.p.y) / sp - T * 0.25) - 0.5), b = abs(fract((h.p.x - h.p.y) / sp + T * 0.25) - 0.5);
  float la = exp(-a * a * 900.0), lb = exp(-b * b * 900.0);
  return (pal(uFlow) * la + pal(0.5 + uFlow) * lb) * (h.groove * 1.5 + h.stripe * 0.2) * (0.4 + 0.8 * uLevel) + vec3(1.0) * la * lb * (h.groove + h.stripe) * (0.5 + kk()) + vec3(1.0) * h.edge * 0.3;
}
vec3 fxLRace(H h) {              // four comets race round the contour and the rim, two each way; a groove lights as the wave passes it
  float T = clockB() * uSpeed; vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++) { float fi = float(i), dir = mod(fi, 2.0) * 2.0 - 1.0;
    float du = fract(dir * (h.uc - T * (0.12 + 0.04 * fi)) + fi * 0.25);
    c += pal(fi * 0.25 + uFlow) * (exp(-du * 25.0) + 0.3 * exp(-du * 4.0)); }
  float g = step(abs(rk(h) - fract(T / 8.0)), 0.08);
  return c * (h.edge * 1.5 + h.sep * 1.2 + h.rim + h.groove * (0.3 + 1.2 * g)) * (0.5 + 0.7 * uLevelS + 0.5 * kk());
}
vec3 fxLString(H h) {            // every groove a string: it vibrates in its own mode as loud as its band of the spectrum
  float k = rk(h), v = specAt(k), md = 2.0 + floor(k * 6.0);
  float wave = abs(sin(h.s * 3.14159 * md) * sin(uTime * (6.0 + md * 3.0)));
  vec3 col = pal(k * 0.8 + uFlow);
  return col * (0.08 + wave * v * 1.6) * (h.groove * 1.6 + h.stripe * 0.2) + mix(col, vec3(1.0), 0.6) * h.groove * v * shimmer(h) + vec3(1.0) * h.edge * 0.2;
}
vec3 fxLRadial(H h) {            // a laser tunnel: rays out of the inner heart and rings racing towards you on the beat
  vec2 q = h.p - uCenter; float a = atan(q.y, q.x) / TAU, x = (fract(a * 24.0 + clockB() * 0.1 * uSpeed) - 0.5) * 12.0;
  float ray = exp(-x * x), z = fract(log(max(h.rad, 0.02)) * 1.5 - uTime * 0.5 * uSpeed), ring = exp(-z * 12.0);
  return pal(a + uFlow) * (ray * 0.6 * (0.5 + uMidS) + ring * (0.5 + kk())) * (h.groove * 1.5 + h.stripe * 0.4) + vec3(1.0) * h.edge * 0.3;
}
vec3 fxLDash(H h) {              // marching dashes along the grooves and the contour, a step every 16th; the bass makes them longer
  float dir = mod(ringIdx(h), 4.0) < 2.0 ? 1.0 : -1.0, st = floor(clockB() * 4.0) * 0.25;
  float on = step(fract(h.uc * 48.0 + dir * st * uSpeed), 0.3 + 0.4 * uBassS);
  vec3 col = pal(rk(h) * 0.4 + uFlow);
  return col * on * (h.groove * 1.5 + h.edge + h.sep) * (0.5 + 0.7 * uLevel) + col * 0.04 * h.stripe;
}
vec3 fxLSpiral(H h) {            // one laser dot runs ring after ring from the inner heart outwards, leaving a trail
  float n = ringN(), pos = mod(clockB() * 0.5 * uSpeed, n), me = ringIdx(h) + h.uc, d = pos - me;
  d = d < 0.0 ? d + n : d;
  return pal(me / n + uFlow) * (exp(-d * 0.45) + 0.06) * (h.groove * 1.8 + h.stripe * 0.5) * (0.6 + 0.6 * uLevel + 0.6 * kk()) + vec3(1.0) * h.edge * 0.15;
}
vec3 fxLEcho(H h) {              // the contour echoes inwards: on every beat a copy of it sinks 10 cm a beat
  vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++) { float age = uBeat + float(i), dd = (h.d - age * 10.0 * uSpeed) / 0.8;
    c += pal(float(i) * 0.2 + uBeatN * 0.1 + uFlow) * exp(-dd * dd) * exp(-age * 0.6); }
  return c * (h.stripe * 0.6 + h.groove * 1.2) * (0.6 + 0.6 * uLevel) + vec3(1.0) * h.edge * (0.4 + kk());
}
` },

  // ---------- nature (MadMapper Caustics, Clouds, Dunes; Notch noise and fluid looks) ----------
  { g: "nature", title: "טבע ויסודות", fx: [
    [94, "קאוסטיקה", "💧", 0, "fxNCaust"],
    [95, "זוהר צפוני", "🌌", 0, "fxNAurora"],
    [96, "מנורת לבה", "🫧", 0, "fxNLava"],
    [97, "עשן", "🌫️", 0, "fxNSmoke"],
    [98, "גשם בחריצים", "🌧️", 1, "fxNRain"],
    [99, "שלג וכפור", "❄️", 0, "fxNSnow"],
    [100, "דיונות", "🏜️", 0, "fxNDunes"],
    [101, "גחלים", "🪵", 1, "fxNEmber"],
    [102, "גלי ים", "🌊", 1, "fxNOcean"],
    [103, "סערה", "⛈️", 2, "fxNStorm"],
  ], glsl: `
vec3 fxNCaust(H h) {             // light through water dancing on the heart, stronger with the bass
  float v = caus(h.p * 0.04, uTime * 0.6 * uSpeed) * (0.6 + 0.8 * uBassS);
  vec3 col = pal(0.6 + uFlow) * 0.15 + mix(pal(0.5 + uFlow), vec3(1.0), 0.4) * v;
  return col * (h.stripe * 0.9 + h.groove * 1.2) * (0.55 + 0.5 * uLevelS) + vec3(1.0) * h.edge * 0.25 * (1.0 + kk());
}
vec3 fxNAurora(H h) {            // northern lights: curtains of colour waving with the mids
  float t = uTime * 0.2 * uSpeed, x = h.p.x * 0.012 + fbm(vec2(h.p.x * 0.006, t)) * 2.0, y = h.p.y / S;
  float cur = pow(0.5 + 0.5 * sin(x * 6.0 + t * 3.0), 3.0);
  float fade = smoothstep(0.0, 0.35, y) * (1.0 - smoothstep(0.55, 1.0, y + 0.3 * fbm(vec2(x, t))));
  vec3 col = mix(pal(0.35 + uFlow), pal(0.75 + uFlow), y);
  return col * cur * fade * (0.4 + 0.8 * uMidS + 0.4 * uLevelS) * (h.stripe + h.groove * 1.3) + vec3(1.0) * shimmer(h) * h.groove + col * h.edge * 0.2;
}
vec3 fxNLava(H h) {              // a lava lamp: six warm blobs rise and merge, swelling with the bass
  float t = uTime * 0.25 * uSpeed, f = 0.0;
  for (int i = 0; i < 6; i++) { float fi = float(i);
    vec2 c = vec2(S * (0.2 + 0.6 * hash11(fi)), S * (1.1 - fract(t * (0.1 + 0.08 * hash11(fi + 3.0)) + hash11(fi + 7.0)) * 1.2));
    f += (900.0 + 1200.0 * uBassS) / (dot(h.p - c, h.p - c) + 1.0); }
  float m = smoothstep(0.8, 1.2, f), rim = smoothstep(0.6, 0.9, f) - m;
  vec3 col = mix(pal(uFlow), vec3(1.0, 0.9, 0.5), smoothstep(1.2, 4.0, f));
  return (col * m + pal(0.1 + uFlow) * rim * 0.6) * (h.stripe * 0.9 + h.groove * 1.2) + pal(0.6) * 0.04 * h.stripe + vec3(1.0) * h.edge * 0.2 * (1.0 + kk());
}
vec3 fxNSmoke(H h) {             // smoke rising through the heart, lit from inside on the kick
  float t = uTime * 0.25 * uSpeed; vec2 q = h.p * 0.012 + vec2(0.0, t);
  float n = fbm(q + fbm(q * 2.0 - vec2(0.0, t)) * 1.2);
  vec3 col = mix(pal(0.6 + uFlow) * 0.3, mix(pal(uFlow), vec3(1.0), 0.6), n);
  return col * smoothstep(0.25, 0.85, n) * (0.4 + 0.5 * uLevelS + 0.8 * kk()) * (h.stripe + h.groove * 1.2) + vec3(1.0) * h.edge * 0.15;
}
vec3 fxNRain(H h) {              // rain running down; the drops shine where they cross a groove, faster when louder
  float cl = floor(h.p.x / 3.0), y = h.p.y - uTime * (40.0 + 60.0 * hash11(cl)) * uSpeed * (0.6 + 0.6 * uLevelS);
  float f = fract(y / 70.0 + hash11(cl * 1.3)), dr = smoothstep(0.0, 0.02, f) * exp(-f * 12.0) * step(0.55, hash11(cl * 2.7));
  return mix(pal(0.55 + uFlow), vec3(1.0), 0.5) * dr * (h.groove * 1.8 + h.stripe * 0.5) + pal(0.6 + uFlow) * 0.05 * h.stripe + vec3(1.0) * (h.edge + h.groove * 0.5) * kb() * 0.3 * kk();
}
vec3 fxNSnow(H h) {              // snow drifting down over the hearts, frost growing on the grooves with the level
  float t = uTime * uSpeed; vec3 c = vec3(0.0);
  for (int i = 0; i < 3; i++) { float fi = float(i), cs = 9.0 + fi * 5.0;
    vec2 q = h.p / cs + vec2(sin(t * 0.3 + fi) * 0.8, -t * (0.6 + 0.3 * fi)), id = floor(q), f = fract(q) - 0.5 + (vec2(hash21(id), hash21(id + 3.3)) - 0.5) * 0.6;
    c += vec3(1.0) * step(0.7, hash21(id + 9.1)) * (1.0 - smoothstep(0.03, 0.09 + 0.04 * fi, length(f))) * (0.5 + 0.2 * fi); }
  float frost = smoothstep(0.3, 0.9, fbm(h.p * 0.08)) * (0.3 + 0.7 * uLevelS);
  return c * h.stripe * (0.6 + 0.6 * uHighS) + mix(pal(0.55 + uFlow), vec3(1.0), 0.6) * frost * h.groove * 1.3 + pal(0.6) * 0.06 * h.stripe + vec3(1.0) * h.edge * (0.2 + 0.4 * kk());
}
vec3 fxNDunes(H h) {             // sand dunes drifting slowly, their ridges catching the highs
  float n = fbm(h.p * 0.01 + vec2(uTime * 0.08 * uSpeed, 0.0)) * 8.0, l = 0.5 + 0.5 * sin((h.p.y * 0.08 + n) * 3.0);
  vec3 col = mix(pal(0.1 + uFlow) * 0.4, pal(0.15 + uFlow), l) + vec3(1.0) * pow(l, 6.0) * 0.5 * (0.5 + uHighS);
  return col * (h.stripe * 0.9 + h.groove * 1.2) * (0.5 + 0.6 * uLevelS) + vec3(1.0) * h.edge * 0.2 * (1.0 + kk());
}
vec3 fxNEmber(H h) {             // the grooves glow like coals breathing with the bass; sparks fly up on the kick
  float t = uTime * uSpeed, heat = fbm(vec2(h.s * 30.0, ringIdx(h) * 1.7 + t * 0.3)) * (0.5 + 0.8 * uBassS);
  vec3 coal = mix(vec3(0.5, 0.02, 0.0), vec3(1.0, 0.55, 0.05), smoothstep(0.35, 0.9, heat));
  vec2 q = h.p / 4.0 + vec2(0.0, t * 6.0);
  float sp = step(0.985 - 0.04 * kk(), hash21(floor(q))) * (1.0 - smoothstep(0.1, 0.35, length(fract(q) - 0.5)));
  return hueShift(coal * heat * (1.4 * h.groove + 0.15 * h.stripe) + vec3(1.0, 0.7, 0.3) * sp * h.stripe, uHue) + vec3(1.0, 0.6, 0.3) * h.edge * 0.25;
}
vec3 fxNOcean(H h) {             // waves roll up from the tip to the cleft, foam breaking on the grooves with the kick
  float t = uTime * uSpeed, y = (S - h.p.y) / S + 0.04 * sin(h.p.x * 0.05 + t);
  float w = fract(y * 3.0 - t * 0.15 - uBassS * 0.2), foam = exp(-w * 18.0) * (0.6 + kk());
  vec3 sea = mix(pal(0.5 + uFlow), pal(0.6 + uFlow) * 0.3, w);
  return sea * h.stripe * (0.5 + 0.4 * uLevelS) + vec3(1.0) * foam * (h.stripe * 0.6 + h.groove * 1.4) + pal(0.5 + uFlow) * h.groove * 0.4 + vec3(1.0) * h.edge * 0.2;
}
vec3 fxNStorm(H h) {             // dark storm clouds; lightning lights them from inside on the hits and runs down the grooves
  float n = fbm(h.p * 0.015 + vec2(1.0, 0.3) * uTime * 0.15 * uSpeed);
  float fl = clamp(uHit, 0.0, 1.0) * step(0.5, hash11(floor(uTime * 8.0))), lit = exp(-abs(h.p.x - hash11(floor(uTime * 2.0)) * S) / 40.0) * fl;
  vec3 c = mix(pal(0.6 + uFlow) * 0.08, vec3(0.9, 0.95, 1.0), clamp(n * lit * 2.0, 0.0, 1.0));
  return c * (h.stripe + h.groove) + vec3(0.8, 0.9, 1.0) * lit * h.groove * 1.5 + pal(0.6 + uFlow) * n * 0.2 * (0.5 + uLevelS) * h.stripe + vec3(1.0) * h.edge * 0.15;
}
` },

  // ---------- geometry and patterns (MadMapper Truchet, Voronoi, Square Array, Siren, Diagonals; Resolume PolkaDot) ----------
  { g: "pattern", title: "גאומטריה ודפוסים", fx: [
    [104, "טרושה", "➿", 1, "fxPTruchet"],
    [105, "תאים", "🕸️", 1, "fxPCells"],
    [106, "פולקה דוטס", "🔴", 1, "fxPDots"],
    [107, "שחמט מתהפך", "♟️", 2, "fxPCheck"],
    [108, "משושים", "⬡", 1, "fxPHex"],
    [109, "מוארה", "🌀", 0, "fxPMoire"],
    [110, "אלכסונים", "↗️", 2, "fxPDiag"],
    [111, "מערך ריבועים", "🔲", 1, "fxPSquare"],
    [112, "סירנה", "🚨", 2, "fxPSiren"],
    [113, "אריגה", "🧶", 0, "fxPWeave"],
  ], glsl: `
vec3 fxPTruchet(H h) {           // Truchet arcs: tiles of quarter circles that turn over on the beat, thicker with the bass
  vec2 g = h.p / 12.0, id = floor(g), f = fract(g);
  if (step(0.5, hash21(id + floor(clockB() * 0.5) * step(0.6, hash21(id + 4.0)))) > 0.5) f.x = 1.0 - f.x;
  float d = min(abs(length(f) - 0.5), abs(length(f - 1.0) - 0.5)), l = 1.0 - smoothstep(0.04, 0.09 + 0.05 * uBassS, d);
  return pal(hash21(id) * 0.3 + uFlow + h.rad * 0.3) * l * (h.stripe * (0.5 + 0.6 * uLevelS) + h.groove * 1.2) + vec3(1.0) * h.edge * kk() * 0.5;
}
vec3 fxPCells(H h) {             // cells, each lit by its own band of the spectrum, their walls drawn over the hearts
  vec3 v = vor(h.p / 18.0 + vec2(0.0, uTime * 0.05 * uSpeed));
  float e = 1.0 - smoothstep(0.0, 0.08, v.x);
  vec3 col = pal(v.y * 0.7 + uFlow);
  return col * (0.1 + specAt(v.y) * 1.2) * h.stripe * smoothstep(0.02, 0.15, v.x) + mix(col, vec3(1.0), 0.5) * e * h.stripe * 0.6 + col * h.groove * (0.4 + kk()) + vec3(1.0) * h.edge * 0.25;
}
vec3 fxPDots(H h) {              // a halftone of dots: they grow ring by ring with the spectrum
  vec2 g = h.p / 6.0; g.x += mod(floor(g.y), 2.0) * 0.5;
  float r = 0.12 + 0.33 * clamp(specAt(rk(h)) * 1.2 + 0.15 * sin(h.rad * 20.0 - uTime * 2.0 * uSpeed), 0.0, 1.0);
  float m = 1.0 - smoothstep(r - 0.05, r + 0.05, length(fract(g) - 0.5));
  return pal(rk(h) * 0.6 + uFlow) * m * (h.stripe * 0.9 + h.groove * 1.3) * (0.5 + 0.6 * uLevelS) + vec3(1.0) * h.edge * 0.3 * kk();
}
vec3 fxPCheck(H h) {             // a chessboard made of the rings and 24 slices along them, turning over on every beat
  float ch = mod(floor(h.uc * 24.0) + ringIdx(h) + uBeatN, 2.0);
  vec3 col = mix(pal(0.5 + uFlow), pal(uFlow), ch);
  return col * (0.35 + 0.65 * kb()) * (0.2 + 0.8 * ch) * (h.stripe * 0.8 + h.groove * 1.2) * (0.5 + 0.6 * uLevel) + vec3(1.0) * h.edge * 0.3;
}
vec3 fxPHex(H h) {               // a honeycomb; every kick sends a wave of lit cells out from the ring centre
  vec4 hx = hexC(h.p / 9.0); vec2 g = abs(hx.xy);
  float edge = smoothstep(0.42, 0.48, max(dot(g, vec2(0.5, 0.8660254)), g.x));
  float dc = length(hx.zw * 9.0 - uCenter) / S, w = exp(-pow((dc - (1.0 - kk()) * 0.8) * 8.0, 2.0)) * kk();
  vec3 col = pal(hash21(floor(hx.zw * 10.0)) * 0.3 + dc + uFlow);
  return col * (0.12 * (1.0 - edge) + w * 1.3 + edge * (0.3 + 0.6 * uLevelS)) * (h.stripe * 0.9 + h.groove * 1.2) + vec3(1.0) * h.edge * 0.25;
}
vec3 fxPMoire(H h) {             // moire: circles from a wandering point meet the heart's own rings
  vec2 c2 = uCenter + vec2(sin(uTime * 0.3 * uSpeed), cos(uTime * 0.23 * uSpeed)) * 30.0 * (0.5 + uBassS);
  float m = smoothstep(0.2, 0.9, sin(length(h.p - c2) * 1.2) * sin(h.d * 1.2 + uTime * uSpeed));
  return pal(m * 0.3 + h.rad * 0.5 + uFlow) * m * (h.stripe * 0.8 + h.groove * 1.2) * (0.5 + 0.6 * uLevelS) + vec3(1.0) * h.edge * 0.3 * kk();
}
vec3 fxPDiag(H h) {              // chevrons mirrored on the seam, marching up with the beat; wider with the bass
  float x = abs(h.p.x - S * 0.5) + h.p.y, w = 10.0 + 8.0 * uBassS, on = step(fract(x / w - clockB() * 0.5 * uSpeed), 0.45);
  return pal(floor(x / w) * 0.07 + uFlow) * on * (h.stripe * 0.7 + h.groove * 1.3) * (0.45 + 0.7 * uLevel) + vec3(1.0) * h.seam * kb() + vec3(1.0) * h.edge * 0.25;
}
vec3 fxPSquare(H h) {            // an array of squares, each sized by a band of the spectrum, with a bright frame
  vec2 g = h.p / 15.0, id = floor(g), f = abs(fract(g) - 0.5);
  float s = 0.1 + 0.38 * specAt(hash21(id)), e = max(f.x, f.y), m = step(e, s), fr = step(abs(e - s), 0.03);
  return pal(hash21(id) * 0.5 + uFlow) * (m * 0.6 + fr * 1.2) * (h.stripe * 0.9 + h.groove * 1.2) * (0.5 + 0.5 * uLevelS + 0.4 * kk()) + vec3(1.0) * h.edge * 0.25;
}
vec3 fxPSiren(H h) {             // two beacons turning opposite ways, one colour on each half
  vec2 q = h.p - uCenter; float a = atan(q.y, q.x), T = clockB() * uSpeed * 3.14159;
  float b1 = pow(0.5 + 0.5 * cos(a - T), 8.0), b2 = pow(0.5 + 0.5 * cos(a + T + 3.14159), 8.0);
  vec3 c = pal(uFlow) * b1 * (1.0 - h.side * 0.7) + pal(0.5 + uFlow) * b2 * (0.3 + h.side * 0.7);
  return c * (h.stripe * 0.8 + h.groove * 1.4) * (0.5 + 0.7 * uLevel) + vec3(1.0) * h.edge * kk() * 0.5;
}
vec3 fxPWeave(H h) {             // a woven heart: the rings are threads going over and under 36 threads across them
  float a = h.uc * 36.0, r = ringIdx(h), over = mod(floor(a) + r, 2.0), sh = mix(0.4, 1.0, 0.5 + 0.5 * cos(fract(a) * TAU));
  float run = 0.6 + 0.4 * sin(h.uc * TAU * 3.0 - clockB() * 0.5 * uSpeed + r);
  vec3 col = mix(pal(0.5 + floor(a) / 36.0 + uFlow) * sh, pal(rk(h) * 0.4 + uFlow) * run, over);
  return col * (h.groove * 1.3 + h.stripe * 0.7) * (0.45 + 0.6 * uLevelS + 0.3 * kk()) + vec3(1.0) * h.edge * 0.2;
}
` },

  // ---------- beats and sequences (HeavyM beat sequences, step sequencers, chases) ----------
  { g: "beats", title: "פעימות וסיקוונסים", fx: [
    [114, "צ'ייס טבעות", "🔂", 2, "fxQChase"],
    [115, "אקסנט", "❗", 2, "fxQAccent"],
    [116, "פינג-פונג", "🏓", 2, "fxQPing"],
    [117, "ספירת תיבה", "4️⃣", 1, "fxQCount"],
    [118, "פולי-ריתם", "🥁", 1, "fxQPoly"],
    [119, "קיק וסנר", "🪘", 2, "fxQKS"],
    [120, "תופים מתגלגלים", "🎢", 2, "fxQRoll"],
    [121, "גל פאמפ", "🫸", 1, "fxQPumpWave"],
    [122, "מקצב אוקלידי", "📐", 1, "fxQEuclid"],
    [123, "כדור קופץ", "🏀", 1, "fxQBounce"],
  ], glsl: `
vec3 fxQChase(H h) {             // a four-step chase: one ring in every four lights up, a step every 16th note
  float st = mod(floor(clockB() * 4.0 * uSpeed), 4.0), on = step(abs(mod(ringIdx(h), 4.0) - st), 0.5);
  return pal(st * 0.25 + uFlow) * on * (1.0 - fract(clockB() * 4.0) * 0.6) * (h.groove * 1.5 + h.stripe * 0.8) * (0.5 + 0.7 * uLevel) + vec3(1.0) * h.edge * 0.2;
}
vec3 fxQAccent(H h) {            // every beat one ring flashes white; the first beat of the bar floods the heart with colour
  float me = step(abs(ringIdx(h) - floor(hash11(uBeatN * 3.3) * ringN())), 0.5), down = step(mod(uBeatN, 4.0), 0.5), e = kb();
  vec3 col = pal(hash11(uBeatN) + uFlow);
  return (vec3(1.0) * me * e + col * down * e * 0.8 + col * 0.06) * (h.groove * 1.4 + h.stripe * 0.7) + vec3(1.0) * h.edge * e * 0.5;
}
vec3 fxQPing(H h) {              // light bounces from half to half, a crossing every beat; the seam flashes as it passes
  float T = clockB() * uSpeed, x = abs(fract(T * 0.5) * 2.0 - 1.0), d = (h.p.x / S - x) * 6.0;
  return pal(floor(T) * 0.25 + uFlow) * exp(-d * d) * (h.groove * 1.6 + h.stripe * 0.6) * (0.5 + 0.7 * uLevel) + vec3(1.0) * h.seam * exp(-abs(x - 0.5) * 20.0) * 1.5 + vec3(1.0) * h.edge * 0.2;
}
vec3 fxQCount(H h) {             // counts the bar: beat 1 lights the inner quarter of the rings, beat 4 the outer quarter
  float bb = mod(uBeatN, 4.0), q = floor(rk(h) * 3.999), on = step(q, bb), now = step(abs(q - bb), 0.5);
  return pal(q * 0.25 + uFlow) * (on * 0.35 + now * kb() * 1.2) * (h.groove * 1.4 + h.stripe * 0.7) * (0.5 + 0.6 * uLevel) + vec3(1.0) * h.edge * 0.25 * kb();
}
vec3 fxQPoly(H h) {              // a polyrhythm: three sets of rings pulse 3, 4 and 5 times a bar
  float set = mod(ringIdx(h), 3.0), ph = fract(clockB() * (3.0 + set) / 4.0 * uSpeed);
  return pal(set / 3.0 + uFlow) * exp(-ph * 7.0) * (h.groove * 1.4 + h.stripe * 0.6) * (0.5 + 0.7 * uLevel) + vec3(1.0) * h.edge * 0.2;
}
vec3 fxQKS(H h) {                // the kick lights the inner rings, the snare and the highs the outer rings
  float k = rk(h), inner = 1.0 - smoothstep(0.4, 0.55, k), outer = smoothstep(0.45, 0.6, k);
  float sn = clamp(uHit - uKick * 0.5, 0.0, 1.0) + uHighS * 0.5;
  vec3 c = pal(uFlow) * inner * (0.08 + kk()) + mix(pal(0.5 + uFlow), vec3(1.0), 0.4) * outer * (0.06 + sn);
  return c * (h.groove * 1.5 + h.stripe * 0.7) + vec3(1.0) * h.edge * sn * 0.6;
}
vec3 fxQRoll(H h) {              // a drum roll: in a build the flashes double from quarters to 32nds; the drop floods it white
  float b = clamp(uBuild, 0.0, 1.0), div = exp2(floor(b * 4.0)), ph = fract(clockB() * div), front = fract(clockB() * div * 0.25);
  float e = exp(-ph * 6.0) * (0.3 + 0.7 * exp(-abs(rk(h) - front) * 5.0));
  return pal(0.6 + b * 0.4 + uFlow) * e * (0.4 + b) * (h.groove * 1.5 + h.stripe * 0.6) + vec3(1.0) * clamp(uDrop, 0.0, 1.0) * (h.stripe + h.groove) * 0.9 + vec3(1.0) * h.edge * 0.2;
}
vec3 fxQPumpWave(H h) {          // the sidechain pump as a tide: after every kick the light comes back from the inner heart out
  float p = clamp(uPump, 0.0, 1.0), k = rk(h), w = smoothstep(k - 0.15, k + 0.15, p);
  return pal(k * 0.5 + uBeatN * 0.0625 + uFlow) * (0.05 + 0.95 * w) * (h.groove * 1.4 + h.stripe * 0.75) * (0.55 + 0.5 * uLevelS) + vec3(1.0) * h.edge * (1.0 - p) * 0.6;
}
vec3 fxQEuclid(H h) {            // Euclidean rhythms: every ring spreads 3 to 8 hits over the 16 steps of the bar
  float r = ringIdx(h), k = 3.0 + mod(r, 6.0), st = floor(clockB() * 4.0 * uSpeed), i = mod(st + r, 16.0);
  float hit = step(0.5, floor(i * k / 16.0) - floor((i - 1.0) * k / 16.0)), e = hit * (1.0 - fract(clockB() * 4.0 * uSpeed) * 0.8);
  vec3 col = pal(k / 9.0 + uFlow);
  return col * e * (h.groove * 1.5 + h.stripe * 0.6) * (0.5 + 0.7 * uLevel) + col * 0.04 * h.stripe + vec3(1.0) * h.edge * 0.2;
}
vec3 fxQBounce(H h) {            // a ball bouncing from the inner heart on every beat, as high as the music is loud
  float y = 1.0 - 4.0 * (uBeat - 0.5) * (uBeat - 0.5), k = rk(h), d = (k - y * (0.6 + 0.4 * uLevelS)) * 12.0;
  return pal(uBeatN * 0.125 + uFlow) * exp(-d * d) * (h.groove * 1.6 + h.stripe * 0.7) + vec3(1.0) * kb() * step(k, 0.06) * (h.stripe + h.groove) + vec3(1.0) * h.edge * 0.2;
}
` },

  // ---------- space (Notch particles and procedurals, starfields, fractal looks) ----------
  { g: "space", title: "חלל וקוסמוס", fx: [
    [124, "שדה כוכבים", "⭐", 1, "fxCStars"],
    [125, "ערפילית", "🌫️", 0, "fxCNebula"],
    [126, "גלקסיה", "🌌", 0, "fxCGalaxy"],
    [127, "חור תולעת", "🕳️", 1, "fxCWorm"],
    [128, "שמש", "☀️", 1, "fxCSun"],
    [129, "מסלולי כוכבי לכת", "🪐", 0, "fxCOrbit"],
    [130, "סופרנובה", "💥", 2, "fxCNova"],
    [131, "שביטים", "☄️", 1, "fxCComet"],
    [132, "חור שחור", "⚫", 1, "fxCHole"],
    [133, "פולסר", "🔦", 2, "fxCPulsar"],
  ], glsl: `
vec3 fxCStars(H h) {             // warp speed: stars stream out of the inner heart, faster when louder and in a build
  vec2 q = h.p - uCenter; float a = atan(q.y, q.x), r = length(q) / S, sp = 0.3 + 1.5 * uLevelS + 2.0 * clamp(uBuild, 0.0, 1.0), c = 0.0;
  for (int i = 0; i < 3; i++) { float fi = float(i), lane = floor(a / TAU * (90.0 + fi * 40.0));
    float z = fract(hash11(lane + fi * 50.0) - uTime * sp * uSpeed * (0.2 + 0.1 * fi));
    c += exp(-abs(r - z * 0.8) * (120.0 - 90.0 * z)) * z * step(0.4, hash11(lane * 1.7 + fi)); }
  return mix(pal(0.6 + uFlow), vec3(1.0), 0.6) * c * 2.5 * (h.stripe * 0.8 + h.groove * 1.4) + vec3(1.0) * h.edge * kk() * 0.4;
}
vec3 fxCNebula(H h) {            // a slow nebula of colour with twinkling stars, glowing with the level and the bass
  float t = uTime * 0.05 * uSpeed; vec2 q = h.p * 0.01, sid = floor(h.p * 0.8);
  float n = fbm(q + fbm(q * 1.5 + t) * 1.5 - t), m = fbm(q * 2.0 - t * 1.3);
  vec3 col = pal(n * 0.8 + uFlow) * smoothstep(0.3, 0.9, n) + pal(0.5 + m + uFlow) * smoothstep(0.5, 0.9, m) * 0.6;
  float st = step(0.985, hash21(sid)) * (0.5 + 0.5 * sin(uTime * 4.0 + hash21(sid) * 40.0));
  return (col * (0.45 + 0.6 * uLevelS + 0.3 * uBassS) + vec3(1.0) * st * (0.4 + uHighS)) * (h.stripe + h.groove * 1.2) + vec3(1.0) * h.edge * 0.15;
}
vec3 fxCGalaxy(H h) {            // a spiral galaxy turning round the ring centre, its core bright with the bass
  vec2 q = h.p - uCenter; float r = length(q) / S, a = atan(q.y, q.x);
  float arm = 0.5 + 0.5 * cos(2.0 * a - log(r + 0.02) * 4.0 - uTime * 0.3 * uSpeed), dust = fbm(vec2(a * 2.0, r * 10.0 - uTime * 0.1));
  vec3 col = pal(r * 1.5 + uFlow) * arm * arm * arm * (0.4 + dust) + mix(pal(0.1 + uFlow), vec3(1.0), 0.6) * exp(-r * (8.0 - 4.0 * uBassS));
  return col * (h.stripe * 0.9 + h.groove * 1.2) * (0.5 + 0.6 * uLevelS) + vec3(1.0) * h.edge * 0.2 * (1.0 + kk());
}
vec3 fxCWorm(H h) {              // a wormhole: a twisting tunnel into the inner heart, faster when louder
  float z = 1.0 / (h.rad + 0.08) + uTime * (0.8 + 2.0 * uLevelS) * uSpeed, v = 0.5 + 0.5 * sin((h.uc * TAU + z * 0.3) * 6.0) * sin(z * 2.0);
  return pal(z * 0.05 + uFlow) * v * v * smoothstep(0.0, 0.3, h.rad) * (h.stripe * 0.9 + h.groove * 1.3) + vec3(1.0) * exp(-h.rad * 12.0) * kk() * (h.stripe + h.groove) + vec3(1.0) * h.edge * 0.25;
}
vec3 fxCSun(H h) {               // the surface of the sun; flares leap off the contour on the kick
  float t = uTime * 0.2 * uSpeed, n = fbm(h.p * 0.03 + vec2(t, -t)) + 0.5 * fbm(h.p * 0.08 - t);
  vec3 col = mix(vec3(0.8, 0.15, 0.0), vec3(1.0, 0.85, 0.3), smoothstep(0.4, 1.1, n + uBassS * 0.3));
  float flare = exp(-h.d / (3.0 + 10.0 * kk())) * (0.5 + 0.5 * noise(vec2(h.uc * 40.0, uTime * 2.0)));
  return hueShift(col * (0.4 + 0.6 * uLevelS) * (h.stripe + h.groove * 1.3) + vec3(1.0, 0.7, 0.3) * flare * h.inside, uHue);
}
vec3 fxCOrbit(H h) {             // a solar system: the inner heart is the sun, every groove the orbit of a planet bright with its band
  float r = ringIdx(h), pos = fract(clockB() / (4.0 + r * 1.5) * uSpeed + hash11(r)), d = abs(fract(h.uc - pos + 0.5) - 0.5);
  vec3 col = pal(hash11(r * 3.1) + uFlow);
  return col * (exp(-d * (60.0 + r * 4.0)) * (0.6 + 1.2 * specAt(rk(h))) + 0.04) * (h.groove * 1.6 + h.stripe * 0.2) + mix(pal(0.1), vec3(1.0), 0.5) * step(r, 0.5) * (0.4 + uBassS) * h.stripe + vec3(1.0) * h.edge * 0.15;
}
vec3 fxCNova(H h) {              // a supernova: the core shrinks and flickers through the build, every kick and the drop blow a shell out
  float b = clamp(uBuild, 0.0, 1.0), d = clamp(uDrop, 0.0, 1.0);
  float core = smoothstep(0.25 - 0.2 * b, 0.0, h.rad) * (0.5 + 0.5 * sin(uTime * (4.0 + 20.0 * b)));
  float shell = exp(-pow((h.rad - (1.0 - kk())) * 10.0, 2.0)) * kk() + exp(-pow((h.rad - (1.0 - d)) * 6.0, 2.0)) * d;
  float n = fbm(vec2(h.uc * 20.0, h.rad * 6.0 - uTime));
  return mix(pal(uFlow), vec3(1.0), 0.5) * core * (h.stripe + h.groove) + pal(0.1 + n * 0.5 + uFlow) * shell * (0.6 + n) * (h.groove * 1.6 + h.stripe * 0.8) + vec3(1.0) * h.edge * 0.2;
}
vec3 fxCComet(H h) {             // three comets cross the heart, their tails longer when louder, shining on the grooves
  vec3 c = vec3(0.0);
  for (int i = 0; i < 3; i++) { float fi = float(i), T = uTime * (0.15 + 0.05 * fi) * uSpeed + fi * 0.37, cyc = floor(T);
    vec2 a = vec2(hash11(cyc + fi) * S, -20.0), b = vec2(hash11(cyc + fi + 9.0) * S, S + 20.0), dir = normalize(b - a), q = h.p - mix(a, b, fract(T));
    float along = dot(q, -dir), across = dot(q, vec2(-dir.y, dir.x));
    c += pal(fi * 0.3 + uFlow) * (step(0.0, along) * exp(-along / (60.0 + 60.0 * uLevelS)) * exp(-across * across / (6.0 + abs(along) * 0.8)) * 1.5 + exp(-dot(q, q) / 12.0) * 2.5); }
  return c * (h.groove * 1.5 + h.stripe * 0.6) + vec3(1.0) * h.edge * kk() * 0.3;
}
vec3 fxCHole(H h) {              // a black hole in the inner heart: a turning disc of light, the rings bent round it
  vec2 q = h.p - uCenter; float r = length(q) / S, a = atan(q.y, q.x), rs = 0.08 + 0.05 * uBassS;
  float disk = exp(-pow((r - rs * 2.2) * 18.0, 2.0)) * (0.6 + 0.4 * sin(a * 3.0 - uTime * 3.0 * uSpeed));
  float bg = 0.5 + 0.5 * sin((h.rad + rs * rs / max(r, 0.01)) * 40.0 - uTime * uSpeed);
  vec3 col = pal(0.05 + uFlow) * disk * 1.6 + pal(0.6 + uFlow) * pow(bg, 4.0) * 0.5;
  return col * smoothstep(rs, rs * 1.3, r) * (h.stripe * 0.9 + h.groove * 1.3) * (0.5 + 0.6 * uLevelS + 0.4 * kk()) + vec3(1.0) * h.edge * 0.2;
}
vec3 fxCPulsar(H h) {            // a pulsar: two beams turning once every two beats, pulsing on the 16ths
  vec2 q = h.p - uCenter; float a = atan(q.y, q.x) - clockB() * 0.5 * TAU * uSpeed;
  float beam = pow(abs(cos(a)), 40.0 - 30.0 * uLevelS), pul = 0.4 + 0.6 * (1.0 - fract(clockB() * 4.0));
  return mix(pal(0.6 + uFlow), vec3(1.0), 0.3) * beam * pul * (h.groove * 1.5 + h.stripe * 0.4) + vec3(1.0) * smoothstep(0.1, 0.0, h.rad) * kk() * (h.stripe + h.groove) + vec3(1.0) * h.edge * 0.15;
}
` },

  // ---------- organic and the living heart ----------
  { g: "organic", title: "אורגני · לב חי", fx: [
    [134, "ורידים", "🩸", 1, "fxOVeins"],
    [135, "זרימת דם", "🫀", 1, "fxOFlow"],
    [136, "לאב-דאב", "💗", 2, "fxOLubDub"],
    [137, "תאים חיים", "🦠", 0, "fxOCell"],
    [138, "שורשים", "🌱", 0, "fxORoots"],
    [139, "פריחה", "🌸", 0, "fxOBloom"],
    [140, "ריאות", "🫁", 0, "fxOLungs"],
    [141, "נוצות", "🪶", 0, "fxOFeather"],
    [142, "אלמוגים", "🪸", 0, "fxOCoral"],
    [143, "גל דופק", "📈", 1, "fxOWave"],
  ], glsl: `
vec3 fxOVeins(H h) {             // veins over the hearts; every beat pushes blood through them from the core out
  float n = abs(fbm(h.p * 0.025) - 0.5) * 2.0, vein = 1.0 - smoothstep(0.02, 0.08, n), pulse = exp(-fract(uBeat - h.rad * 0.6) * 6.0);
  vec3 col = hueShift(mix(vec3(0.5, 0.0, 0.05), vec3(1.0, 0.15, 0.2), pulse), uHue + uFlow * 0.2);
  return col * vein * (0.4 + 1.2 * pulse) * (h.stripe + h.groove * 1.3) * (0.5 + 0.6 * uLevelS) + vec3(0.6, 0.0, 0.1) * 0.05 * h.stripe + vec3(1.0, 0.6, 0.6) * h.edge * 0.25 * pulse;
}
vec3 fxOFlow(H h) {              // blood cells flow along the grooves, neighbours the other way, rushing on every beat
  float dir = mod(ringIdx(h), 2.0) * 2.0 - 1.0, sp = (0.15 + 0.4 * kb() + 0.3 * uLevelS) * uSpeed;
  float x = h.uc * 70.0 + dir * clockB() * sp * 8.0, id = floor(x);
  float cell = step(0.35, hash11(id + ringIdx(h) * 13.0)) * (1.0 - smoothstep(0.2, 0.42, abs(fract(x) - 0.5)));
  return hueShift(mix(vec3(0.6, 0.0, 0.05), vec3(1.0, 0.2, 0.25), hash11(id)), uHue) * cell * (h.groove * 1.5 + h.stripe * 0.3) + vec3(0.5, 0.0, 0.05) * 0.1 * h.stripe * (0.5 + kk()) + vec3(1.0, 0.5, 0.5) * h.edge * 0.2;
}
vec3 fxOLubDub(H h) {            // a real heartbeat: the left half beats (lub), the right answers (dub), each squeezing to its core
  float lub = exp(-uBeat * 9.0), dub = exp(-max(uBeat - 0.25, 0.0) * 9.0) * step(0.25, uBeat);
  float e = h.side < 0.5 ? lub + 0.3 * dub : dub + 0.3 * lub, w = (h.dn - (1.0 - e)) * 5.0;
  vec3 col = pal(uFlow);
  return col * (0.06 + 0.9 * e * (0.5 + uInt)) * (h.stripe * 0.75 + h.groove) + mix(col, vec3(1.0), 0.5) * exp(-w * w) * e * h.groove * 1.4 + vec3(1.0) * h.edge * e * 0.6;
}
vec3 fxOCell(H h) {              // living cells drifting; they divide (get smaller) on the kick
  vec3 v = vor(h.p / (16.0 - 4.0 * kk()) + vec2(sin(uTime * 0.2), cos(uTime * 0.17)) * 0.5 * uSpeed);
  float mem = 1.0 - smoothstep(0.03, 0.12, v.x), body = smoothstep(0.3, 0.6, v.x);
  vec3 col = pal(0.3 + v.y * 0.4 + uFlow);
  return (col * mem * 1.2 + col * 0.12 + mix(col, vec3(1.0), 0.5) * body * 0.3 * uBassS) * (h.stripe * (0.5 + 0.6 * uLevelS) + h.groove) + vec3(1.0) * h.edge * 0.2;
}
vec3 fxORoots(H h) {             // roots grow up from the tip as high as the music is loud
  float grow = 0.2 + 0.8 * uLevelS + 0.3 * uBuild, y = (S - h.p.y) / S;
  float br = abs(sin(h.p.x * 0.15 + fbm(vec2(h.p.y * 0.02, 1.0)) * 9.0 + fbm(h.p * 0.03) * 4.0)), l = 1.0 - smoothstep(0.0, 0.12, br);
  vec3 col = mix(pal(0.35 + uFlow), pal(0.15 + uFlow), y);
  return col * l * (step(y, grow) + exp(-abs(y - grow) * 30.0) * 2.0) * (h.stripe * 0.8 + h.groove * 1.4) + col * 0.04 * h.stripe + vec3(1.0) * h.edge * 0.2;
}
vec3 fxOBloom(H h) {             // flowers open and close over the hearts, each on its own four-beat cycle, wider with the bass
  vec2 g = h.p / 34.0, id = floor(g), f = (fract(g) - 0.5) * 34.0;
  float age = mod(uBeatN + uBeat + hash21(id) * 4.0, 4.0), open = smoothstep(0.0, 1.5, age) * (1.0 - smoothstep(3.0, 4.0, age));
  float r = length(f), pet = abs(cos(atan(f.y, f.x) * 2.5 + hash21(id) * 6.0)) * 12.0 * open * (0.6 + 0.6 * uBassS);
  vec3 col = pal(hash21(id + 1.0) + uFlow);
  return col * (1.0 - smoothstep(pet - 1.0, pet + 1.0, r)) * (0.4 + 0.6 * uLevelS) * (h.stripe + h.groove * 1.3) + mix(col, vec3(1.0), 0.6) * (1.0 - smoothstep(1.0, 2.5, r)) * open * h.stripe + vec3(1.0) * h.edge * 0.2;
}
vec3 fxOLungs(H h) {             // the two halves breathe like lungs, filling from the contour inwards
  float br = breathV(h.side * 0.08), lv = 1.0 - br * (0.6 + 0.4 * uBassS), fill = smoothstep(lv - 0.15, lv + 0.15, h.dn);
  float alv = 0.6 + 0.4 * noise(h.p * 0.5);
  vec3 col = mix(pal(uFlow), pal(0.1 + uFlow), alv);
  return col * (0.05 + fill * alv) * (h.stripe * 0.9 + h.groove * 1.2) * (0.5 + 0.5 * uLevelS) + col * h.edge * (0.2 + 0.4 * br) + vec3(1.0) * h.seam * 0.2 * br;
}
vec3 fxOFeather(H h) {           // feathers: barbs grow out from the seam on both sides and sway with the mids
  float x = abs(h.p.x - S * 0.5), sway = sin(uTime * 1.2 * uSpeed + h.p.y * 0.02) * 6.0 * (0.3 + uMidS);
  float b = (fract((h.p.y - x * 0.6 + sway) / 2.5) - 0.5) * 5.0, barb = exp(-b * b);
  return pal(x / S + rk(h) * 0.3 + uFlow) * barb * (0.3 + 0.7 * smoothstep(0.0, 0.7, h.dn)) * (h.stripe * (0.5 + 0.5 * uLevelS) + h.groove * 1.2) + vec3(1.0) * h.seam * (0.3 + kk()) + vec3(1.0) * h.edge * 0.2;
}
vec3 fxOCoral(H h) {             // a coral pattern that grows slowly and shifts with the bass
  float n = fbm(h.p * 0.04 + uTime * 0.05 * uSpeed) * 12.0 + h.rad * 4.0, l = smoothstep(0.3, 0.7, 0.5 + 0.5 * sin(n + uBassS * 2.0));
  vec3 col = mix(pal(0.5 + uFlow) * 0.15, pal(0.05 + uFlow), l);
  return col * (h.stripe * (0.6 + 0.5 * uLevelS) + h.groove * 1.2) + vec3(1.0) * shimmer(h) * l * h.stripe + vec3(1.0) * h.edge * 0.2 * (1.0 + kk());
}
vec3 fxOWave(H h) {              // a pulse wave: every ring beats a heartbeat, the outer rings first, the inner heart last
  float ph = fract(uBeat - (1.0 - rk(h)) * 0.5), e = exp(-ph * 10.0) + 0.6 * exp(-max(ph - 0.18, 0.0) * 12.0) * step(0.18, ph);
  return pal(rk(h) * 0.3 + uFlow) * (0.05 + e * (0.6 + 0.6 * uLevel)) * (h.groove * 1.4 + h.stripe * 0.8) + vec3(1.0) * h.edge * e * 0.4;
}
` },

  // ---------- 3D materials (HeavyM 3D Materials; lit over the real cut like the 3D group) ----------
  { g: "material", title: "חומרים תלת-ממד", fx: [
    [144, "זהב יצוק", "🥇", 0, "fxMGold"],
    [145, "שיש", "🏛️", 0, "fxMMarble"],
    [146, "מתכת מוברשת", "🔩", 1, "fxMBrushed"],
    [147, "צינורות ניאון", "💡", 1, "fxMNeon"],
    [148, "קריסטל", "💎", 1, "fxMCrystal"],
    [149, "קטיפה", "🎀", 0, "fxMVelvet"],
    [150, "נחושת ופטינה", "🟫", 0, "fxMPatina"],
    [151, "קרח", "🧊", 0, "fxMIce"],
    [152, "צבע מטאלי", "🚗", 1, "fxMFlake"],
    [153, "פנינה", "🦪", 0, "fxMPearl"],
  ], glsl: `
vec3 fxMGold(H h) {              // cast gold: a light circles every four bars, the highlights flash with the highs
  vec3 L = orbitL(clockB() * TAU / 16.0 * uSpeed, 0.8), n = nMix(nDome(h, 50.0), nCut(h, 2.4)), g = hueShift(vec3(1.0, 0.72, 0.25), uHue);
  vec3 c = g * (0.15 + 0.85 * dif(n, L)) * ao(h) + mix(g, vec3(1.0), 0.5) * spc(n, L, 60.0) * (0.6 + 2.0 * uHighS) + g * envMap(reflect(vec3(0.0, 0.0, -1.0), n)) * 0.3;
  return c * (0.6 + 0.4 * uLevelS + 0.4 * kk()) * h.inside;
}
vec3 fxMMarble(H h) {            // polished marble, its veins tinted by the palette
  float v = 0.5 + 0.5 * sin(h.p.x * 0.03 + h.p.y * 0.02 + fbm(h.p * 0.02) * 6.0 + uTime * 0.05 * uSpeed);
  vec3 base = mix(vec3(0.85), pal(uFlow) * 0.6, pow(v, 8.0)), L = normalize(vec3(-0.4 + 0.3 * sin(uTime * 0.3), -0.5, 0.8));
  return litMat(h, base, L, 40.0, 2.2, 50.0, 0.5 + uHighS) * (0.55 + 0.45 * uLevelS + 0.3 * kk()) * h.inside;
}
vec3 fxMBrushed(H h) {           // brushed steel, brushed along the grooves; a band of light sweeps round every bar
  float st = noise(vec2(h.s * 400.0, ringIdx(h) * 3.0)) * 0.3 + 0.7, sw = fract(clockB() * 0.25 * uSpeed);
  float bd = exp(-pow((h.uc - sw) * 8.0, 2.0)) + exp(-pow((h.uc - sw + 1.0) * 8.0, 2.0));
  vec3 n = nMix(nDome(h, 30.0), nCut(h, 2.6)), L = normalize(vec3(0.3, -0.6, 0.75)), base = hueShift(vec3(0.75, 0.78, 0.82), uHue) * st;
  return (base * (0.2 + 0.8 * dif(n, L)) * ao(h) + vec3(1.0) * bd * st * (0.4 + kk()) * (h.groove + h.stripe * 0.5) + pal(0.5 + uFlow) * spc(n, L, 20.0) * 0.4) * (0.6 + 0.4 * uLevelS) * h.inside;
}
vec3 fxMNeon(H h) {              // every groove a round glass neon tube with a hot core; they buzz and flicker on the hits
  float t = clamp(h.gt / (uGW * 0.5), -1.0, 1.0), cyl = sqrt(max(1.0 - t * t, 0.0));
  float fl = 1.0 - step(0.85, hash21(vec2(ringIdx(h), floor(uTime * 12.0)))) * clamp(uHit, 0.0, 1.0);
  vec3 col = pal(rk(h) * 0.7 + uFlow);
  vec3 tube = (col * cyl * 1.2 + vec3(1.0) * pow(cyl, 12.0) * 0.8) * h.groove * fl * (0.6 + 0.6 * uLevel);
  return tube + col * exp(-max(h.gd - uGW * 0.5, 0.0) / 2.0) * h.stripe * 0.35 * fl + vec3(0.02) * h.stripe + vec3(1.0) * h.edge * 0.2;
}
vec3 fxMCrystal(H h) {           // cut crystal: facets that split the light into a rainbow, sparkling with the highs
  vec3 v = vor(h.p / 14.0), n = normalize(vec3((v.yz - 0.5) * 0.9 + nCut(h, 2.0).xy, 1.0)), L = orbitL(uTime * 0.4 * uSpeed, 0.7);
  vec3 rb = hsv(dot(n.xy, vec2(0.7)) * 3.0 + uFlow, 0.6, 1.0);
  float fe = 1.0 - smoothstep(0.0, 0.05, v.x);
  return (rb * (0.15 + 0.6 * dif(n, L)) + vec3(1.0) * spc(n, L, 80.0) * (0.8 + 2.0 * uHighS) + vec3(1.0) * fe * 0.3 * (0.4 + kk())) * (0.5 + 0.5 * uLevelS) * h.inside;
}
vec3 fxMVelvet(H h) {            // velvet: deep colour that shines where the surface turns away, more with the bass
  vec3 n = nMix(nDome(h, 70.0), nCut(h, 2.0)), L = normalize(vec3(sin(uTime * 0.4 * uSpeed), -0.5, 0.7)), col = pal(uFlow);
  float sheen = pow(1.0 - n.z, 1.5) * 3.0 + pow(1.0 - dif(n, L), 4.0) * 0.3;
  return (col * 0.25 * dif(n, L) + mix(col, vec3(1.0), 0.4) * sheen * (0.5 + uBassS)) * ao(h) * (0.6 + 0.4 * uLevelS + 0.3 * kk()) * h.inside;
}
vec3 fxMPatina(H h) {            // copper with green patina; the louder the music, the more copper shines through
  float p = smoothstep(0.45, 0.65, fbm(h.p * 0.04) + 0.3 * (1.0 - h.dn) - 0.3 * uLevelS);
  vec3 cu = hueShift(vec3(0.95, 0.45, 0.25), uHue), base = mix(cu, vec3(0.25, 0.7, 0.6), p);
  vec3 L = orbitL(clockB() * TAU / 32.0, 0.8), n = nMix(nDome(h, 40.0), nCut(h, 2.4));
  return (base * (0.15 + 0.85 * dif(n, L)) * ao(h) + cu * spc(n, L, 40.0) * (1.0 - p) * (0.5 + 1.5 * uHighS)) * (0.6 + 0.4 * uLevelS + 0.3 * kk()) * h.inside;
}
vec3 fxMIce(H h) {               // ice: cracks that light up on the kick, glints with the highs, deeper blue in the middle
  vec3 v = vor(h.p / 20.0), n = nMix(nDome(h, 50.0), nCut(h, 2.2)), L = normalize(vec3(-0.3, -0.6, 0.75));
  float crack = 1.0 - smoothstep(0.0, 0.04, v.x), glint = step(0.97 - 0.1 * uHighS, hash21(floor(h.p * 1.5) + floor(uTime * 8.0)));
  vec3 base = mix(vec3(0.6, 0.85, 1.0), pal(0.55 + uFlow), 0.3) * (0.3 + 0.4 * h.dn);
  return (base * (0.3 + 0.7 * dif(n, L)) + vec3(1.0) * spc(n, L, 90.0) + vec3(0.8, 0.95, 1.0) * crack * (0.4 + kk()) + vec3(1.0) * glint * 0.8 * h.stripe) * (0.55 + 0.45 * uLevelS) * h.inside;
}
vec3 fxMFlake(H h) {             // metallic car paint: a clear-coat shine and flakes that sparkle with the highs
  vec3 n = nMix(nDome(h, 55.0), nCut(h, 2.4)), L = orbitL(uTime * 0.3 * uSpeed, 0.75), col = pal(n.x * 0.3 + uFlow);
  float flake = pow(hash21(floor(h.p * 3.0)), 20.0) * (0.5 + 3.0 * uHighS) * dif(n, L);
  return (col * (0.1 + 0.9 * dif(n, L)) * ao(h) + vec3(1.0) * spc(n, L, 120.0) * 1.2 + mix(col, vec3(1.0), 0.5) * flake) * (0.6 + 0.4 * uLevelS + 0.3 * kk()) * h.inside;
}
vec3 fxMPearl(H h) {             // mother of pearl: colours that change with the angle of the dome and the grooves
  vec3 n = nMix(nDome(h, 65.0), nCut(h, 1.8)), L = normalize(vec3(-0.4, -0.5, 0.8));
  vec3 col = mix(vec3(0.95, 0.92, 0.9), hsv((1.0 - n.z) * 3.0 + dot(n.xy, vec2(0.6, -0.4)) + uFlow + uBassS * 0.3, 0.35, 1.0), 0.55);
  return (col * (0.3 + 0.7 * dif(n, L)) * ao(h) + vec3(1.0) * spc(n, L, 50.0) * (0.5 + uHighS + kk() * 0.5)) * (0.6 + 0.4 * uLevelS) * h.inside;
}
` },

  // ---------- flow and transitions (Resolume Infinite Zoom and wipes, HeavyM sequence transitions, TouchDesigner feedback) ----------
  { g: "flow", title: "זרימה ומעברים", fx: [
    [154, "דומינו", "🁢", 1, "fxFDomino"],
    [155, "מחיקה", "🧽", 1, "fxFWipe"],
    [156, "זום אינסופי", "🔍", 1, "fxFZoom"],
    [157, "דיו במים", "🖋️", 0, "fxFInk"],
    [158, "מכחול", "🖌️", 0, "fxFBrush"],
    [159, "מורף צבעים", "🎨", 0, "fxFMorph"],
    [160, "שובלים", "💨", 1, "fxFTrail"],
    [161, "קרן מסתובבת", "🕐", 1, "fxFCone"],
    [162, "התמוססות", "✨", 1, "fxFDissolve"],
    [163, "נהר צבעים", "🏞️", 0, "fxFRiver"],
  ], glsl: `
vec3 fxFDomino(H h) {            // the pieces (rings, or the parts of an element) take a new colour one after another, every bar
  float T = clockB() / 4.0 * uSpeed, k = pK(h), cyc = floor(T), ph = fract(T) * 1.1;
  vec3 col = mix(pal(cyc * 0.25 + uFlow), pal((cyc + 1.0) * 0.25 + uFlow), step(k, ph));
  return col * (h.stripe * 0.7 + h.groove * 1.2) * (0.5 + 0.5 * uLevelS) + vec3(1.0) * exp(-abs(k - ph) * 25.0) * (h.groove * 1.5 + h.stripe * 0.5) * (0.5 + kk()) + vec3(1.0) * h.edge * 0.2;
}
vec3 fxFWipe(H h) {              // a wipe across the heart every bar, left to right then back, its front running down the grooves
  float T = clockB() / 4.0 * uSpeed, cyc = floor(T), p = fract(T) * 1.1 - 0.05, x = h.p.x / S;
  x = mod(cyc, 2.0) < 0.5 ? x : 1.0 - x;
  vec3 col = mix(pal((cyc + 1.0) * 0.33 + uFlow), pal(cyc * 0.33 + uFlow), smoothstep(p - 0.03, p + 0.03, x));
  return col * (h.stripe * 0.7 + h.groove * 1.2) * (0.45 + 0.5 * uLevelS) + vec3(1.0) * exp(-abs(x - p) * 40.0) * h.groove * (0.6 + kk()) + vec3(1.0) * h.edge * 0.2;
}
vec3 fxFZoom(H h) {              // an endless zoom into the inner heart, every octave a new pattern; faster in a build
  float z = log2(max(h.rad, 0.01)) + fract(uTime * 0.15 * uSpeed * (1.0 + uBuild * 2.0)), f = fract(z), i = floor(z);
  float v = 0.5 + 0.5 * sin(h.uc * TAU * (4.0 + 2.0 * mod(i, 3.0)) + i);
  return pal(i * 0.17 + v * 0.2 + uFlow) * (0.2 + 0.8 * v) * smoothstep(0.0, 0.2, f) * (h.stripe * 0.8 + h.groove * 1.3) * (0.5 + 0.6 * uLevelS) + vec3(1.0) * h.edge * kk() * 0.4;
}
vec3 fxFInk(H h) {               // ink in water: on every beat a drop of colour lands somewhere and spreads out
  vec3 c = vec3(0.0);
  for (int i = 0; i < 3; i++) { float fi = float(i), bi = uBeatN - fi, a = uBeat + fi;
    vec2 cc = vec2(0.2 + 0.6 * hash11(bi * 1.3), 0.2 + 0.6 * hash11(bi * 2.1 + 4.0)) * S;
    float r = length(h.p - cc + vec2(fbm(h.p * 0.03 + bi), fbm(h.p * 0.03 - bi)) * 30.0) / S, R = a * 0.35 * uSpeed;
    c += pal(hash11(bi) + uFlow) * smoothstep(R + 0.02, R - 0.05, r) * exp(-a * 0.7); }
  return c * (h.stripe * 0.85 + h.groove * 1.2) * (0.5 + 0.6 * uLevelS) + vec3(1.0) * h.edge * 0.2;
}
vec3 fxFBrush(H h) {             // a brush paints every ring a new colour over a bar, each starting at its own place
  float T = clockB() / 4.0 * uSpeed, cyc = floor(T), ph = fract(T), r = ringIdx(h), u = fract(h.uc - hash11(r + cyc * 7.0));
  float bristle = 0.6 + 0.4 * noise(vec2(h.uc * 300.0, h.gt * 2.0 + r));
  vec3 col = mix(pal((cyc - 1.0) * 0.25 + rk(h) * 0.2 + uFlow), pal(cyc * 0.25 + rk(h) * 0.2 + uFlow), step(u, ph));
  return col * bristle * (h.groove * 1.3 + h.stripe * 0.75) * (0.5 + 0.5 * uLevelS + 0.3 * kk()) + vec3(1.0) * exp(-abs(u - ph) * 80.0) * h.groove + vec3(1.0) * h.edge * 0.15;
}
vec3 fxFMorph(H h) {             // the colours melt slowly into each other along the rings; the bass lifts the grooves
  float t = uTime * 0.05 * uSpeed, v = fbm(vec2(h.uc * 3.0, rk(h) * 2.0) + t) + 0.3 * sin(h.uc * TAU + t * 3.0);
  return pal(v + uFlow) * (h.stripe * (0.5 + 0.5 * uLevelS) + h.groove * (0.8 + 0.6 * uBassS)) + vec3(1.0) * shimmer(h) * h.groove * 0.5 + vec3(1.0) * h.edge * 0.2 * (1.0 + kk());
}
vec3 fxFTrail(H h) {             // a light runs round every ring with a long trail, longer when louder
  float r = ringIdx(h), pos = fract(clockB() * (0.08 + 0.02 * mod(r, 3.0)) * uSpeed + hash11(r * 2.0)), d = fract(pos - h.uc);
  float tr = exp(-d * (12.0 - 8.0 * uLevelS)) + 0.5 * exp(-fract(pos + 0.5 - h.uc) * 10.0);
  return pal(rk(h) * 0.5 + d * 0.3 + uFlow) * tr * (h.groove * 1.5 + h.stripe * 0.5) * (0.5 + 0.6 * uLevel + 0.4 * kk()) + vec3(1.0) * h.edge * 0.15;
}
vec3 fxFCone(H h) {              // a sweeping hand turns round every piece's own centre, once in two bars, each piece a little later
  vec2 q = h.p - h.pc; float a = fract(atan(q.x, -q.y) / TAU + 0.5 - clockB() * 0.125 * uSpeed + pK(h) * 0.25);
  float tr = pow(a, 1.5 + 3.0 * (1.0 - uLevelS)), head = smoothstep(0.97, 1.0, a);
  return pal(pK(h) * 0.3 + a * 0.3 + uFlow) * (tr + head * (1.0 + kk())) * (h.groove * 1.4 + h.stripe * 0.7) + vec3(1.0) * h.edge * 0.2;
}
vec3 fxFDissolve(H h) {          // the heart dissolves cell by cell into the next colour over two bars, each cell sparking as it turns
  float T = clockB() / 8.0 * uSpeed, cyc = floor(T), ph = fract(T), cell = hash21(vec2(floor(h.uc * 60.0), ringIdx(h)) + cyc);
  vec3 col = mix(pal(cyc * 0.3 + uFlow), pal((cyc + 1.0) * 0.3 + uFlow), step(cell, ph));
  return col * (h.stripe * 0.7 + h.groove * 1.2) * (0.5 + 0.5 * uLevelS) + vec3(1.0) * exp(-abs(cell - ph) * 80.0) * (h.groove + h.stripe) * (0.5 + kk()) + vec3(1.0) * h.edge * 0.15;
}
vec3 fxFRiver(H h) {             // rivers of colour flow down from the cleft to the tip along every ring, faster when louder
  float v = fract(h.p.y / 60.0 - uTime * 0.2 * uSpeed * (0.5 + uLevelS) + noise(vec2(h.uc * 8.0, rk(h) * 4.0)) * 0.5);
  float bright = 0.4 + 0.6 * smoothstep(0.0, 0.5, v) * (1.0 - smoothstep(0.5, 1.0, v));
  return pal(v + rk(h) * 0.2 + uFlow) * bright * (h.groove * 1.4 + h.stripe * 0.7) * (0.6 + 0.4 * uLevelS + 0.4 * kk()) + vec3(1.0) * h.edge * 0.15;
}
` },
];
