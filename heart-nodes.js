// Workspace: a node network for the show's sound, after TouchDesigner's way of working. Operators sit in a network,
// wires carry their outputs to other operators, every operator cooks once a frame from its inputs, and the result is
// exported to the heart: show parameters, the inputs every effect reads, and extra layers of effects.
// Two kinds of wire: audio (an input and a frequency band, amber, thick) and value (a number per frame, thin).
// Operators, as in TouchDesigner's audio chain:
//   Audio Device In -> Audio Filter (band) -> Analyze (level, 0..1) -> Math / Lag / Trigger / Count / Logic -> Export.
// Built from Derivative's published operator reference, written from scratch for the heart.
// A third kind of wire carries a picture (TOP, violet): Heart Source -> Feedback -> Displace -> Level -> Lookup -> Chromatic ->
// Heart Out runs the liquid of heart-td.js, and any value wired into a TOP's side input moves that parameter over its whole range
// (the way a CHOP is exported to a TOP parameter). Every operator shows a viewer, as in TouchDesigner: a trace of its value for
// CHOPs, the liquid itself for TOPs, the projector picture for Heart Out.
import { TD_DEFAULT, TD_SOURCES, TD_RAMPS, TD_LOOKS, TD_FX, MECHS } from "./heart-td.js?v=1";

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t, k) => k === "in" ? t * t : k === "out" ? 1 - (1 - t) * (1 - t) : k === "inout" ? t * t * (3 - 2 * t) : t;

export const FAMS = {
  audio: { name: "סאונד", col: "#f59f00", op: "CHOP" }, signal: { name: "עיבוד", col: "#22b8cf", op: "CHOP" }, time: { name: "זמן", col: "#94d82d", op: "CHOP" },
  top: { name: "תמונה", col: "#9775fa", op: "TOP" }, out: { name: "פלט ללב", col: "#f06595", op: "OUT" },
};
// Show parameters an Export can drive: the value 0..1 becomes the slider's own units.
export const EXPORT_PARAMS = {
  master: ["בהירות", v => v * 100], hue: ["גוון", v => v * 360], speed: ["מהירות", v => v * 200], intensity: ["עוצמת תגובה", v => v * 100],
  outline: ["קונטור לבן", v => v * 100], vidmix: ["וידאו", v => v * 100], engmix: ["מנוע טבעות", v => v * 100],
};
export const EXPORT_FEATS = { kick: "קיק", hit: "מכה", bass: "בס", mid: "אמצע", high: "גבוהים", level: "עוצמה" };

// Parameter helpers: f = number slider, m = menu, b = toggle.
const f = (k, l, d, min, max, step = 0.01) => ({ k, l, t: "f", d, min, max, step });
const m = (k, l, d, o) => ({ k, l, t: "m", d, o });
const b = (k, l, d) => ({ k, l, t: "b", d });
const A = "audio", I = "top";   // port types
// A TOP parameter: the value wired into side input i (0..1) moves it over its whole range, else the slider.
const pv = (n, In, i, q) => { const v = In[i]; return typeof v === "number" && isFinite(v) ? q.min + Math.min(1, Math.max(0, v)) * (q.max - q.min) : n.p[q.k]; };
// A TOP: its picture comes in on input 0 (none: nothing goes out), side inputs 1.. drive the parameters listed in `side`.
const top = (name, he, side, rest, extra = {}) => {
  const ps = [...side, ...rest];
  return { fam: "top", name, he, view: "td", ins: [["image", I], ...side.map(q => [q.l])], outs: [["image", I]], params: () => ps,
    cook(n, In) { const a = In[0]; if (!a || typeof a !== "object") return [null]; const o = { ...a };
      side.forEach((q, i) => { o[q.k] = pv(n, In, i + 1, q); }); rest.forEach(q => { o[q.k] = q.t === "b" ? +!!n.p[q.k] : q.t === "m" ? +n.p[q.k] : n.p[q.k]; }); return [o]; }, ...extra };
};

