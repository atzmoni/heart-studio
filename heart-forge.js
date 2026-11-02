// Element studio ("סטודיו אלמנטים"): design your own element or installation, not only the heart, and send it to production.
// A design is a list of parts on the same 240 x 240 cm board the studio maps (cm, origin top-left, y down). Every part is a
// closed outline (with optional holes) made one of four ways: a ready shape, free drawing, drafting point by point with exact
// coordinates and lengths, or tracing a photo from the camera. Inside the parts the grooves (the channels the light lives in,
// 2 cm wide by default) are laid out by the same model the effects use (heart-geo.js rebuild), so whatever is cut is exactly
// what is lit. Applying a design hands it to heart-elements.js as the "custom" element, and every effect maps onto it.
// The 3D view shows the element as built (parts as raised boards, grooves milled in), on a wall over a floor, with light
// running in the grooves. Production files: DXF (cut + grooves on layers, mm), G-code (grooves + profile cut), HPGL .plt,
// SVG plan, an LED map for LEDLAB (pixels along every groove), and one zip package with a job sheet for the DXF-TLV workshop.
import * as G from "./heart-geo.js?v=1";
import { ELEMENTS, ELEMENT_BASE, partsOf, setCustom } from "./heart-elements.js?v=1";

const KEY = "heartstudio.forge";
const SZ = G.SIZE, RES = G.RES, MARGIN = G.MARGIN;
const rad = a => a * Math.PI / 180, r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const clone = o => JSON.parse(JSON.stringify(o));

export const PATTERNS = {
  concentric: "במקביל לקונטור (מרווח קבוע)",
  scaled: "מוקטנים אל המרכז",
  parallel: "פסים ישרים",
  chevron: "שברונים",
  radial: "קרניים",
};

export const DEFAULT_DESIGN = {
  name: "האלמנט שלי",
  maker: "", phone: "", notes: "",
  parts: [],
  groove: { pattern: "concentric", width: 2, pitch: 6, depth: 10, count: 6, angle: 90, edge: 1.2, joint: 2.5 },
  material: { name: "MDF", thickness: 18, tool: 6, feed: 1800, plunge: 400, step: 4, safe: 5, leds: 60 },
  mount: 40,          // cm from the floor to the bottom of the board, for the 3D stage
  underlay: null,     // { src, x, y, w, h, op } photo or camera frame to trace, cm
};

// ---------- shapes, in a unit box (-0.5..0.5, y down) ----------
const poly = (n, a0 = -90) => Array.from({ length: n }, (_, i) => [0.5 * Math.cos(rad(a0 + i * 360 / n)), 0.5 * Math.sin(rad(a0 + i * 360 / n))]);
const circ = (r = 0.5, n = 120) => Array.from({ length: n }, (_, i) => [r * Math.cos(i * 2 * Math.PI / n), r * Math.sin(i * 2 * Math.PI / n)]);
function roundRect(r = 0.12, n = 10) {
  const o = [], c = [[0.5 - r, -0.5 + r, -90], [0.5 - r, 0.5 - r, 0], [-0.5 + r, 0.5 - r, 90], [-0.5 + r, -0.5 + r, 180]];
  for (const [x, y, a] of c) for (let i = 0; i <= n; i++) o.push([x + r * Math.cos(rad(a + i * 90 / n)), y + r * Math.sin(rad(a + i * 90 / n))]);
  return o;
}
function normBox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const w = Math.max(1e-6, x1 - x0), h = Math.max(1e-6, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { w, h, x: cx, y: cy, map: p => [(p[0] - cx) / w, (p[1] - cy) / h] };
}
const unit = pts => { const b = normBox(pts); return pts.map(b.map); };
const star = (n = 5, k = 0.42) => Array.from({ length: n * 2 }, (_, i) => { const r = i % 2 ? 0.5 * k : 0.5, a = rad(-90 + i * 180 / n); return [r * Math.cos(a), r * Math.sin(a)]; });
export const SHAPE_LIB = {
  heart: { name: "לב", icon: "❤", make: () => [unit(G.resample(G.outline("classic"), 240, true))] },
  circle: { name: "עיגול", icon: "●", make: () => [circ()] },
  ring: { name: "טבעת", icon: "◯", make: () => [circ(), circ(0.3)] },
  rect: { name: "מלבן", icon: "■", make: () => [[[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]] },
  rrect: { name: "מלבן מעוגל", icon: "▢", make: () => [roundRect()] },
  frame: { name: "מסגרת", icon: "▣", make: () => [[[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], [[-0.32, -0.32], [-0.32, 0.32], [0.32, 0.32], [0.32, -0.32]]] },
  tri: { name: "משולש", icon: "▲", make: () => [unit(poly(3))] },
  diamond: { name: "מעוין", icon: "◆", make: () => [[[0, -0.5], [0.5, 0], [0, 0.5], [-0.5, 0]]] },
  hex: { name: "משושה", icon: "⬢", make: () => [unit(poly(6, 0))] },
  oct: { name: "מתומן", icon: "⯃", make: () => [unit(poly(8, 22.5))] },
  star: { name: "כוכב", icon: "★", make: () => [unit(star())] },
  arch: { name: "קשת", icon: "⌒", make: () => [unit([...Array.from({ length: 61 }, (_, i) => [Math.cos(Math.PI + i * Math.PI / 60), Math.sin(Math.PI + i * Math.PI / 60)]), [1, 1.6], [-1, 1.6]])] },
  drop: { name: "טיפה", icon: "💧", make: () => [unit(Array.from({ length: 120 }, (_, i) => { const t = i / 120 * 2 * Math.PI; return [Math.sin(t) * Math.pow(Math.sin(t / 2), 1.2), -Math.cos(t)]; }))] },
};

// ---------- parts ----------
// A part: { id, name, u: [outerUnit, ...holesUnit] in the unit box, x, y (centre, cm), w, h (cm), rot (deg), h3 (board thickness, mm) }.
let nid = 1;
const newId = () => "p" + Date.now().toString(36) + (nid++);
export function makePart(u, box, name, extra = {}) { return { id: newId(), name, u, x: r1(box.x), y: r1(box.y), w: r1(box.w), h: r1(box.h), rot: 0, h3: null, ...extra }; }
export function loopsOf(p) {
  const c = Math.cos(rad(p.rot || 0)), s = Math.sin(rad(p.rot || 0));
  return p.u.map(l => l.map(([u, v]) => { const X = u * p.w, Y = v * p.h; return [p.x + X * c - Y * s, p.y + X * s + Y * c]; }));
}
function toUnit(p, x, y) {
  const c = Math.cos(rad(p.rot || 0)), s = Math.sin(rad(p.rot || 0)), X = x - p.x, Y = y - p.y;
  return [(X * c + Y * s) / p.w, (-X * s + Y * c) / p.h];
}
const inPoly = (pl, x, y) => {
  let c = false;
  for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) {
    const [xi, yi] = pl[i], [xj, yj] = pl[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const hitPart = (p, x, y) => { const [u, v] = toUnit(p, x, y); return inPoly(p.u[0], u, v) && !p.u.slice(1).some(h => inPoly(h, u, v)); };
const area = pl => Math.abs(pl.reduce((s, [x, y], i) => { const [x2, y2] = pl[(i + 1) % pl.length]; return s + x * y2 - x2 * y; }, 0) / 2);
function fromWorld(loops, name, extra) {
  const b = normBox(loops[0]);
  return makePart(loops.map(l => l.map(b.map)), b, name, extra);
}
// Ramer-Douglas-Peucker, for strokes and traced outlines.
// A closed loop (first point = last, or flagged) is split at its farthest point and each half simplified.
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  if (Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 1e-6) {
    let fi = 0, fd = -1; pts.forEach((q, i) => { const dd = Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]); if (dd > fd) { fd = dd; fi = i; } });
    if (fi < 2 || fi > pts.length - 3) return pts;
    return simplifyOpen(pts.slice(0, fi + 1), tol).concat(simplifyOpen(pts.slice(fi), tol).slice(1));
  }
  return simplifyOpen(pts, tol);
}
function simplifyOpen(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function chaikin(pts, it = 2) {
  for (let k = 0; k < it; k++) {
    const o = [];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
    pts = o;
  }
  return pts;
}

// ---------- design -> the studio's model ----------
export function loadDesign() { try { const d = JSON.parse(localStorage.getItem(KEY)); return d?.parts ? fixDesign(d) : null; } catch { return null; } }
function saveDesign(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); }
  catch { try { localStorage.setItem(KEY, JSON.stringify({ ...d, underlay: null })); } catch {} }   // a big photo may not fit; keep the parts
}
function fixDesign(d) {
  const o = { ...clone(DEFAULT_DESIGN), ...d };
  o.groove = { ...DEFAULT_DESIGN.groove, ...d.groove }; o.material = { ...DEFAULT_DESIGN.material, ...d.material };
  o.parts = (d.parts || []).filter(p => p.u?.[0]?.length > 2);
  return o;
}
// What the custom element is made of (heart-elements.js partsOf numbers and finishes them).
export const designParts = d => d.parts.slice(0, 64).map(p => ({ name: p.name, loops: loopsOf(p), h3: p.h3 }));
// The groove settings of the design, as the studio's cfg. Spaced designs (concentric, straight, chevron) get explicit levels,
// so the grooves stay exactly `pitch` cm apart whatever the size of the parts.
export function designPreset(d, field) {
  const g = d.groove, base = { ...G.DEFAULTS, ...ELEMENT_BASE, pattern: g.pattern, width: +g.width, edge: +g.edge, joint: +g.joint, angle: +g.angle, count: +g.count, inner: 0.2, outer: 0.9, levels: null, seam: 0, rim: 0 };
  if (!field || g.pattern === "scaled" || g.pattern === "radial") return base;
  const [lo, hi] = G.phiRange(base, field), p = Math.max(0.5, +g.pitch), lev = [];
  if (g.pattern === "concentric") for (let L = p; L < hi - Math.min(p / 2, g.width / 2 + 0.3) && lev.length < 63; L += p) lev.push(r2(L));
  else {
    const n = Math.min(63, Math.max(0, Math.floor((hi - lo) / p)));
    const s = lo + ((hi - lo) - (n - 1) * p) / 2;
    for (let k = 0; k < n; k++) lev.push(r2(s + k * p));
  }
  base.levels = lev; base.count = lev.length;
  return base;
}
// Builds the model exactly as the studio does for the "custom" element: partsOf -> distanceField(parts, joint) -> rebuild.
export function buildModel(d) {
  if (!d.parts.length) return null;
  const preset0 = designPreset(d);
  setCustom(designParts(d), preset0);
  const parts = partsOf("custom"), field = G.distanceField(parts, preset0.joint);
  const cfg = designPreset(d, field);
  setCustom(designParts(d), cfg);
  const model = G.rebuild(cfg, parts[0].loops[0], field);
  model.forgeParts = parts;
  return model;
}

