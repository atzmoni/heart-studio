// Heart element geometry, in centimetres. The physical piece is 240 x 240 cm; (0,0) is the top-left of its bounding box, y points down.
// The real element (measured from the photos): two mirrored halves joined at a vertical seam from the cleft to the tip, folded
// slightly like an open book, with about 21 ring channels that are scaled copies of the outline converging on a small inner heart.
// It is split into separate parts, the way the piece is built:
//   edge  - the outer contour line itself
//   seam  - the joint between the two halves (x = 120)
//   rim   - optional band along the contour, separated from the inside by
//   sep   - the separation groove between the rim and the field
//   grooves - the channels (each one a separate line, numbered from the centre out; a = left half, b = right half)
//   stripes - the raised bands between grooves (stripe 0 is the small inner heart)
// Every groove pattern is one scalar field phi(x,y): a groove is the set phi = level, so the same code draws,
// numbers, scans and renders horizontal, diagonal, chevron, concentric and radial grooves.
export const SIZE = 240;          // cm, width and height of the element
export const MARGIN = 12;         // cm of field kept around the box, for a soft halo just outside the edge
export const RES = 2;             // field samples per cm (0.5 cm grid; the GPU interpolates between them)

export const PATTERNS = {
  scaled: "לבבות מוקטנים אל המרכז (כמו האלמנט)",
  parallel: "פסים ישרים (בזווית)",
  chevron: "שברונים (V לכיוון החוד)",
  concentric: "קונצנטרי (במקביל לקונטור)",
  radial: "קרניים (ממרכז)",
};
export const SHAPES = { element: "האלמנט (לפי התמונות)", classic: "לב קלאסי", geometric: "לב גאומטרי (קשתות וקווים ישרים)", round: "לב עגול" };

export const DEFAULTS = {
  shape: "element",
  pattern: "scaled",
  angle: 90,        // parallel: groove direction normal in degrees (90 = horizontal grooves); chevron: arm slope in degrees
  count: 21,        // number of grooves inside the field
  inner: 0.165,     // scaled: size of the innermost ring (the small heart) relative to the whole heart
  outer: 0.955,     // scaled: size of the outermost ring
  width: 1.4,       // groove width, cm
  edge: 1.5,        // outer contour line width, cm
  joint: 2.5,       // gap between the parts of an element of separate parts, cm (heart-elements.js)
  seam: 1.2,        // width of the joint between the halves, cm (0 = one piece)
  rim: 0,           // rim band width, cm (0 = no rim)
  gap: 2,           // width of the separation groove between rim and field, cm
  cx: 120, cy: 117, // centre the rings shrink towards (scaled) / rays start from (radial), cm
  levels: null,     // explicit groove levels from a photo scan (phi values); null = evenly spaced
};

// ---------- contour ----------
function rawShape(shape, n = 4000) {
  const pts = [];
  if (shape === "geometric") {
    // Two lobe circles of radius 1 whose centres are 0.62 apart from the axis, and two straight tangents down to the tip.
    const a = 0.62, tip = [0, -2.35], c = [a, 0];
    const dx = tip[0] - c[0], dy = tip[1] - c[1], L = Math.hypot(dx, dy);
    // Tangent point on the right circle seen from the tip (the outer one).
    const base = Math.atan2(dy, dx), off = Math.acos(1 / L);
    const tA = base + off;                       // angle of the tangent point on the outer side of the right circle
    const cleftA = Math.PI - Math.acos(a);       // where the right circle meets the axis at the top (x = 0)
    // Right circle from the cleft, over the top, down to the tangent point (clockwise in screen = decreasing angle in y-up).
    let a0 = cleftA, a1 = tA; while (a1 > a0) a1 -= 2 * Math.PI;
    const arc = k => { const t = a0 + (a1 - a0) * k; return [c[0] + Math.cos(t), c[1] + Math.sin(t)]; };
    const m = n / 2;
    for (let i = 0; i < m * 0.8; i++) pts.push(arc(i / (m * 0.8)));
    const tp = arc(1);
    for (let i = 0; i < m * 0.2; i++) { const k = i / (m * 0.2); pts.push([tp[0] + (tip[0] - tp[0]) * k, tp[1] + (tip[1] - tp[1]) * k]); }
    const right = pts.slice();
    for (let i = right.length - 1; i >= 0; i--) pts.push([-right[i][0], right[i][1]]);
    pts.splice(right.length, 0, tip);
    return pts.map(([x, y]) => [x, -y]);
  }
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI, s = Math.sin(t);
    let x, y;
    if (shape === "element") {
      // Fitted to the photos: cleft 14% of the height deep, widest at 27%, half width 0.89 / 0.62 / 0.33 at 50 / 70 / 85% height.
      x = 16 * Math.pow(Math.abs(s), 2.2) * Math.sign(s);
      y = 13 * Math.cos(t) - 4 * Math.cos(2 * t) - 1.6 * Math.cos(3 * t) - 0.4 * Math.cos(4 * t);
    } else if (shape === "round") {
      x = 16 * Math.pow(Math.abs(s), 2.6) * Math.sign(s);
      y = 13 * Math.cos(t) - 4 * Math.cos(2 * t) - 1.6 * Math.cos(3 * t) - 0.5 * Math.cos(4 * t);
    } else {
      x = 16 * s * s * s;
      y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    }
    pts.push([x, -y]);   // y down; t = 0 is the cleft at the top centre, increasing t runs clockwise on screen
  }
  return pts;
}