export function makeOps(env) {
  // env: { rx, music, effects, blends, masks, inputs() }
  return {
    audioin: { fam: "audio", name: "Audio Device In", he: "הכניסה של הסטודיו: שיר, וידאו, מיקרופון או כבל. בוחרים את המיקס או ערוץ אחד של כרטיס הקול.",
      ins: [], outs: [["audio", A]], params: () => [m("src", "ערוץ", "-1", [["-1", "מיקס"], ...env.inputs().map((n, i) => [String(i), n])])],
      cook: (n) => [{ src: +n.p.src, lo: 20, hi: 20000 }] },
    filter: { fam: "audio", name: "Audio Filter", he: "מסנן תדרים: מעביר רק חלק מהספקטרום. Low Pass מתחת לחיתוך, High Pass מעליו, Band Pass בין שניהם.",
      ins: [["audio", A]], outs: [["audio", A]],
      params: () => [m("type", "סוג", "band", [["low", "Low Pass"], ["high", "High Pass"], ["band", "Band Pass"]]), f("lo", "חיתוך נמוך (Hz)", 40, 20, 16000, 1), f("hi", "חיתוך גבוה (Hz)", 120, 20, 20000, 1)],
      cook(n, [a]) {
        if (!a) return [null];
        const p = n.p, lo = p.type === "low" ? a.lo : Math.max(a.lo, p.lo), hi = p.type === "high" ? a.hi : Math.min(a.hi, p.hi);
        return [{ src: a.src, lo: Math.min(lo, hi), hi: Math.max(lo, hi) }];
      } },
    analyze: { fam: "audio", name: "Analyze", he: "מודד את העוצמה של הקול שנכנס (RMS בדציבלים) והופך אותה לערך 0..1: הגברה, סף רעש וטווח דינמי. כיול אוטומטי עוקב אחרי השיא.",
      ins: [["audio", A]], outs: [["level"], ["dB"]],
      params: () => [f("gain", "הגברה (dB)", 0, -24, 36, 1), f("gate", "סף רעש (dB)", -100, -130, -20, 1), f("range", "טווח (dB)", 24, 3, 60, 1), b("auto", "כיול אוטומטי", true)],
      cook(n, [a], c) {
        if (!a) return [0, -140];
        const raw = env.rx.band(a.src, a.lo, a.hi, c.nowMs); if (raw == null) return [0, -140];
        const p = n.p, db = raw + p.gain, r = n.rt;
        r.peak = Math.max(db, (r.peak ?? -60) - 4 * c.dt, p.gate + p.range);
        const top = p.auto ? r.peak : p.gate + p.range;
        return [db < p.gate ? 0 : clamp((db - (top - p.range)) / p.range), db];
      } },
    channel: { fam: "audio", name: "Sound Channel", he: "ערוץ מלשונית הסאונד (קיק, בס, היי-האט…) או קריאת הטראנס, כמו שהוא.",
      ins: [], outs: [["env"], ["trig"]],
      params: () => [m("ch", "ערוץ", env.rx.o.ch[0]?.id || "", env.channels())],
      cook: (n) => [env.rx.get(n.p.ch, "env"), env.rx.get(n.p.ch, "trig")] },
    trance: { fam: "audio", name: "Trance", he: "קריאה מוזיקלית: נשימה (עוצמה איטית ורכה), פאמפ (0 על הקיק, עולה עד הקיק הבא), בילדאפ, דרופ וברייקדאון.",
      ins: [], outs: [["breath"], ["pump"], ["build"], ["drop"], ["break"]], params: () => [],
      cook: (n, I, c) => [c.f.breath ?? 0, c.f.pump ?? 1, c.f.build ?? 0, c.f.drop ?? 0, c.f.brk ?? 0] },
    beat: { fam: "time", name: "Beat", he: "שעון המוזיקה: ramp עולה בכל פעימה, bar בכל תיבה, pulse על כל פעימה, step של 16 צעדים.",
      ins: [], outs: [["ramp"], ["bar"], ["pulse"], ["step"], ["16th"]], params: () => [f("decay", "דעיכת pulse (שנ')", 0.15, 0.02, 1)],
      cook(n, I, c) {
        const fr = c.f, k = fr.beatN ?? 0, r = n.rt;
        if (r.k !== k) { r.k = k; r.pulse = 1; } else r.pulse = (r.pulse ?? 0) * Math.exp(-c.dt / n.p.decay);
        const st = Math.floor(((fr.beatN ?? 0) + (fr.beat ?? 0)) * 4);
        return [fr.beat ?? 0, fr.bar ?? 0, r.pulse, ((st % 16) + 16) % 16 / 15, 1 - ((((fr.beat ?? 0) * 4) % 1))];
      } },
    lfo: { fam: "time", name: "LFO", he: "מתנד: גל שחוזר על עצמו. בסנכרון, הקצב נמדד בפעימות של השיר.",
      ins: [], outs: [["out"]],
      params: () => [m("wave", "צורה", "sine", [["sine", "סינוס"], ["tri", "משולש"], ["square", "ריבוע"], ["ramp", "רמפה"], ["pulse", "פולס"]]),
        b("sync", "סנכרון לפעימות", true), f("rate", "קצב (מחזורים לפעימה / Hz)", 0.25, 0.01, 8), f("amp", "עוצמה", 1, 0, 2), f("off", "היסט", 0, -1, 1), f("phase", "פאזה", 0, 0, 1)],
      cook(n, I, c) {
        const p = n.p, x = (p.sync ? ((c.f.beatN ?? 0) + (c.f.beat ?? 0)) * p.rate : c.t * p.rate) + p.phase, fr = x - Math.floor(x);
        const w = { sine: 0.5 + 0.5 * Math.sin(x * 2 * Math.PI), tri: 1 - 2 * Math.abs(fr - 0.5), square: fr < 0.5 ? 1 : 0, ramp: fr, pulse: fr < 0.1 ? 1 : 0 }[p.wave] ?? 0;
        return [w * p.amp + p.off];
      } },
    constant: { fam: "signal", name: "Constant", he: "ערך קבוע, מסליידר. טוב לשליטה ידנית או מבקר MIDI.",
      ins: [], outs: [["value"]], params: () => [f("v", "ערך", 0.5, 0, 1)], cook: n => [n.p.v] },
    math: { fam: "signal", name: "Math", he: "מתמטיקה: הוספה לפני, הכפלה, הוספה אחרי, מיפוי טווח, קימור, היפוך והגבלה.",
      ins: [["in"]], outs: [["out"]],
      params: () => [f("pre", "הוספה לפני", 0, -1, 1), f("gain", "הכפלה", 1, -5, 5), f("post", "הוספה אחרי", 0, -1, 1),
        f("from0", "מטווח מ-", 0, -1, 2), f("from1", "מטווח עד", 1, -1, 2), f("to0", "לטווח מ-", 0, -1, 2), f("to1", "לטווח עד", 1, -1, 2),
        f("curve", "קימור", 1, 0.2, 4), b("inv", "היפוך", false), b("clamp", "הגבלה ל-0..1", true)],
      cook(n, [x = 0]) {
        const p = n.p; let v = (x + p.pre) * p.gain + p.post;
        v = (v - p.from0) / ((p.from1 - p.from0) || 1);
        v = Math.sign(v) * Math.pow(Math.abs(v), p.curve);
        if (p.inv) v = 1 - v;
        v = p.to0 + v * (p.to1 - p.to0);
        return [p.clamp ? clamp(v, Math.min(p.to0, p.to1), Math.max(p.to0, p.to1)) : v];
      } },
    lag: { fam: "signal", name: "Lag", he: "החלקה: זמן עלייה וזמן ירידה נפרדים (בערך הזמן להגיע ל-90%), עם Overshoot שמגזים בתנועה.",
      ins: [["in"]], outs: [["out"]], params: () => [f("up", "זמן עלייה (שנ')", 0.02, 0, 3), f("down", "זמן ירידה (שנ')", 0.3, 0, 5), f("over", "Overshoot", 0, 0, 1)],
      cook(n, [x = 0], c) {
        const r = n.rt, p = n.p, prev = r.v ?? x, t = (x > prev ? p.up : p.down) / 2.3;   // 90% after `lag` seconds
        r.vel = r.vel ?? 0;
        let v = t <= 0 ? x : prev + (x - prev) * (1 - Math.exp(-c.dt / t));
        if (p.over > 0) { r.vel = r.vel * 0.85 + (v - prev); v += r.vel * p.over * 3; }
        r.v = v; return [v];
      } },
    trigger: { fam: "signal", name: "Trigger", he: "מעטפת ADSR: כשהכניסה חוצה את הסף, מתחיל Attack עד Peak, Decay עד Sustain, ו-Release כשהיא יורדת מתחת לסף השחרור.",
      ins: [["in"]], outs: [["env"], ["fire"]],
      params: () => [f("th", "סף", 0.5, 0, 1), f("rel", "סף שחרור", 0.4, 0, 1), f("retrig", "השהיה לטריגר הבא (שנ')", 0.1, 0, 2),
        f("att", "Attack (שנ')", 0, 0, 2), f("peak", "Peak", 1, 0, 2), f("dec", "Decay (שנ')", 0.2, 0, 3), f("sus", "Sustain", 0, 0, 1), f("relT", "Release (שנ')", 0.2, 0, 4),
        m("shape", "צורה", "out", [["lin", "ליניארי"], ["in", "Ease In"], ["out", "Ease Out"], ["inout", "Ease In Out"]])],
      cook(n, [x = 0], c) {
        const r = n.rt, p = n.p;
        r.stage ??= "off"; r.t ??= 0; r.v ??= 0; r.last ??= -9;
        let fire = 0;
        if (x >= p.th && !r.on && c.t - r.last >= p.retrig) { r.on = true; r.stage = "att"; r.t = 0; r.from = r.v; r.last = c.t; fire = 1; }
        else if (x < p.rel && r.on) { r.on = false; if (r.stage !== "off") { r.stage = "rel"; r.t = 0; r.from = r.v; } }
        r.t += c.dt;
        if (r.stage === "att") { r.v = p.att > 0 ? r.from + (p.peak - r.from) * ease(clamp(r.t / p.att), p.shape) : p.peak; if (r.t >= p.att) { r.stage = "dec"; r.t = 0; } }
        else if (r.stage === "dec") { r.v = p.dec > 0 ? p.peak + (p.sus - p.peak) * ease(clamp(r.t / p.dec), p.shape) : p.sus; if (r.t >= p.dec) { r.stage = "sus"; if (!r.on) { r.stage = "rel"; r.t = 0; r.from = r.v; } } }
        else if (r.stage === "sus") r.v = p.sus;
        else if (r.stage === "rel") { r.v = p.relT > 0 ? r.from * (1 - ease(clamp(r.t / p.relT), p.shape)) : 0; if (r.t >= p.relT) { r.stage = "off"; r.v = 0; } }
        return [r.v, fire];
      } },
    count: { fam: "signal", name: "Count", he: "סופר טריגרים: כל חציית סף מוסיפה 1. גבולות: לולאה, עצירה או זיגזג. כניסה שנייה מאפסת.",
      ins: [["in"], ["reset"]], outs: [["count"], ["norm"]],
      params: () => [f("th", "סף", 0.5, 0, 1), f("min", "מינימום", 0, 0, 64, 1), f("max", "מקסימום", 7, 1, 64, 1), m("limit", "גבולות", "loop", [["off", "בלי"], ["loop", "לולאה"], ["clamp", "עצירה"], ["zigzag", "זיגזג"]])],
      cook(n, [x = 0, rs = 0]) {
        const r = n.rt, p = n.p; r.c ??= p.min; r.dir ??= 1;
        if (rs >= 0.5 && !r.ron) r.c = p.min; r.ron = rs >= 0.5;
        if (x >= p.th && !r.on) {
          let c = r.c + r.dir;
          if (p.limit === "loop" && c > p.max) c = p.min;
          else if (p.limit === "clamp") c = Math.min(c, p.max);
          else if (p.limit === "zigzag" && (c > p.max || c < p.min)) { r.dir = -r.dir; c = r.c + r.dir; }
          r.c = c;
        }
        r.on = x >= p.th;
        return [r.c, clamp((r.c - p.min) / ((p.max - p.min) || 1))];
      } },
    logic: { fam: "signal", name: "Logic", he: "לוגיקה: כל כניסה נחשבת דולקת מעל הסף. AND, OR, XOR, NOT, או השוואה בין שתי הכניסות.",
      ins: [["a"], ["b"]], outs: [["out"]],
      params: () => [m("op", "פעולה", "and", [["and", "AND"], ["or", "OR"], ["xor", "XOR"], ["not", "NOT a"], ["gt", "a > b"], ["lt", "a < b"]]), f("th", "סף", 0.5, 0, 1)],
      cook(n, [a = 0, b = 0]) {
        const t = n.p.th, A1 = a >= t, B1 = b >= t;
        return [+({ and: A1 && B1, or: A1 || B1, xor: A1 !== B1, not: !A1, gt: a > b, lt: a < b }[n.p.op] ?? false)];
      } },
    combine: { fam: "signal", name: "Combine", he: "מחבר שתי כניסות: חיבור, כפל, מקסימום, מינימום, ממוצע או הפרש.",
      ins: [["a"], ["b"]], outs: [["out"]],
      params: () => [m("op", "פעולה", "max", [["add", "חיבור"], ["mul", "כפל"], ["max", "מקסימום"], ["min", "מינימום"], ["avg", "ממוצע"], ["sub", "a פחות b"]])],
      cook: (n, [a = 0, b = 0]) => [{ add: a + b, mul: a * b, max: Math.max(a, b), min: Math.min(a, b), avg: (a + b) / 2, sub: a - b }[n.p.op] ?? 0] },
    jumper: { fam: "signal", name: "Random Hold", he: "בכל טריגר קופץ לערך אקראי חדש בטווח, ומחזיק אותו עד הטריגר הבא.",
      ins: [["trig"]], outs: [["out"]], params: () => [f("th", "סף", 0.5, 0, 1), f("lo", "מינימום", 0, 0, 1), f("hi", "מקסימום", 1, 0, 1)],
      cook(n, [x = 0]) { const r = n.rt; if (x >= n.p.th && !r.on) r.v = n.p.lo + Math.random() * (n.p.hi - n.p.lo); r.on = x >= n.p.th; return [r.v ?? n.p.lo]; } },
    nul: { fam: "signal", name: "Null", he: "מעביר הלאה כמו שהוא. נקודת חיבור מסודרת, כמו Null ב-TouchDesigner.",
      ins: [["in"]], outs: [["out"]], params: () => [], cook: (n, [x = 0]) => [x] },
    // ---- TOPs: the liquid ----
    tdsrc: { fam: "top", name: "Heart Source", he: "מקור החום של הנוזל, ממופה לחלקי החיתוך: פעימות לב שמתפשטות כגלים, בועות על כל מכה, התעלות לפי הספקטרום, קירות אש על הקונטור, לבה חיה, ניצוצות, משאבה מהלב הפנימי או וידאו. הכניסה מזיזה את העוצמה.",
      view: "td", ins: [["עוצמה"]], outs: [["image", I]],
      params: () => [m("src", "מקור", "0", TD_SOURCES.map((t, i) => [String(i), t])), f("gain", "עוצמה", 1, 0, 3), f("react", "תגובה למוזיקה", 0.8, 0, 2), f("wave", "מהירות הגל", 0.9, 0.2, 3), f("spark", "ניצוצות", 0, 0, 1)],
      cook(n, In) { const p = n.p; return [{ ...TD_DEFAULT, src: +p.src, gain: pv(n, In, 0, f("gain", "", 1, 0, 3)), react: p.react, wave: p.wave, spark: p.spark }]; } },
    feedback: top("Feedback", "הלב של הרשת: התמונה של הפריים הקודם חוזרת פנימה, מתקררת לאט, מתקרבת או מתרחקת ומסתובבת סביב מרכז כל חלק. צמיגות מטשטשת אותה כמו נוזל סמיך.",
      [f("decay", "החזקה", 0.9, 0.5, 0.995, 0.005), f("zoom", "זום", 0.6, -4, 4), f("rot", "סיבוב", 0, -4, 4)], [f("visc", "צמיגות", 0.3, 0, 1), b("mirror", "מראה על התפר", false)]),
    displace: top("Displace", "מזיז את הנוזל בשדה זרימה (Curl Noise) שמתחזק עם הבס והקיק, ודוחף אותו לרוחב הטבעות: חיובי החוצה, שלילי פנימה.",
      [f("flow", "זרימה", 1, 0, 3), f("push", "דחיפה בין הטבעות", 0.3, -2, 2)], [f("nscale", "גודל המערבולות", 1, 0.2, 3), f("nspeed", "מהירות המערבולות", 0.3, 0, 1.5)]),
    level: top("Level", "בהירות וגאמה של החום לפני הצביעה. גאמה גבוהה משאירה רק את החלקים החמים.",
      [f("bright", "בהירות", 1, 0, 2.5)], [f("gamma", "גאמה", 1, 0.4, 3)]),
    lookup: top("Lookup", "צובע את החום ברמפה (אש כמו בסרטון, צבעי ההופעה או ירוק) ובוחר מראה: לבה, ורידים (קצוות זוהרים לכל בועה) או מפת גובה תלת-ממדית מוארת.",
      [f("vein", "ורידים", 1, 0, 3)], [m("ramp", "רמפה", "0", TD_RAMPS.map((t, i) => [String(i), t])), m("look", "מראה", "0", TD_LOOKS.map((t, i) => [String(i), t]))]),
    chroma: top("Chromatic", "פיצול צבעים (Chromatic Aberration) שמתרחב על המכות, טשטוש זום לכיוון המרכז, ושכבת ניצוצות.",
      [f("chroma", "פיצול צבעים (ס״מ)", 0, 0, 8), f("zblur", "טשטוש זום", 0, 0, 1.5)], []),
    heartout: { fam: "out", name: "Heart Out", he: "התמונה עולה ללב, חתוכה בדיוק לתעלות, ללבבות שביניהן ולקונטור, כשכבה מעל ההופעה. כניסת השקיפות פותחת אותה.",
      view: "out", ins: [["image", I], ["שקיפות"]], outs: [],
      params: () => [f("gG", "תעלות", 1.4, 0, 3), f("sG", "לבבות בין התעלות", 0.55, 0, 2), f("edge", "קונטור", 0.3, 0, 2),
        m("blend", "מיזוג", "screen", Object.entries(env.blends)), m("mask", "מסכה", "all", Object.entries(env.masks)), f("op", "שקיפות בסיס", 1, 0, 1), b("on", "פעילה", true)],
      cook: () => [] },
    heartbeat: { fam: "audio", name: "Heartbeat", he: "פעימות הלב של המוזיקה: lub על כל מכה, dub שליש פעימה אחריו, ומעטפת שדועכת. אותן פעימות שמזיזות את הנוזל.",
      ins: [], outs: [["lub"], ["dub"], ["env"]], params: () => [], cook: () => [env.td?.lub ?? 0, env.td?.dubFire ?? 0, env.td?.env ?? 0] },
    mech: { fam: "out", name: "Mechanisms", he: "מפעיל את המנגנונים מהרשת: כל כניסה שעוברת את 0.5 מפעילה את שלה (גל הלם על הדרופ, ניצוצות על הסנר...), וערך רציף מחזיק אותו.",
      ins: MECHS.map(([, ico, name]) => [ico + " " + name]), outs: [], params: () => [], cook: () => [] },
    exporter: { fam: "out", name: "Export → Heart", he: "שולח ערכים ללב: כל כניסה מחוברת מחליפה את הפרמטר (בהירות, גוון, מהירות…) או את מה שהאפקטים קוראים (קיק, בס…).",
      ins: [...Object.entries(EXPORT_PARAMS).map(([k, [l]]) => [l, null, k]), ...Object.entries(EXPORT_FEATS).map(([k, l]) => [l, null, "f_" + k])], outs: [], params: () => [],
      cook: () => [] },
    layer: { fam: "out", name: "Layer → Heart", he: "שכבת אפקט מעל ההופעה: בוחרים אפקט, מיזוג ומסכה לפי חלקי החיתוך. כניסת השקיפות פותחת אותה, וכניסות הקיק והעוצמה הן מה שהאפקט שלה מרגיש.",
      ins: [["שקיפות"], ["קיק"], ["עוצמה"]], outs: [],
      params: () => [m("fx", "אפקט", "23", env.effects()), m("blend", "מיזוג", "screen", Object.entries(env.blends)), m("mask", "מסכה", "all", Object.entries(env.masks)),
        f("op", "שקיפות בסיס", 1, 0, 1), b("on", "פעילה", true)],
      cook: () => [] },
  };
}

