// Elements made of separate parts, mapped with the same model as the heart: every part is its own contour with its own
// scaled rings (or grooves of any pattern), its own channel, and a 3D facet orientation, inside the same 240 x 240 cm box.
// They follow pieces that are common in projection-mapped sculpture and stage sets: honeycomb and triangle walls, faceted
// low-poly forms, shattered pieces, nested portal frames, isometric cube stacks and petal or feather fans.
// A part is { name, loops: [outer, ...holes], order 0..1 (sequence for chases), band 0..1 (slice of the spectrum it plays),
// tilt [x, y] (facet slope: the 3D effects light it as if it faces that way), c: [x, y] (the centre its rings shrink to) }.
// Parts may touch: the joint between them (cfg.joint, cm) is cut out of the distance field, so it stays exactly as wide everywhere.
import { SIZE, outline, resample } from "./heart-geo.js?v=1";

const C = SIZE / 2, rad = a => a * Math.PI / 180;
const mirror = pts => pts.map(([x, y]) => [SIZE - x, y]).reverse();
const centroid = pts => {
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length], k = x1 * y2 - x2 * y1;
    a += k; x += (x1 + x2) * k; y += (y1 + y2) * k;
  }
  return Math.abs(a) < 1e-9 ? pts[0] : [x / (3 * a), y / (3 * a)];
};
const inPoly = (poly, x, y) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const scaleAbout = (pts, [cx, cy], s) => pts.map(([x, y]) => [cx + (x - cx) * s, cy + (y - cy) * s]);
const polar = ([cx, cy], r, a) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
// Slope of a 3D triangle (x, y, z per vertex; z towards the viewer, cm) seen from the front: the facet's tilt.
function tilt3(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  if (n[2] < 0) n = n.map(q => -q);
  return [n[0] / (n[2] || 1), n[1] / (n[2] || 1)];
}
// Smooth an open control polygon (Chaikin), keeping its end points.
function smooth(pts, it = 4) {
  for (let k = 0; k < it; k++) {
    const o = [pts[0]];
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      o.push([x1 * 0.75 + x2 * 0.25, y1 * 0.75 + y2 * 0.25], [x1 * 0.25 + x2 * 0.75, y1 * 0.25 + y2 * 0.75]);
    }
    o.push(pts[pts.length - 1]); pts = o;
  }
  return pts;
}
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
// Order by distance from a point: the first part is 0, the furthest 1 (chases run outwards).
function orderFrom(parts, p) {
  const ds = parts.map(q => dist(q.c, p)), lo = Math.min(...ds), hi = Math.max(...ds);
  parts.forEach((q, i) => q.order ??= hi > lo ? (ds[i] - lo) / (hi - lo) : 0);
}
// Spectrum: low parts in the middle and at the bottom, highs out at the edges and on top.
function bandFrom(parts) { parts.forEach(q => q.band ??= Math.min(1, Math.max(0, q.order * 0.8 + (1 - q.c[1] / SIZE) * 0.2))); }

const HEART = () => outline("element", 720);
const HC = [C, 117];   // the heart's ring centre (heart-geo DEFAULTS cx, cy)

// ---------- the ten elements ----------
// 1. Honeycomb heart: hexagon panels on a honeycomb, every cell that fits inside the heart's contour.
function hexHeart() {
  const H = HEART(), R = 17.5, w = Math.sqrt(3) * R, parts = [];
  for (let r = 0; r < 20; r++) {
    const y = 12 + R + r * 1.5 * R, off = r % 2 ? w / 2 : 0;
    for (let i = -8; i <= 8; i++) {
      const x = C + off + i * w, cell = Array.from({ length: 6 }, (_, k) => polar([x, y], R, 30 + k * 60));
      if (cell.every(([px, py]) => inPoly(H, px, py))) parts.push({ name: "משושה", loops: [cell], c: [x, y], tilt: [0, 0] });
    }
  }
  orderFrom(parts, HC);
  // A gentle dome: cells lean outwards, more towards the contour.
  parts.forEach(p => { const d = [p.c[0] - HC[0], p.c[1] - HC[1]], L = Math.hypot(...d) || 1; p.tilt = [d[0] / L * 0.35 * p.order, d[1] / L * 0.35 * p.order]; });
  return parts;
}