// ---------- production files ----------
const MM = 10;   // cm -> mm
const X = x => r2(x * MM), Y = y => r2((SZ - y) * MM);   // machine coordinates: mm, origin bottom-left, y up
function dxfPolyline(o, layer, pts, closed) {
  o.push("0", "POLYLINE", "8", layer, "66", "1", "70", closed ? "1" : "0", "10", "0", "20", "0", "30", "0");
  for (const [x, y] of pts) o.push("0", "VERTEX", "8", layer, "10", X(x), "20", Y(y), "30", "0");
  o.push("0", "SEQEND", "8", layer);
}
const closedLine = p => p.length > 2 && Math.hypot(p[0][0] - p.at(-1)[0], p[0][1] - p.at(-1)[1]) < 0.05;
// DXF R12 (opens in every CAD/CAM): mm, y up. Layers: CUT (through-cut outlines), GROOVE_W<width>_D<depth> (groove centre
// lines, milled with a cutter of the groove's width), LABELS (part numbers), BOARD (the 240 cm frame, for reference).
export function toDXF(model, d) {
  const g = d.groove, gl = `GROOVE_W${Math.round(g.width * 10)}MM_D${Math.round(g.depth)}MM`;
  const layers = [["CUT", 1], [gl, 5], ["LABELS", 3], ["BOARD", 8]];
  const o = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "9", "$INSUNITS", "70", "4", "9", "$MEASUREMENT", "70", "1",
    "9", "$EXTMIN", "10", "0", "20", "0", "9", "$EXTMAX", "10", String(SZ * MM), "20", String(SZ * MM), "0", "ENDSEC",
    "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", String(layers.length)];
  for (const [n, c] of layers) o.push("0", "LAYER", "2", n, "70", "0", "62", String(c), "6", "CONTINUOUS");
  o.push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES");
  dxfPolyline(o, "BOARD", [[0, 0], [SZ, 0], [SZ, SZ], [0, SZ]], true);
  for (const p of model.partLines) dxfPolyline(o, "CUT", closedLine(p) ? p.slice(0, -1) : p, true);
  for (const gr of model.grooves) for (const p of gr.pieces) dxfPolyline(o, gl, closedLine(p) ? p.slice(0, -1) : p, closedLine(p));
  model.parts.forEach((p, i) => o.push("0", "TEXT", "8", "LABELS", "10", X(p.c[0]), "20", Y(p.c[1]), "30", "0", "40", "40", "1", String(i + 1)));
  o.push("0", "ENDSEC", "0", "EOF");
  return o.join("\r\n") + "\r\n";
}
// HPGL for plotters, vinyl/laser cutters and many CNC controllers: 40 units per mm. Pen 1 = cut, pen 2 = grooves.
export function toPLT(model) {
  const u = v => Math.round(v * MM * 40), o = ["IN;", "PA;"];
  const path = p => { o.push(`PU${u(p[0][0])},${u(SZ - p[0][1])};`); o.push("PD" + p.slice(1).map(q => `${u(q[0])},${u(SZ - q[1])}`).join(",") + ";"); };
  o.push("SP2;"); for (const g of model.grooves) for (const p of g.pieces) path(p);
  o.push("SP1;"); for (const p of model.partLines) path([...p, p[0]]);
  o.push("PU;SP0;");
  return o.join("\n") + "\n";
}
// The order a cutter visits paths: nearest next start, so the machine doesn't cross the board for every groove.
function orderPaths(paths) {
  const out = [], left = paths.slice(); let at = [0, SZ];
  while (left.length) {
    let bi = 0, bd = Infinity, rev = false;
    left.forEach((p, i) => {
      const a = Math.hypot(p[0][0] - at[0], p[0][1] - at[1]), b = p.closed ? Infinity : Math.hypot(p.at(-1)[0] - at[0], p.at(-1)[1] - at[1]);
      if (a < bd) { bd = a; bi = i; rev = false; } if (b < bd) { bd = b; bi = i; rev = true; }
    });
    let p = left.splice(bi, 1)[0]; if (rev) { const c = p.closed; p = p.slice().reverse(); p.closed = c; }
    out.push(p); at = p.at(-1);
  }
  return out;
}
// G-code (mm, absolute, origin = bottom-left corner of the 240 cm board, Z0 = top of the board):
// 1. every groove along its centre line, in steps down to the groove depth (a cutter as wide as the groove);
// 2. every part cut out, the tool outside the outline (offset by its radius, holes inside), down through the board.
export function toGcode(model, d) {
  const m = d.material, g = d.groove, R = m.tool / 2 / MM, f = v => (+v).toFixed(2);
  const o = [`(${d.name} - heart-studio element studio - for DXF-TLV)`, `(board ${SZ * MM} x ${SZ * MM} mm, material ${m.name} ${m.thickness} mm, tool D${m.tool} mm)`,
    `(grooves: width ${g.width * MM} mm, depth ${g.depth} mm; cut-through: ${m.thickness} mm. NO TABS - hold the parts down or add tabs in CAM)`,
    "G21 G90 G17", `G0 Z${f(m.safe)}`, "M3 S18000"];
  const passes = depth => { const n = Math.max(1, Math.ceil(depth / Math.max(0.5, m.step))); return Array.from({ length: n }, (_, i) => -depth * (i + 1) / n); };
  const run = (paths, depth) => {
    for (const p of orderPaths(paths)) {
      o.push(`G0 X${f(X(p[0][0]))} Y${f(Y(p[0][1]))}`);
      for (const z of passes(depth)) {
        o.push(`G1 Z${f(z)} F${m.plunge}`);
        const seq = p.closed || closedLine(p) ? p.slice(1).concat([p[0]]) : p.slice(1);
        o.push(`G1 X${f(X(seq[0][0]))} Y${f(Y(seq[0][1]))} F${m.feed}`);
        for (const q of seq.slice(1)) o.push(`X${f(X(q[0]))} Y${f(Y(q[1]))}`);
        if (!(p.closed || closedLine(p))) { o.push(`G0 Z${f(m.safe)}`); if (z > -depth + 1e-6) o.push(`G0 X${f(X(p[0][0]))} Y${f(Y(p[0][1]))}`); }
      }
      o.push(`G0 Z${f(m.safe)}`);
    }
  };
  o.push("(--- grooves ---)");
  run(model.grooves.flatMap(gr => gr.pieces.map(p => { const q = simplify(p, 0.02); q.closed = closedLine(p); return q; })), +g.depth);
  o.push("(--- profile cut ---)");
  const prof = G.isolines(model.field.d, model.field.N, -R).filter(l => l.closed).map(l => { const q = simplify(l.pts, 0.02); q.closed = true; return q; });
  run(prof, +m.thickness + 0.5);
  o.push(`G0 Z${f(m.safe + 20)}`, "M5", "G0 X0 Y0", "M30");
  return o.join("\n") + "\n";
}
// Path lengths, for the job sheet (cm).
function lengths(model, d) {
  const groove = model.grooves.reduce((s, g) => s + g.length, 0), cut = model.perimeter;
  const passes = v => Math.max(1, Math.ceil(v / Math.max(0.5, d.material.step)));
  const minutes = (groove * MM * passes(d.groove.depth) + cut * MM * passes(d.material.thickness + 0.5)) / d.material.feed;
  return { groove, cut, minutes };
}
// LEDs along every groove (the grooves hold LED strip): wiring order groove by groove, piece by piece; positions in -1..1
// like LEDLAB's map files (Pixelblaze format), with the centimetres and the groove name next to them in the CSV.
export function ledMap(model, d) {
  const per = Math.max(1, d.material.leds) / 100, out = [];
  model.grooves.forEach((g, k) => g.pieces.forEach((p, i) => {
    const L = G.polyLength(p), n = Math.max(1, Math.floor(L * per));
    let j = 0, acc = 0;
    for (let s = 0; s < n; s++) {
      const t = (s + 0.5) / per;
      while (j < p.length - 2 && acc + Math.hypot(p[j + 1][0] - p[j][0], p[j + 1][1] - p[j][1]) < t) { acc += Math.hypot(p[j + 1][0] - p[j][0], p[j + 1][1] - p[j][1]); j++; }
      const sl = Math.hypot(p[j + 1][0] - p[j][0], p[j + 1][1] - p[j][1]) || 1, a = Math.min(1, (t - acc) / sl);
      out.push({ x: p[j][0] + (p[j + 1][0] - p[j][0]) * a, y: p[j][1] + (p[j + 1][1] - p[j][1]) * a, groove: G.pieceName(g, i), ch: G.CH.groove + k * 2 });
    }
  }));
  const r3 = v => Math.round(v * 1000) / 1000;
  return {
    json: { name: d.name, count: out.length, ledsPerMeter: d.material.leds, unit: "map in -1..1 (x right, y up); cm in the CSV", map: out.map(q => [r3(q.x / (SZ / 2) - 1), r3(1 - q.y / (SZ / 2)), 0]),
      segments: model.grooves.flatMap(g => g.pieces.map((p, i) => G.pieceName(g, i))) },
    csv: "﻿index,x_cm,y_cm,groove,channel\n" + out.map((q, i) => [i, r1(q.x), r1(q.y), q.groove, q.ch].join(",")).join("\n"),
  };
}
// Job sheet for the workshop: what to cut, from what, how deep, with which files.
export function jobSheet(model, d, files) {
  const L = lengths(model, d), m = d.material, g = d.groove, date = new Date().toLocaleDateString("he-IL");
  const rows = d.parts.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td>${r1(p.w)} × ${r1(p.h)}</td><td>${r2(area(loopsOf(p)[0]) / 1e4)}</td><td>${p.h3 || m.thickness}</td></tr>`).join("");
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>דף עבודה · ${esc(d.name)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:820px;margin:24px auto;padding:0 16px;color:#111}h1{margin:0}small{color:#666}table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid #ccc;padding:4px 8px;text-align:start}th{background:#f3f3f3}.k{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px}.k div{border:1px solid #ddd;border-radius:8px;padding:8px}.k b{display:block;font-size:20px}img{max-width:100%;border:1px solid #ddd;border-radius:8px}</style></head><body>
<h1>DXF-TLV · דף עבודה לייצור</h1><small>בית המלאכה השיתופי · יצירה, ייצור, שיחה, חוויה ושיתוף · ${date}</small>
<h2>${esc(d.name)}</h2>
<p>יוצר/ת: <b>${esc(d.maker) || "—"}</b> · טלפון: <b>${esc(d.phone) || "—"}</b></p>
${d.notes ? `<p>${esc(d.notes)}</p>` : ""}
<div class="k"><div>לוח<b>${SZ} × ${SZ} ס״מ</b></div><div>חומר<b>${esc(m.name)} ${m.thickness} מ״מ</b></div><div>חלקים<b>${d.parts.length}</b></div>
<div>תעלות<b>${model.grooves.length} · ${g.width * MM} מ״מ רוחב · ${g.depth} מ״מ עומק</b></div><div>אורך תעלות<b>${r1(L.groove / 100)} מ׳</b></div><div>אורך חיתוך<b>${r1(L.cut / 100)} מ׳</b></div>
<div>כרסום משוער<b>≈ ${Math.ceil(L.minutes)} דק׳</b></div><div>כלי<b>Ø${m.tool} מ״מ · F${m.feed}</b></div></div>
<h3>חלקים</h3><table><tr><th>#</th><th>שם</th><th>רוחב × גובה (ס״מ)</th><th>שטח (מ״ר)</th><th>עובי (מ״מ)</th></tr>${rows}</table>
<h3>הוראות</h3><ol><li>פתחו את <b>design.dxf</b> (מ״מ, ראשית בפינה השמאלית התחתונה). שכבת CUT היא חיתוך מלא, שכבת GROOVE היא קווי המרכז של התעלות: כרסום ברוחב ${g.width * MM} מ״מ לעומק ${g.depth} מ״מ.</li>
<li>אפשר גם להריץ ישירות את <b>design.nc</b> (G-code): קודם תעלות, אחר כך חיתוך החלקים מבחוץ לקו. אין גשרים (tabs): להדק את החלקים או להוסיף גשרים ב-CAM.</li>
<li>המרווח בין חלקים הוא ${g.joint * MM} מ״מ, כך שהחלקים נחתכים בלי לגעת זה בזה.</li>
<li>התעלות הן בדיוק התעלות שהסטודיו ממפה עליהן אור (מקרן) ולדים (led-map.json, ${m.leds} לדים למטר).</li></ol>
<h3>קבצים</h3><ul>${files.map(f => `<li>${esc(f)}</li>`).join("")}</ul>
<p><img src="preview-3d.png" alt="הדמיה בתלת ממד"> <img src="plan.svg" alt="תוכנית"></p>
</body></html>`;
}