// Closed polygon fitted exactly to the 240 x 240 box, resampled to n points equally spaced along the contour,
// starting at the cleft (top centre) and running clockwise: right lobe, tip (about halfway), left lobe.
export function outline(shape = "element", n = 720) {
  const raw = rawShape(shape);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of raw) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const fit = raw.map(([x, y]) => [(x - x0) / (x1 - x0) * SIZE, (y - y0) / (y1 - y0) * SIZE]);
  return resample(fit, n, true);
}

export function resample(pts, n, closed) {
  const P = closed ? [...pts, pts[0]] : pts, cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const total = cum[cum.length - 1], out = [], m = closed ? n : n - 1;
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = total * i / m;
    while (j < P.length - 2 && cum[j + 1] < s) j++;
    const k = (s - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
    out.push([P[j][0] + (P[j + 1][0] - P[j][0]) * k, P[j][1] + (P[j + 1][1] - P[j][1]) * k]);
  }
  return out;
}

export const polyLength = (p, closed) => p.reduce((s, q, i) => i || closed ? s + Math.hypot(q[0] - p[(i || p.length) - 1][0], q[1] - p[(i || p.length) - 1][1]) : s, 0);

// ---------- distance field ----------
// Signed distance to the contour on a RES-per-cm grid (positive inside), plus where along the contour the nearest point is
// (u from 0 at the cleft, clockwise, to 1). Exact point-to-segment distances; inside/outside by scanline parity.
// It takes one outline or a list of parts ({ loops: [outer, ...holes] }, see heart-elements.js). With parts, pid says which
// part every sample belongs to (the nearest one outside them), and the joint between touching parts (cm) is cut out of d,
// so every part shrinks by joint / 2 and the gaps stay exactly that wide along any shape.
export function distanceField(input, joint = 0) {
  const parts = Array.isArray(input[0]) ? [{ loops: [input] }] : input;
  const N = Math.round((SIZE + 2 * MARGIN) * RES) + 1;
  const d = new Float32Array(N * N), u = new Float32Array(N * N), pid = new Uint8Array(N * N).fill(255);
  const ax = [], ay = [], ex = [], ey = [], il = [], su = [], start = [0];
  for (const p of parts) {
    for (const loop of p.loops) {
      const n = loop.length;
      for (let i = 0; i < n; i++) {
        const a = loop[i], b = loop[(i + 1) % n];
        ax.push(a[0]); ay.push(a[1]); ex.push(b[0] - a[0]); ey.push(b[1] - a[1]);
        il.push(1 / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1)); su.push(i / n);
      }
    }
    start.push(ax.length);
  }
  const loopN = []; for (const p of parts) for (const loop of p.loops) for (let i = 0; i < loop.length; i++) loopN.push(loop.length);
  for (let q = 0; q < parts.length; q++) {
    for (let j = 0; j < N; j++) {
      const y = j / RES - MARGIN, xs = [];
      for (let i = start[q]; i < start[q + 1]; i++) {
        const y0 = ay[i], y1 = ay[i] + ey[i];
        if ((y0 <= y) !== (y1 <= y)) xs.push(ax[i] + ex[i] * (y - y0) / ey[i]);
      }
      xs.sort((p, r) => p - r);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, Math.ceil((xs[k] + MARGIN) * RES)), b = Math.min(N - 1, Math.floor((xs[k + 1] + MARGIN) * RES));
        for (let i = a; i <= b; i++) pid[j * N + i] = q;
      }
    }
  }
  const S = ax.length;
  if (parts.length > 1) { nearestBuckets(N, d, u, pid, { ax, ay, ex, ey, il, su, loopN, start, S }, joint); return { N, d, u, pid, parts, joint }; }
  for (let j = 0; j < N; j++) {
    const y = j / RES - MARGIN;
    for (let i = 0; i < N; i++) {
      const x = i / RES - MARGIN, k = j * N + i, own = pid[k];
      // Inside a part the nearest edge is always one of its own (any other part is beyond it).
      const s0 = own < 255 ? start[own] : 0, s1 = own < 255 ? start[own + 1] : S;
      let best = Infinity, bi = 0, bt = 0;
      for (let s = s0; s < s1; s++) {
        const px = x - ax[s], py = y - ay[s];
        let t = (px * ex[s] + py * ey[s]) * il[s];
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = px - ex[s] * t, qy = py - ey[s] * t, dd = qx * qx + qy * qy;
        if (dd < best) { best = dd; bi = s; bt = t; }
      }
      d[k] = (own < 255 ? Math.sqrt(best) : -Math.sqrt(best)) - joint / 2;
      u[k] = su[bi] + bt / loopN[bi];
      if (own === 255) { let q = 0; while (start[q + 1] <= bi) q++; pid[k] = q + 128; }   // outside: nearest part, flagged +128
    }
  }
  return { N, d, u, pid, parts, joint };
}