// 2. Diamond heart: the heart as a low-poly gem, triangles between the contour, a middle ring and a raised centre.
function facetHeart() {
  const n = 16, O = outline("element", n), mid = [C, 124], I = scaleAbout(O, mid, 0.5), parts = [];
  const z = (p, h) => [p[0], p[1], h];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const tri = (a, b, c, za, zb, zc, ring) => parts.push({ name: ring ? "פאה חיצונית" : "פאה פנימית", loops: [[a, b, c]], c: centroid([a, b, c]),
      tilt: tilt3(z(a, za), z(b, zb), z(c, zc)) });
    tri(mid, I[i], I[j], 46, 26, 26, 0);
    // Quads between the rings, cut on alternating diagonals like a brilliant cut.
    if (i % 2) { tri(I[i], O[i], O[j], 26, 0, 0, 1); tri(I[i], O[j], I[j], 26, 0, 26, 1); }
    else { tri(I[i], O[i], I[j], 26, 0, 26, 1); tri(I[j], O[i], O[j], 26, 0, 0, 1); }
  }
  orderFrom(parts, mid);
  return parts;
}

// 3. Shattered heart: the real contour broken into shards around an off-centre impact point.
function shardHeart() {
  const n = 720, O = HEART(), hit = [128, 112], I = scaleAbout(O, hit, 0.46), parts = [];
  const cuts = [0, 52, 118, 170, 228, 290, 352, 410, 468, 525, 590, 655];   // contour indices of the radial cracks
  const tw = [14, -10, 18, -6, 12, -16, 8, -12, 16, -8, 10, -14];             // how far each crack twists on the inner ring
  const arc = (P, a, b) => { const o = []; for (let k = a; ; k = (k + 1) % n) { o.push(P[k]); if (k === b) break; } return o; };
  const m = cuts.length, inner = cuts.map((c, i) => (c + tw[i] + n) % n);
  for (let i = 0; i < m; i++) {
    const a = cuts[i], b = cuts[(i + 1) % m], ia = inner[i], ib = inner[(i + 1) % m];
    const loop = [...arc(O, a, b), ...arc(I, ia, ib).reverse()];
    parts.push({ name: "רסיס", loops: [resample(loop, 140, true)], c: centroid(loop) });
  }
  // The inner piece cracks again from the impact point, every third crack.
  for (let i = 0; i < m; i += 3) {
    const loop = [hit, ...arc(I, inner[i], inner[(i + 3) % m])];
    parts.push({ name: "רסיס פנימי", loops: [resample(loop, 100, true)], c: centroid(loop) });
  }
  parts.forEach((p, i) => { const d = [p.c[0] - hit[0], p.c[1] - hit[1]], L = Math.hypot(...d) || 1, s = (i % 2 ? 0.45 : 0.25); p.tilt = [d[0] / L * s, d[1] / L * s]; });
  orderFrom(parts, hit);
  return parts;
}

// 4. Heart portal: nested heart frames standing apart like stage arches, with a solid heart at the back.
function nestedHearts() {
  const H = HEART(), S = [[1, 0.83], [0.73, 0.57], [0.48, 0.34], [0.26, 0.15]], parts = [];
  S.forEach(([a, b], k) => parts.push({ name: `מסגרת ${k + 1}`, loops: [scaleAbout(H, HC, a), scaleAbout(H, HC, b)], c: HC,
    order: 1 - k / S.length, tilt: [0, 0] }));
  parts.push({ name: "לב אחורי", loops: [scaleAbout(H, HC, 0.08)], c: HC, order: 0, tilt: [0, 0] });
  return parts;
}