// ---------- zip (stored, no compression: plenty for text and two pictures) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function zip(files) {
  const enc = new TextEncoder(), chunks = [], cen = []; let off = 0;
  for (const [name, data] of files) {
    const nb = enc.encode(name), db = typeof data === "string" ? enc.encode(data) : data, c = crc32(db);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint32(14, c, true);
    h.setUint32(18, db.length, true); h.setUint32(22, db.length, true); h.setUint16(26, nb.length, true);
    chunks.push(new Uint8Array(h.buffer), nb, db);
    const e = new DataView(new ArrayBuffer(46));
    e.setUint32(0, 0x02014b50, true); e.setUint16(4, 20, true); e.setUint16(6, 20, true); e.setUint16(8, 0x800, true); e.setUint32(16, c, true);
    e.setUint32(20, db.length, true); e.setUint32(24, db.length, true); e.setUint16(28, nb.length, true); e.setUint32(42, off, true);
    cen.push(new Uint8Array(e.buffer), nb);
    off += 30 + nb.length + db.length;
  }
  const cl = cen.reduce((s, b) => s + b.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cl, true); end.setUint32(16, off, true);
  return new Blob([...chunks, ...cen, new Uint8Array(end.buffer)], { type: "application/zip" });
}

// ---------- 3D view: the element as built, on a wall over a floor, light running in the grooves ----------
const M4 = {
  mul(a, b) { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; },
  persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; },
  look(e, c, up) {
    const z = norm([e[0] - c[0], e[1] - c[1], e[2] - c[2]]), x = norm(cross(up, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
  },
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
const VS = `#version 300 es
in vec3 p; in vec3 n; in vec3 i; uniform mat4 mvp; out vec3 vn; out vec3 vi; out vec3 vp;
void main(){ vn=n; vi=i; vp=p; gl_Position=mvp*vec4(p,1.); }`;
const FS = `#version 300 es
precision highp float; in vec3 vn; in vec3 vi; in vec3 vp; uniform float t, glow, lvl; uniform vec3 mat; out vec4 o;
vec3 hue(float h){ return clamp(abs(mod(h*6.+vec3(0,4,2),6.)-3.)-1.,0.,1.); }
void main(){
  vec3 N=normalize(vn), L=normalize(vec3(.4,.7,.9)), L2=normalize(vec3(-.6,.3,.5));
  float dif=max(dot(N,L),0.)*.75+max(dot(N,L2),0.)*.3+.22;
  vec3 c;
  if(vi.x<-.5){ // floor: grid every metre
    vec2 g=abs(fract(vp.xz/100.)-.5); float ln=step(.495,max(g.x,g.y)); c=mix(vec3(.08,.09,.11),vec3(.2,.23,.28),ln); }
  else if(vi.y<.5) c=vec3(.13,.14,.17)*dif;           // the wall behind
  else c=mat*dif;                                       // the boards
  if(vi.x>.5 && vi.y>.5){ // inside a groove
    float k=fract(vi.z*.025-t*.25), pulse=.55+.45*sin(vi.z*.35-t*4.);
    c=mix(c*.55, hue(k)*(1.2+lvl*2.), glow*pulse); }
  o=vec4(pow(c,vec3(.9)),1.);
}`;
export class Viewer3D {
  constructor(canvas) {
    this.c = canvas; const gl = this.gl = canvas.getContext("webgl2", { antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error("אין WebGL2 בדפדפן הזה, אין הדמיית תלת ממד");
    const sh = (ty, s) => { const o = gl.createShader(ty); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pr = this.pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    this.u = Object.fromEntries(["mvp", "t", "glow", "lvl", "mat"].map(k => [k, gl.getUniformLocation(pr, k)]));
    this.yaw = -0.5; this.pitch = 0.18; this.dist = 520; this.glow = 1; this.mat = [0.93, 0.92, 0.9]; this.level = () => 0;
    let drag = null;
    canvas.addEventListener("pointerdown", e => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", e => { if (!drag) return; this.yaw += (e.clientX - drag[0]) * 0.008; this.pitch = Math.max(-0.2, Math.min(1.4, this.pitch + (e.clientY - drag[1]) * 0.006)); drag = [e.clientX, e.clientY]; });
    canvas.addEventListener("pointerup", () => drag = null);
    canvas.addEventListener("wheel", e => { e.preventDefault(); this.dist = Math.max(120, Math.min(1600, this.dist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
  }
  // Heights on the field grid: a part's own board thickness (mm) inside it, minus the groove depth where a groove runs.
  build(model, d) {
    const gl = this.gl, { N, d: dist, pid } = model.field, S = N;
    const gc = document.createElement("canvas"); gc.width = gc.height = S;
    const x = gc.getContext("2d", { willReadFrequently: true });
    x.setTransform(RES, 0, 0, RES, MARGIN * RES, MARGIN * RES); x.strokeStyle = "#fff"; x.lineWidth = d.groove.width; x.lineCap = "round"; x.lineJoin = "round";
    for (const g of model.grooves) for (const p of g.pieces) { x.beginPath(); p.forEach((q, i) => i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])); x.stroke(); }
    const gm = x.getImageData(0, 0, S, S).data;
    const ph = model.forgeParts.map(p => (p.h3 || d.material.thickness) / MM), depth = d.groove.depth / MM, H = new Float32Array(S * S), G1 = new Float32Array(S * S);
    for (let k = 0; k < S * S; k++) {
      if (dist[k] <= 0) continue;
      const part = model.multi ? pid[k] & 127 : 0, top = ph[part] ?? ph[0];
      G1[k] = gm[k * 4] / 255; H[k] = top - G1[k] * Math.min(depth, top * 0.95);
    }
    const nv = S * S + 4, P = new Float32Array(nv * 3), Nn = new Float32Array(nv * 3), I = new Float32Array(nv * 3), base = d.mount;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const k = j * S + i, cx = i / RES - MARGIN, cy = j / RES - MARGIN;
      P[k * 3] = cx - SZ / 2; P[k * 3 + 1] = base + SZ - cy; P[k * 3 + 2] = H[k];
      const hx = (H[j * S + Math.min(S - 1, i + 1)] - H[j * S + Math.max(0, i - 1)]) * RES / 2, hy = (H[Math.min(S - 1, j + 1) * S + i] - H[Math.max(0, j - 1) * S + i]) * RES / 2;
      const n = norm([-hx, hy, 1]); Nn[k * 3] = n[0]; Nn[k * 3 + 1] = n[1]; Nn[k * 3 + 2] = n[2];
      I[k * 3] = G1[k] > 0.4 ? 1 : 0; I[k * 3 + 1] = dist[k] > 0 ? 1 : 0; I[k * 3 + 2] = Math.max(0, dist[k]);
    }
    // the floor (4 vertices after the grid)
    const f0 = S * S, fl = [[-600, 0, -40], [600, 0, -40], [600, 0, 700], [-600, 0, 700]];
    fl.forEach((v, q) => { P.set(v, (f0 + q) * 3); Nn.set([0, 1, 0], (f0 + q) * 3); I.set([-1, 0, 0], (f0 + q) * 3); });
    const idx = new Uint32Array((S - 1) * (S - 1) * 6 + 6); let o = 0;
    for (let j = 0; j < S - 1; j++) for (let i = 0; i < S - 1; i++) { const a = j * S + i; idx.set([a, a + S, a + 1, a + 1, a + S, a + S + 1], o); o += 6; }
    idx.set([f0, f0 + 1, f0 + 2, f0, f0 + 2, f0 + 3], o);
    this.count = idx.length;
    gl.useProgram(this.pr);
    this.vao ??= gl.createVertexArray(); gl.bindVertexArray(this.vao);
    const buf = (name, arr) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); const l = gl.getAttribLocation(this.pr, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0); return b; };
    (this.bufs || []).forEach(b => gl.deleteBuffer(b));
    this.bufs = [buf("p", P), buf("n", Nn), buf("i", I)];
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW); this.bufs.push(ib);
    this.target = [0, base + SZ / 2, 0];
  }
  draw(t) {
    const gl = this.gl, c = this.c, w = c.clientWidth * devicePixelRatio | 0, h = c.clientHeight * devicePixelRatio | 0;
    if (!w || !h || !this.count) return;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    gl.viewport(0, 0, w, h); gl.clearColor(0.03, 0.035, 0.05, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
    const T = this.target, e = [T[0] + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist, T[1] + Math.sin(this.pitch) * this.dist, T[2] + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist];
    gl.useProgram(this.pr); gl.bindVertexArray(this.vao);
    gl.uniformMatrix4fv(this.u.mvp, false, M4.mul(M4.persp(0.8, w / h, 5, 5000), M4.look(e, T, [0, 1, 0])));
    gl.uniform1f(this.u.t, t); gl.uniform1f(this.u.glow, this.glow); gl.uniform1f(this.u.lvl, Math.min(1, this.level() || 0)); gl.uniform3fv(this.u.mat, this.mat);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0);
  }
}

// ---------- the editor ----------
const CSS = `
.forge{position:fixed;inset:0;z-index:2000;background:var(--bg,#0d1117);color:var(--fg,#e6ebf2);display:grid;grid-template-rows:auto 1fr;font:14px/1.45 var(--display,system-ui,sans-serif)}
.forge header{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--line,#263041);background:var(--panel,#161c25)}
.forge header h2{margin:0 0 0 auto;font-size:1.05rem;font-weight:800}.forge header h2 small{color:var(--muted,#8592a6);font-weight:400}
.forge button,.forge select,.forge input{font:inherit;color:inherit;background:var(--btn,#1f2734);border:1px solid var(--line,#263041);border-radius:8px;padding:5px 9px;min-height:32px}
.forge input[type=number]{width:74px}.forge input[type=text]{width:100%}.forge input[type=range]{padding:0;min-height:0}
.forge button[aria-pressed=true],.forge .pri{background:var(--accent,#ff4f7b);color:var(--on-accent,#2a0611);border-color:transparent;font-weight:700}
.forge .body{display:grid;grid-template-columns:340px 1fr;min-height:0}
.forge aside{overflow:auto;border-inline-end:1px solid var(--line,#263041);padding:10px;display:grid;gap:10px;align-content:start;background:var(--panel,#161c25)}
.forge details{border:1px solid var(--line,#263041);border-radius:10px;padding:6px 10px;background:var(--bg,#0d1117)}
.forge summary{cursor:pointer;font-weight:700;padding:3px 0}
.forge .g{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0}.forge .g label{display:flex;gap:6px;align-items:center}
.forge .lib{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.forge .lib button{display:grid;font-size:12px;padding:4px}.forge .lib b{font-size:20px;line-height:1.2}
.forge .muted{color:var(--muted,#8592a6);font-size:12.5px;margin:2px 0}
.forge .view{position:relative;min-height:0;overflow:hidden;background:#05070a}
.forge .view canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none}
.forge .hud{position:absolute;inset-inline-start:10px;bottom:10px;background:#0b0f15cc;border:1px solid #263041;border-radius:8px;padding:4px 8px;font:12px var(--mono,monospace);pointer-events:none;direction:ltr}
.forge .stat{position:absolute;inset-inline-end:10px;top:10px;background:#0b0f15cc;border:1px solid #263041;border-radius:8px;padding:6px 10px;font-size:12.5px;max-width:60%}
.forge video{width:100%;border-radius:8px;background:#000}
.forge .parts{display:grid;gap:3px;max-height:180px;overflow:auto}.forge .parts button{text-align:start}
@media (max-width:760px){.forge .body{grid-template-columns:1fr;grid-template-rows:55vh auto}.forge aside{order:2;border:0}.forge .view{order:1}}
`;
const TOOLS = { select: "↖ בחירה והזזה", draw: "✍ ציור חופשי", points: "📐 שרטוט בנקודות", measure: "📏 כיול תמונה" };

export class Forge {
  constructor() { this.d = loadDesign() || clone(DEFAULT_DESIGN); this.hist = []; this.fut = []; this.tool = "select"; this.sel = null; this.snap = 1; this.view = "2d"; this.model = null; }
  open(opts = {}) {
    this.opts = opts;
    if (!document.getElementById("forgeCss")) document.head.insertAdjacentHTML("beforeend", `<style id="forgeCss">${CSS}</style>`);
    const el = this.el = document.createElement("div"); el.className = "forge"; el.dir = "rtl";
    el.innerHTML = `
<header>
  <h2>🛠️ סטודיו אלמנטים <small>· יצירה, מיפוי וייצור · DXF-TLV</small></h2>
  <button data-v="2d" aria-pressed="true">✏️ שרטוט</button><button data-v="3d" aria-pressed="false">🧊 תלת ממד</button>
  <button id="fUndo" title="Ctrl+Z">↶</button><button id="fRedo" title="Ctrl+Y">↷</button>
  <button id="fApply" class="pri" title="האפקטים יעברו לרוץ על האלמנט הזה">✔ החל על הבמה</button><button id="fClose">✕ סגירה</button>
</header>
<div class="body">
<aside>
  <details open><summary>➕ הוספת צורה</summary>
    <div class="lib">${Object.entries(SHAPE_LIB).map(([k, s]) => `<button data-shape="${k}"><b>${s.icon}</b>${s.name}</button>`).join("")}</div>
    <div class="g"><label>התחלה מאלמנט קיים <select id="fFrom"><option value="">—</option><option value="element">הלב המקורי</option>${Object.entries(ELEMENTS).filter(([k]) => k !== "custom").map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("")}</select></label></div>
  </details>
  <details open><summary>✍ כלים</summary>
    <div class="g">${Object.entries(TOOLS).map(([k, v]) => `<button data-tool="${k}" aria-pressed="${k === "select"}">${v}</button>`).join("")}</div>
    <div class="g"><label>הצמדה <select id="fSnap">${[0, 0.5, 1, 2, 5, 10].map(v => `<option value="${v}" ${v === 1 ? "selected" : ""}>${v ? v + " ס״מ" : "בלי"}</option>`).join("")}</select></label></div>
    <div id="fCmdRow" hidden><input type="text" id="fCmd" placeholder="x,y · ‎@dx,dy · אורך<זווית · Enter לסגירה" dir="ltr" autocomplete="off"><p class="muted">שרטוט מדויק: לחיצה על הלוח מוסיפה נקודה. אפשר להקליד: <span dir="ltr">120,40</span> (מיקום בס״מ), <span dir="ltr">@30,0</span> (הזזה), <span dir="ltr">50&lt;90</span> (אורך 50 ס״מ בזווית 90°). לחיצה על הנקודה הראשונה או Enter סוגרים את הצורה.</p></div>
    <p class="muted" id="fToolHelp"></p>
  </details>
  <details><summary>📷 צילום, תמונה ומעקב</summary>
    <div class="g"><button id="fCam">📷 מצלמה</button><button id="fShot" disabled>📸 צלם</button><label>📁 תמונה <input type="file" id="fImg" accept="image/*" hidden></label><button id="fImgBtn">📁 מקובץ</button><button id="fUnDel">🗑</button></div>
    <video id="fVid" playsinline muted hidden></video>
    <div class="g"><label>שקיפות <input type="range" id="fUnOp" min="0" max="1" step=".05" value=".5"></label><label>רוחב (ס״מ) <input type="number" id="fUnW" step="1"></label></div>
    <p class="muted">צלמו את האלמנט או את הסקיצה ישר מלפנים. 📏 כיול: לחצו על שתי נקודות בתמונה והקלידו את המרחק האמיתי ביניהן.</p>
    <div class="g"><label>סף <input type="range" id="fThr" min="0" max="255" value="110"></label><label><input type="checkbox" id="fInv"> הפוך</label><button id="fTrace">🪄 מעקב אוטומטי</button></div>
    <p class="muted">המעקב הופך את האזורים הכהים בתמונה (או הבהירים, עם "הפוך") לחלקים, עם החורים שבתוכם.</p>
  </details>
  <details open><summary>🧩 חלקים <span id="fCount"></span></summary>
    <div class="parts" id="fParts"></div>
    <div id="fInsp" hidden>
      <div class="g"><input type="text" id="fName" aria-label="שם החלק"></div>
      <div class="g"><label>X <input type="number" id="fX" step=".5"></label><label>Y <input type="number" id="fY" step=".5"></label></div>
      <div class="g"><label>רוחב <input type="number" id="fW" step=".5" min="1"></label><label>גובה <input type="number" id="fH" step=".5" min="1"></label><label><input type="checkbox" id="fLock" checked> יחס</label></div>
      <div class="g"><label>סיבוב° <input type="number" id="fR" step="1"></label><label>עובי (מ״מ) <input type="number" id="fT" step="1" min="3" placeholder="כמו הלוח"></label></div>
      <div class="g"><button id="fDup">⧉ שכפול</button><button id="fMir">⇋ מראה</button><button id="fDel">🗑 מחיקה</button></div>
    </div>
    <p class="muted">ס״מ על לוח של 240×240. גרירה מזיזה, חיצים מזיזים בצעד ההצמדה, Delete מוחק.</p>
  </details>
  <details open><summary>〰 תעלות</summary>
    <div class="g"><label>תבנית <select id="gPattern">${Object.entries(PATTERNS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label></div>
    <div class="g"><label>רוחב תעלה (ס״מ) <input type="number" id="gWidth" step=".1" min=".3"></label><label>עומק (מ״מ) <input type="number" id="gDepth" step="1" min="1"></label></div>
    <div class="g"><label data-p="concentric parallel chevron">מרווח (ס״מ) <input type="number" id="gPitch" step=".5" min="1"></label><label data-p="scaled radial">מספר <input type="number" id="gCount" step="1" min="0" max="63"></label><label data-p="parallel chevron">זווית <input type="number" id="gAngle" step="5"></label></div>
    <div class="g"><label>מרווח בין חלקים (ס״מ) <input type="number" id="gJoint" step=".5" min="0"></label><label>קו מתאר (ס״מ) <input type="number" id="gEdge" step=".1" min="0"></label></div>
    <p class="muted" id="gInfo"></p>
  </details>
  <details><summary>🪵 חומר, כלי ולדים</summary>
    <div class="g"><label>חומר <input type="text" id="mName" style="width:110px"></label><label>עובי (מ״מ) <input type="number" id="mThickness" step="1"></label></div>
    <div class="g"><label>כרסום Ø (מ״מ) <input type="number" id="mTool" step=".5"></label><label>הזנה <input type="number" id="mFeed" step="100"></label><label>צלילה <input type="number" id="mPlunge" step="50"></label></div>
    <div class="g"><label>עומק לצעד (מ״מ) <input type="number" id="mStep" step=".5"></label><label>גובה בטוח <input type="number" id="mSafe" step="1"></label></div>
    <div class="g"><label>לדים למטר <input type="number" id="mLeds" step="1"></label><label>גובה מהרצפה (ס״מ) <input type="number" id="dMount" step="5"></label></div>
  </details>
  <details open><summary>🏭 ייצור · DXF-TLV</summary>
    <div class="g"><input type="text" id="dName" placeholder="שם העבודה"></div>
    <div class="g"><input type="text" id="dMaker" placeholder="שם היוצר/ת" style="width:48%"><input type="text" id="dPhone" placeholder="טלפון" style="width:48%" dir="ltr"></div>
    <div class="g"><input type="text" id="dNotes" placeholder="הערות לבית המלאכה"></div>
    <div class="g"><button class="pri" id="xPack">📦 שלח לייצור ב-DXF-TLV</button></div>
    <div class="g"><button id="xDxf">DXF</button><button id="xNc">G-code</button><button id="xPlt">PLT</button><button id="xSvg">SVG</button><button id="xLed">מפת לדים (LEDLAB)</button><button id="xJson">💾 שמירת עיצוב</button><button id="xLoad">📂 טעינה</button><input type="file" id="xLoadF" accept=".json,application/json" hidden></div>
    <p class="muted">החבילה (zip) כוללת DXF, G-code, PLT, SVG, מפת לדים, הדמיה ודף עבודה. מעבירים אותה לבית המלאכה.</p>
  </details>
</aside>
<div class="view"><canvas id="f2d"></canvas><canvas id="f3d" hidden></canvas><div class="hud" id="fHud"></div><div class="stat" id="fStat"></div></div>
</div>`;
    document.body.append(el);
    this.$ = id => el.querySelector("#" + id);
    this.cv = this.$("f2d"); this.ctx = this.cv.getContext("2d");
    this.fit(); this.wire(); this.syncForm(); this.rebuild();
    this.ro = new ResizeObserver(() => this.draw()); this.ro.observe(this.cv.parentElement);
    const loop = t => { if (!this.el) return; if (this.view === "3d" && this.v3) this.v3.draw(t / 1000); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
    if (!this.d.parts.length) this.toast("התחילו בהוספת צורה, בציור, בשרטוט או מצילום");
  }
  close() {
    cancelAnimationFrame(this.raf); this.ro?.disconnect(); this.stopCam();
    this.el?.remove(); this.el = null; document.removeEventListener("keydown", this.kd);
    this.opts.onClose?.();
  }
  toast(s) { (this.opts.toast || (m => console.log(m)))(s); }
  // ----- state -----
  commit() { this.hist.push(JSON.stringify(this.d)); if (this.hist.length > 60) this.hist.shift(); this.fut = []; }
  undo() { if (!this.hist.length) return; this.fut.push(JSON.stringify(this.d)); this.d = JSON.parse(this.hist.pop()); this.after(); }
  redo() { if (!this.fut.length) return; this.hist.push(JSON.stringify(this.d)); this.d = JSON.parse(this.fut.pop()); this.after(); }
  after() { if (!this.d.parts.some(p => p.id === this.sel)) this.sel = null; this.syncForm(); this.rebuild(); }
  addPart(p) { this.commit(); this.d.parts.push(p); this.sel = p.id; this.after(); }
  part() { return this.d.parts.find(p => p.id === this.sel); }
  // Groove model and 3D rebuild a moment after the last change, so dragging stays light.
  rebuild() {
    clearTimeout(this.rt); saveDesign(this.d);
    this.draw();
    this.rt = setTimeout(() => {
      const t0 = performance.now();
      try { this.model = buildModel(this.d); } catch (e) { this.model = null; console.error(e); this.toast("שגיאה בחישוב התעלות: " + e.message); }
      this.ms = performance.now() - t0;
      if (this.view === "3d") this.build3d();
      this.draw(); this.info();
    }, 180);
  }
  info() {
    const m = this.model, s = this.$("fStat"), gi = this.$("gInfo");
    if (!m) { s.textContent = "אין חלקים עדיין"; gi.textContent = ""; return; }
    const L = lengths(m, this.d);
    s.innerHTML = `${this.d.parts.length} חלקים · ${m.grooves.length} תעלות · ${m.grooves.reduce((a, g) => a + g.pieces.length, 0)} קווים<br>תעלות ${r1(L.groove / 100)} מ׳ · חיתוך ${r1(L.cut / 100)} מ׳ · ≈${Math.ceil(L.minutes)} דק׳ כרסום`;
    gi.textContent = (m.cfg.levels?.length >= 63 ? "הגעתם ל-63 תעלות, המקסימום שהמנוע ממפה. הגדילו את המרווח. " : "") + `${m.grooves.length} תעלות, כל אחת ערוץ משלה לאפקטים ולסאונד.`;
  }
  // ----- view: cm <-> screen -----
  fit() {
    const r = this.cv.parentElement.getBoundingClientRect(), s = Math.min(r.width, r.height) / (SZ + 30);
    this.vs = s || 2; this.vx = (r.width - SZ * this.vs) / 2; this.vy = (r.height - SZ * this.vs) / 2;
  }
  toCm(e) { const r = this.cv.getBoundingClientRect(); return [(e.clientX - r.left - this.vx) / this.vs, (e.clientY - r.top - this.vy) / this.vs]; }
  snapPt([x, y]) { const s = this.snap; return s ? [Math.round(x / s) * s, Math.round(y / s) * s] : [r1(x), r1(y)]; }
  draw() {
    if (!this.el) return;
    const cv = this.cv, r = cv.parentElement.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    if (cv.width !== (r.width * dpr | 0) || cv.height !== (r.height * dpr | 0)) { cv.width = r.width * dpr | 0; cv.height = r.height * dpr | 0; if (!this.vs || this.vs === 2) this.fit(); }
    const x = this.ctx; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, r.width, r.height);
    x.save(); x.translate(this.vx, this.vy); x.scale(this.vs, this.vs);
    const px = 1 / this.vs;
    // board and grid
    x.fillStyle = "#0b0f15"; x.fillRect(0, 0, SZ, SZ);
    const U = this.d.underlay;
    if (U?.src) { this.uimg ||= Object.assign(new Image(), { src: U.src }); if (this.uimg.src !== U.src) this.uimg.src = U.src; if (this.uimg.complete) { x.globalAlpha = U.op; x.drawImage(this.uimg, U.x, U.y, U.w, U.h); x.globalAlpha = 1; } else this.uimg.onload = () => this.draw(); }
    const gs = this.vs * 10 > 14 ? 10 : 20;
    x.lineWidth = px;
    for (let v = 0; v <= SZ; v += gs) { x.strokeStyle = v % 50 ? "#18202c" : "#263041"; x.beginPath(); x.moveTo(v, 0); x.lineTo(v, SZ); x.moveTo(0, v); x.lineTo(SZ, v); x.stroke(); }
    x.strokeStyle = "#3b4658"; x.setLineDash([4 * px, 4 * px]); x.strokeRect(0, 0, SZ, SZ); x.setLineDash([]);
    // parts
    for (const p of this.d.parts) {
      const L = loopsOf(p); x.beginPath(); for (const l of L) { l.forEach((q, i) => i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])); x.closePath(); }
      x.fillStyle = p.id === this.sel ? "#ff4f7b33" : "#ffffff14"; x.fill("evenodd");
      x.strokeStyle = p.id === this.sel ? "#ff4f7b" : "#8592a6"; x.lineWidth = (p.id === this.sel ? 2 : 1) * px; x.stroke();
    }
    // grooves and cut lines from the model (what the effects map and the machine cuts)
    const m = this.model;
    if (m) {
      x.lineCap = "round"; x.lineJoin = "round";
      m.grooves.forEach((g, k) => { x.strokeStyle = G.grooveColor(k, m.grooves.length); x.globalAlpha = 0.85; x.lineWidth = m.cfg.width; for (const p of g.pieces) { x.beginPath(); p.forEach((q, i) => i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])); x.stroke(); } });
      x.globalAlpha = 1; x.strokeStyle = "#ff3b5c"; x.lineWidth = Math.max(px, 0.3);
      for (const p of m.partLines) { x.beginPath(); p.forEach((q, i) => i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])); x.closePath(); x.stroke(); }
    }
    // selection box
    const s = this.part();
    if (s) {
      const L = loopsOf(s)[0]; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [a, b] of L) { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, a); y1 = Math.max(y1, b); }
      x.strokeStyle = "#ffd166"; x.lineWidth = px; x.setLineDash([3 * px, 3 * px]); x.strokeRect(x0, y0, x1 - x0, y1 - y0); x.setLineDash([]);
      x.fillStyle = "#ffd166"; x.font = `${12 * px}px sans-serif`; x.fillText(`${r1(x1 - x0)} × ${r1(y1 - y0)} ס״מ`, x0, y0 - 4 * px);
    }
    // tool in progress
    const st = this.stroke;
    if (st?.length) {
      x.strokeStyle = "#35d0ba"; x.lineWidth = 2 * px; x.beginPath(); st.forEach((q, i) => i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]));
      if (this.hover && this.tool !== "draw") x.lineTo(this.hover[0], this.hover[1]);
      x.stroke();
      if (this.tool !== "draw") { x.fillStyle = "#35d0ba"; for (const q of st) x.fillRect(q[0] - 3 * px, q[1] - 3 * px, 6 * px, 6 * px); }
    }
    if (this.hover && this.tool !== "select") { x.strokeStyle = "#35d0ba88"; x.lineWidth = px; const [a, b] = this.hover; x.beginPath(); x.moveTo(a - 6 * px, b); x.lineTo(a + 6 * px, b); x.moveTo(a, b - 6 * px); x.lineTo(a, b + 6 * px); x.stroke(); }
    x.restore();
    const h = this.hover, last = st?.at(-1);
    this.$("fHud").textContent = h ? `x ${r1(h[0])}  y ${r1(h[1])} cm` + (last && this.tool !== "draw" ? `   L ${r1(Math.hypot(h[0] - last[0], h[1] - last[1]))}  ∠ ${Math.round(Math.atan2(last[1] - h[1], h[0] - last[0]) * 180 / Math.PI)}°` : "") : "";
  }
  // ----- 3D -----
  build3d() {
    if (!this.model) return;
    try { this.v3 ||= new Viewer3D(this.$("f3d")); this.v3.level = this.opts.level || (() => 0); this.v3.build(this.model, this.d); }
    catch (e) { this.toast(e.message); }
  }
  setView(v) {
    this.view = v; this.el.querySelectorAll("[data-v]").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === v));
    this.$("f3d").hidden = v !== "3d"; this.cv.hidden = v === "3d"; this.$("fHud").hidden = v === "3d";
    if (v === "3d") this.build3d(); else this.draw();
  }
  // ----- camera, photo, trace -----
  async startCam() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } });
      const v = this.$("fVid"); v.srcObject = this.stream; v.hidden = false; await v.play(); this.$("fShot").disabled = false;
    } catch (e) { this.toast("אין גישה למצלמה: " + e.message); }
  }
  stopCam() { this.stream?.getTracks().forEach(t => t.stop()); this.stream = null; if (this.el) { this.$("fVid").hidden = true; this.$("fShot").disabled = true; } }
  setUnderlay(src, w, h) {
    this.commit();
    const W = SZ, H = W * h / w, fitH = H > SZ ? SZ / H : 1;
    this.d.underlay = { src, x: (SZ - W * fitH) / 2, y: (SZ - H * fitH) / 2, w: W * fitH, h: H * fitH, op: +this.$("fUnOp").value };
    this.uimg = null; this.syncForm(); this.draw(); saveDesign(this.d);
  }
  shoot() {
    const v = this.$("fVid"), c = document.createElement("canvas"), k = Math.min(1, 1600 / v.videoWidth);
    c.width = v.videoWidth * k; c.height = v.videoHeight * k; c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    this.setUnderlay(c.toDataURL("image/jpeg", 0.85), c.width, c.height); this.stopCam(); this.toast("התמונה על הלוח. כיילו את הגודל ב-📏 ואז מעקב או ציור מעליה");
  }
  // Dark (or light) areas of the photo -> closed outlines -> parts with their holes.
  trace() {
    const U = this.d.underlay; if (!U?.src || !this.uimg?.complete) return this.toast("קודם צלמו או טענו תמונה");
    const N = Math.round((SZ + 2 * MARGIN) * RES) + 1, c = document.createElement("canvas"); c.width = c.height = N;
    const x = c.getContext("2d", { willReadFrequently: true }); x.fillStyle = "#fff"; x.fillRect(0, 0, N, N);
    if (this.$("fInv").checked) { x.fillStyle = "#000"; x.fillRect(0, 0, N, N); }
    x.setTransform(RES, 0, 0, RES, MARGIN * RES, MARGIN * RES); x.filter = "blur(1px)"; x.drawImage(this.uimg, U.x, U.y, U.w, U.h);
    const px = x.getImageData(0, 0, N, N).data, thr = +this.$("fThr").value, inv = this.$("fInv").checked, g = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) {
      const l = px[k * 4] * 0.3 + px[k * 4 + 1] * 0.59 + px[k * 4 + 2] * 0.11, j = (k / N) | 0, i = k % N;
      g[k] = (i < 2 || j < 2 || i > N - 3 || j > N - 3) ? -1 : inv ? l - thr : thr - l;
    }
    let loops = G.isolines(g, N, 0).filter(l => l.closed).map(l => simplify(l.pts, 0.35)).filter(l => l.length > 3 && area(l) > 40);
    if (!loops.length) return this.toast("לא נמצאו צורות. שנו את הסף או סמנו 'הפוך'");
    loops.sort((a, b) => area(b) - area(a)); loops = loops.slice(0, 64);
    const depth = loops.map((l, i) => loops.filter((o, j) => j !== i && area(o) > area(l) && inPoly(o, l[0][0], l[0][1])).length);
    const parts = [];
    loops.forEach((l, i) => {
      if (depth[i] % 2) return;
      const holes = loops.filter((h, j) => depth[j] === depth[i] + 1 && inPoly(l, h[0][0], h[0][1]));
      parts.push(fromWorld([l, ...holes], `מעקב ${parts.length + 1}`));
    });
    this.commit(); this.d.parts.push(...parts); this.sel = parts[0]?.id; this.after();
    this.toast(`נוספו ${parts.length} חלקים מהתמונה`);
  }
  // ----- drawing tools -----
  finishPoly() {
    const st = this.stroke; this.stroke = null;
    if (!st || st.length < 3) { this.draw(); return; }
    let pts = st;
    if (this.tool === "draw") { pts = chaikin(simplify(st, 0.5), 2); }
    if (area(pts) < 4) { this.toast("הצורה קטנה מדי"); this.draw(); return; }
    this.addPart(fromWorld([pts], (this.tool === "draw" ? "ציור " : "שרטוט ") + (this.d.parts.length + 1)));
  }
  command(s) {
    s = s.trim(); const st = this.stroke ||= [], last = st.at(-1) || [0, 0];
    if (!s) return this.finishPoly();
    let m;
    if ((m = s.match(/^@\s*(-?[\d.]+)\s*[, ]\s*(-?[\d.]+)$/))) st.push([last[0] + +m[1], last[1] + +m[2]]);
    else if ((m = s.match(/^(-?[\d.]+)\s*<\s*(-?[\d.]+)$/))) st.push([last[0] + m[1] * Math.cos(rad(m[2])), last[1] - m[1] * Math.sin(rad(m[2]))]);
    else if ((m = s.match(/^(-?[\d.]+)\s*[, ]\s*(-?[\d.]+)$/))) st.push([+m[1], +m[2]]);
    else return this.toast("לא הבנתי: " + s);
    this.draw();
  }
  measure(a, b) {
    const U = this.d.underlay; if (!U) return this.toast("אין תמונה לכייל");
    const real = parseFloat(prompt(`המרחק על המסך: ${r1(Math.hypot(b[0] - a[0], b[1] - a[1]))} ס״מ. מה המרחק האמיתי (ס״מ)?`, ""));
    if (!(real > 0)) return;
    const k = real / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1); this.commit();
    Object.assign(U, { x: a[0] + (U.x - a[0]) * k, y: a[1] + (U.y - a[1]) * k, w: U.w * k, h: U.h * k });
    this.syncForm(); this.draw(); saveDesign(this.d); this.toast("התמונה כוילה למידה אמיתית");
  }
  setTool(t) {
    this.tool = t; this.stroke = null;
    this.el.querySelectorAll("[data-tool]").forEach(b => b.setAttribute("aria-pressed", b.dataset.tool === t));
    this.$("fCmdRow").hidden = t !== "points";
    this.$("fToolHelp").textContent = { select: "לחיצה על חלק בוחרת אותו, גרירה מזיזה.", draw: "ציירו קו סגור עם העכבר או האצבע. בשחרור הוא נסגר ומוחלק לחלק.", points: "", measure: "לחצו על שתי נקודות בתמונה שהמרחק ביניהן ידוע." }[t];
    if (t === "points") this.$("fCmd").focus();
    this.draw();
  }
  // ----- form <-> design -----
  syncForm() {
    const d = this.d, $ = this.$, g = d.groove, m = d.material;
    $("gPattern").value = g.pattern;
    for (const k of ["width", "depth", "pitch", "count", "angle", "joint", "edge"]) $("g" + k[0].toUpperCase() + k.slice(1)).value = g[k];
    for (const k of ["name", "thickness", "tool", "feed", "plunge", "step", "safe", "leds"]) $("m" + k[0].toUpperCase() + k.slice(1)).value = m[k];
    $("dMount").value = d.mount; $("dName").value = d.name; $("dMaker").value = d.maker; $("dPhone").value = d.phone; $("dNotes").value = d.notes;
    this.el.querySelectorAll("[data-p]").forEach(l => l.hidden = !l.dataset.p.split(" ").includes(g.pattern));
    $("fUnW").value = d.underlay ? r1(d.underlay.w) : ""; if (d.underlay) $("fUnOp").value = d.underlay.op;
    $("fCount").textContent = `(${d.parts.length})`;
    $("fParts").innerHTML = d.parts.map((p, i) => `<button data-pid="${p.id}" aria-pressed="${p.id === this.sel}">${i + 1} · ${esc(p.name)} <span class="muted">${r1(p.w)}×${r1(p.h)}</span></button>`).join("");
    const s = this.part(); $("fInsp").hidden = !s;
    if (s) { $("fName").value = s.name; $("fX").value = r1(s.x); $("fY").value = r1(s.y); $("fW").value = r1(s.w); $("fH").value = r1(s.h); $("fR").value = s.rot || 0; $("fT").value = s.h3 ?? ""; }
  }
  wire() {
    const $ = this.$, el = this.el;
    el.querySelectorAll("[data-v]").forEach(b => b.onclick = () => this.setView(b.dataset.v));
    el.querySelectorAll("[data-tool]").forEach(b => b.onclick = () => this.setTool(b.dataset.tool));
    $("fClose").onclick = () => this.close(); $("fUndo").onclick = () => this.undo(); $("fRedo").onclick = () => this.redo();
    $("fApply").onclick = () => {
      if (!this.d.parts.length) return this.toast("אין חלקים להחיל");
      const m = this.model || buildModel(this.d);
      this.opts.onApply?.(this.d, designParts(this.d), m.cfg); this.toast("האלמנט על הבמה: כל האפקטים רצים עכשיו על התעלות שלו");
    };
    // shapes
    el.querySelectorAll("[data-shape]").forEach(b => b.onclick = () => {
      const S = SHAPE_LIB[b.dataset.shape], u = S.make(), n = this.d.parts.length, sz = Math.min(120, SZ * 0.5);
      const ar = (() => { const b0 = normBox(S.make()[0]); return b0.w / b0.h; })();
      const off = (n % 5) * 12;
      this.addPart(makePart(u, { x: SZ / 2 + off, y: SZ / 2 + off, w: b.dataset.shape === "heart" ? sz : sz * Math.min(1, ar || 1), h: b.dataset.shape === "heart" ? sz * 0.92 : sz / Math.max(1, ar || 1) }, `${S.name} ${n + 1}`));
    });
    $("fFrom").onchange = () => {
      const k = $("fFrom").value; if (!k) return;
      const ps = k === "element" ? [{ name: "לב", loops: [G.outline("element")] }] : partsOf(k);
      this.commit(); this.d.parts = ps.map(p => fromWorld(p.loops, p.name.replace(/^\d+ · /, "")));
      const E = ELEMENTS[k]?.preset; if (E) Object.assign(this.d.groove, { pattern: E.pattern, count: E.count || this.d.groove.count });
      this.sel = null; $("fFrom").value = ""; this.after(); this.toast("האלמנט נטען לעריכה. כל חלק ניתן להזזה, שינוי ומחיקה");
    };
    $("fSnap").onchange = () => this.snap = +$("fSnap").value;
    // parts list and inspector
    $("fParts").onclick = e => { const b = e.target.closest("[data-pid]"); if (b) { this.sel = b.dataset.pid; this.syncForm(); this.draw(); } };
    const ins = (id, f) => $(id).onchange = () => { const p = this.part(); if (!p) return; this.commit(); f(p, $(id).value); this.after(); };
    ins("fName", (p, v) => p.name = v); ins("fX", (p, v) => p.x = +v); ins("fY", (p, v) => p.y = +v); ins("fR", (p, v) => p.rot = +v);
    ins("fT", (p, v) => p.h3 = v === "" ? null : Math.max(3, +v));
    ins("fW", (p, v) => { const k = +v / p.w; if (!(k > 0)) return; p.w = +v; if ($("fLock").checked) p.h = r1(p.h * k); });
    ins("fH", (p, v) => { const k = +v / p.h; if (!(k > 0)) return; p.h = +v; if ($("fLock").checked) p.w = r1(p.w * k); });
    $("fDup").onclick = () => { const p = this.part(); if (p) this.addPart({ ...clone(p), id: newId(), x: p.x + 10, y: p.y + 10, name: p.name + " ׳" }); };
    $("fMir").onclick = () => { const p = this.part(); if (!p) return; this.commit(); p.u = p.u.map(l => l.map(([u, v]) => [-u, v]).reverse()); this.after(); };
    $("fDel").onclick = () => this.delSel();
    // grooves and material
    const num = (id, obj, k, f = Number) => $(id).onchange = () => { const v = f($(id).value); if (f === Number && !isFinite(v)) return; this.commit(); obj()[k] = v; this.after(); };
    $("gPattern").onchange = () => { this.commit(); this.d.groove.pattern = $("gPattern").value; this.after(); };
    for (const k of ["width", "depth", "pitch", "count", "angle", "joint", "edge"]) num("g" + k[0].toUpperCase() + k.slice(1), () => this.d.groove, k);
    for (const k of ["thickness", "tool", "feed", "plunge", "step", "safe", "leds"]) num("m" + k[0].toUpperCase() + k.slice(1), () => this.d.material, k);
    num("mName", () => this.d.material, "name", String); num("dMount", () => this.d, "mount");
    for (const k of ["name", "maker", "phone", "notes"]) $("d" + k[0].toUpperCase() + k.slice(1)).onchange = e => { this.d[k] = e.target.value; saveDesign(this.d); };
    // photo
    $("fCam").onclick = () => this.stream ? this.stopCam() : this.startCam();
    $("fShot").onclick = () => this.shoot();
    $("fImgBtn").onclick = () => $("fImg").click();
    $("fImg").onchange = () => { const f = $("fImg").files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => { const c = document.createElement("canvas"), k = Math.min(1, 1600 / Math.max(im.width, im.height)); c.width = im.width * k; c.height = im.height * k; c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); this.setUnderlay(c.toDataURL("image/jpeg", 0.85), c.width, c.height); }; im.src = r.result; }; r.readAsDataURL(f); $("fImg").value = ""; };
    $("fUnDel").onclick = () => { this.commit(); this.d.underlay = null; this.uimg = null; this.syncForm(); this.draw(); saveDesign(this.d); };
    $("fUnOp").oninput = () => { if (this.d.underlay) { this.d.underlay.op = +$("fUnOp").value; this.draw(); } };
    $("fUnOp").onchange = () => saveDesign(this.d);
    $("fUnW").onchange = () => { const U = this.d.underlay, w = +$("fUnW").value; if (!U || !(w > 0)) return; this.commit(); U.h *= w / U.w; U.w = w; this.draw(); saveDesign(this.d); };
    $("fTrace").onclick = () => this.trace();
    $("fCmd").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); this.command($("fCmd").value); $("fCmd").value = ""; } if (e.key === "Escape") { this.stroke = null; this.draw(); } };
    // exports
    const need = () => { if (!this.model) { this.toast("אין עדיין מה לייצא"); return null; } return this.model; };
    const dl = this.opts.download || ((name, data, type) => { const a = document.createElement("a"); a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
    const base = () => (this.d.name || "element").replace(/[\\/:*?"<>|]+/g, "_");
    $("xDxf").onclick = () => { const m = need(); if (m) dl(base() + ".dxf", toDXF(m, this.d), "application/dxf"); };
    $("xNc").onclick = () => { const m = need(); if (m) dl(base() + ".nc", toGcode(m, this.d), "text/plain"); };
    $("xPlt").onclick = () => { const m = need(); if (m) dl(base() + ".plt", toPLT(m), "application/vnd.hp-hpgl"); };
    $("xSvg").onclick = () => { const m = need(); if (m) dl(base() + ".svg", G.toSVG(m), "image/svg+xml"); };
    $("xLed").onclick = () => { const m = need(); if (m) { const L = ledMap(m, this.d); dl(base() + "-led-map.json", JSON.stringify(L.json), "application/json"); setTimeout(() => dl(base() + "-led-patch.csv", L.csv, "text/csv"), 400); } };
    $("xJson").onclick = () => dl(base() + ".element.json", JSON.stringify(this.d), "application/json");
    $("xLoad").onclick = () => $("xLoadF").click();
    $("xLoadF").onchange = async () => { const f = $("xLoadF").files[0]; if (!f) return; try { const d = JSON.parse(await f.text()); if (!d.parts) throw new Error("זה לא קובץ עיצוב"); this.commit(); this.d = fixDesign(d); this.uimg = null; this.sel = null; this.after(); } catch (e) { this.toast("לא נטען: " + e.message); } $("xLoadF").value = ""; };
    $("xPack").onclick = async () => { const m = need(); if (!m) return; const b = await this.pack(m); dl(`DXF-TLV_${base()}.zip`, b, "application/zip"); this.toast("חבילת הייצור מוכנה: שלחו אותה ל-DXF-TLV"); };
    // pointer on the 2D board
    const cv = this.cv; let drag = null;
    cv.addEventListener("pointerdown", e => {
      cv.setPointerCapture(e.pointerId); const raw = this.toCm(e), p = this.snapPt(raw);
      if (e.button === 1 || e.altKey) { drag = { pan: [e.clientX, e.clientY, this.vx, this.vy] }; return; }
      if (this.tool === "select") {
        const hit = [...this.d.parts].reverse().find(q => hitPart(q, raw[0], raw[1]));
        this.sel = hit?.id || null; this.syncForm(); this.draw();
        drag = hit ? { part: hit, from: raw, x: hit.x, y: hit.y, moved: false } : { pan: [e.clientX, e.clientY, this.vx, this.vy] };
      } else if (this.tool === "draw") { this.stroke = [raw]; drag = { draw: true }; }
      else if (this.tool === "points" || this.tool === "measure") {
        const st = this.stroke ||= [];
        if (this.tool === "points" && st.length > 2 && Math.hypot(st[0][0] - p[0], st[0][1] - p[1]) * this.vs < 10) return this.finishPoly();
        st.push(p);
        if (this.tool === "measure" && st.length === 2) { const [a, b] = st; this.stroke = null; this.measure(a, b); }
        this.draw();
      }
    });
    cv.addEventListener("pointermove", e => {
      const raw = this.toCm(e); this.hover = this.tool === "draw" ? raw : this.snapPt(raw);
      if (drag?.pan) { this.vx = drag.pan[2] + e.clientX - drag.pan[0]; this.vy = drag.pan[3] + e.clientY - drag.pan[1]; }
      else if (drag?.part) {
        if (!drag.moved) { this.commit(); drag.moved = true; }
        const [nx, ny] = this.snapPt([drag.x + raw[0] - drag.from[0], drag.y + raw[1] - drag.from[1]]); drag.part.x = nx; drag.part.y = ny;
      } else if (drag?.draw) { const l = this.stroke.at(-1); if (Math.hypot(raw[0] - l[0], raw[1] - l[1]) > 0.4) this.stroke.push(raw); }
      this.draw();
    });
    cv.addEventListener("pointerup", () => { if (drag?.draw) this.finishPoly(); else if (drag?.part && drag.moved) { this.syncForm(); this.rebuild(); } drag = null; });
    cv.addEventListener("dblclick", () => { if (this.tool === "points") this.finishPoly(); });
    cv.addEventListener("wheel", e => {
      e.preventDefault(); const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k = e.deltaY > 0 ? 0.9 : 1.1;
      this.vx = mx - (mx - this.vx) * k; this.vy = my - (my - this.vy) * k; this.vs *= k; this.draw();
    }, { passive: false });
    this.kd = e => {
      if (!this.el || e.target.matches("input,select,textarea")) return;
      const p = this.part(), st = this.snap || 0.5;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); this.redo(); }
      else if (e.key === "Delete" || e.key === "Backspace") { if (p) { e.preventDefault(); this.delSel(); } }
      else if (e.key === "Escape") { if (this.stroke) { this.stroke = null; this.draw(); } else this.setTool("select"); }
      else if (e.key === "Enter" && this.stroke) this.finishPoly();
      else if (p && e.key.startsWith("Arrow")) { e.preventDefault(); this.commit(); const k = e.shiftKey ? 10 : 1; p.x += { ArrowLeft: -st, ArrowRight: st }[e.key] * k || 0; p.y += { ArrowUp: -st, ArrowDown: st }[e.key] * k || 0; this.after(); }
    };
    document.addEventListener("keydown", this.kd);
  }
  delSel() { const p = this.part(); if (!p) return; this.commit(); this.d.parts = this.d.parts.filter(q => q !== p); this.sel = null; this.after(); }
  // The production package for the workshop.
  async pack(m) {
    if (!this.v3) { try { this.v3 = new Viewer3D(this.$("f3d")); } catch {} }
    let png = null;
    if (this.v3) {
      const c3 = this.$("f3d"), hid = c3.hidden; c3.hidden = false; c3.style.visibility = "hidden";
      this.v3.build(m, this.d); this.v3.draw(2.2);
      png = await new Promise(r => c3.toBlob(r, "image/png")); c3.hidden = hid; c3.style.visibility = "";
    }
    const L = ledMap(m, this.d), files = [["design.dxf", toDXF(m, this.d)], ["design.nc", toGcode(m, this.d)], ["design.plt", toPLT(m)], ["plan.svg", G.toSVG(m)],
      ["led-map.json", JSON.stringify(L.json)], ["led-patch.csv", L.csv], ["map.json", JSON.stringify(G.toJSON(m), null, 1)], ["design.element.json", JSON.stringify(this.d)]];
    if (png) files.push(["preview-3d.png", new Uint8Array(await png.arrayBuffer())]);
    files.unshift(["job-sheet.html", jobSheet(m, this.d, files.map(f => f[0]))]);
    return zip(files);
  }
}
