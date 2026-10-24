// Projector renderer for the heart. One full-screen fragment shader: every output pixel is mapped back to centimetres on the
// heart through a perspective warp per half (the element is two halves folded like an open book, so each half gets its own
// 4-corner warp sharing the seam), then looks up the distance field of the contour and works out which part it lies on
// (edge, seam, rim, separation groove, ring/groove k, stripe k). Effects are GLSL functions of that
// part plus the music clock, so lines stay razor sharp at any projector resolution. Two effects render at once for crossfades.
// The effects come in banks (the built-in 64, then the ten banks of heart-fx.js); each set of banks in use is its own program.
import { SIZE, MARGIN, RES } from "./heart-geo.js?v=1";
import { FX_COMMON, FX_BANKS } from "./heart-fx.js?v=1";

// id, Hebrew name, icon, energy class (0 calm, 1 medium, 2 intense) for the automatic show.
export const EFFECTS = [
  { id: 0, name: "כיול", ico: "📐", e: -1 },
  { id: 1, name: "פעימת לב", ico: "💓", e: 2 },
  { id: 2, name: "רצים בתעלות", ico: "☄️", e: 1 },
  { id: 3, name: "אקולייזר", ico: "📊", e: 2 },
  { id: 4, name: "שביל המתאר", ico: "💫", e: 0 },
  { id: 5, name: "מילוי נוזלי", ico: "🌊", e: 0 },
  { id: 6, name: "אדוות לב", ico: "🫧", e: 1 },
  { id: 7, name: "פסים מתחלפים", ico: "🎛️", e: 2 },
  { id: 8, name: "להבות", ico: "🔥", e: 1 },
  { id: 9, name: "ניאון", ico: "🟣", e: 0 },
  { id: 10, name: "סורק לייזר", ico: "🔦", e: 1 },
  { id: 11, name: "שני חצאים", ico: "🌗", e: 2 },
  { id: 12, name: "פלזמה", ico: "🫠", e: 0 },
  { id: 13, name: "נצנוצים", ico: "✨", e: 0 },
  { id: 14, name: "זרם קשת", ico: "🌈", e: 1 },
  { id: 15, name: "סטרובו", ico: "⚡", e: 3 },
  { id: 16, name: "גשם לבבות", ico: "💕", e: 0 },
  { id: 17, name: "סולם תעלות", ico: "🪜", e: 1 },
  { id: 18, name: "וידאו ממופה", ico: "🎬", e: -1 },
  { id: 19, name: "מנהרת לב", ico: "🌀", e: 1 },
  { id: 20, name: "הד מהלב הפנימי", ico: "❤️‍🔥", e: 2 },
  { id: 21, name: "מנוע טבעות", ico: "🎹", e: -1 },
  // Live: built for the ring heart and the music clock.
  { id: 22, name: "מד עוצמה לבבי", ico: "📶", e: 2, g: "live" },
  { id: 23, name: "פיצוץ קיק", ico: "💥", e: 2, g: "live" },
  { id: 24, name: "בס מול גבוהים", ico: "🎚️", e: 1, g: "live" },
  { id: 25, name: "ספירלת תיבה", ico: "🌀", e: 1, g: "live" },
  { id: 26, name: "רדאר", ico: "📡", e: 1, g: "live" },
  { id: 27, name: "טבעות ספקטרום", ico: "🎼", e: 1, g: "live" },
  { id: 28, name: "נשימת לב", ico: "🫁", e: 0, g: "live" },
  { id: 29, name: "מוניטור דופק", ico: "🩺", e: 0, g: "live" },
  { id: 30, name: "ניצוצות פגיעה", ico: "🎇", e: 2, g: "live" },
  { id: 31, name: "זיקוקים", ico: "🎆", e: 2, g: "live" },
  { id: 32, name: "קליידוסקופ", ico: "🔮", e: 1, g: "live" },
  { id: 33, name: "מצלמה תרמית", ico: "🌡️", e: 1, g: "live" },
  { id: 34, name: "גלים מהתפר", ico: "〰️", e: 1, g: "live" },
  { id: 35, name: "זרם טבעות", ico: "🔁", e: 1, g: "live" },
  { id: 36, name: "גשם דיגיטלי", ico: "💾", e: 1, g: "live" },
  { id: 37, name: "ברקים", ico: "🌩️", e: 2, g: "live" },
  { id: 38, name: "פעימה כפולה", ico: "💞", e: 2, g: "live" },
  { id: 39, name: "סטרובו רץ", ico: "🏁", e: 2, g: "live" },
  { id: 40, name: "זהב נוצץ", ico: "🏅", e: 0, g: "live" },
  { id: 41, name: "צבע לכל תיבה", ico: "🎨", e: 1, g: "live" },
  // 3D: lit from the heart's own cut.
  { id: 42, name: "תבליט מדרגות", ico: "🪜", e: 1, g: "3d" },
  { id: 43, name: "כרית תלת-ממד", ico: "🛋️", e: 0, g: "3d" },
  { id: 44, name: "כרום נוזלי", ico: "🪩", e: 1, g: "3d" },
  { id: 45, name: "לב זכוכית", ico: "🧊", e: 0, g: "3d" },
  { id: 46, name: "מנהרה תלת-ממד", ico: "🕳️", e: 1, g: "3d" },
  { id: 47, name: "לב מסתובב", ico: "🔄", e: 1, g: "3d" },
  { id: 48, name: "תבליט ספקטרום", ico: "🏙️", e: 2, g: "3d" },
  { id: 49, name: "זרקורים", ico: "🔦", e: 1, g: "3d" },
  { id: 50, name: "גל הלם", ico: "🌊", e: 2, g: "3d" },
  { id: 51, name: "הולוגרמה", ico: "🛸", e: 0, g: "3d" },
  // Trance: driven by the sound engine's trance reading (sidechain pump, build-up, drop, breakdown) and the 16th-note clock.
  { id: 52, name: "מניפת לייזרים", ico: "🎇", e: 2, g: "trance" },
  { id: 53, name: "פאמפ סיידצ'יין", ico: "🫀", e: 1, g: "trance" },
  { id: 54, name: "בילדאפ ודרופ", ico: "🚀", e: 2, g: "trance" },
  { id: 55, name: "טראנס גייט", ico: "▦", e: 3, g: "trance" },
  { id: 56, name: "ארפג'יו", ico: "🎹", e: 1, g: "trance" },
  { id: 57, name: "היפר-ספייס", ico: "🌌", e: 1, g: "trance" },
  // Breathing sound sculpture: every piece (a part of an element, or a ring of the heart) is its own voice, and every sound
  // channel moves something different: bass the breath, mids the colour flow, highs a shimmer on the cut, the kick a pulse.
  { id: 58, name: "פסל נושם", ico: "🌬️", e: 0, g: "parts" },
  { id: 59, name: "מקהלת חלקים", ico: "🎶", e: 1, g: "parts" },
  { id: 60, name: "גל עובר", ico: "🐦", e: 1, g: "parts" },
  { id: 61, name: "פאנלים מתהפכים", ico: "🃏", e: 1, g: "parts" },
  { id: 62, name: "תבליט פאנלים", ico: "🧱", e: 1, g: "parts" },
  { id: 63, name: "שכבות מרחפות", ico: "🪐", e: 0, g: "parts" },
];
EFFECTS.forEach(e => e.bank = 0);
FX_BANKS.forEach((b, i) => b.fx.forEach(([id, name, ico, e, fn]) => { EFFECTS[id] = { id, name, ico, e, g: b.g, bank: i + 1, fn }; }));
// Effect groups for the pads, in the order they show.
export const FX_GROUPS = [["base", "בסיס"], ["live", "לייב · מגיבים למוזיקה"], ["trance", "טראנס · פאמפ, בילדאפ, דרופ וגייט"], ["3d", "תלת-ממד · מוארים לפי החיתוך"],
  ["parts", "פסל אור-קול נושם · כל חלק קול משלו"], ...FX_BANKS.map(b => [b.g, b.title])];

export const PALETTES = {
  love: { name: "אהבה", c: ["#ff1744", "#ff6fa5", "#ffd1dc", "#c2185b"] },
  fire: { name: "אש", c: ["#ff2a00", "#ff8a00", "#ffd000", "#b30000"] },
  ocean: { name: "אוקיינוס", c: ["#00c2ff", "#0047ff", "#00ffd5", "#6a00ff"] },
  neon: { name: "ניאון", c: ["#ff00e6", "#00f0ff", "#faff00", "#7b00ff"] },
  gold: { name: "זהב", c: ["#ffb300", "#fff1c1", "#ff7a00", "#ffd54f"] },
  ice: { name: "קרח", c: ["#e0f7ff", "#7fd6ff", "#ffffff", "#4a7dff"] },
  forest: { name: "יער", c: ["#00e676", "#c6ff00", "#00bfa5", "#64dd17"] },
  sunset: { name: "שקיעה", c: ["#ff4e50", "#f9d423", "#fc913a", "#e8175d"] },
};