// 5. Triangle wall: a flat-top hexagon of equilateral triangle panels, each tipped a little like a folded pleat.
function triWall() {
  const t = 40, h = t * Math.sqrt(3) / 2, R = 120, cy = 120, hex = Array.from({ length: 6 }, (_, k) => polar([C, cy], R, k * 60));
  const parts = [];
  for (let r = -3; r < 3; r++) {
    const y0 = cy + r * h, y1 = y0 + h;
    for (let i = -8; i <= 8; i++) {
      const x = C + i * t / 2, up = ((i + r) % 2 + 2) % 2 === 0;
      const tri = up ? [[x - t / 2, y1], [x, y0], [x + t / 2, y1]] : [[x - t / 2, y0], [x + t / 2, y0], [x, y1]];
      const c = centroid(tri);
      if (!inPoly(hex, c[0], c[1])) continue;
      // Pleats: each column of triangles faces left or right, ups a bit to the top and downs a bit to the bottom.
      const side = ((i % 4) + 4) % 4 < 2 ? -1 : 1;
      parts.push({ name: up ? "משולש ▲" : "משולש ▼", loops: [tri], c, tilt: [side * 0.45, up ? -0.2 : 0.2] });
    }
  }
  orderFrom(parts, [C, cy]);
  return parts;
}

// 6. Cube stack: a pyramid of isometric cubes, each cube three separate faces (top, left, right), the classic 3D illusion.
function cubeStack() {
  const a = 33, w = Math.sqrt(3) * a, rows = 4, bottom = 232, parts = [];
  for (let r = 0; r < rows; r++) {
    const n = rows - r, y = bottom - a - r * 1.5 * a;
    for (let i = 0; i < n; i++) {
      const x = C + (i - (n - 1) / 2) * w, c = [x, y], v = k => polar(c, a, -90 + k * 60);
      const ord = 1 - r / (rows - 1);
      parts.push({ name: "קובייה · עליון", loops: [[c, v(5), v(0), v(1)]], c: centroid([c, v(5), v(0), v(1)]), tilt: [0, -0.9], order: ord, band: 0.85 });
      parts.push({ name: "קובייה · ימין", loops: [[c, v(1), v(2), v(3)]], c: centroid([c, v(1), v(2), v(3)]), tilt: [0.8, 0.45], order: ord, band: 0.5 });
      parts.push({ name: "קובייה · שמאל", loops: [[c, v(3), v(4), v(5)]], c: centroid([c, v(3), v(4), v(5)]), tilt: [-0.8, 0.45], order: ord, band: 0.15 });
    }
  }
  return parts;
}

// 7. Faceted star: a five-point star, every point two facets meeting on a raised ridge.
function facetStar() {
  const R = 118, r = R * 0.42, c = [C, 132], parts = [];
  const O = k => polar(c, R, -90 + k * 72), I = k => polar(c, r, -54 + k * 72);
  const z = (p, h) => [p[0], p[1], h];
  for (let k = 0; k < 5; k++) {
    const A = [c, I((k + 4) % 5), O(k)], B = [c, O(k), I(k)];
    parts.push({ name: `קרן ${k + 1} · א`, loops: [A], c: centroid(A), tilt: tilt3(z(c, 40), z(A[1], 0), z(A[2], 0)), order: k / 5 });
    parts.push({ name: `קרן ${k + 1} · ב`, loops: [B], c: centroid(B), tilt: tilt3(z(c, 40), z(B[1], 0), z(B[2], 0)), order: (k + 0.5) / 5 });
  }
  return parts;
}