// The same nearest-edge search for elements of many parts, through 6 cm buckets of segments: inside a part only its own
// edges count (searched outwards until nothing closer can be left), outside only edges within 16 cm (further out is -16).
function nearestBuckets(N, d, u, pid, g, joint) {
  const { ax, ay, ex, ey, il, su, loopN, start, S } = g, B = 6, M = Math.ceil((SIZE + 2 * MARGIN) / B) + 1, cells = Array.from({ length: M * M }, () => []);
  const part = new Uint8Array(S); for (let q = 0; q + 1 < start.length; q++) part.fill(q, start[q], start[q + 1]);
  const cell = v => Math.max(0, Math.min(M - 1, Math.floor((v + MARGIN) / B)));
  for (let s = 0; s < S; s++) {
    const x0 = cell(Math.min(ax[s], ax[s] + ex[s])), x1 = cell(Math.max(ax[s], ax[s] + ex[s])), y0 = cell(Math.min(ay[s], ay[s] + ey[s])), y1 = cell(Math.max(ay[s], ay[s] + ey[s]));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) cells[cy * M + cx].push(s);
  }
  const OUT = 16;
  for (let j = 0; j < N; j++) {
    const y = j / RES - MARGIN, cy = cell(y);
    for (let i = 0; i < N; i++) {
      const x = i / RES - MARGIN, cx = cell(x), k = j * N + i, own = pid[k];
      let best = Infinity, bi = -1, bt = 0;
      const maxR = own < 255 ? M : Math.ceil(OUT / B) + 1;
      for (let r = 0; r <= maxR; r++) {
        if (bi >= 0 && Math.sqrt(best) < (r - 1) * B) break;
        for (let yy = cy - r; yy <= cy + r; yy++) {
          if (yy < 0 || yy >= M) continue;
          for (let xx = cx - r; xx <= cx + r; xx++) {
            if (xx < 0 || xx >= M || (Math.abs(yy - cy) !== r && Math.abs(xx - cx) !== r)) continue;
            for (const s of cells[yy * M + xx]) {
              if (own < 255 && part[s] !== own) continue;
              const px = x - ax[s], py = y - ay[s];
              let t = (px * ex[s] + py * ey[s]) * il[s];
              t = t < 0 ? 0 : t > 1 ? 1 : t;
              const qx = px - ex[s] * t, qy = py - ey[s] * t, dd = qx * qx + qy * qy;
              if (dd < best) { best = dd; bi = s; bt = t; }
            }
          }
        }
      }
      if (bi < 0) { d[k] = -OUT - joint / 2; u[k] = 0; pid[k] = 128; continue; }
      d[k] = (own < 255 ? Math.sqrt(best) : -Math.min(OUT, Math.sqrt(best))) - joint / 2;
      u[k] = su[bi] + bt / loopN[bi];
      if (own === 255) pid[k] = part[bi] + 128;
    }
  }
}

// Bilinear sample of a grid in cm coordinates.
export function sample(grid, N, x, y) {
  const fx = (x + MARGIN) * RES, fy = (y + MARGIN) * RES;
  const i = Math.max(0, Math.min(N - 2, Math.floor(fx))), j = Math.max(0, Math.min(N - 2, Math.floor(fy)));
  const a = fx - i, b = fy - j, k = j * N + i;
  return (grid[k] * (1 - a) + grid[k + 1] * a) * (1 - b) + (grid[k + N] * (1 - a) + grid[k + N + 1] * a) * b;
}