// ---------------- network ----------------
let uid = 1;
export class Network {
  constructor(ops) { this.ops = ops; this.nodes = []; this.wires = []; this.vals = new Map(); this.t = 0; }
  add(type, x, y, p = {}) {
    const op = this.ops[type]; if (!op) return null;
    const n = { id: "n" + uid++, type, x, y, p: {}, rt: {}, name: this.nameFor(type) };
    for (const q of op.params()) n.p[q.k] = q.d;
    Object.assign(n.p, p);
    this.nodes.push(n); return n;
  }
  // TouchDesigner-style names: the operator's type and a number, math1, math2...
  nameFor(type) { const base = (this.ops[type]?.name || type).toLowerCase().replace(/[^a-z]+/g, ""); let k = 1; while (this.nodes.some(n => n.name === base + k)) k++; return base + k; }
  remove(id) { this.nodes = this.nodes.filter(n => n.id !== id); this.wires = this.wires.filter(w => w.from[0] !== id && w.to[0] !== id); }
  node(id) { return this.nodes.find(n => n.id === id); }
  ins(n) { return this.ops[n.type].ins; }
  outs(n) { return this.ops[n.type].outs; }
  // A value input takes one wire; connecting again replaces it. Audio goes only to audio, values only to values.
  connect(from, to) {
    const a = this.node(from[0]), b = this.node(to[0]); if (!a || !b || a === b) return false;
    const ot = this.outs(a)[from[1]]?.[1] || null, it = this.ins(b)[to[1]]?.[1] || null;
    if (ot !== it) return false;
    this.wires = this.wires.filter(w => !(w.to[0] === to[0] && w.to[1] === to[1]));
    this.wires.push({ from: [...from], to: [...to] }); return true;
  }
  input(n, i) { const w = this.wires.find(w => w.to[0] === n.id && w.to[1] === i); return w ? this.vals.get(w.from[0])?.[w.from[1]] : undefined; }
  wired(n, i) { return this.wires.some(w => w.to[0] === n.id && w.to[1] === i); }
  // Cook every operator once, inputs first. A loop reads the previous frame's value, as in TouchDesigner.
  cook(ctx) {
    this.t += ctx.dt; ctx.t = this.t;
    const done = new Set(), busy = new Set();
    const visit = n => {
      if (done.has(n.id) || busy.has(n.id)) return;
      busy.add(n.id);
      for (const w of this.wires) if (w.to[0] === n.id) { const s = this.node(w.from[0]); if (s) visit(s); }
      busy.delete(n.id); done.add(n.id);
      const I = this.ins(n).map((_, i) => this.input(n, i));
      try { this.vals.set(n.id, this.ops[n.type].cook(n, I, ctx) || []); n.err = null; } catch (e) { n.err = e.message; this.vals.set(n.id, []); }
    };
    for (const n of this.nodes) visit(n);
    // What goes to the heart.
    const out = { params: {}, feats: {}, layers: [], td: null, mech: [0, 0, 0, 0, 0, 0, 0, 0] };
    for (const n of this.nodes) {
      if (n.type === "exporter") this.ins(n).forEach(([, , k], i) => {
        const v = this.input(n, i); if (v === undefined || !isFinite(v)) return;
        if (k.startsWith("f_")) out.feats[k.slice(2)] = v; else out.params[k] = EXPORT_PARAMS[k][1](v);
      });
      if (n.type === "heartout" && n.p.on) {
        const d = this.input(n, 0);
        if (d && typeof d === "object") {
          out.td = { ...d, gG: n.p.gG, sG: n.p.sG, edge: n.p.edge };
          const op = this.wired(n, 1) ? clamp(this.input(n, 1) ?? 0) * n.p.op : n.p.op;
          out.layers.push({ fx: 164, blend: n.p.blend, mask: n.p.mask, op });
        }
      }
      if (n.type === "mech") this.ins(n).forEach((_, i) => { const v = this.input(n, i); if (typeof v === "number" && isFinite(v)) out.mech[i] = Math.max(out.mech[i], v); });
      if (n.type === "layer" && n.p.on) {
        const op = this.wired(n, 0) ? clamp(this.input(n, 0) ?? 0) * n.p.op : n.p.op, k = this.input(n, 1), lv = this.input(n, 2);
        out.layers.push({ fx: +n.p.fx, blend: n.p.blend, mask: n.p.mask, op, kick: k, level: lv });
      }
    }
    return out;
  }
  save() { return { nodes: this.nodes.map(({ id, type, x, y, p, name }) => ({ id, type, x, y, p, name })), wires: this.wires }; }
  load(o) {
    this.nodes = []; this.wires = []; this.vals.clear();
    for (const s of o?.nodes || []) if (this.ops[s.type]) { const n = this.add(s.type, s.x, s.y, s.p); n.id = s.id; if (s.name) n.name = s.name; }
    for (const n of this.nodes) { const k = +n.id.slice(1); if (k >= uid) uid = k + 1; }
    for (const w of o?.wires || []) this.connect(w.from, w.to);
  }
}