// 8. Butterfly: four wings, each fanned into three vein panels from its root, a body and a head.
function butterfly() {
  const parts = [];
  const wing = (root, ctrl, name, ord) => {
    // Veins: rays from the root that split the wing's angular spread in three equal fans.
    const edge = resample(smooth(ctrl), 150, false), ang = edge.map(([x, y]) => Math.atan2(y - root[1], x - root[0]));
    for (let i = 1; i < ang.length; i++) { while (ang[i] - ang[i - 1] > Math.PI) ang[i] -= 2 * Math.PI; while (ang[i - 1] - ang[i] > Math.PI) ang[i] += 2 * Math.PI; }
    const a0 = ang[8], a1 = ang[141], at = t => ang.findIndex(v => (v - a0) / (a1 - a0) >= t);
    const cuts = [0, at(1 / 3), at(2 / 3), 149];
    for (let s = 0; s < 3; s++) {
      const loop = [root, ...edge.slice(cuts[s], cuts[s + 1] + 1)];
      parts.push({ name: `${name} ${s + 1}`, loops: [loop], c: centroid(loop), order: ord + s * 0.12 });
    }
  };
  const upper = [[131, 100], [150, 44], [192, 14], [230, 22], [238, 58], [224, 98], [192, 116], [134, 112]];
  const lower = [[134, 122], [178, 126], [214, 148], [222, 188], [202, 222], [166, 228], [140, 196], [131, 140]];
  wing([131, 108], upper, "כנף עליונה ימין", 0.5);
  wing([131, 124], lower, "כנף תחתונה ימין", 0.5);
  const right = parts.splice(0);
  for (const p of right) parts.push({ ...p, name: p.name.replace("ימין", "שמאל"), loops: [mirror(p.loops[0])], c: [SIZE - p.c[0], p.c[1]] }, p);
  const body = Array.from({ length: 60 }, (_, k) => [C + 6 * Math.cos(k / 60 * 2 * Math.PI), 132 + 74 * Math.sin(k / 60 * 2 * Math.PI)]);
  const head = Array.from({ length: 40 }, (_, k) => [C + 10 * Math.cos(k / 40 * 2 * Math.PI), 44 + 10 * Math.sin(k / 40 * 2 * Math.PI)]);
  parts.push({ name: "גוף", loops: [body], c: [C, 132], order: 0, band: 0 }, { name: "ראש", loops: [head], c: [C, 44], order: 0.1, band: 0.1 });
  parts.forEach(p => { const d = p.c[0] - C; p.tilt ??= [Math.sign(d) * 0.3, -0.15]; });
  return parts;
}

// 9. Lotus mandala: a centre disc and two rings of almond petals, the outer ring between the inner petals.
function lotus() {
  const c = [C, 120], parts = [];
  const disc = Array.from({ length: 64 }, (_, k) => polar(c, 24, k * 360 / 64));
  parts.push({ name: "מרכז", loops: [disc], c, order: 0, band: 0, tilt: [0, 0] });
  const petal = (a, r0, r1, hw) => {
    const pts = [];
    for (let k = 0; k <= 30; k++) { const t = k / 30, r = r0 + (r1 - r0) * t, w = hw * Math.pow(Math.sin(Math.PI * t), 0.75) * (1 - 0.25 * t); pts.push(polar(c, r, a + w / r * 180 / Math.PI)); }
    for (let k = 29; k > 0; k--) { const t = k / 30, r = r0 + (r1 - r0) * t, w = hw * Math.pow(Math.sin(Math.PI * t), 0.75) * (1 - 0.25 * t); pts.push(polar(c, r, a - w / r * 180 / Math.PI)); }
    return pts;
  };
  for (let k = 0; k < 8; k++) {
    const a = -90 + k * 45, p = petal(a, 30, 80, 17), d = [Math.cos(rad(a)), Math.sin(rad(a))];
    parts.push({ name: `עלה פנימי ${k + 1}`, loops: [p], c: polar(c, 55, a), order: 0.35 + k / 8 * 0.1, tilt: [d[0] * 0.3, d[1] * 0.3] });
  }
  for (let k = 0; k < 8; k++) {
    const a = -67.5 + k * 45, p = petal(a, 62, 118, 26), d = [Math.cos(rad(a)), Math.sin(rad(a))];
    parts.push({ name: `עלה חיצוני ${k + 1}`, loops: [p], c: polar(c, 92, a), order: 0.75 + k / 8 * 0.25, tilt: [d[0] * 0.55, d[1] * 0.55] });
  }
  return parts;
}