// Scaled rings: for every point, the size s of the scaled copy of the outline (about centre C) that passes through it,
// s = |p - C| / R(angle) where R is how far the outline is from C in that direction. Rings are the sets s = level.
// ua is where along the outline (0..1 from the cleft, clockwise) the ray through the point lands: the same position on every ring.
function rayTable(poly, cx, cy, A) {
  const R = new Float32Array(A), U = new Float32Array(A), n = poly.length;
  for (let k = 0; k < A; k++) {
    const th = k / A * 2 * Math.PI, dx = Math.cos(th), dy = Math.sin(th);
    let best = Infinity, bu = 0;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n], ex = x2 - x1, ey = y2 - y1;
      const den = dx * ey - dy * ex; if (Math.abs(den) < 1e-12) continue;
      const qx = x1 - cx, qy = y1 - cy, t = (qx * ey - qy * ex) / den, w = (qx * dy - qy * dx) / den;
      if (t > 1e-6 && w >= 0 && w <= 1 && t < best) { best = t; bu = (i + w) / n; }
    }
    R[k] = best === Infinity ? 1 : best; U[k] = bu;
  }
  return { R, U, A };
}
function gaugeAt(T, x, y) {
  const { R, U, A } = T;
  let a = Math.atan2(y, x) / (2 * Math.PI); if (a < 0) a += 1;
  const f = a * A, k0 = Math.floor(f) % A, k1 = (k0 + 1) % A, w = f - Math.floor(f);
  let u0 = U[k0], u1 = U[k1]; if (u1 - u0 > 0.5) u1 -= 1; else if (u0 - u1 > 0.5) u1 += 1;
  return [Math.hypot(x, y) / (R[k0] * (1 - w) + R[k1] * w), ((u0 * (1 - w) + u1 * w) % 1 + 1) % 1];
}
export function gaugeField(poly, field, cx, cy) {
  const T = rayTable(poly, cx, cy, 4096);
  const { N } = field, s = new Float32Array(N * N), ua = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const [g, q] = gaugeAt(T, i / RES - MARGIN - cx, j / RES - MARGIN - cy);
    s[j * N + i] = g; ua[j * N + i] = q;
  }
  return { s, ua };
}
// The same for an element of separate parts: every part gets its own scaled rings, shrinking to its own centre.
export function gaugeParts(field) {
  const { N, pid, parts } = field, T = parts.map(p => rayTable(resample(p.loops[0], 240, true), p.c[0], p.c[1], 1024));
  const s = new Float32Array(N * N), ua = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, p = parts[pid[k] & 127];
    const [g, q] = gaugeAt(T[pid[k] & 127], i / RES - MARGIN - p.c[0], j / RES - MARGIN - p.c[1]);
    s[k] = g; ua[k] = q;
  }
  return { s, ua };
}

// ---------- groove field ----------
// phi in cm for every pattern except radial (radians). For concentric phi is the distance in from the contour.
export function phiAt(cfg, x, y, d, field) {
  switch (cfg.pattern) {
    case "scaled": return field?.s ? sample(field.s, field.N, x, y) : 0;
    case "concentric": return d;
    case "radial": return Math.atan2(x - cfg.cx, cfg.cy - y);
    case "chevron": return y + Math.abs(x - SIZE / 2) * Math.tan(cfg.angle * Math.PI / 180);
    default: { const a = cfg.angle * Math.PI / 180; return x * Math.cos(a) + y * Math.sin(a); }
  }
}
export const innerStart = cfg => cfg.rim > 0 ? cfg.rim + cfg.gap : 0;

// phi range over the field (inside the separation groove).
export function phiRange(cfg, field) {
  const { N, d } = field, inner = innerStart(cfg);
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i; if (d[k] < inner) continue;
    const p = phiAt(cfg, i / RES - MARGIN, j / RES - MARGIN, d[k], field);
    if (p < lo) lo = p; if (p > hi) hi = p;
  }
  return [lo, hi];
}

// Groove levels: from a scan when there is one, otherwise spread evenly so all stripes have the same width.
export function levels(cfg, field) {
  if (cfg.levels?.length) return cfg.levels.slice().sort((a, b) => a - b);
  const n = Math.max(0, Math.min(64, Math.round(cfg.count)));
  if (cfg.pattern === "scaled") return Array.from({ length: n }, (_, k) => cfg.inner + (n > 1 ? k * (cfg.outer - cfg.inner) / (n - 1) : 0));
  if (cfg.pattern === "radial") return Array.from({ length: n }, (_, k) => -Math.PI + (k + 0.5) * 2 * Math.PI / n);
  const [lo, hi] = phiRange(cfg, field), step = (hi - lo) / (n + 1);
  return Array.from({ length: n }, (_, k) => lo + (k + 1) * step);
}