const VS = `#version 300 es
in vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

// GLSL function of every built-in effect, by id.
const CORE_FN = ["fxCalib", "fxHeartbeat", "fxRunners", "fxEq", "fxContour", "fxLiquid", "fxRipples", "fxFlip", "fxFire", "fxNeon", "fxLaser", "fxHalves", "fxPlasma", "fxSparkle", "fxRainbow", "fxStrobe", "fxHeartRain", "fxLadder", "fxVideo", "fxTunnel", "fxEcho", "fxEngine", "fxVU", "fxKickBurst", "fxBassHigh", "fxSpiral", "fxRadar", "fxSpecRings", "fxBreath", "fxECG", "fxSparks", "fxFireworks", "fxKaleido", "fxThermal", "fxSeamWaves", "fxRingFlow", "fxDigitalRain", "fxLightning", "fxTwinPulse", "fxRunStrobe", "fxGold", "fxBarWipe", "fxTerrace", "fxPillow", "fxChrome", "fxGlass", "fxTunnel3D", "fxRotHeart", "fxSpecRelief", "fxSpot", "fxShock", "fxHolo", "fxTrLaser", "fxTrPump", "fxTrBuild", "fxTrGate", "fxTrArp", "fxTrHyper", "fxBreathe", "fxChoir", "fxWave", "fxCards", "fxBlocks", "fxFloat"];

const FS_HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
out vec4 o;
uniform sampler2D uField, uVid, uCh, uPartMap, uPartD;
uniform int uParts;
uniform float uBassS, uMidS, uHighS, uBreath, uFlow;
uniform int uAnySolo;
uniform vec2 uRes;
uniform mat3 uInvHL, uInvHR;
uniform float uN, uDMax;
uniform int uPattern, uNLev, uFxA, uFxB;
uniform float uLev[64];
uniform float uGW, uEdge, uRim, uGap, uAngle, uSeam, uCleft;
uniform vec2 uCenter;
uniform float uTime, uBeat, uBeatN, uBar, uBass, uMid, uHigh, uLevel, uLevelS, uKick, uHit;
uniform float uPump, uBuild, uDrop, uBreak;   // trance reading: 0 right after a kick -> 1; build-up; drop flash; breakdown
uniform float uSpec[32];
uniform float uEngMix;
uniform float uSpeed, uInt, uMix, uVidMix, uVidOn, uVidAspect, uMaster, uOutline, uHue;
uniform vec3 uPal[4];
uniform int uPass, uMask, uLayMode;   // layer passes: 0 is the show itself, 1.. are layers blended over it (see renderLayer)
uniform float uLayOp;
#define TAU 6.28318530718
#define S ${SIZE.toFixed(1)}

struct H { vec2 p, gD, gP, pc, tilt; float aa, d, uc, phi, gd, gt, s, gn, sn, dn, side, rad, pk, pb, dm; int gi, si, part;
  float inside, edge, seam, rim, sep, field, groove, stripe, lines; };

float hash11(float n) { return fract(sin(n * 127.1 + 1.3) * 43758.5453); }
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
vec3 hsv(float h, float s, float v) { vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }
vec3 hueShift(vec3 c, float h) { const vec3 k = vec3(0.57735); float a = h * TAU, ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca); }
vec3 pal(float x) { x = fract(x) * 4.0; int i = int(x); float f = smoothstep(0.0, 1.0, fract(x)); return hueShift(mix(uPal[i], uPal[(i + 1) % 4], f), uHue); }
float band(float a, float b, float x, float aa) { return smoothstep(a - aa, a + aa, x) * (1.0 - smoothstep(b - aa, b + aa, x)); }
float dot2(vec2 v) { return dot(v, v); }
float sdHeart(vec2 p) { p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y); }
float clockB() { return uBeatN + uBeat; }   // music clock in beats

H heart(vec2 px) {
  H h;
  vec3 ql = uInvHL * vec3(px, 1.0), qr = uInvHR * vec3(px, 1.0);
  vec2 pl = ql.xy / ql.z, pr = qr.xy / qr.z;
  bool gap = pl.x > S * 0.5 && pr.x < S * 0.5;   // between the two halves' warps: nothing there
  h.p = pl.x <= S * 0.5 ? pl : pr;
  h.side = step(S * 0.5, h.p.x);
  h.aa = max(length(dFdx(h.p)), length(dFdy(h.p))) * 0.7 + 1e-4;
  vec2 uv = ((h.p + ${MARGIN.toFixed(1)}) * ${RES.toFixed(1)} + 0.5) / uN;
  vec4 f = texture(uField, uv);
  bool out_ = any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)));
  h.d = out_ || gap ? -50.0 : f.r;
  h.uc = fract(atan(f.b, f.g) / TAU + 1.0);
  // The part this point is on (elements of separate parts): its centre, order, depth, facet tilt and spectrum band.
  // Each part is its own little heart: dn and rad are measured within it.
  h.part = 0; h.pc = uCenter; h.pk = 0.0; h.pb = 0.0; h.tilt = vec2(0.0); h.dm = uDMax;
  if (uParts > 1) {
    ivec2 gi = clamp(ivec2(floor((h.p + ${MARGIN.toFixed(1)}) * ${RES.toFixed(1)} + 0.5)), ivec2(0), ivec2(int(uN) - 1));
    h.part = int(texelFetch(uPartMap, gi, 0).r * 255.0 + 0.5) & 127;
    vec4 pa = texelFetch(uPartD, ivec2(h.part, 0), 0), pb = texelFetch(uPartD, ivec2(h.part, 1), 0);
    h.pc = pa.xy; h.pk = pa.z; h.dm = max(pa.w, 1.0); h.tilt = pb.xy; h.pb = pb.z;
  }
  h.dn = clamp(h.d / h.dm, 0.0, 1.0);
  h.rad = uPattern == 4 ? clamp(f.a, 0.0, 1.0) : 1.0 - h.dn;   // 0 at the heart's core, 1 on the contour
  float r = length(h.p - uCenter);
  if (uPattern == 4) h.phi = f.a;
  else if (uPattern == 2) h.phi = h.d;
  else if (uPattern == 3) h.phi = atan(h.p.x - uCenter.x, uCenter.y - h.p.y);
  else if (uPattern == 1) h.phi = h.p.y + abs(h.p.x - S * 0.5) * tan(radians(uAngle));
  else h.phi = dot(h.p, vec2(cos(radians(uAngle)), sin(radians(uAngle))));
  // Along-the-line position 0..1, the coordinate chases travel on.
  if (uPattern == 2 || uPattern == 4) h.s = h.uc;
  else if (uPattern == 3) h.s = clamp(r / (S * 0.75), 0.0, 1.0);
  else if (uPattern == 1) h.s = h.p.x / S;
  else { float a = radians(uAngle); h.s = dot(h.p - S * 0.5, vec2(-sin(a), cos(a))) / S + 0.5; }
  // Slopes (per cm) of the contour distance and of the groove coordinate, from samples 0.5 cm either side. They give the
  // 3D effects their surface normals, and ring size changes faster near the cleft, so they also turn level differences into cm.
  float e = 0.5 * ${RES.toFixed(1)} / uN;
  vec4 fxp = texture(uField, uv + vec2(e, 0.0)), fxm = texture(uField, uv - vec2(e, 0.0));
  vec4 fyp = texture(uField, uv + vec2(0.0, e)), fym = texture(uField, uv - vec2(0.0, e));
  h.gD = vec2(fxp.r - fxm.r, fyp.r - fym.r);
  vec2 gp;
  if (uPattern == 4) gp = vec2(fxp.a - fxm.a, fyp.a - fym.a);
  else if (uPattern == 2) gp = h.gD;
  else if (uPattern == 3) gp = vec2(uCenter.y - h.p.y, h.p.x - uCenter.x) / max(r, 1.0);
  else if (uPattern == 1) gp = vec2(sign(h.p.x - S * 0.5) * tan(radians(uAngle)), 1.0);
  else gp = vec2(cos(radians(uAngle)), sin(radians(uAngle)));
  float gs = uPattern == 4 ? length(gp) + 1e-5 : 1.0;
  h.gP = gp / (length(gp) + 1e-6);   // direction in which the groove coordinate grows (outwards for rings)
  h.gd = 1e9; h.gt = 0.0; h.gi = -1; h.si = 0;
  for (int k = 0; k < 64; k++) {
    if (k >= uNLev) break;
    float df = h.phi - uLev[k];
    if (uPattern == 3) df = (mod(df + 3.14159265, TAU) - 3.14159265) * r;
    else if (uPattern == 4) df /= gs;
    if (abs(df) < h.gd) { h.gd = abs(df); h.gt = df; h.gi = k; }
    if (h.phi > uLev[k]) h.si = k + 1;
  }
  if (uPattern == 3 && h.si == uNLev) h.si = 0;
  float nl = max(float(uNLev), 1.0);
  h.gn = (float(h.gi) + 0.5) / nl;
  h.sn = float(h.si) / nl;
  float aa = h.aa;
  h.inside = smoothstep(-aa, aa, h.d);
  h.edge = band(-1.0, uEdge, h.d, aa) * h.inside;
  float fieldStart = uRim > 0.0 ? uRim + uGap : uEdge;
  h.rim = uRim > 0.0 ? band(uEdge, uRim, h.d, aa) : 0.0;
  h.sep = uRim > 0.0 ? band(uRim, uRim + uGap, h.d, aa) : 0.0;
  h.field = smoothstep(fieldStart - aa, fieldStart + aa, h.d);
  h.seam = uSeam > 0.0 ? (1.0 - smoothstep(uSeam * 0.5 - aa, uSeam * 0.5 + aa, abs(h.p.x - S * 0.5))) * step(uCleft, h.p.y) * h.field : 0.0;
  h.groove = uNLev > 0 ? h.field * (1.0 - smoothstep(uGW * 0.5 - aa, uGW * 0.5 + aa, h.gd)) * (1.0 - h.seam) : 0.0;
  h.stripe = max(h.field - h.groove - h.seam, 0.0);
  h.lines = clamp(h.edge + h.sep + h.groove + h.seam, 0.0, 1.0);
  return h;
}

vec3 video(vec2 p) {
  vec2 uv = p / S - 0.5;
  if (uVidAspect > 1.0) uv.x /= uVidAspect; else uv.y *= uVidAspect;
  return uVidOn > 0.5 ? texture(uVid, uv + 0.5).rgb : vec3(0.0);
}

vec3 fxCalib(H h) {
  float aa = h.aa * 1.5;
  vec2 g10 = abs(fract(h.p / 10.0 + 0.5) - 0.5) * 10.0, g50 = abs(fract(h.p / 50.0 + 0.5) - 0.5) * 50.0;
  float box = step(-0.5, h.p.x) * step(h.p.x, S + 0.5) * step(-0.5, h.p.y) * step(h.p.y, S + 0.5);
  float grid = (1.0 - smoothstep(0.12, 0.12 + aa, min(g10.x, g10.y))) * 0.14 + (1.0 - smoothstep(0.3, 0.3 + aa, min(g50.x, g50.y))) * 0.3;
  vec2 e = min(abs(h.p), abs(h.p - S));
  float border = 1.0 - smoothstep(0.8, 0.8 + aa, min(e.x, e.y));
  vec2 c = abs(h.p - S * 0.5);
  float cross_ = (1.0 - smoothstep(0.35, 0.35 + aa, min(c.x, c.y))) * step(max(c.x, c.y), 14.0);
  vec3 bg = box * (vec3(grid) + vec3(0.1, 0.9, 0.8) * border + vec3(1.0, 1.0, 0.2) * cross_);
  vec3 stripeC = hsv(hash11(float(h.si) * 3.1), 0.55, 0.22 + 0.06 * float(h.si % 2));
  vec3 hc = stripeC * h.stripe + hsv(h.gn * 0.85, 0.85, 1.0) * h.groove + vec3(1.0, 0.85, 0.1) * h.sep + vec3(0.4, 0.9, 1.0) * h.seam
          + vec3(0.6, 0.15, 0.3) * h.rim + vec3(1.0) * h.edge;
  return mix(bg, hc + vec3(grid) * 0.4 * h.stripe, h.inside);
}


// ---------------- shared by every effect bank ----------------
float ringN() { return max(float(uNLev) * 2.0 + 1.0, 1.0); }
float ringIdx(H h) { return h.groove > 0.5 ? float(h.gi) * 2.0 + 1.0 : float(h.si) * 2.0; }   // 0 inner heart, groove, heart ...
float specAt(float x) { float fi = clamp(x, 0.0, 1.0) * 31.0; int i = int(fi); return mix(uSpec[i], uSpec[min(i + 1, 31)], fract(fi)); }
float kk() { return clamp(uKick, 0.0, 1.0); }
// The 3D effects light the real cut: the surface normal comes from the heart's own grooves (each groove a V cut with an
// inner and an outer wall) and from a dome over the whole heart, so light, shadow and depth land exactly on the channels.
vec3 nCut(H h, float steep) {
  float t = clamp(h.gt / (uGW * 0.5), -1.0, 1.0);
  return normalize(vec3(h.gP * (t < 0.0 ? 1.0 : -1.0) * steep * h.groove + h.tilt, 1.0));
}
// The dome of the heart, or of every part on its own, leaning the way the part's facet faces.
vec3 nDome(H h, float hm) { vec2 g = hm * 0.5 / sqrt(max(h.dn, 0.015)) * h.gD / h.dm; return normalize(vec3(-g + h.tilt, 1.0)); }
vec3 nMix(vec3 a, vec3 b) { return normalize(vec3(a.xy + b.xy, 1.0)); }
float ao(H h) { return 1.0 - 0.65 * h.groove * (1.0 - abs(clamp(h.gt / (uGW * 0.5), -1.0, 1.0))); }
float dif(vec3 n, vec3 L) { return max(dot(n, L), 0.0); }
float spc(vec3 n, vec3 L, float sh) { return pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), sh); }
vec3 orbitL(float a, float z) { return normalize(vec3(cos(a), sin(a), z)); }
vec3 envMap(vec3 R) {
  float sky = smoothstep(-0.3, 0.7, -R.y);
  vec3 c = mix(pal(0.6) * 0.15, pal(0.0), sky);
  c += vec3(1.0) * smoothstep(0.93, 0.98, sin(R.x * 7.0 + uTime * 0.7 * uSpeed)) * sky;
  c += pal(0.5) * smoothstep(0.96, 0.99, sin(R.y * 9.0 - uTime * 0.4)) * 0.6;
  return c;
}
// A piece is a part of an element, or a ring of the heart. Each sound channel has one job, smoothed so it moves and never jumps:
// uBassS breathes (how deep and bright), uMidS turns the colour flow (uFlow), uHighS shimmers on the cut lines, the kick pulses,
// the spectrum gives every piece its own voice, and uBreath is a slow breath whose pace follows the music's energy.
// The trance reading joins in: a build-up deepens the breath and speeds the wave, a drop floods every piece at once.
float pK(H h) { return uParts > 1 ? h.pk : ringIdx(h) / ringN(); }                       // where the piece is in the sequence
float pB(H h) { return uParts > 1 ? h.pb : ringIdx(h) / ringN(); }                       // its slice of the spectrum
float pSeed(H h) { return uParts > 1 ? hash11(float(h.part) * 7.31 + 0.4) : hash11(ringIdx(h) * 3.7 + 0.4); }
float breathV(float off) { float x = fract(uBreath + off); return x < 0.4 ? smoothstep(0.0, 0.4, x) : 1.0 - smoothstep(0.4, 1.0, x); }   // in 40%, out 60%
float shimmer(H h) { return pow(noise(h.p * 0.55 + vec2(uTime * 2.3, -uTime * 1.7)), 6.0) * uHighS * 3.5; }

// ---------------- ring engine ----------------
// Row 2 of the channel texture: the engine's colour for every channel this frame (heart-engine.js), already scaled by level.
vec3 chE(int id) { return texelFetch(uCh, ivec2(id, 2), 0).rgb; }
// The six parts a pixel can belong to (it blends between them at edges): 0 edge, 1 seam, 2 rim, 3 separation, 4 groove, 5 band.
// Written as functions rather than local arrays: some phone GPUs reject arrays without an explicit precision.
int chId(H h, int i) {
  int sd = int(h.side);
  if (i == 0) return sd;
  if (i == 1) return 2;
  if (i == 2) return 3 + sd;
  if (i == 3) return 5 + sd;
  if (i == 4) return 8 + max(h.gi, 0) * 2 + sd;
  return 136 + h.si * 2 + sd;
}
float chW(H h, int i) {
  if (i == 0) return h.edge;
  if (i == 1) return h.seam;
  if (i == 2) return h.rim;
  if (i == 3) return h.sep;
  if (i == 4) return h.groove;
  return h.stripe;
}
vec3 engineAt(H h) {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 6; i++) { float w = chW(h, i); if (w > 0.001) c += w * chE(chId(h, i)); }
  return c;
}
vec3 fxEngine(H h) {
  vec3 c = engineAt(h);
  // A little life inside each ring: a soft sheen running along it, brightest in the middle of the groove.
  float sheen = 0.86 + 0.14 * sin(h.s * TAU * 5.0 - uTime * 1.7);
  float core = 1.0 + 0.35 * h.groove * (1.0 - smoothstep(0.0, uGW * 0.5, h.gd));
  return c * sheen * core;
}

// A classic trance gate: 16 steps, on/off. The pattern reads from the lowest bit, one step per 16th note.
float gateAt(int i) { return float((0x6DB5 >> (i & 15)) & 1); }
float gate16() { float st = clockB() * 4.0; return gateAt(int(mod(floor(st), 16.0))) * (1.0 - smoothstep(0.5, 0.72, fract(st))); }
`;