// Ready-made networks.
export const TEMPLATES = {
  liquid: { name: "🌋 לבה צמיגה (כמו בסרטון)", build: N => buildLiquid(N) },
  trance: { name: "🚀 טראנס", build(N) {
    const a = N.add("audioin", 20, 40);
    const fk = N.add("filter", 200, 20, { type: "band", lo: 40, hi: 120 }), ak = N.add("analyze", 380, 20, { range: 18 });
    const tk = N.add("trigger", 560, 20, { th: 0.55, rel: 0.35, retrig: 0.2, att: 0, peak: 1, dec: 0.18, sus: 0, relT: 0.1 });
    const fh = N.add("filter", 200, 210, { type: "high", lo: 6000 }), ah = N.add("analyze", 380, 210, { range: 20 }), lh = N.add("lag", 560, 230, { up: 0.01, down: 0.25 });
    const tr = N.add("trance", 380, 400), mp = N.add("math", 560, 400, { to0: 0.35, to1: 1 });
    const bt = N.add("beat", 20, 400), lf = N.add("lfo", 200, 470, { wave: "ramp", sync: true, rate: 1 / 32 });
    const bd = N.add("combine", 560, 560, { op: "max" });
    const ex = N.add("exporter", 800, 330);
    const l1 = N.add("layer", 800, 20, { fx: "23", blend: "screen", mask: "grooves" }), l2 = N.add("layer", 800, 170, { fx: "52", blend: "add", mask: "all", op: 0.9 });
    const l3 = N.add("layer", 1020, 520, { fx: "54", blend: "screen", mask: "all" });
    const W = (a1, o, b1, i) => N.connect([a1.id, o], [b1.id, i]);
    W(a, 0, fk, 0); W(fk, 0, ak, 0); W(ak, 0, tk, 0); W(tk, 0, l1, 0); W(tk, 0, l1, 1);
    W(a, 0, fh, 0); W(fh, 0, ah, 0); W(ah, 0, lh, 0); W(lh, 0, l2, 0); W(tk, 0, l2, 1);
    W(tr, 1, mp, 0); W(mp, 0, ex, 0); W(lf, 0, ex, 1); W(tk, 0, ex, 7);
    W(tr, 2, bd, 0); W(tr, 3, bd, 1); W(bd, 0, l3, 0);
    void bt;
  } },
  bands: { name: "🎚️ 3 פסים", build(N) {
    const a = N.add("audioin", 20, 200), ex = N.add("exporter", 760, 160);
    [["low", 20, 250, "f_bass", 9], ["band", 250, 4000, "f_mid", 10], ["high", 4000, 20000, "f_high", 11]].forEach(([type, lo, hi, , port], i) => {
      const fl = N.add("filter", 200, 40 + i * 190, { type, lo, hi }), an = N.add("analyze", 380, 40 + i * 190), lg = N.add("lag", 560, 40 + i * 190, { up: 0.02, down: 0.25 });
      N.connect([a.id, 0], [fl.id, 0]); N.connect([fl.id, 0], [an.id, 0]); N.connect([an.id, 0], [lg.id, 0]); N.connect([lg.id, 0], [ex.id, port]);
    });
  } },
};