// ---------- line extraction ----------
// Marching squares on a grid -> chained polylines of the iso line value = level (in cm).
export function isolines(grid, N, level, mask) {
  const segs = [], key = new Map();
  const v = k => grid[k] - level;
  const pt = (k1, k2, i1, j1, i2, j2) => { const a = v(k1), b = v(k2), t = a / (a - b); return [((i1 + (i2 - i1) * t) / RES) - MARGIN, ((j1 + (j2 - j1) * t) / RES) - MARGIN]; };
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const k = j * N + i, c = [k, k + 1, k + N + 1, k + N];
    if (mask && !(mask(c[0]) && mask(c[1]) && mask(c[2]) && mask(c[3]))) continue;
    const s = (v(c[0]) > 0 ? 1 : 0) | (v(c[1]) > 0 ? 2 : 0) | (v(c[2]) > 0 ? 4 : 0) | (v(c[3]) > 0 ? 8 : 0);
    if (s === 0 || s === 15) continue;
    // Edges: 0 top (c0-c1), 1 right (c1-c2), 2 bottom (c3-c2), 3 left (c0-c3); keys shared with the neighbour cell.
    const E = [
      () => ({ id: "h" + k, p: pt(c[0], c[1], i, j, i + 1, j) }),
      () => ({ id: "v" + (k + 1), p: pt(c[1], c[2], i + 1, j, i + 1, j + 1) }),
      () => ({ id: "h" + (k + N), p: pt(c[3], c[2], i, j + 1, i + 1, j + 1) }),
      () => ({ id: "v" + k, p: pt(c[0], c[3], i, j, i, j + 1) }),
    ];
    const centre = (v(c[0]) + v(c[1]) + v(c[2]) + v(c[3])) > 0;
    const T = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: centre ? [[3, 2], [1, 0]] : [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]],
      8: [[2, 3]], 9: [[2, 0]], 10: centre ? [[0, 3], [2, 1]] : [[0, 1], [2, 3]], 11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]] }[s];
    for (const [a, b] of T) {
      const A = E[a](), B = E[b](), id = segs.length;
      segs.push([A, B]);
      for (const e of [A.id, B.id]) { if (!key.has(e)) key.set(e, []); key.get(e).push(id); }
    }
  }
  const used = new Uint8Array(segs.length), lines = [];
  const next = (id, from) => (key.get(from) || []).find(s => s !== id && !used[s]);
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const line = [segs[s0][0].p, segs[s0][1].p];
    let tail = segs[s0][1].id, s;
    while ((s = next(-1, tail)) !== undefined) { used[s] = 1; const [A, B] = segs[s]; const far = A.id === tail ? B : A; line.push(far.p); tail = far.id; }
    let head = segs[s0][0].id;
    while ((s = next(-1, head)) !== undefined) { used[s] = 1; const [A, B] = segs[s]; const far = A.id === head ? B : A; line.unshift(far.p); head = far.id; }
    if (line.length > 2) lines.push({ pts: line, closed: head === tail });
  }
  return lines;
}

// Clip an open polyline by a closed polygon -> the pieces that lie inside, with exact crossing points.
function insidePoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function clip(line, poly) {
  const out = []; let cur = insidePoly(poly, ...line[0]) ? [line[0]] : null;
  for (let s = 0; s + 1 < line.length; s++) {
    const [x1, y1] = line[s], [x2, y2] = line[s + 1], hits = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [x3, y3] = poly[j], [x4, y4] = poly[i];
      const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4); if (!den) continue;
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den, w = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
      if (t > 0 && t <= 1 && w >= 0 && w < 1) hits.push(t);
    }
    hits.sort((a, b) => a - b);
    for (const t of hits) {
      const p = [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
      if (cur) { cur.push(p); if (cur.length > 1) out.push(cur); cur = null; } else cur = [p];
    }
    if (cur) cur.push(line[s + 1]);
  }
  if (cur && cur.length > 1) out.push(cur);
  return out.filter(p => polyLength(p) > 0.5);
}

// The analytic curve of one groove level, long enough to cross the whole box (clipped afterwards). All are straight pieces.
function grooveCurve(cfg, L) {
  if (cfg.pattern === "chevron") {
    const t = Math.tan(cfg.angle * Math.PI / 180), cx = SIZE / 2, ext = 400;
    return [[cx - ext, L - ext * t], [cx, L], [cx + ext, L - ext * t]];
  }
  if (cfg.pattern === "radial") return [[cfg.cx, cfg.cy], [cfg.cx + Math.sin(L) * 400, cfg.cy - Math.cos(L) * 400]];
  const a = cfg.angle * Math.PI / 180, nx = Math.cos(a), ny = Math.sin(a), c = SIZE / 2;
  const base = [nx * L, ny * L], dir = [-ny, nx], o = (c - base[0]) * dir[0] + (c - base[1]) * dir[1];
  return [[base[0] + dir[0] * (o - 400), base[1] + dir[1] * (o - 400)], [base[0] + dir[0] * (o + 400), base[1] + dir[1] * (o + 400)]];
}

// Full model: contour, rim edge, separation groove and every groove as separate numbered lines (pieces lettered a, b, ...).
export function build(cfgIn = {}) {
  const cfg = { ...DEFAULTS, ...cfgIn };
  const poly = outline(cfg.shape);
  const field = distanceField(poly);
  return rebuild(cfg, poly, field);
}

// Cut a polyline where it crosses the seam (x = 120), so each half gets its own pieces. A loop (last point = first point) whose
// start is not on the seam has its last and first pieces joined back into one.
function splitAtSeam(P, loop) {
  const c = SIZE / 2, out = [];
  let cur = [P[0]];
  for (let i = 1; i < P.length; i++) {
    const [x1, y1] = P[i - 1], [x2, y2] = P[i];
    if ((x1 < c && x2 > c) || (x1 > c && x2 < c)) {
      const t = (c - x1) / (x2 - x1), q = [c, y1 + (y2 - y1) * t];
      cur.push(q); out.push(cur); cur = [q];
    }
    cur.push(P[i]);
    if (x2 === c && i < P.length - 1) { out.push(cur); cur = [P[i]]; }
  }
  out.push(cur);
  if (loop && out.length > 1 && P[0][0] !== c) { const last = out.pop(); out[0] = [...last, ...out[0].slice(1)]; }
  return out.filter(p => polyLength(p) > 1);
}