const CORE_GLSL = `
vec3 fxHeartbeat(H h) {
  float ph = uBeat;
  float env = exp(-ph * 8.0) + 0.65 * exp(-max(ph - 0.2, 0.0) * 9.0) * step(0.2, ph);
  float front = ph * h.dm * 1.5;
  float ring = exp(-pow((h.d - front) / 5.0, 2.0));
  vec3 base = pal(0.0);
  vec3 c = base * (0.08 + 0.9 * env * uInt) * (h.stripe * 0.7 + h.rim);
  c += mix(base, vec3(1.0, 0.85, 0.9), 0.6) * ring * (h.groove + h.sep) * 1.5;
  c += base * ring * h.stripe * 0.35;
  c += vec3(1.0, 0.9, 0.95) * h.edge * (0.35 + 0.65 * env);
  return c;
}

vec3 fxRunners(H h) {
  float T = clockB();
  float dir = (h.gi % 2 == 0) ? 1.0 : -1.0;
  float f = fract(dir * h.s * 3.0 - T * 0.5 * uSpeed + hash11(float(h.gi)));
  float comet = pow(f, 14.0) + 0.6 * smoothstep(0.985, 1.0, f);
  vec3 col = pal(h.gn + T * 0.03);
  vec3 c = col * comet * h.groove * 1.6;
  float fe = fract(h.uc * 2.0 - T * 0.125);
  c += mix(col, vec3(1.0), 0.5) * pow(fe, 10.0) * (h.edge + h.sep) * 1.4;
  c += pal(h.sn + 0.5) * (0.05 + 0.25 * uKick) * h.stripe;
  c += pal(0.25) * 0.12 * h.rim;
  return c;
}

vec3 fxEq(H h) {
  int b = int(clamp((1.0 - h.sn) * 31.0, 0.0, 31.0));
  float v = clamp(uSpec[b] * (0.6 + 0.6 * uInt), 0.0, 1.0);
  float w = abs(h.s - 0.5) * 2.0;
  float fill = 1.0 - smoothstep(v * 1.15 - 0.03, v * 1.15 + 0.03, w);
  vec3 col = pal(float(b) / 31.0);
  vec3 c = col * (0.08 + 0.92 * fill) * (0.35 + 0.65 * v) * h.stripe;
  int bg = int(clamp((1.0 - h.gn) * 31.0, 0.0, 31.0));
  c += mix(col, vec3(1.0), 0.4) * smoothstep(0.25, 0.9, uSpec[bg]) * h.groove * 1.3;
  c += pal(0.0) * (0.2 + 0.8 * uBass) * (h.rim * 0.7 + h.edge);
  c += vec3(1.0) * uKick * h.sep * 0.8;
  return c;
}

vec3 fxContour(H h) {
  float T = clockB();
  vec3 c = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float pos = fract(T / 16.0 * uSpeed + float(i) / 3.0);
    float du = fract(pos - h.uc);
    float tr = exp(-du * 14.0) + 0.5 * smoothstep(0.995, 1.0, 1.0 - du);
    vec3 col = pal(float(i) / 3.0);
    c += col * tr * (h.edge * 1.3 + h.rim * 0.7 + h.sep + (h.groove * 0.8 + h.stripe * 0.12) * exp(-h.d / 22.0));
  }
  c += pal(0.6) * 0.04 * h.stripe + vec3(1.0) * uKick * 0.25 * h.edge;
  return c;
}

vec3 fxLiquid(H h) {
  float t = uTime * uSpeed;
  float lvl = mix(0.1, 0.96, uLevelS);
  float yf = S * (1.0 - lvl) + sin(h.p.x * 0.06 + t * 2.0) * 3.0 * (0.4 + uBass) + sin(h.p.x * 0.13 - t * 1.3) * 1.5;
  float under = smoothstep(yf - 1.0, yf + 1.0, h.p.y);
  float surf = exp(-pow((h.p.y - yf) / 1.3, 2.0));
  float depth = clamp((h.p.y - yf) / 120.0, 0.0, 1.0);
  vec2 bq = vec2(h.p.x / 8.0, (h.p.y + t * 22.0) / 8.0);
  float bub = step(0.93, hash21(floor(bq))) * (1.0 - smoothstep(0.12, 0.28, length(fract(bq) - 0.5)));
  vec3 col = pal(depth * 0.5);
  vec3 c = col * under * (h.stripe * (0.45 + 0.35 * depth) + h.rim * 0.7 + h.lines * 1.3);
  c += vec3(1.0, 0.95, 0.95) * surf * h.inside;
  c += vec3(0.9) * under * bub * h.stripe * 0.7;
  c += pal(0.5) * (1.0 - under) * (h.lines * 0.08 + h.edge * 0.3);
  return c;
}

vec3 fxRipples(H h) {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float age = uBeat + float(i);
    float front = age * 0.42 * uSpeed;
    float ring = exp(-pow((h.rad - front) / 0.03, 2.0)) * exp(-age * 0.55);
    c += pal(fract((uBeatN - float(i)) * 0.25)) * ring;
  }
  return c * (h.groove * 1.7 + h.sep * 1.5 + h.edge * 1.5 + h.stripe * 0.4 + h.rim * 0.8) + pal(0.75) * 0.03 * h.stripe;
}

vec3 fxFlip(H h) {
  float T = uBeatN;
  float r = hash21(vec2(float(h.si) + 0.5, T));
  float on = step(0.42, r);
  float env = 0.35 + 0.65 * exp(-uBeat * 3.0);
  vec3 c = pal(r * 4.0) * on * env * h.stripe;
  c += pal(hash11(T)) * env * h.rim;
  c += vec3(1.0) * (0.06 + 0.9 * uKick) * (h.groove + h.sep) + vec3(1.0) * 0.5 * h.edge;
  return c;
}

vec3 fxFire(H h) {
  float t = uTime * uSpeed;
  vec2 q = vec2(h.p.x * 0.025, h.p.y * 0.018 + t * 1.2);
  float n = fbm(q + vec2(0.0, fbm(q * 1.7 - t * 0.4)));
  float heat = clamp((h.p.y / S) * 1.25 - 0.25 + (n - 0.5) * 1.1 + uBass * 0.35 + uKick * 0.15, 0.0, 1.0);
  vec3 fire = mix(vec3(0.0), vec3(0.75, 0.04, 0.0), smoothstep(0.0, 0.35, heat));
  fire = mix(fire, vec3(1.0, 0.45, 0.0), smoothstep(0.35, 0.7, heat));
  fire = mix(fire, vec3(1.0, 0.95, 0.6), smoothstep(0.7, 1.0, heat));
  return hueShift(fire, uHue) * (h.stripe * 0.85 + h.rim + h.lines * 1.35);
}

vec3 fxNeon(H h) {
  float flick = 1.0 - step(0.82, hash21(vec2(float(h.gi), floor(uTime * 14.0)))) * uHit * 0.9;
  float buzz = 0.88 + 0.12 * sin(uTime * 110.0 + float(h.gi) * 2.0);
  vec3 col = pal(h.gn * 0.9 + 0.05);
  float core = 1.0 - smoothstep(0.0, uGW * 0.5, h.gd);
  float glow = exp(-max(h.gd - uGW * 0.5, 0.0) / 2.5) * 0.35 * h.stripe;
  vec3 c = (col * (h.groove * (0.7 + 0.6 * core)) + col * glow) * flick * buzz * (0.7 + 0.5 * uLevel);
  c += mix(pal(0.0), vec3(1.0), 0.6) * h.edge * 1.2 + pal(0.5) * h.sep * (0.6 + 0.4 * uBass);
  return c;
}

vec3 fxLaser(H h) {
  float t = uTime * uSpeed;
  vec3 c = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float th = t * 0.25 + float(i) * 1.5708;
    vec2 dir = vec2(cos(th), sin(th));
    float x = dot(h.p - S * 0.5, dir);
    float pos = sin(t * (1.1 + 0.4 * float(i)) + float(i)) * 125.0;
    float beam = exp(-pow((x - pos) / 1.6, 2.0)), wide = exp(-pow((x - pos) / 16.0, 2.0));
    vec3 col = pal(0.3 + float(i) * 0.4);
    c += col * (beam * h.inside * 1.3 + wide * (h.groove + h.sep) * 1.1 + wide * h.stripe * 0.12);
  }
  c += vec3(1.0) * h.edge * (0.25 + 0.75 * uKick);
  return c;
}

vec3 fxHalves(H h) {
  float side = step(S * 0.5, h.p.x);
  float on = abs(side - mod(uBeatN, 2.0)) < 0.5 ? 1.0 : 0.0;
  float env = 0.25 + 0.75 * exp(-uBeat * 2.5);
  vec3 a = pal(0.0), b = pal(0.5);
  vec3 col = mix(a, b, side);
  vec3 c = col * (on * env + 0.06) * (h.stripe + h.rim);
  c += mix(b, a, side) * (h.groove + h.sep) * (0.3 + 0.9 * on * env);
  float seam = exp(-pow((h.p.x - S * 0.5) / 0.8, 2.0)) * exp(-uBar * 6.0);
  c += vec3(1.0) * (h.edge * 0.8 + seam * h.inside);
  return c;
}

vec3 fxPlasma(H h) {
  float t = uTime * 0.6 * uSpeed;
  vec2 q = h.p / 38.0;
  float v = sin(q.x + t) + sin((q.y + t) * 0.8) + sin((q.x + q.y + t) * 0.6) + sin(length(q - 3.0) * 1.5 - t * 1.3);
  vec3 col = pal(v * 0.125 + 0.5 + uBass * 0.1);
  return col * (h.stripe + h.rim) * (0.55 + 0.45 * uLevel) + col * 0.05 * (h.groove + h.sep) + vec3(1.0) * h.edge * 0.6;
}

vec3 fxSparkle(H h) {
  float cells = 46.0;
  float cid = floor(h.s * cells);
  float tw = hash21(vec2(cid + float(h.gi) * 71.0, floor(uTime * 9.0)));
  float on = step(1.0 - 0.06 - 0.4 * uHigh, tw);
  float dot_ = 1.0 - smoothstep(0.12, 0.42, abs(fract(h.s * cells) - 0.5));
  vec3 c = mix(pal(h.gn), vec3(1.0), 0.6) * on * dot_ * h.groove * 1.6;
  vec2 g = h.p / 7.0; vec2 id = floor(g);
  float star = step(0.965, hash21(id + 13.0)) * (1.0 - smoothstep(0.05, 0.22, length(fract(g) - 0.5)));
  c += vec3(1.0) * star * (0.5 + 0.5 * sin(uTime * 3.0 * uSpeed + hash21(id) * 30.0)) * h.stripe * (0.5 + uHigh);
  c += pal(0.6) * 0.05 * h.stripe + mix(pal(0.0), vec3(1.0), 0.5) * h.edge * 0.7;
  return c;
}

vec3 fxRainbow(H h) {
  float T = clockB();
  vec3 col = hueShift(hsv(h.sn * 0.7 + T * 0.03 * uSpeed + h.s * 0.15, 0.85, 1.0), uHue);
  return col * (h.stripe * 0.75 + h.rim * 0.6) + vec3(1.0) * h.lines * (0.25 + 0.75 * exp(-uBeat * 5.0));
}

vec3 fxStrobe(H h) {
  float T = clockB();
  float flash = step(fract(T * 2.0), 0.16);
  return vec3(1.0) * flash * h.inside * (0.45 + 0.55 * uLevel) + (1.0 - flash) * pal(floor(T * 2.0) * 0.25) * (h.lines * 0.9 + h.stripe * 0.05);
}

vec3 fxHeartRain(H h) {
  float t = uTime * uSpeed, cell = 26.0;
  vec2 q = h.p;
  float colm = floor(q.x / cell);
  q.y -= t * (16.0 + 12.0 * hash11(colm));
  vec2 id = floor(q / cell), f = fract(q / cell) - 0.5;
  float rnd = hash21(id + colm * 0.37);
  float sc = (0.3 + 0.08 * rnd) * (1.0 + 0.25 * exp(-uBeat * 5.0));
  vec2 hp = f / sc; hp.y = -hp.y + 0.55;
  float m = (1.0 - smoothstep(0.0, 0.06, sdHeart(hp))) * step(0.4, rnd);
  vec3 c = pal(rnd * 4.0) * m * h.stripe;
  c += pal(0.0) * (0.12 + 0.4 * uKick) * (h.groove + h.sep) + vec3(1.0, 0.8, 0.85) * h.edge * 0.8 + pal(0.25) * 0.1 * h.rim;
  return c;
}

vec3 fxLadder(H h) {
  float n = max(float(uNLev), 1.0);
  float T = clockB() * uSpeed;
  float k = abs(mod(T * 2.0, 2.0 * n) - n);     // bounces from the first groove to the last and back, two grooves a beat
  float gg = exp(-abs(float(h.gi) - k) * 1.3);
  float ss = exp(-abs(float(h.si) - 0.5 - k) * 1.0);
  vec3 c = pal(h.gn) * gg * h.groove * 1.6 + pal(h.sn + 0.5) * ss * h.stripe * 0.45;
  c += vec3(1.0) * h.edge * (0.3 + 0.7 * uKick) + pal(0.0) * h.sep * 0.4;
  return c;
}

vec3 fxVideo(H h) {
  vec3 v = uVidOn > 0.5 ? video(h.p) : pal(h.p.y / S + uTime * 0.05) * 0.4;
  vec3 c = v * (h.stripe + h.rim) * (0.85 + 0.3 * uKick);
  c += pal(h.gn + uBeatN * 0.25) * h.groove * (0.3 + 0.9 * exp(-uBeat * 4.0));
  c += vec3(1.0) * h.edge * 0.8 + pal(0.5) * h.sep * 0.6;
  return c;
}

vec3 fxTunnel(H h) {
  float T = clockB();
  float z = log(max(h.rad, 0.02)) * 2.2 + T * 0.5 * uSpeed;        // endless zoom into the small heart
  float band_ = fract(z);
  vec3 col = pal(floor(z) * 0.25);
  float glow = smoothstep(0.0, 0.15, band_) * (1.0 - smoothstep(0.55, 0.8, band_));
  vec3 c = col * glow * (h.stripe * 0.75 + h.groove * 1.3) * (0.55 + 0.45 * uLevel);
  c += vec3(1.0) * (h.edge + h.seam * 0.5) * (0.3 + 0.7 * uKick);
  return c;
}

vec3 fxEcho(H h) {
  float n = max(float(uNLev), 1.0);
  float k = h.groove > 0.5 ? float(h.gi) + 1.0 : float(h.si);     // 0 = the small inner heart, then ring by ring outward
  float age = uBeat - k / n * 0.85;                                  // each ring answers a little after the one inside it
  float env = age >= 0.0 ? exp(-age * 7.0) : 0.0;
  vec3 col = pal(uBeatN * 0.125 + k / n * 0.3);
  vec3 c = col * env * (h.groove * 1.6 + h.stripe * 0.5 + h.edge);
  c += pal(0.0) * (0.5 + 0.5 * uKick) * step(float(h.si), 0.5) * h.stripe * (h.groove < 0.5 ? 1.0 : 0.0);
  c += vec3(1.0) * h.seam * env * 0.6;
  return c;
}

// ================= live music effects (22-41) =================

vec3 fxVU(H h) {                 // loudness fills the rings from the inner heart outwards, a peak ring floats above
  float k = ringIdx(h) / ringN(), lv = clamp(uLevel * (0.6 + 0.8 * uInt), 0.0, 1.0);
  float peak = exp(-pow((k - min(1.0, uLevelS * 1.05)) * 28.0, 2.0));
  vec3 col = mix(pal(0.0), pal(0.5), k); col = mix(col, vec3(1.0, 0.25, 0.2), clamp((k - 0.8) * 5.0, 0.0, 1.0));
  return col * (step(k, lv) * (h.groove > 0.5 ? 1.0 : 0.65) + peak * 1.2) * (h.stripe + h.groove) + vec3(1.0) * h.edge * kk();
}
vec3 fxKickBurst(H h) {          // every kick fires a bright front from the inner heart to the contour
  float front = 1.0 - kk(), ring = exp(-pow((h.rad - front) / 0.06, 2.0)) * kk();
  float core = smoothstep(0.25, 0.0, h.rad) * (0.3 + 0.7 * kk());
  return mix(pal(0.0), vec3(1.0), 0.4) * ring * (h.groove * 1.8 + h.stripe * 0.6) + pal(0.1) * core * h.stripe + pal(0.6) * 0.05 * h.stripe + vec3(1.0) * h.edge * (0.2 + kk());
}
vec3 fxBassHigh(H h) {           // left half meters the bass, right half the highs
  float k = ringIdx(h) / ringN(), v = h.side < 0.5 ? clamp(uBass * 1.3, 0.0, 1.0) : clamp(uHigh * 1.6, 0.0, 1.0);
  vec3 col = h.side < 0.5 ? pal(0.0) : pal(0.5);
  return col * smoothstep(v + 0.03, v - 0.03, k) * (h.stripe * 0.7 + h.groove * 1.3) + vec3(1.0) * (h.seam + h.edge) * 0.4 * (0.5 + 0.5 * uLevel);
}
vec3 fxSpiral(H h) {             // a two-arm spiral that turns once a bar
  float T = clockB(); vec2 q = h.p - uCenter; float a = atan(q.y, q.x) / TAU;
  float arm = fract(a * 2.0 + h.rad * 1.6 - T * 0.25 * uSpeed), b = smoothstep(0.0, 0.08, arm) * (1.0 - smoothstep(0.08, 0.35, arm));
  return pal(a + T * 0.05) * b * (h.groove * 1.5 + h.stripe * 0.5) * (0.5 + 0.7 * uLevel) + vec3(1.0) * h.edge * exp(-uBeat * 5.0) * 0.5;
}
vec3 fxRadar(H h) {              // a radar sweep, one turn a bar, and a blip on a different ring every beat
  float T = clockB(); vec2 q = h.p - uCenter; float a = fract(atan(q.x, -q.y) / TAU + 1.0);
  float tr = exp(-fract(fract(T * 0.25) - a + 1.0) * 7.0);
  float pick = floor(hash11(uBeatN * 1.7) * ringN()), blip = step(abs(ringIdx(h) - pick), 0.5) * exp(-uBeat * 3.0);
  return pal(0.3) * tr * (h.groove * 1.4 + h.stripe * 0.3) + mix(pal(0.3), vec3(1.0), 0.6) * blip * (h.groove + h.stripe) + pal(0.3) * 0.5 * h.edge;
}
vec3 fxSpecRings(H h) {          // the spectrum from bass (inner heart) to treble (contour), one slice per ring
  float k = ringIdx(h) / ringN(), v = max(specAt(k), 0.06 + 0.12 * uLevel);
  return pal(k * 0.8 + clockB() * 0.02) * v * (h.stripe * 0.8 + h.groove * 1.4) + vec3(1.0) * h.edge * uLevel * 0.5;
}
vec3 fxBreath(H h) {             // slow breathing with the overall loudness
  float lv = uLevelS, w = 0.5 + 0.5 * sin(h.rad * 12.0 - uTime * 1.2 * uSpeed);
  return pal(h.rad * 0.5 + uTime * 0.02) * (0.15 + 0.85 * lv) * mix(0.4, 1.0, w) * (h.stripe * 0.6 + h.groove) + vec3(1.0) * h.edge * 0.4 * lv;
}
float ecg(float bp) { return -32.0 * exp(-pow((bp - 0.06) / 0.012, 2.0)) + 11.0 * exp(-pow((bp - 0.1) / 0.014, 2.0)) - 7.0 * exp(-pow((bp - 0.32) / 0.05, 2.0)) - 3.0 * exp(-pow((bp - 0.9) / 0.04, 2.0)); }
vec3 fxECG(H h) {                // a heart monitor trace drawn across the heart, one heartbeat per music beat
  float T = clockB(), scan = fract(T * 0.25) * S, age = mod(scan - h.p.x, S) / S;
  float bp = fract(T - age * 4.0), y = 125.0 + ecg(bp);
  float line = exp(-pow((h.p.y - y) / 1.4, 2.0)) * (1.0 - age) * 1.4, head = exp(-pow((h.p.x - scan) / 3.0, 2.0)) * exp(-pow((h.p.y - y) / 3.0, 2.0));
  return pal(0.3) * line * h.inside + vec3(1.0) * head * h.inside + pal(0.0) * exp(-uBeat * 8.0) * (h.groove * 0.8 + h.edge);
}
vec3 fxSparks(H h) {             // every onset sparks random rings
  float k = ringIdx(h), r = hash21(vec2(k, floor(uTime * 10.0)));
  float on = step(1.0 - clamp(uHit, 0.0, 1.0) * 0.35 - uHigh * 0.15, r);
  return mix(pal(r), vec3(1.0), 0.5) * on * (h.groove * 1.6 + h.stripe * 0.4) + pal(k / ringN()) * (0.06 + 0.2 * uLevel) * (h.stripe * 0.5 + h.groove);
}
vec3 burst(H h, float n, float age) {
  vec2 c = uCenter + vec2(hash11(n * 3.1) - 0.5, hash11(n * 5.7) - 0.6) * 110.0;
  vec2 q = h.p - c; q.y -= age * age * 25.0;
  float R = age * 85.0, ang = atan(q.y, q.x) / TAU * 26.0;
  float spark = exp(-pow((length(q) - R) / 2.2, 2.0)) * smoothstep(0.35, 0.0, abs(fract(ang) - 0.5) - 0.15);
  return pal(hash11(n)) * spark * (1.0 - age) * (1.0 - age) * 2.0;
}
vec3 fxFireworks(H h) {          // a firework on every beat at a new spot
  vec3 c = burst(h, uBeatN, uBeat) + burst(h, uBeatN - 1.0, min(uBeat + 1.0, 1.0) * 0.999);
  return c * (h.stripe * 0.8 + h.groove * 1.6) + vec3(1.0) * h.edge * exp(-uBeat * 6.0) * 0.4;
}
vec3 fxKaleido(H h) {            // a kaleidoscope mirrored on the seam
  float T = clockB(); vec2 q = vec2(abs(h.p.x - S * 0.5), h.p.y - uCenter.y);
  float a = atan(q.y, q.x) + T * 0.05, l = length(q); a = abs(mod(a, TAU / 6.0) - TAU / 12.0);
  float v = sin(l * 0.08 - uTime * 2.0 * uSpeed) * cos(a * 6.0 + uMid * 4.0) + sin(l * 0.03 + a * 3.0);
  return pal(v * 0.3 + h.rad * 0.4 + uTime * 0.03) * (h.stripe * 0.8 + h.groove * 1.2) * (0.5 + 0.6 * uLevel);
}
vec3 thermal(float t) { return t < 0.25 ? mix(vec3(0.0), vec3(0.1, 0.0, 0.6), t * 4.0) : t < 0.5 ? mix(vec3(0.1, 0.0, 0.6), vec3(0.85, 0.0, 0.3), (t - 0.25) * 4.0) : t < 0.75 ? mix(vec3(0.85, 0.0, 0.3), vec3(1.0, 0.6, 0.0), (t - 0.5) * 4.0) : mix(vec3(1.0, 0.6, 0.0), vec3(1.0, 1.0, 0.9), (t - 0.75) * 4.0); }
vec3 fxThermal(H h) {            // a thermal camera: the music heats the heart from its core
  float t = clamp(uLevelS * 0.8 + (1.0 - h.rad) * 0.5 * (0.3 + uBass) + (noise(h.p * 0.04 + uTime * 0.3) - 0.5) * 0.4 + kk() * 0.2 - 0.1 + h.groove * 0.08, 0.0, 1.0);
  return hueShift(thermal(t), uHue) * (h.stripe + h.groove + h.edge);
}
vec3 fxSeamWaves(H h) {          // waves leave the seam to both sides on every beat
  float dx = abs(h.p.x - S * 0.5); vec3 c = vec3(0.0);
  for (int i = 0; i < 3; i++) { float age = uBeat + float(i); c += pal(fract((uBeatN - float(i)) * 0.25)) * exp(-pow((dx - age * 70.0 * uSpeed) / 4.0, 2.0)) * exp(-age * 0.7); }
  return c * (h.groove * 1.6 + h.stripe * 0.5) + vec3(1.0) * h.seam * exp(-uBeat * 5.0);
}
vec3 fxRingFlow(H h) {           // energy flows along every ring, neighbours in opposite directions, faster when louder
  float k = ringIdx(h), dir = mod(k, 2.0) < 0.5 ? 1.0 : -1.0, T = clockB();
  float f = fract(h.s * 4.0 * dir - T * 0.5 * uSpeed * (0.6 + uLevel) + k * 0.13), b = smoothstep(0.0, 0.5, f) * smoothstep(1.0, 0.5, f);
  return pal(k / ringN() + T * 0.02) * b * (h.groove * 1.5 + h.stripe * 0.6);
}
vec3 fxDigitalRain(H h) {        // falling code, columns 4 cm wide
  float col = floor(h.p.x / 4.0), sp = 30.0 + 40.0 * hash11(col);
  float head = fract(uTime * sp * uSpeed / 280.0 + hash11(col + 9.0)) * 280.0 - 20.0, dist = head - h.p.y;
  float trail = dist > 0.0 ? exp(-dist / 30.0) : 0.0, glyph = step(0.45, hash21(vec2(col, floor((h.p.y + floor(uTime * 12.0) * 4.0) / 4.0))));
  float headGlow = exp(-dist * dist / 6.0);
  return (pal(0.3) * trail * glyph + vec3(0.9, 1.0, 0.9) * headGlow) * (h.stripe * 0.7 + h.groove * 1.3) * (0.6 + 0.6 * uLevel);
}
vec3 fxLightning(H h) {          // lightning from the cleft to the tip on the hits
  float seed = floor(uTime * 8.0) + uBeatN * 13.0, flash = max(clamp(uHit, 0.0, 1.0), exp(-uBeat * 10.0));
  float xb = S * 0.5 + (fbm(vec2(h.p.y * 0.03, seed)) - 0.5) * 140.0, xb2 = xb + (fbm(vec2(h.p.y * 0.06, seed + 3.0)) - 0.5) * 90.0 * step(90.0, h.p.y);
  float d1 = abs(h.p.x - xb), d2 = abs(h.p.x - xb2);
  float bolt = exp(-d1 * d1 / 1.5) + 0.6 * exp(-d2 * d2 / 1.0), glow = exp(-min(d1, d2) / 18.0);
  vec3 c = mix(vec3(0.7, 0.8, 1.0), pal(0.6), 0.3) * (bolt * h.inside + glow * (h.groove * 0.9 + h.stripe * 0.15)) * flash * 1.5;
  return c + pal(0.6) * 0.03 * h.stripe;
}
vec3 fxTwinPulse(H h) {          // the two lobes beat in turn, their rings crossing over the seam
  float side = mod(uBeatN, 2.0); vec2 c = side < 0.5 ? vec2(62.0, 80.0) : vec2(178.0, 80.0);
  float dd = length(h.p - c), ring = exp(-pow((dd - uBeat * 130.0 * uSpeed) / 5.0, 2.0)) * exp(-uBeat * 1.5);
  vec3 col = side < 0.5 ? pal(0.0) : pal(0.5);
  return col * ring * (h.groove * 1.7 + h.stripe * 0.5) + col * 0.12 * exp(-dd / 40.0) * h.stripe + vec3(1.0) * h.edge * 0.3;
}
vec3 fxRunStrobe(H h) {          // one ring at a time flashes white, racing outwards on 32nd notes
  float n = ringN(), idx = mod(floor(clockB() * 8.0 * uSpeed), n), on = step(abs(ringIdx(h) - idx), 0.5);
  return vec3(1.0) * on * (h.stripe + h.groove) * (0.5 + 0.5 * uLevel) + pal(idx / n) * 0.08 * (h.stripe + h.groove);
}
vec3 fxGold(H h) {               // brushed gold with glitter that sparkles on the highs
  vec2 id = floor(h.p / 1.2); float r = hash21(id);
  float sp = pow(max(0.0, sin(uTime * (3.0 + r * 6.0) * uSpeed + r * 40.0)), 20.0) * step(0.6, r) * (0.5 + uHigh * 1.5);
  vec3 gold = hueShift(mix(vec3(0.45, 0.3, 0.05), vec3(1.0, 0.85, 0.4), 0.5 + 0.5 * sin(h.rad * 20.0 - uTime)), uHue);
  return gold * (h.stripe * 0.5 + h.groove * 0.9) * (0.4 + 0.6 * uLevel) + vec3(1.0, 0.95, 0.8) * sp * (h.stripe + h.groove) + gold * h.edge;
}
vec3 fxBarWipe(H h) {            // each new bar wipes a new colour up from the tip during its first beat
  float T = clockB(), bar = floor(T / 4.0), prog = clamp(T - bar * 4.0, 0.0, 1.0), front = S + 10.0 - prog * (S + 20.0);
  vec3 c = mix(pal((bar - 1.0) * 0.27), pal(bar * 0.27), step(front, h.p.y));
  return c * (h.stripe * 0.6 + h.groove * 1.2) + vec3(1.0) * exp(-pow((h.p.y - front) / 2.0, 2.0)) * h.inside * (1.0 - prog) + c * h.edge * 0.5;
}

// ================= 3D effects (42-51) =================

vec3 fxTerrace(H h) {            // stepped relief like the real piece: every heart a raised step, light turning every two bars
  float k = ringIdx(h) / ringN(), T = clockB();
  vec3 n = nCut(h, 2.6), L = orbitL(T * TAU / 8.0 * uSpeed, 0.85);
  vec3 base = pal(k * 0.6 + T * 0.01) * (0.55 + 0.45 * (1.0 - k));
  vec3 c = base * (0.18 + 0.82 * dif(n, L)) * ao(h) + vec3(1.0) * spc(n, L, 30.0) * 0.5 * h.groove;
  return c * (0.75 + 0.35 * uLevel) + vec3(1.0) * kk() * 0.25 * h.stripe * (1.0 - k) + vec3(1.0) * h.edge * 0.5;
}
vec3 fxPillow(H h) {             // the heart as a soft dome with the grooves engraved in it
  vec3 n = nMix(nDome(h, 60.0), nCut(h, 1.8)), L = normalize(vec3(-0.4 + 0.35 * sin(uTime * 0.5 * uSpeed), -0.6, 0.9));
  vec3 base = pal(h.rad * 0.4 + uTime * 0.02);
  return base * (0.12 + 0.88 * dif(n, L)) * ao(h) + vec3(1.0) * spc(n, L, 40.0) * (0.4 + 0.6 * kk()) + pal(0.5) * (1.0 - n.z) * 0.5 * uBass;
}
vec3 fxChrome(H h) {             // liquid chrome reflecting moving studio lights, rippling with the bass
  vec3 n = nMix(nDome(h, 70.0), nCut(h, 2.2));
  vec2 out_ = -h.gD / (length(h.gD) + 1e-4);
  n = normalize(vec3(n.xy + out_ * cos(h.rad * 40.0 - uTime * 5.0) * uBass * 0.45, n.z));
  return envMap(reflect(vec3(0.0, 0.0, -1.0), n)) * (0.6 + 0.6 * uLevel) * ao(h) + vec3(1.0) * kk() * 0.3 * spc(n, vec3(0.0, 0.0, 1.0), 60.0);
}
vec3 fxGlass(H h) {              // a glass heart: the video (or a moving pattern) bends through the dome and the cuts
  vec3 n = nMix(nDome(h, 45.0), nCut(h, 3.0));
  vec2 q = h.p + n.xy * 35.0;
  vec3 bg = uVidOn > 0.5 ? video(q) : pal(sin(q.x * 0.05 + uTime) * 0.3 + cos(q.y * 0.04 - uTime * 0.7) * 0.3 + 0.5) * 0.7;
  float fres = pow(1.0 - n.z, 1.5) * 2.0;
  vec3 L = normalize(vec3(-0.5, -0.7, 0.8));
  return bg * 0.8 * (0.7 + 0.5 * uLevel) + vec3(1.0) * fres * 0.6 + vec3(1.0) * spc(n, L, 60.0) * (0.6 + kk()) + vec3(0.8, 0.9, 1.0) * h.groove * 0.15;
}
vec3 fxTunnel3D(H h) {           // a deep tunnel of hearts behind the surface; its rings meet the real rings as they pass
  float z = 1.0 / max(h.rad, 0.02), T = clockB();
  float trv = z * 0.9 - T * 0.5 * uSpeed, b = fract(trv);
  float ringL = smoothstep(0.0, 0.08, b) * smoothstep(0.5, 0.12, b), fog = exp(-(z - 1.0) * 0.22);
  float st = 0.5 + 0.5 * sin(h.uc * TAU * 8.0 + z * 0.6 - uTime);
  vec3 c = pal(floor(trv) * 0.17) * (0.25 + 0.75 * ringL) * (0.6 + 0.4 * st) * fog * (0.7 + 0.5 * uLevel);
  return c * (h.stripe + h.groove * (1.0 + ringL)) + vec3(1.0) * kk() * 0.3 * fog * h.stripe + vec3(1.0) * h.edge * 0.4;
}
float sdPuffy(vec3 q) {           // an inflated 3D heart: the 2D heart outline, thickest in the middle
  float d2 = sdHeart(vec2(q.x, q.y + 0.55));
  float th = 0.32 * sqrt(max(-d2, 0.0) * 2.2);
  return max(d2, abs(q.z) - th) * 0.6;
}
vec3 fxRotHeart(H h) {           // a 3D heart turning inside the cut, one turn every two bars, lit and shining
  float T = clockB(), a = T * TAU / 8.0 * uSpeed, tl = 0.25 * sin(uTime * 0.7);
  vec2 o = vec2(h.p.x - S * 0.5, -(h.p.y - 118.0)) / 100.0;
  vec3 ro = vec3(o * 0.6, 2.0), rd = vec3(0.0, 0.0, -1.0);
  mat3 Ry = mat3(cos(a), 0.0, -sin(a), 0.0, 1.0, 0.0, sin(a), 0.0, cos(a)), Rx = mat3(1.0, 0.0, 0.0, 0.0, cos(tl), sin(tl), 0.0, -sin(tl), cos(tl));
  mat3 R = Rx * Ry; ro = R * ro; rd = R * rd;
  float t = 0.0, hit = 0.0;
  for (int i = 0; i < 48; i++) { float dd = sdPuffy(ro + rd * t); if (dd < 0.002) { hit = 1.0; break; } t += dd; if (t > 4.0) break; }
  vec3 c = pal(0.6) * 0.06 * (h.stripe + h.groove);
  if (hit > 0.5) {
    vec3 pp = ro + rd * t; vec2 ee = vec2(0.003, 0.0);
    vec3 n = normalize(vec3(sdPuffy(pp + ee.xyy) - sdPuffy(pp - ee.xyy), sdPuffy(pp + ee.yxy) - sdPuffy(pp - ee.yxy), sdPuffy(pp + ee.yyx) - sdPuffy(pp - ee.yyx)));
    n = transpose(R) * n;
    vec3 L = normalize(vec3(-0.5, 0.6, 0.8));
    vec3 base = pal(0.0 + pp.y * 0.2);
    c = base * (0.15 + 0.85 * max(dot(n, L), 0.0)) + vec3(1.0) * pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 30.0) * (0.6 + kk());
    c *= (h.stripe + h.groove * 1.3) * (0.75 + 0.4 * uLevel);
  }
  return c + vec3(1.0) * h.edge * 0.5;
}
vec3 fxSpecRelief(H h) {         // every heart a step whose height is its slice of the spectrum; the walls catch the light
  float k = ringIdx(h) / ringN(), v = max(specAt(k), 0.08 + 0.12 * uLevel);
  float vin = max(specAt(max(k - 1.0 / ringN(), 0.0)), 0.08), dv = vin - v;
  vec3 n = nCut(h, 2.0 + 6.0 * abs(dv)), L = normalize(vec3(-0.3, -0.8, 0.6));
  vec3 base = pal(k * 0.8) * (0.25 + 0.75 * v);
  return base * (0.2 + 0.8 * dif(n, L)) * ao(h) * (h.stripe + h.groove * 1.4) + vec3(1.0) * spc(n, L, 25.0) * v * h.groove + vec3(1.0) * h.edge * uLevel * 0.5;
}
vec3 fxSpot(H h) {               // two coloured lights circling in front of the heart, the second flashing on the beat
  float T = clockB(), a = T * TAU / 8.0 * uSpeed, k = ringIdx(h) / ringN();
  vec3 P = vec3(h.p, (1.0 - k) * 25.0), n = nCut(h, 3.0), c = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float ai = a + float(i) * 3.14159;
    vec3 Lp = vec3(S * 0.5 + 170.0 * cos(ai), 120.0 + 170.0 * sin(ai), 110.0), Lv = Lp - P;
    float att = 1.0 / (1.0 + dot(Lv, Lv) / 40000.0), d0 = dif(n, normalize(Lv));
    vec3 col = i == 0 ? pal(0.0) : pal(0.5) * (0.3 + 1.2 * exp(-uBeat * 4.0));
    c += col * d0 * att * 1.6 + vec3(1.0) * spc(n, normalize(Lv), 40.0) * att * h.groove;
  }
  return c * ao(h) * (h.stripe + h.groove) * (0.7 + 0.5 * uLevel) + vec3(1.0) * h.edge * 0.3;
}
vec3 fxShock(H h) {              // the dome hit by a shock wave from the inner heart on every beat
  float front = uBeat * 1.3 * uSpeed, env = exp(-pow((h.rad - front) / 0.12, 2.0)) * (1.0 - uBeat);
  vec2 out_ = -h.gD / (length(h.gD) + 1e-4);
  vec3 n = nMix(nDome(h, 50.0), nCut(h, 1.8));
  n = normalize(vec3(n.xy + out_ * cos((h.rad - front) * 30.0) * env * 1.4, n.z));
  vec3 L = normalize(vec3(-0.5, -0.6, 0.8)), base = pal(h.rad * 0.3 + uBeatN * 0.1);
  return base * (0.15 + 0.85 * dif(n, L)) * ao(h) + vec3(1.0) * spc(n, L, 35.0) * (0.3 + env) + vec3(1.0) * h.edge * env;
}
vec3 fxHolo(H h) {               // a hologram: rainbow edges, scan lines and glitches on the hits
  vec3 n = nMix(nDome(h, 55.0), nCut(h, 2.0));
  float fres = pow(1.0 - n.z, 1.2);
  vec3 ir = hueShift(hsv(fres * 1.5 + h.rad * 0.5 + uTime * 0.1, 0.7, 1.0), uHue);
  float scan = 0.75 + 0.25 * sin(h.p.y * 1.5 - uTime * 8.0), sweep = step(0.975, fract(h.p.y / 40.0 - uTime * 0.4 * uSpeed));
  float glitch = 1.0 - clamp(uHit, 0.0, 1.0) * 0.4 * step(0.5, hash11(floor(uTime * 20.0) + floor(h.p.y / 6.0)));
  return (ir * (0.15 + fres * 1.6) * scan + vec3(0.4, 1.0, 1.0) * h.groove * 0.7 + vec3(1.0) * sweep * 0.5) * glitch * (0.7 + 0.5 * uLevel) * (h.stripe + h.groove + h.edge);
}

// ================= breathing sound sculpture (58-63) =================

vec3 fxBreathe(H h) {            // every piece breathes light out from its core, one after another; the kick beats inside it
  float k = pK(h), br = breathV(-k * 0.35), amp = 0.35 + 0.65 * uBassS, reach = min(br * (0.55 + 0.45 * amp) + uBuild * 0.3, 1.2);
  float fill = smoothstep(1.0 - reach - 0.22, 1.0 - reach + 0.22, h.dn);
  vec3 col = pal(k * 0.3 + uFlow), c = col * (0.04 + 0.96 * fill) * (0.3 + 0.7 * amp) * (h.stripe + h.groove * 1.25);
  c += mix(col, vec3(1.0), 0.6) * shimmer(h) * (h.groove + h.edge);
  float ring = exp(-pow((h.dn - kk()) / 0.08, 2.0)) * kk();
  c += col * uDrop * 0.8 * (h.stripe + h.groove);
  return c + pal(k * 0.3 + uFlow + 0.5) * ring * 0.8 * (h.stripe * 0.5 + h.groove) + col * h.edge * (0.12 + 0.45 * br);
}
vec3 fxChoir(H h) {              // every piece sings its own band of the spectrum, a lit dome whose rings fill from the core
  float b = pB(h), v = specAt(b);
  vec3 n = nMix(nDome(h, 25.0 + 55.0 * v), nCut(h, 2.0)), L = normalize(vec3(-0.4, -0.7, 0.8));
  vec3 col = pal(b * 0.8 + uFlow * 0.5);
  float fill = smoothstep(1.0 - v * 1.15 - 0.04, 1.0 - v * 1.15 + 0.04, h.dn);
  vec3 c = col * (0.12 + 0.88 * dif(n, L)) * (0.12 + 0.88 * v) * ao(h) * (h.stripe * (0.5 + 0.5 * fill) + h.groove * (0.4 + 1.0 * fill));
  return c + vec3(1.0) * spc(n, L, 40.0) * (0.15 + uHighS) * v + col * h.edge * (0.15 + 0.55 * breathV(b * 0.5));
}
vec3 fxWave(H h) {               // a murmuration: a wave rolls through the pieces every bar, a softer one comes back with the mids
  float k = pK(h), T = clockB();
  float f1 = fract(T * (0.25 + 0.25 * step(0.5, uBuild)) * uSpeed) * 1.3 - 0.15, w1 = exp(-pow((k - f1) / 0.1, 2.0)) + 0.35 * exp(-pow((k - f1 + 0.18) / 0.16, 2.0));
  float f2 = 1.0 - fract(T * 0.125 * uSpeed), w2 = exp(-pow((k - f2) / 0.18, 2.0)) * uMidS;
  float env = 0.35 + 0.65 * uLevelS + 0.6 * kk();
  vec3 c = pal(k * 0.4 + uFlow) * w1 * env * (h.stripe * 0.8 + h.groove * 1.4) + pal(k * 0.4 + uFlow + 0.5) * w2 * 0.7 * (h.stripe * 0.5 + h.groove);
  c += pal(0.6 + uFlow) * 0.05 * h.stripe * (1.0 + breathV(k * 0.3)) + mix(pal(k), vec3(1.0), 0.5) * shimmer(h) * h.groove;
  return c + vec3(1.0) * h.edge * (w1 * 0.6 + 0.05);
}
vec3 fxCards(H h) {              // the pieces turn over like cards, one after another every two bars; the bass swings them further
  float k = pK(h), T = clockB() / 8.0 * uSpeed, tt = clamp(fract(T) * 1.7 - k * 0.7, 0.0, 1.0);
  float a = 3.14159265 * smoothstep(0.0, 1.0, tt) + sin(uTime * 1.3 + k * 6.0) * 0.25 * uBassS, ca = cos(a);
  float dx = h.p.x - h.pc.x, rr = h.dm * 2.2;
  float face = 1.0 - smoothstep(rr * abs(ca) - 1.0, rr * abs(ca) + 1.0, abs(dx)) * (1.0 - h.edge);   // narrower when edge-on
  vec3 n = normalize(vec3(sin(a), 0.0, ca) * sign(ca + 1e-4) + vec3(h.tilt, 0.0)), L = normalize(vec3(-0.5, -0.4, 0.8));
  vec3 col = ca > 0.0 ? pal(k * 0.3 + floor(T) * 0.25 + uFlow) : pal(k * 0.3 + floor(T) * 0.25 + uFlow + 0.5);
  float shade = (0.2 + 0.8 * dif(n, L)) * (1.0 + 0.004 * dx * sin(a));
  return col * shade * face * (0.5 + 0.5 * uLevelS + 0.3 * kk()) * (h.stripe + h.groove * 1.3) + vec3(1.0) * spc(n, L, 25.0) * face * (0.2 + uHighS) * h.stripe;
}
vec3 fxBlocks(H h) {             // every piece a raised block with a bevelled edge, its height its band; a slow light circles round
  float v = max(specAt(pB(h)), uDrop), bw = 2.0 + 4.0 * v, bev = 1.0 - smoothstep(0.0, bw, h.d);
  vec2 outd = -h.gD / (length(h.gD) + 1e-4);
  vec3 n = normalize(vec3(h.tilt + outd * bev * (1.2 + 2.0 * v), 1.0));
  float a = uTime * 0.25 * uSpeed + uFlow * 2.0;
  vec3 L = normalize(vec3(cos(a), sin(a), 0.75 - 0.3 * uBassS)), col = pal(pB(h) * 0.7 + uFlow * 0.5);
  vec3 c = col * (0.1 + 0.9 * dif(n, L)) * (0.3 + 0.6 * v + 0.3 * uBassS) * ao(h) + vec3(1.0) * spc(n, L, 30.0) * bev * (0.3 + 1.5 * uHighS);
  return c * (h.stripe + h.groove) + col * h.edge * (0.2 + 0.3 * kk());
}
vec3 fxFloat(H h) {              // one flowing picture seen through all the pieces, each at its own depth: they drift apart and back
  float z = pSeed(h) * 0.8 + pK(h) * 0.2;
  vec2 sway = vec2(sin(uTime * 0.23 * uSpeed), cos(uTime * 0.17 * uSpeed)) * (14.0 + 26.0 * uMidS) + vec2(0.0, (breathV(0.0) - 0.5) * 10.0);
  vec2 q = h.p + sway * z + (h.p - h.pc) * kk() * 0.15 * z;
  float n = fbm(q * 0.025 + vec2(uTime * 0.03 * uSpeed, 0.0));
  vec3 col = pal(n * 0.8 + z * 0.3 + uFlow * 0.4);
  vec3 c = col * (0.12 + 0.88 * smoothstep(0.3, 0.8, n)) * (1.0 - z * 0.55) * (0.45 + 0.5 * uLevelS + 0.35 * uBassS);
  c += vec3(1.0) * pow(noise(q * 0.4 + uTime), 8.0) * uHighS * 2.0 * (h.groove + h.edge);
  return c * (h.stripe + h.groove * 1.2) + col * h.edge * 0.25;
}

// ================= trance (52-57) =================
vec3 fxTrLaser(H h) {            // a fan of beams from the heart's tip, sweeping over two bars; the cut grooves catch them
  vec2 q = h.p - vec2(S * 0.5, S * 0.97);
  float a = atan(q.x, -q.y), sw = sin(clockB() * TAU / 8.0) * 0.45, n = 7.0;
  float x = (a - sw) * n / 1.7, d = abs(fract(x) - 0.5) * 1.7 / n, w = 0.01 + 0.02 * kk();
  float beam = exp(-pow(d / w, 2.0)) * (1.0 - smoothstep(0.8, 0.95, abs(a - sw)));
  float on = mix(1.0, gate16(), clamp(uBuild, 0.0, 1.0));
  vec3 col = pal(floor(x) / n + floor(clockB() / 4.0) * 0.125);
  return col * beam * on * (h.groove * 1.7 + h.stripe * 0.3 + h.edge) * (0.55 + 0.9 * kk()) + vec3(1.0) * h.edge * clamp(uDrop, 0.0, 1.0);
}
vec3 fxTrPump(H h) {             // the whole heart ducks on every kick and swells back before the next, like a sidechained pad
  float k = ringIdx(h) / ringN(), p = clamp(uPump, 0.0, 1.0), sw = p * p * (3.0 - 2.0 * p);
  float wave = 0.5 + 0.5 * sin((k - clockB() * 0.5) * TAU * 2.0);
  return pal(k * 0.5 + clockB() * 0.03) * (0.12 + 0.88 * sw) * (h.stripe * (0.55 + 0.45 * wave) + h.groove * 1.25) + vec3(1.0) * h.edge * kk();
}
vec3 fxTrBuild(H h) {            // build: rings close in from the contour, faster as the build rises; drop: a white shock from the core
  float k = ringIdx(h) / ringN(), b = clamp(uBuild, 0.0, 1.0), rate = exp2(floor(b * 4.0));
  float front = 1.0 - fract(clockB() * rate / 4.0), ring = exp(-pow((k - front) * ringN() * 0.45, 2.0));
  float spark = step(1.0 - 0.18 * b, hash21(floor(h.p * 0.5) + floor(uTime * 20.0)));
  vec3 c = pal(0.6 + b * 0.4) * ring * (0.25 + 0.95 * b) * (h.groove * 1.5 + h.stripe * 0.5) + vec3(1.0) * spark * b * h.stripe * 0.6;
  float d = clamp(uDrop, 0.0, 1.0), shock = exp(-pow((k - (1.0 - d)) * 6.0, 2.0)) * d;
  return c + vec3(1.0) * shock * (h.groove * 2.0 + h.stripe) + vec3(1.0) * pow(d, 6.0) * 0.8 + pal(0.0) * 0.04 * h.stripe;
}
vec3 fxTrGate(H h) {             // the trance gate chops the heart in 16ths; neighbouring rings alternate, the halves are offset
  float st = clockB() * 4.0; int idx = int(mod(floor(st), 16.0));
  float g = gateAt(idx + (h.side > 0.5 ? 2 : 0)) * (1.0 - smoothstep(0.5, 0.75, fract(st)));
  float alt = mod(ringIdx(h) + floor(st), 2.0);
  return pal(float(idx) / 16.0) * g * (h.stripe * (0.35 + 0.65 * alt) + h.groove * 1.4) + vec3(1.0) * h.edge * 0.3 * g;
}
vec3 fxTrArp(H h) {              // one ring per 16th note, climbing out and back like an arpeggiator, with a fading tail
  float n = ringN(), st = clockB() * 4.0, per = max(2.0 * (n - 1.0), 1.0), pos = mod(floor(st), per);
  float r = pos <= n - 1.0 ? pos : per - pos, d = abs(ringIdx(h) - r);
  float tail = exp(-d * 0.8) * (1.0 - fract(st) * 0.5);
  return pal(r / n + floor(st / 16.0) * 0.25) * tail * (h.groove * 1.5 + h.stripe * 0.6) + vec3(1.0) * h.seam * 0.4 * kk();
}
vec3 fxTrHyper(H h) {            // hyperspace: rings rush out of the core, faster with the build; streaks race along the grooves
  float k = ringIdx(h) / ringN(), sp = 0.5 + 2.0 * clamp(uBuild, 0.0, 1.0) + uLevel;
  float z = fract(k * 3.0 - uTime * sp * uSpeed * 0.5), rv = smoothstep(0.0, 0.1, z) * (1.0 - smoothstep(0.1, 0.5, z));
  float streak = pow(noise(vec2(h.s * 60.0, uTime * sp * 4.0 - k * 20.0)), 3.0) * 2.0;
  return mix(pal(0.5), pal(0.0), k) * (rv * (h.groove * 1.4 + h.stripe * 0.6) + streak * h.groove * (0.5 + kk())) + vec3(1.0) * h.edge * kk() * 0.8;
}
`;