// The liquid as a network, as in the reel: the sound chain (a "snare" band, the bass, the heartbeat) on top, exported into the
// TOP chain below it. `preset` is one of the 20 ready effects, so any of them can be opened and taken apart in the workspace.
export function buildLiquid(N, preset = TD_FX[0][4]) {
  const P = { ...TD_DEFAULT, ...preset }, W = (a1, o, b1, i) => N.connect([a1.id, o], [b1.id, i]);
  const a = N.add("audioin", 20, 60);
  const fs = N.add("filter", 220, 20, { type: "band", lo: 180, hi: 400 }), as = N.add("analyze", 420, 20, { range: 18 });
  const ms = N.add("math", 620, 20, { to0: 0.25, to1: 0.6 }), ls = N.add("lag", 820, 20, { up: 0.05, down: 0.5 });
  const fb = N.add("filter", 220, 200, { type: "low", hi: 120 }), ab = N.add("analyze", 420, 200, { range: 20 }), lb = N.add("lag", 620, 200, { up: 0.04, down: 0.6 });
  const mb = N.add("math", 820, 200, { to0: 0.5 + P.zoom / 8 - 0.03, to1: 0.5 + P.zoom / 8 + 0.12 });
  const hb = N.add("heartbeat", 20, 380), mh = N.add("math", 220, 380, { to0: 0, to1: Math.min(1, 0.15 + P.chroma / 8) });
  const tr = N.add("trance", 420, 380), mc = N.add("mech", 1240, 340);
  const y = 640;
  const src = N.add("tdsrc", 20, y, { src: String(P.src), gain: P.gain, react: P.react, wave: P.wave, spark: P.spark });
  const fd = N.add("feedback", 220, y, { decay: P.decay, zoom: P.zoom, rot: P.rot, visc: P.visc, mirror: !!P.mirror });
  const ds = N.add("displace", 420, y, { flow: P.flow, push: P.push, nscale: P.nscale, nspeed: P.nspeed });
  const lv = N.add("level", 620, y, { bright: P.bright, gamma: P.gamma });
  const lk = N.add("lookup", 820, y, { ramp: String(P.ramp), look: String(P.look), vein: P.vein });
  const ch = N.add("chroma", 1020, y, { chroma: P.chroma, zblur: P.zblur });
  const ho = N.add("heartout", 1240, y, { gG: P.gG, sG: P.sG, edge: P.edge });
  W(a, 0, fs, 0); W(fs, 0, as, 0); W(as, 0, ms, 0); W(ms, 0, ls, 0);
  W(a, 0, fb, 0); W(fb, 0, ab, 0); W(ab, 0, lb, 0); W(lb, 0, mb, 0);
  W(src, 0, fd, 0); W(fd, 0, ds, 0); W(ds, 0, lv, 0); W(lv, 0, lk, 0); W(lk, 0, ch, 0); W(ch, 0, ho, 0);
  W(ls, 0, src, 0); W(mb, 0, fd, 2); W(hb, 2, mh, 0); if (P.chroma > 0) W(mh, 0, ch, 1);
  W(tr, 3, mc, 1); W(tr, 2, mc, 3);
}