// Same as build(), reusing a contour and distance field when only the groove settings changed (the slow part is the field).
// A field of several parts (heart-elements.js) gives every part its own contour and its own grooves; poly is then the first part.
export function rebuild(cfg, poly, field) {
  const { N, d } = field, inner = innerStart(cfg), multi = field.parts?.length > 1;
  if (cfg.pattern === "scaled") {
    const gk = multi ? "parts" : cfg.cx + "," + cfg.cy;
    if (field.gKey !== gk) Object.assign(field, multi ? gaugeParts(field) : gaugeField(poly, field, cfg.cx, cfg.cy), { gKey: gk });
  }
  const lev = levels(cfg, field);
  const longest = ls => ls.sort((a, b) => b.pts.length - a.pts.length);
  const rimLine = cfg.rim > 0 ? longest(isolines(d, N, cfg.rim)) : [];
  const innerLine = cfg.rim > 0 ? longest(isolines(d, N, inner)) : [];
  const sepLine = cfg.rim > 0 ? longest(isolines(d, N, cfg.rim + cfg.gap / 2)) : [];
  // Every part's own outline, as cut (inside the joints).
  const partLines = multi ? longest(isolines(d, N, 0)).filter(l => l.closed).map(l => l.pts) : [poly];
  // The field boundary: grooves are clipped to it (to the contour itself when there is no rim).
  const fieldPolys = cfg.rim > 0 ? innerLine.filter(l => l.closed).map(l => l.pts) : partLines;
  const partAt = p => field.pid ? field.pid[Math.round((p[1] + MARGIN) * RES) * N + Math.round((p[0] + MARGIN) * RES)] & 127 : 0;
  const grooves = lev.map((L, k) => {
    let pieces;
    if (cfg.pattern === "scaled" && multi) {
      // Each part's rings are the iso lines of its own gauge, kept inside the part.
      pieces = isolines(field.s, N, L, q => d[q] >= Math.max(inner, 0.2)).map(l => ({ p: l.pts, loop: l.closed }));
      pieces = pieces.flatMap(({ p, loop }) => cfg.seam > 0 ? splitAtSeam(p, loop) : [p]);
    } else if (cfg.pattern === "scaled") {
      const ring = poly.map(([x, y]) => [cfg.cx + (x - cfg.cx) * L, cfg.cy + (y - cfg.cy) * L]);
      ring.push(ring[0]);
      pieces = cfg.seam > 0 ? splitAtSeam(ring, true) : [ring];
    } else {
      if (cfg.pattern === "concentric") pieces = isolines(d, N, L).map(l => ({ p: l.pts, loop: l.closed }));
      else { const curve = grooveCurve(cfg, L); pieces = fieldPolys.flatMap(fp => clip(curve, fp)).map(p => ({ p, loop: false })); }
      pieces = pieces.flatMap(({ p, loop }) => cfg.seam > 0 ? splitAtSeam(p, loop) : [p]);
    }
    pieces = pieces.filter(p => polyLength(p) > 2);
    if (multi) pieces.forEach(p => p.part = partAt(p[Math.floor(p.length / 2)]));
    // Order pieces left to right so "a" is always the left one (by part first, for elements).
    const mx = p => p.reduce((s, v) => s + v[0], 0) / p.length;
    pieces.sort((p, q) => (p.part ?? 0) - (q.part ?? 0) || mx(p) - mx(q));
    return { id: k + 1, level: L, pieces, length: pieces.reduce((s, p) => s + polyLength(p), 0) };
  }).filter(g => g.pieces.length);
  // The seam runs down the middle from the cleft (first contour point) to the tip.
  const top = multi ? 0 : poly[0][1];
  const seamLine = cfg.seam > 0 ? [[SIZE / 2, top], [SIZE / 2, SIZE]] : null;
  // Per part: how deep it is (largest distance in from its edge), for effects that light each part as its own dome.
  const parts = (multi ? field.parts : [{ name: "הלב", c: [cfg.cx, cfg.cy], order: 0, band: 0, tilt: [0, 0] }]).map(p => ({ ...p, depth: 1 }));
  for (let k = 0; k < N * N; k++) if (d[k] > 0) { const q = parts[multi ? field.pid[k] & 127 : 0]; if (d[k] > q.depth) q.depth = d[k]; }
  return { cfg, poly, field, levels: lev, grooves, seamLine, rimLine: rimLine.map(l => l.pts), sepLine: sepLine.map(l => l.pts),
    innerLine: innerLine.map(l => l.pts), stripes: lev.length + 1, parts, partLines, multi, cleft: top,
    perimeter: partLines.reduce((s, p) => s + polyLength(p, true), 0) };
}