// The fragment shader for a set of banks (0 = the built-in effects, i = FX_BANKS[i - 1]): only their effects are in it.
function fsSource(banks) {
  const cases = [], code = [];
  for (const b of banks) {
    if (b === 0) { code.push(CORE_GLSL); CORE_FN.forEach((f, id) => cases.push(`    case ${id}: return ${f}(h);`)); }
    else { const B = FX_BANKS[b - 1]; code.push(B.glsl); B.fx.forEach(([id, , , , f]) => cases.push(`    case ${id}: return ${f}(h);`)); }
  }
  if (!banks.includes(0)) cases.unshift("    case 0: return fxCalib(h);");
  return FS_HEAD + FX_COMMON + code.join("") + `
vec3 fx(int id, H h) {
  switch (id) {
${cases.join("\n")}
  }
  return vec3(0.0);
}
` + FS_TAIL;
}

const FS_TAIL = `
vec3 layer(int id, H h) {
  vec3 c = fx(id, h);
  if (id == 0) return c;   // calibration also draws the box and grid around the heart
  if (uVidMix > 0.0 && uVidOn > 0.5 && id != 18) {
    vec3 v = video(h.p) * (h.stripe + h.rim) + c * h.lines;
    c = mix(c, v, uVidMix);
  }
  if (id != 21 && uEngMix > 0.0) c += fxEngine(h) * uEngMix * (1.0 - min(c, vec3(1.0)));   // the engine over any effect
  return c * h.inside;     // nothing outside the contour: no spill on the wall behind
}

// ---------------- channels ----------------
// Every part is its own channel, per half: row 0 = tint colour + tint amount, row 1 = gain/2, effect+1 (0 = the show's), mute, solo.
// Ids: 0-1 edge L/R, 2 seam, 3-4 rim, 5-6 separation, 8 + 2k + side = groove k, 136 + 2k + side = band k (band 0 = inner heart),
// 272 + p = part p of an element (over all of the part's own channels).
vec4 chA(int id) { return texelFetch(uCh, ivec2(id, 0), 0); }
vec4 chB(int id) { return texelFetch(uCh, ivec2(id, 1), 0); }
vec3 chApply(int id, vec3 c) {
  vec4 a = chA(id), b = chB(id);
  if (uAnySolo == 1) return vec3(b.a > 0.5 ? 1.0 : 0.0);             // identify: soloed channels white, the rest dark
  c = mix(c, a.rgb * max(c.r, max(c.g, c.b)), a.a);                  // keep the effect's brightness, take the channel's colour
  return c * b.r * 2.0 * (1.0 - step(0.5, b.b));
}

float layerMask(H h) {
  if (uMask == 1) return h.groove;
  if (uMask == 2) return h.stripe;
  if (uMask == 3) return h.edge;
  if (uMask == 4) return 1.0 - h.side;
  if (uMask == 5) return h.side;
  if (uMask == 6) return 1.0 - smoothstep(0.45, 0.55, h.rad);
  if (uMask == 7) return smoothstep(0.45, 0.55, h.rad);
  if (uMask == 8) return h.seam;
  // Parts of an element (rings stand in for them on the heart).
  if (uMask == 9 || uMask == 10) { int k = uParts > 1 ? h.part : int(ringIdx(h)); return float((k % 2 == 0) == (uMask == 9)); }
  if (uMask == 11) return 1.0 - step(0.5, pK(h));
  if (uMask == 12) return step(0.5, pK(h));
  return 1.0;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  H h = heart(px);
  int dom = 5; float wd = chW(h, 5);
  for (int i = 0; i < 5; i++) { float w = chW(h, i); if (w > wd) { wd = w; dom = i; } }
  bool calib = uFxA == 0 || (uFxB == 0 && uMix > 0.001);            // the test grid always shows the whole heart, untouched
  int own = calib || uPass > 0 ? -1 : int(chB(chId(h, dom)).g * 255.0 + 0.5) - 1;  // this channel runs its own effect
  int pch = 272 + h.part;                                             // the part's own channel (elements of separate parts)
  if (!calib && uPass == 0 && own < 0 && uParts > 1) own = int(chB(pch).g * 255.0 + 0.5) - 1;
  vec3 c = layer(own >= 0 ? own : uFxA, h);
  if (uMix > 0.001 && own < 0) c = mix(c, layer(uFxB, h), uMix);
  float norm = 0.0; vec3 acc = vec3(0.0);
  if (!calib || uAnySolo == 1) for (int i = 0; i < 6; i++) { float w = chW(h, i); if (w > 0.001) { acc += w * chApply(chId(h, i), c); norm += w; } }
  if (norm > 0.001) c = acc / norm * h.inside + c * (1.0 - h.inside);
  if (uParts > 1 && (!calib || uAnySolo == 1)) {
    vec4 pa = chA(pch), pb = chB(pch);
    if (uAnySolo == 1) c = max(c, vec3(pb.a > 0.5 ? 1.0 : 0.0) * h.inside);
    else c = mix(c, pa.rgb * max(c.r, max(c.g, c.b)), pa.a) * pb.r * 2.0 * (1.0 - step(0.5, pb.b)) * h.inside + c * (1.0 - h.inside);
  }
  if (uPass == 0) c += vec3(1.0, 0.95, 0.97) * h.edge * uOutline;
  c = clamp(c * uMaster, 0.0, 1.0);
  if (uPass == 0) { o = vec4(c, 1.0); return; }
  // A layer: its mask keeps it inside chosen parts of the cut, and opacity goes out as the blend wants it.
  float a = layerMask(h) * uLayOp;
  if (uLayMode == 2) o = vec4(mix(vec3(1.0), c, a), 1.0);        // multiply: outside the mask the layer is white
  else if (uLayMode == 1) o = vec4(c * a, 1.0);                   // screen, max: premultiplied
  else o = vec4(c, a);                                            // over, add, subtract: straight alpha
}`;