// Ready-made networks for the OP Create menu, by family (the order of the toolbar).
export const WS_MENU = [
  ["CHOP · סאונד", ["audioin", "filter", "analyze", "channel", "trance", "heartbeat"]],
  ["CHOP · זמן ועיבוד", ["beat", "lfo", "constant", "math", "lag", "trigger", "count", "logic", "combine", "jumper", "nul"]],
  ["TOP · נוזל", ["tdsrc", "feedback", "displace", "level", "lookup", "chroma"]],
  ["פלט ללב", ["heartout", "layer", "exporter", "mech"]],
];

// ---------------- editor ----------------
// The network on screen: operators as boxes, inputs on the left, outputs on the right, wires as curves. Drag a box by its
// title, drag from an output to an input to wire it, click a wire to cut it, drag the background to pan, wheel to zoom.
// The selected operator's parameters show under the network, like TouchDesigner's parameter window.
const NW = 156, HEAD = 24, ROW = 19, VIEW = 58;
const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const portY = i => HEAD + ROW * i + ROW / 2;
export class Editor {
  constructor(area, panel, net, onChange) {
    Object.assign(this, { area, panel, net, onChange, view: { x: 20, y: 20, k: 0.85 }, sel: null, drag: null });
    area.innerHTML = `<div class="wsWorld"><svg class="wsWires"></svg><div class="wsNodes"></div></div>`;
    this.world = area.querySelector(".wsWorld"); this.svg = area.querySelector(".wsWires"); this.box = area.querySelector(".wsNodes");
    area.addEventListener("pointerdown", e => this.down(e));
    area.addEventListener("pointermove", e => this.move(e));
    area.addEventListener("pointerup", e => this.up(e));
    area.addEventListener("wheel", e => { e.preventDefault(); const r = area.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, v = this.view, k = Math.min(2, Math.max(0.3, v.k * Math.exp(-e.deltaY * 0.0012)));
      v.x = mx - (mx - v.x) * k / v.k; v.y = my - (my - v.y) * k / v.k; v.k = k; this.place(); }, { passive: false });
    area.addEventListener("keydown", e => { if ((e.key === "Delete" || e.key === "Backspace") && this.sel) { this.net.remove(this.sel); this.sel = null; this.render(); this.changed(); } });
    this.render();
  }
  changed() { this.onChange?.(); }
  pt(e) { const r = this.area.getBoundingClientRect(), v = this.view; return [(e.clientX - r.left - v.x) / v.k, (e.clientY - r.top - v.y) / v.k]; }
  place() { const v = this.view; this.world.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.k})`; }
  add(type) {
    const r = this.area.getBoundingClientRect(), v = this.view, n = this.net.add(type, (r.width / 2 - v.x) / v.k - NW / 2 + Math.random() * 30, (r.height / 2 - v.y) / v.k - 40 + Math.random() * 30);
    this.sel = n?.id; this.render(); this.changed();
  }
  fit() {
    const ns = this.net.nodes; if (!ns.length) return;
    const r = this.area.getBoundingClientRect(), x0 = Math.min(...ns.map(n => n.x)), y0 = Math.min(...ns.map(n => n.y));
    const x1 = Math.max(...ns.map(n => n.x + NW)), y1 = Math.max(...ns.map(n => n.y + this.h(n)));
    const k = Math.min(1.2, Math.max(0.3, Math.min((r.width - 30) / (x1 - x0), (r.height - 30) / (y1 - y0))));
    this.view = { k, x: (r.width - (x1 - x0) * k) / 2 - x0 * k, y: (r.height - (y1 - y0) * k) / 2 - y0 * k }; this.place();
  }
  h(n) { return HEAD + ROW * Math.max(1, this.net.ins(n).length, this.net.outs(n).length) + 8 + (this.viewOf(n) ? VIEW : 0); }
  // Which viewer an operator shows: the liquid (TOPs), the projector (Heart Out), or a trace of its first value (CHOPs).
  viewOf(n) { const op = this.net.ops[n.type], o = op.outs[0]; return op.view || (o && !o[1] ? "chop" : null); }
  render() {
    const N = this.net;
    this.box.innerHTML = N.nodes.map(n => {
      const op = N.ops[n.type], fam = FAMS[op.fam], ins = N.ins(n), outs = N.outs(n), rows = Math.max(1, ins.length, outs.length), pc = t => t === A ? "aud" : t === I ? "img" : "";
      let body = "";
      for (let i = 0; i < rows; i++) {
        const a = ins[i], o = outs[i];
        body += `<div class="wsRow">${a ? `<i class="wsPort in ${pc(a[1])}" data-in="${i}"></i><span>${esc(a[0])}</span>` : "<span></span>"}`
          + `${o ? `<span class="wsOut">${o[1] === I ? "" : `<b data-v="${i}"></b>`}${esc(o[0])}</span><i class="wsPort out ${pc(o[1])}" data-out="${i}"></i>` : ""}</div>`;
      }
      const v = this.viewOf(n);
      return `<div class="wsNode ${n.id === this.sel ? "sel" : ""}" data-id="${n.id}" style="left:${n.x}px;top:${n.y}px;width:${NW}px;--fam:${fam.col}">`
        + `<header title="${esc(op.he)}"><span><i class="wsKind">${fam.op}</i>${esc(op.name)}</span><small>${esc(n.name || "")}</small><button data-del aria-label="מחק">×</button></header>${body}`
        + (v ? `<canvas class="wsView" data-view="${v}" width="148" height="${VIEW - 8}"></canvas>` : "") + `</div>`;
    }).join("");
    this.els = new Map([...this.box.children].map(el => [el.dataset.id, el]));
    this.wires(); this.place(); this.params();
  }
  wires(tmp) {
    const N = this.net, P = (n, side, i) => [n.x + (side ? NW : 0), n.y + portY(i)];
    const path = ([x1, y1], [x2, y2]) => { const d = Math.max(40, Math.abs(x2 - x1) * 0.5); return `M${x1},${y1} C${x1 + d},${y1} ${x2 - d},${y2} ${x2},${y2}`; };
    let s = "";
    N.wires.forEach((w, i) => {
      const a = N.node(w.from[0]), b = N.node(w.to[0]); if (!a || !b) return;
      const t = N.outs(a)[w.from[1]]?.[1], d = path(P(a, 1, w.from[1]), P(b, 0, w.to[1])), col = t === I ? FAMS.top.col : FAMS[N.ops[a.type].fam].col;
      const exp = !t && N.ops[b.type].fam === "top";   // a value exported into a TOP's parameter: dashed, as TouchDesigner draws it
      s += `<path d="${d}" class="hit" data-w="${i}"/><path d="${d}" class="w ${t === A ? "aud" : t === I ? "img" : ""}${exp ? " exp" : ""}" style="stroke:${col}"/>`;
    });
    if (tmp) s += `<path d="${path(tmp[0], tmp[1])}" class="w tmp"/>`;
    this.svg.innerHTML = s;
  }
  // Live values on every output, refreshed by the studio's frame loop while the tab is open.
  show() {
    const now = performance.now(), slow = now - (this.vt || 0) > 120;
    if (slow) { this.vt = now; this.tdImg = null; }
    this.hist ??= new Map();
    for (const n of this.net.nodes) {
      const el = this.els?.get(n.id); if (!el) continue;
      const v = this.net.vals.get(n.id) || [];
      const cv = el.querySelector(".wsView");
      if (cv) {
        const kind = cv.dataset.view, x = cv.getContext("2d"), W = cv.width, H = cv.height;
        if (kind === "chop") {   // a trace of the first value over the last two seconds, as a CHOP viewer
          const h = this.hist.get(n.id) || []; h.push(typeof v[0] === "number" && isFinite(v[0]) ? v[0] : 0); if (h.length > 120) h.shift(); this.hist.set(n.id, h);
          x.fillStyle = "#05070a"; x.fillRect(0, 0, W, H);
          const lo = Math.min(0, ...h), hi = Math.max(1, ...h), Y = q => H - 3 - (q - lo) / (hi - lo || 1) * (H - 6);
          x.strokeStyle = "#1d2430"; x.beginPath(); x.moveTo(0, Y(0)); x.lineTo(W, Y(0)); x.stroke();
          x.strokeStyle = getComputedStyle(el).getPropertyValue("--fam"); x.lineWidth = 1.5; x.beginPath();
          h.forEach((q, i) => i ? x.lineTo(i / 119 * W, Y(q)) : x.moveTo(0, Y(q))); x.stroke();
        } else if (slow && kind === "td") {   // the liquid's heat, shared by the whole TOP chain (it is one simulation)
          if (this.tdImg === null) this.tdImg = this.viewTd?.() || false;
          const im = this.tdImg; x.fillStyle = "#05070a"; x.fillRect(0, 0, W, H);
          if (im && v[0] !== null) { this.tdCv ??= document.createElement("canvas"); this.tdCv.width = im.w; this.tdCv.height = im.h;
            this.tdCv.getContext("2d").putImageData(new ImageData(im.data, im.w, im.h), 0, 0); x.drawImage(this.tdCv, (W - H) / 2, 0, H, H); }
          else { x.fillStyle = "#5c6678"; x.font = "10px sans-serif"; x.textAlign = "center"; x.fillText(v[0] === null ? "אין כניסה" : "—", W / 2, H / 2 + 3); }
        } else if (slow && kind === "out" && this.viewOut) { x.fillStyle = "#000"; x.fillRect(0, 0, W, H); try { x.drawImage(this.viewOut, 0, 0, W, H); } catch {} }
      }
      el.querySelectorAll("[data-v]").forEach(b => { const x = v[+b.dataset.v];
        b.textContent = x == null ? "—" : typeof x === "object" ? `${Math.round(x.lo)}-${Math.round(x.hi)}Hz` : x.toFixed(2);
        b.style.setProperty("--v", typeof x === "number" ? Math.min(1, Math.max(0, x)) : 0); });
      el.classList.toggle("err", !!n.err);
    }
  }
  params() {
    const n = this.net.node(this.sel), P = this.panel;
    if (!n) { P.innerHTML = `<p class="help">בחרו אופרטור כדי לראות את הפרמטרים שלו. הוספה מהסרגל למעלה, חיבור בגרירה מיציאה (ימין) לכניסה (שמאל), ניתוק בלחיצה על חוט.</p>`; return; }
    const op = this.net.ops[n.type];
    P.innerHTML = `<h3 style="color:${FAMS[op.fam].col}">${esc(op.name)}</h3><p class="help">${esc(op.he)}</p>` + op.params().map(q => {
      const v = n.p[q.k], id = `wp_${q.k}`;
      if (q.t === "f") return `<div class="sl"><label for="${id}">${esc(q.l)}</label><input type="range" id="${id}" data-k="${q.k}" min="${q.min}" max="${q.max}" step="${q.step}" value="${v}"><output>${+(+v).toFixed(3)}</output></div>`;
      if (q.t === "m") return `<div class="grid2"><label>${esc(q.l)}<select data-k="${q.k}">${q.o.map(([k, l]) => `<option value="${esc(k)}"${String(k) === String(v) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label></div>`;
      return `<label class="row help"><input type="checkbox" data-k="${q.k}"${v ? " checked" : ""}> ${esc(q.l)}</label>`;
    }).join("");
    P.oninput = P.onchange = e => {
      const el = e.target, k = el.dataset.k; if (!k) return;
      n.p[k] = el.type === "checkbox" ? el.checked : el.type === "range" ? +el.value : el.value;
      if (el.type === "range") el.nextElementSibling.textContent = +(+el.value).toFixed(3);
      this.changed();
    };
  }
  down(e) {
    const t = e.target, nodeEl = t.closest(".wsNode");
    this.area.focus({ preventScroll: true });
    if (t.dataset.del != null && nodeEl) { this.net.remove(nodeEl.dataset.id); this.sel = null; this.render(); this.changed(); return; }
    if (t.dataset.out != null && nodeEl) { const n = this.net.node(nodeEl.dataset.id); this.drag = { kind: "wire", from: [n.id, +t.dataset.out], p0: [n.x + NW, n.y + portY(+t.dataset.out)] }; }
    else if (t.dataset.in != null && nodeEl) {   // pulling a wire off an input picks it up again from its source
      const w = this.net.wires.find(w => w.to[0] === nodeEl.dataset.id && w.to[1] === +t.dataset.in); if (!w) return;
      this.net.wires = this.net.wires.filter(x => x !== w); const n = this.net.node(w.from[0]);
      this.drag = { kind: "wire", from: w.from, p0: [n.x + NW, n.y + portY(w.from[1])] }; this.changed();
    } else if (t.closest("header") && nodeEl) {
      const n = this.net.node(nodeEl.dataset.id), [x, y] = this.pt(e);
      this.drag = { kind: "node", n, dx: x - n.x, dy: y - n.y };
      if (this.sel !== n.id) { this.sel = n.id; this.box.querySelectorAll(".wsNode").forEach(el => el.classList.toggle("sel", el === nodeEl)); this.params(); }
    } else if (nodeEl) { if (this.sel !== nodeEl.dataset.id) { this.sel = nodeEl.dataset.id; this.render(); } return; }
    else if (t.classList.contains("hit")) { this.net.wires.splice(+t.dataset.w, 1); this.wires(); this.changed(); return; }
    else { this.drag = { kind: "pan", x: e.clientX - this.view.x, y: e.clientY - this.view.y }; if (this.sel) { this.sel = null; this.render(); } }
    this.area.setPointerCapture(e.pointerId);
  }
  move(e) {
    const d = this.drag; if (!d) return;
    if (d.kind === "pan") { this.view.x = e.clientX - d.x; this.view.y = e.clientY - d.y; this.place(); }
    else if (d.kind === "node") { const [x, y] = this.pt(e); d.n.x = Math.round(x - d.dx); d.n.y = Math.round(y - d.dy); const el = this.els.get(d.n.id); el.style.left = d.n.x + "px"; el.style.top = d.n.y + "px"; this.wires(); }
    else if (d.kind === "wire") this.wires([d.p0, this.pt(e)]);
  }
  up(e) {
    const d = this.drag; this.drag = null; if (!d) return;
    if (d.kind === "wire") {
      const t = document.elementFromPoint(e.clientX, e.clientY), port = t?.closest?.("[data-in]"), nodeEl = t?.closest?.(".wsNode");
      if (port && nodeEl && !this.net.connect(d.from, [nodeEl.dataset.id, +port.dataset.in])) this.onWarn?.("אפשר לחבר סאונד רק לסאונד, וערך רק לערך");
      this.wires(); this.changed();
    } else if (d.kind === "node") this.changed();
  }
}