// 10. Winged heart: the real heart outline in the middle, seven feather blades fanned out on each side.
function wingedHeart() {
  const H = outline("element", 360), s = 0.36, w = SIZE * s, hc = [C, 140];
  const heart = H.map(([x, y]) => [hc[0] + (x - C) * s, hc[1] + (y - C) * s]);
  const parts = [{ name: "לב", loops: [heart], c: [hc[0], hc[1] - 3], order: 0, band: 0, tilt: [0, 0] }];
  const root = [C - w / 2 - 10, 112], fe = [];
  for (let k = 0; k < 7; k++) {
    const a = 160 + k * 15, L = [54, 57, 59, 62, 74, 86, 92][k], pts = [];
    const r0 = 16, d = 6.2;
    for (let i = 0; i <= 20; i++) { const r = r0 + (L - r0) * i / 20; pts.push(polar(root, r, a - d)); }
    for (let i = 1; i < 12; i++) pts.push(polar(root, L + 5 * Math.sin(Math.PI * i / 12), a - d + 2 * d * i / 12));   // rounded tip
    for (let i = 20; i >= 0; i--) { const r = r0 + (L - r0) * i / 20; pts.push(polar(root, r, a + d)); }
    fe.push({ name: `נוצה ${k + 1} · שמאל`, loops: [pts], c: polar(root, (r0 + L) / 2, a), order: 0.3 + k / 6 * 0.7,
      tilt: [Math.cos(rad(a)) * 0.4, Math.sin(rad(a)) * 0.4 - 0.1] });
  }
  for (const f of fe) parts.push(f, { ...f, name: f.name.replace("שמאל", "ימין"), loops: [mirror(f.loops[0])], c: [SIZE - f.c[0], f.c[1]], tilt: [-f.tilt[0], f.tilt[1]] });
  return parts;
}

// name, maker, and the groove settings that suit its parts (applied when the element is picked).
export const ELEMENTS = {
  hexheart: { name: "לב משושים (חלת דבש)", make: hexHeart, preset: { pattern: "scaled", count: 3, inner: 0.3, outer: 0.78 } },
  facets: { name: "לב יהלום (פאות)", make: facetHeart, preset: { pattern: "scaled", count: 3, inner: 0.3, outer: 0.75 } },
  shards: { name: "לב שבור (רסיסים)", make: shardHeart, preset: { pattern: "concentric", count: 6 } },
  nested: { name: "שער לבבות (מסגרות)", make: nestedHearts, preset: { pattern: "scaled", count: 12, inner: 0.1, outer: 0.97 } },
  triwall: { name: "קיר משולשים", make: triWall, preset: { pattern: "scaled", count: 3, inner: 0.25, outer: 0.75 } },
  cubes: { name: "ערימת קוביות", make: cubeStack, preset: { pattern: "scaled", count: 4, inner: 0.2, outer: 0.82 } },
  star: { name: "כוכב פאות", make: facetStar, preset: { pattern: "scaled", count: 5, inner: 0.2, outer: 0.85 } },
  butterfly: { name: "פרפר", make: butterfly, preset: { pattern: "concentric", count: 5 } },
  lotus: { name: "מנדלת לוטוס", make: lotus, preset: { pattern: "scaled", count: 4, inner: 0.25, outer: 0.82 } },
  wings: { name: "לב מכונף", make: wingedHeart, preset: { pattern: "scaled", count: 5, inner: 0.2, outer: 0.85 } },
};
// Settings every element shares: a 2.5 cm joint between the parts, no centre seam (each part is its own piece).
export const ELEMENT_BASE = { seam: 0, rim: 0, joint: 2.5, width: 1.2, edge: 1.2 };

// The parts of any shape: a heart shape is one part (its own outline), an element is the list above, finished with
// defaults for centre, order, band and tilt, numbered 1.. in the name.
export function partsOf(shape) {
  const E = ELEMENTS[shape];
  if (!E) return [{ name: "הלב", loops: [outline(shape)], c: HC, order: 0, band: 0, tilt: [0, 0] }];
  const parts = E.make();
  parts.forEach(p => { p.c ??= centroid(p.loops[0]); p.tilt ??= [0, 0]; });
  orderFrom(parts, [C, C]);
  bandFrom(parts);
  parts.forEach((p, i) => p.name = `${i + 1} · ${p.name}`);
  return parts.slice(0, 64);
}