export const CH_W = 336;
const PATTERN_ID = { parallel: 0, chevron: 1, concentric: 2, radial: 3, scaled: 4 };
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

// 3x3 homography taking the 4 points src to dst (each [[x,y] x4]), row-major.
export function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}
export const applyH = (H, x, y) => { const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; };
export const BOX = [[0, 0], [SIZE, 0], [SIZE, SIZE], [0, SIZE]];
const HALF = SIZE / 2, BOX_L = [[0, 0], [HALF, 0], [HALF, SIZE], [0, SIZE]], BOX_R = [[HALF, 0], [SIZE, 0], [SIZE, SIZE], [HALF, SIZE]];
// Calibration points, in output pixels: top-left, top-centre, top-right, bottom-right, bottom-centre, bottom-left of the
// 240 x 240 box. The centre pair sits on the seam; the left half is warped by TL TC BC BL and the right by TC TR BR BC.
export const halves = P => ({ L: [P[0], P[1], P[4], P[5]], R: [P[1], P[2], P[3], P[4]] });
// Six points that make one flat warp from four corners (no fold): the centre pair follows the plane.
export function flatPoints(c4) {
  const H = homography(BOX, c4);
  return [c4[0], applyH(H, HALF, 0), c4[1], c4[2], applyH(H, HALF, SIZE), c4[3]];
}
export function defaultPoints(w, h) {
  const s = Math.min(w, h) * 0.9, x0 = (w - s) / 2, y0 = (h - s) / 2;
  return [[x0, y0], [x0 + s / 2, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0 + s / 2, y0 + s], [x0, y0 + s]];
}
// Output pixel -> heart cm, through the half that owns it (null outside both).
export function toHeart(P, x, y) {
  const { L, R } = halves(P);
  const l = applyH(homography(L, BOX_L), x, y); if (l[0] <= HALF) return l;
  const r = applyH(homography(R, BOX_R), x, y); return r[0] >= HALF ? r : null;
}
export function toOutput(P, x, y) { const { L, R } = halves(P); return x <= HALF ? applyH(homography(BOX_L, L), x, y) : applyH(homography(BOX_R, R), x, y); }