// ---------- channels ----------
// Every part of the heart is a separate channel, per half (same ids as the renderer's channel texture).
// Elements of separate parts add one channel per part (272 + part), over everything on that part.
export const CH = { edge: 0, seam: 2, rim: 3, sep: 5, groove: 8, band: 136, part: 272 };
export function chName(type, k, side) {
  const sd = side ? "ימין" : "שמאל";
  switch (type) {
    case "edge": return "קונטור · " + sd;
    case "seam": return "תפר מרכזי";
    case "rim": return "שוליים · " + sd;
    case "sep": return "תעלת הפרדה · " + sd;
    case "groove": return `תעלה ${k + 1} · ${sd}`;
    default: return (k === 0 ? "לב פנימי" : `לב ${k}`) + " · " + sd;
  }
}
export function channels(model) {
  const out = [], n = model.levels.length, add = (type, k, side, id) => out.push({ id, type, k, side, name: chName(type, k, side) });
  for (let sd = 0; sd < 2; sd++) add("edge", 0, sd, CH.edge + sd);
  if (model.cfg.seam > 0) add("seam", 0, 0, CH.seam);
  if (model.cfg.rim > 0) for (let sd = 0; sd < 2; sd++) { add("rim", 0, sd, CH.rim + sd); add("sep", 0, sd, CH.sep + sd); }
  for (let k = 0; k <= n; k++) for (let sd = 0; sd < 2; sd++) add("band", k, sd, CH.band + k * 2 + sd);
  for (let k = 0; k < n; k++) for (let sd = 0; sd < 2; sd++) add("groove", k, sd, CH.groove + k * 2 + sd);
  if (model.multi) model.parts.forEach((p, k) => out.push({ id: CH.part + k, type: "part", k, side: p.c[0] >= SIZE / 2 ? 1 : 0, name: p.name }));
  return out;
}
// Which channel a point (cm) is on, with the same rules as the shader. null outside the heart.
export function channelAt(model, x, y) {
  const { cfg, field, levels: lev } = model, d = sample(field.d, field.N, x, y);
  if (d < 0) return null;
  const P = model.multi ? field.pid[Math.round((y + MARGIN) * RES) * field.N + Math.round((x + MARGIN) * RES)] & 127 : -1;
  const sd = x >= SIZE / 2 ? 1 : 0, pick = (type, k = 0) => ({ id: (CH[type] + (type === "seam" ? 0 : k * 2 + sd)), type, k, side: sd,
    name: (P >= 0 ? model.parts[P].name + " · " : "") + chName(type, k, sd), part: P >= 0 ? { id: CH.part + P, k: P, name: model.parts[P].name } : null });
  if (d < cfg.edge) return pick("edge");
  if (cfg.rim > 0 && d < cfg.rim) return pick("rim");
  if (cfg.rim > 0 && d < cfg.rim + cfg.gap) return pick("sep");
  if (cfg.seam > 0 && Math.abs(x - SIZE / 2) < cfg.seam / 2 && y > model.cleft) return pick("seam");
  const phi = phiAt(cfg, x, y, d, field);
  let gd = Infinity, gi = 0, si = 0, gs = 1;
  if (cfg.pattern === "scaled") { const e = 0.5; gs = Math.hypot(sample(field.s, field.N, x + e, y) - sample(field.s, field.N, x - e, y), sample(field.s, field.N, x, y + e) - sample(field.s, field.N, x, y - e)); }
  const r = Math.hypot(x - cfg.cx, y - cfg.cy);
  lev.forEach((L, k) => {
    let df = phi - L;
    if (cfg.pattern === "radial") df = ((df + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI, df *= r;
    else if (cfg.pattern === "scaled") df /= gs || 1e-5;
    if (Math.abs(df) < gd) { gd = Math.abs(df); gi = k; }
    if (phi > L) si = k + 1;
  });
  if (cfg.pattern === "radial" && si === lev.length) si = 0;
  return gd < cfg.width / 2 ? pick("groove", gi) : pick("band", si);
}

// ---------- drawings ----------
const f1 = v => Math.round(v * 10) / 10;
const pathD = (pts, closed) => "M" + pts.map(p => f1(p[0]) + " " + f1(p[1])).join("L") + (closed ? "Z" : "");
export const grooveColor = (k, n) => `hsl(${Math.round((k / Math.max(1, n)) * 300 + 190) % 360} 85% 58%)`;
// Pieces of a groove: 3a, 3b ... on the heart; part.groove (12.3) on an element of separate parts.
export const pieceName = (g, i) => g.pieces[i].part != null ? `${g.pieces[i].part + 1}.${g.id}` + (g.pieces.filter(p => p.part === g.pieces[i].part).length > 1 ? "abcdefgh"[g.pieces.slice(0, i).filter(p => p.part === g.pieces[i].part).length] || "" : "")
  : g.pieces.length > 1 ? g.id + ("abcdefgh"[i] || "." + (i + 1)) : String(g.id);

// Cutting / mapping plan: every part a separate group and every groove its own path id, 1 unit = 1 cm.
export function toSVG(model, opts = {}) {
  const { cfg, poly, grooves } = model, labels = opts.labels !== false;
  const pad = 18, W = SIZE + pad * 2;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${W} ${W + 6}" width="${opts.px || "240cm"}" height="${opts.px || "246cm"}" font-family="Heebo, sans-serif">`);
  out.push(`<rect x="${-pad}" y="${-pad}" width="${W}" height="${W + 6}" fill="${opts.bg || "#05070a"}"/>`);
  out.push(`<g id="frame" stroke="#3b4658" stroke-width=".4" fill="none" stroke-dasharray="2 2"><rect x="0" y="0" width="${SIZE}" height="${SIZE}"/></g>`);
  out.push(`<g id="dimensions" fill="#8592a6" font-size="5" text-anchor="middle"><text x="${SIZE / 2}" y="${-6}">240 ס״מ</text><text x="${-8}" y="${SIZE / 2}" transform="rotate(-90 ${-8} ${SIZE / 2})">240 ס״מ</text></g>`);
  out.push(`<g id="contour" fill="none" stroke="#ff3b5c" stroke-width="${Math.max(0.6, cfg.edge)}">` + (model.multi
    ? model.partLines.map((p, i) => `<path id="part-${i + 1}" d="${pathD(p, true)}"/>`).join("") : `<path id="contour-outer" d="${pathD(poly, true)}"/>`) + `</g>`);
  if (model.multi && labels) out.push(`<g id="part-labels" font-size="4" font-weight="700" fill="#ff8fa3" text-anchor="middle" dominant-baseline="central">`
    + model.parts.map((p, i) => `<text x="${f1(p.c[0])}" y="${f1(p.c[1])}">${i + 1}</text>`).join("") + `</g>`);
  if (cfg.rim > 0) {
    out.push(`<g id="rim" fill="none" stroke="#ffb3c1" stroke-width=".5" stroke-dasharray="3 1.5">${model.rimLine.map((p, i) => `<path id="rim-inner-${i + 1}" d="${pathD(p, true)}"/>`).join("")}</g>`);
    out.push(`<g id="separation" fill="none" stroke="#ffd166" stroke-opacity=".9" stroke-width="${cfg.gap}">${model.sepLine.map((p, i) => `<path id="separation-${i + 1}" d="${pathD(p, true)}"/>`).join("")}</g>`);
  }
  if (model.seamLine) out.push(`<g id="seam" stroke="#9fe8ff" stroke-width="${cfg.seam}"><path id="seam-centre" d="${pathD(model.seamLine)}"/></g>`);
  out.push(`<g id="grooves" fill="none" stroke-linecap="round" stroke-width="${cfg.width}">`);
  grooves.forEach((g, k) => g.pieces.forEach((p, i) => out.push(`<path id="groove-${pieceName(g, i)}" stroke="${grooveColor(k, grooves.length)}" d="${pathD(p)}"/>`)));
  out.push(`</g>`);
  if (labels) {
    out.push(`<g id="labels" font-size="2.6" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="central">`);
    grooves.forEach((g, k) => g.pieces.forEach((p, i) => {
      // Rings: label where they are furthest apart (the outer side of each half); straight grooves: in the middle.
      const m = cfg.pattern === "scaled" || cfg.pattern === "concentric"
        ? p.reduce((a, q) => Math.abs(q[0] - SIZE / 2) - Math.abs(q[1] - cfg.cy) * 0.15 > Math.abs(a[0] - SIZE / 2) - Math.abs(a[1] - cfg.cy) * 0.15 ? q : a)
        : p[Math.floor(p.length / 2)];
      out.push(`<circle cx="${f1(m[0])}" cy="${f1(m[1])}" r="2.1" fill="#05070a" stroke="${grooveColor(k, grooves.length)}" stroke-width=".5"/><text x="${f1(m[0])}" y="${f1(m[1])}">${pieceName(g, i)}</text>`);
    }));
    out.push(`</g>`);
  }
  out.push(`</svg>`);
  return out.join("\n");
}

// Everything as plain numbers, for other mapping software.
export function toJSON(model) {
  const r = p => p.map(([x, y]) => [f1(x), f1(y)]);
  return {
    unit: "cm", width: SIZE, height: SIZE, origin: "top-left, y down",
    settings: { ...model.cfg },
    contour: r(model.poly), perimeter: f1(model.perimeter),
    parts: model.multi ? model.parts.map((p, i) => ({ id: i + 1, name: p.name, centre: r([p.c])[0], order: f1(p.order), band: f1(p.band), tilt: p.tilt.map(f1),
      loops: p.loops.map(r) })) : undefined,
    partOutlines: model.multi ? model.partLines.map(r) : undefined,
    seam: model.seamLine && r(model.seamLine), rimInner: model.rimLine.map(r), separation: model.sepLine.map(r),
    grooves: model.grooves.map(g => ({ id: g.id, level: Math.round(g.level * 1000) / 1000, length: f1(g.length), pieces: g.pieces.map((p, i) => ({ name: pieceName(g, i), part: p.part != null ? p.part + 1 : undefined, points: r(p) })) })),
    stripes: model.stripes,
  };
}