export class HeartGL {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = this.gl = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2 לא זמין בדפדפן הזה");
    this.linearFloat = !!gl.getExtension("OES_texture_float_linear");
    // Programs by set of banks ("0", "3", "0,3"...). The built-in bank is built now, so a broken GPU still fails here as before;
    // the others start compiling in the background where the browser can (KHR_parallel_shader_compile), else on first use.
    this.parallel = !!gl.getExtension("KHR_parallel_shader_compile");
    this.vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(this.vs, VS); gl.compileShader(this.vs);
    this.progs = new Map(); this.bad = new Set(); this.chBanks = [];
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.use("0");
    if (this.parallel) FX_BANKS.forEach((_, i) => this.build(String(i + 1)));
    this.field = gl.createTexture(); this.vid = gl.createTexture(); this.ch = gl.createTexture();
    this.partMap = gl.createTexture(); this.partD = gl.createTexture(); this.sm = {}; this.tPrev = null;
    this.chData = new Uint8Array(CH_W * 3 * 4); this.chDirty = true; this.anySolo = 0;
    for (let i = 0; i < CH_W; i++) this.chData[(CH_W + i) * 4] = 128;    // gain 1
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.vid);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR);
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.ch);
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
    for (const t of [this.partMap, this.partD]) {
      gl.activeTexture(t === this.partMap ? gl.TEXTURE3 : gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, t);
      for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
      for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
    }
    this.videoEl = null;
  }

  build(key) {
    const gl = this.gl, p = gl.createProgram(), fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSource(key.split(",").map(Number))); gl.compileShader(fs);
    gl.attachShader(p, this.vs); gl.attachShader(p, fs); gl.bindAttribLocation(p, 0, "a"); gl.linkProgram(p);
    const pr = { p, fs, loc: null }; this.progs.set(key, pr); return pr;
  }
  // Make the program for a set of banks current (building it if needed) and return its uniform locations.
  use(key) {
    const gl = this.gl, pr = this.progs.get(key) || this.build(key);
    if (!pr.loc) {
      if (!gl.getProgramParameter(pr.p, gl.LINK_STATUS)) {
        const msg = gl.getShaderInfoLog(pr.fs) || gl.getShaderInfoLog(this.vs) || gl.getProgramInfoLog(pr.p);
        this.progs.delete(key); throw new Error(msg);
      }
      gl.useProgram(pr.p); pr.loc = {};
      const n = gl.getProgramParameter(pr.p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(pr.p, i), name = u.name.replace(/\[0\]$/, ""); pr.loc[name] = gl.getUniformLocation(pr.p, u.name); }
      gl.uniform1i(pr.loc.uField, 0); gl.uniform1i(pr.loc.uVid, 1); gl.uniform1i(pr.loc.uCh, 2);
      gl.uniform1i(pr.loc.uPartMap, 3); gl.uniform1i(pr.loc.uPartD, 4);
    }
    gl.useProgram(pr.p); this.loc = pr.loc; return pr.loc;
  }
  bankOf(id) { return EFFECTS[id]?.bank ?? 0; }
  keyFor(ids) { return [...new Set(ids.map(id => this.bankOf(id)))].sort((a, b) => a - b).join(","); }

  // Upload the distance field of a model built by heart-geo.js; the groove settings go in as uniforms each frame.
  setModel(model) {
    const gl = this.gl, { N, d, u } = model.field, data = new Float32Array(N * N * 4);
    let dmax = 0;
    for (let k = 0; k < N * N; k++) {
      // Rings: "where along the contour" follows the ray from the ring centre, so every ring shares the same positions.
      const uu = model.field.ua && model.cfg.pattern === "scaled" ? model.field.ua[k] : u[k];
      data[k * 4] = d[k]; data[k * 4 + 1] = Math.cos(uu * 2 * Math.PI); data[k * 4 + 2] = Math.sin(uu * 2 * Math.PI);
      data[k * 4 + 3] = model.field.s && model.cfg.pattern === "scaled" ? model.field.s[k] : 0;
      if (d[k] > dmax) dmax = d[k];
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.field);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.linearFloat ? gl.RGBA32F : gl.RGBA16F, N, N, 0, gl.RGBA, gl.FLOAT, data);
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR);
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
    // Which part every sample is on (R8, read exactly with texelFetch) and, per part, centre, order, depth / tilt, band.
    const parts = model.parts || [], pid = model.field.pid || new Uint8Array(N * N);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.partMap);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, N, N, 0, gl.RED, gl.UNSIGNED_BYTE, pid);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    const pd = new Float32Array(64 * 2 * 4);
    parts.slice(0, 64).forEach((p, i) => { pd.set([p.c[0], p.c[1], p.order ?? 0, p.depth ?? dmax], i * 4); pd.set([p.tilt?.[0] ?? 0, p.tilt?.[1] ?? 0, p.band ?? 0, 0], (64 + i) * 4); });
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.partD);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 64, 2, 0, gl.RGBA, gl.FLOAT, pd);
    this.model = model; this.N = N; this.dmax = dmax; this.nParts = model.multi ? Math.min(64, parts.length) : 1;
  }
  setVideo(el) { this.videoEl = el; }
  // The ring engine's colours for this frame: CH_W x RGBA.
  setEngine(rgba) { this.chData.set(rgba, CH_W * 2 * 4); this.chDirty = true; }

  // Channel settings: { id: { tint: "#rrggbb" | null, tintAmt 0..1, gain 0..2, fx -1 | id, mute, solo } }.
  setChannels(map) {
    const D = this.chData; D.fill(0, 0, CH_W * 2 * 4); let solo = 0;
    for (let i = 0; i < CH_W; i++) D[(CH_W + i) * 4] = 128;
    for (const [id, c] of Object.entries(map)) {
      const i = +id; if (!(i >= 0 && i < CH_W)) continue;
      if (c.tint) { const [r, g, b] = hex(c.tint); D[i * 4] = r * 255; D[i * 4 + 1] = g * 255; D[i * 4 + 2] = b * 255; D[i * 4 + 3] = Math.round((c.tintAmt ?? 1) * 255); }
      const o = (CH_W + i) * 4;
      D[o] = Math.round(Math.max(0, Math.min(2, c.gain ?? 1)) * 127.5); D[o + 1] = (c.fx ?? -1) + 1; D[o + 2] = c.mute ? 255 : 0; D[o + 3] = c.solo ? 255 : 0;
      if (c.solo) solo = 1;
    }
    this.chFx = Object.values(map).map(c => c.fx ?? -1).filter(f => f >= 0);
    this.anySolo = solo; this.chDirty = true;
  }

  // points: the six calibration points (see halves()), in output pixels.
  // A crossfade between effects of different banks is drawn as two passes, the second blended over the first by the mix.
  render(s, points, pass = null) {
    if (!this.model) return;
    const fxA = s.fxA, fxB = s.mix > 0.001 ? s.fxB : s.fxA, own = pass ? [] : this.chFx || [];
    if (this.bankOf(fxA) === this.bankOf(fxB)) return this.draw(s, points, pass, this.keyFor([fxA, fxB, ...own]));
    this.draw({ ...s, fxB: fxA, mix: 0 }, points, null, this.keyFor([fxA, ...own]));
    this.draw({ ...s, fxA: fxB, mix: 0 }, points, { xfade: s.mix }, this.keyFor([fxB, ...own]));
  }
  draw(s, points, pass, key) {
    let L;
    try { L = this.use(key); }
    catch (e) {   // a bank this GPU cannot build: say so once and show the heartbeat instead, so the show goes on
      if (!this.bad.has(key)) { this.bad.add(key); console.error("heart-gl: effect bank " + key + " failed to build", e.message); }
      L = this.use("0"); s = { ...s, fxA: this.bankOf(s.fxA) ? 1 : s.fxA, fxB: this.bankOf(s.fxB) ? 1 : s.fxB };
    }
    const gl = this.gl, c = this.canvas, m = this.model;
    const layerPass = pass && pass.xfade == null;
    gl.uniform1i(L.uPass, layerPass ? 1 : 0);
    if (pass && !layerPass) {
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendColor(0, 0, 0, pass.xfade);
      gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
    } else if (pass) {
      gl.uniform1i(L.uMask, pass.mask || 0); gl.uniform1f(L.uLayOp, pass.op);
      gl.uniform1i(L.uLayMode, { multiply: 2, screen: 1, lighten: 1 }[pass.blend] ?? 0);
      gl.enable(gl.BLEND);
      gl.blendEquation({ lighten: gl.MAX, subtract: gl.FUNC_REVERSE_SUBTRACT }[pass.blend] ?? gl.FUNC_ADD);
      const F = { over: [gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA], add: [gl.SRC_ALPHA, gl.ONE], subtract: [gl.SRC_ALPHA, gl.ONE],
        screen: [gl.ONE, gl.ONE_MINUS_SRC_COLOR], lighten: [gl.ONE, gl.ONE], multiply: [gl.DST_COLOR, gl.ZERO] }[pass.blend] || [gl.ONE, gl.ONE_MINUS_SRC_COLOR];
      gl.blendFunc(F[0], F[1]);
    } else gl.disable(gl.BLEND);
    gl.viewport(0, 0, c.width, c.height);
    const { L: pl, R: pr } = halves(points), col = H => [H[0], H[3], H[6], H[1], H[4], H[7], H[2], H[5], H[8]];
    gl.uniformMatrix3fv(L.uInvHL, false, col(homography(pl, BOX_L)));
    gl.uniformMatrix3fv(L.uInvHR, false, col(homography(pr, BOX_R)));
    gl.uniform2f(L.uRes, c.width, c.height);
    gl.uniform1f(L.uN, this.N); gl.uniform1f(L.uDMax, this.dmax);
    const cfg = m.cfg, lev = new Float32Array(64); m.levels.slice(0, 64).forEach((v, i) => lev[i] = v);
    gl.uniform1i(L.uPattern, PATTERN_ID[cfg.pattern] ?? 0); gl.uniform1i(L.uNLev, Math.min(64, m.levels.length));
    gl.uniform1fv(L.uLev, lev);
    gl.uniform1f(L.uGW, cfg.width); gl.uniform1f(L.uEdge, cfg.edge); gl.uniform1f(L.uRim, cfg.rim); gl.uniform1f(L.uGap, cfg.gap);
    gl.uniform1f(L.uSeam, cfg.seam || 0); gl.uniform1f(L.uCleft, m.cleft ?? m.poly[0][1]);
    gl.uniform1i(L.uParts, this.nParts || 1);
    // Smoothed sound for the breathing effects: fast in, slow out, so the light swells and settles instead of flickering.
    const t = s.time ?? 0, dt = this.tPrev == null ? 0 : Math.min(0.1, Math.max(0, t - this.tPrev)); this.tPrev = t;
    const sm = (k, v, up, down) => { const c0 = this.sm[k] ?? 0; this.sm[k] = c0 + ((v || 0) - c0) * (1 - Math.exp(-dt / (v > c0 ? up : down))); return this.sm[k]; };
    const bassS = sm("b", s.bass, 0.08, 0.7), midS = sm("m", s.mid, 0.3, 1.4), highS = sm("h", s.high, 0.03, 0.25);
    // A breath of 5 to 20 a minute, quicker when the music is louder; the colour flow turns with the mids.
    this.breath = ((this.breath || 0) + dt * (0.085 + 0.18 * (s.levelS || 0) + 0.07 * bassS) * (s.speed ?? 1)) % 1000;
    this.flow = ((this.flow || 0) + dt * (0.008 + 0.05 * midS) * (s.speed ?? 1)) % 1000;
    gl.uniform1f(L.uBassS, bassS); gl.uniform1f(L.uMidS, midS); gl.uniform1f(L.uHighS, highS);
    gl.uniform1f(L.uBreath, this.breath); gl.uniform1f(L.uFlow, this.flow);
    gl.uniform1f(L.uAngle, cfg.angle); gl.uniform2f(L.uCenter, cfg.cx, cfg.cy);
    gl.uniform1i(L.uFxA, s.fxA); gl.uniform1i(L.uFxB, s.fxB); gl.uniform1f(L.uMix, s.mix);
    for (const k of ["Time", "Beat", "BeatN", "Bar", "Bass", "Mid", "High", "Level", "LevelS", "Kick", "Hit", "Pump", "Build", "Drop", "Break", "Speed", "Int", "Master", "Outline", "Hue", "VidMix", "EngMix"])
      gl.uniform1f(L["u" + k], s[k[0].toLowerCase() + k.slice(1)] ?? 0);
    gl.uniform1fv(L.uSpec, s.spec);
    gl.uniform3fv(L.uPal, (s.palette || PALETTES.love.c).flatMap(hex));
    const v = this.videoEl, vidOn = v && v.readyState >= 2 && v.videoWidth > 0;
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.vid);
    if (vidOn && !pass) { try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v); } catch {} }
    gl.uniform1f(L.uVidOn, vidOn ? 1 : 0); gl.uniform1f(L.uVidAspect, vidOn ? v.videoWidth / v.videoHeight : 1);
    if (this.chDirty) {
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.ch);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, CH_W, 3, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.chData);
      this.chDirty = false;
    }
    gl.uniform1i(L.uAnySolo, this.anySolo);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.partMap);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.partD);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
