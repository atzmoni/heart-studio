// Live painting on the heart from a phone, a tablet or the studio itself (heart-paint.js).
// Strokes are kept in heart space (cm, 0..240 on both axes), so a line drawn on the phone lands on the same place of the
// physical heart whatever the projector calibration is. The studio draws them into a heart-space canvas that heart-gl.js
// lays over the show (masked to the cut: the whole heart, only the grooves, the stripes or the contour) with a neon glow.
//
// Everything travels as small events, the same on every device:
//   { t: "b", id, k: brush, c: "#rrggbb", w: cm, m: mirror 0/1 }   begin a stroke (id = "<client>:<n>")
//   { t: "p", id, p: [x, y, pressure, ...] }                         more points (cm, pressure 0..2)
//   { t: "e", id }                                                   end
//   { t: "u", cid }  undo that client's last stroke     { t: "x" }  clear     { t: "s", ...settings }  look of the layer
// In the desktop app a small relay (desktop/paint-relay.js) passes them between the phones and the studio over the local
// Wi-Fi, with no internet. Without it the studio still paints from its own panel.

export const SIZE = 240;

export const BRUSHES = [
  ["neon", "✨", "ניאון"], ["marker", "🖊️", "טוש"], ["brush", "🖌️", "מכחול"], ["rainbow", "🌈", "קשת"],
  ["spray", "💨", "ספריי"], ["dots", "⚪", "נקודות"], ["stars", "⭐", "כוכבים"], ["eraser", "🧽", "מחק"],
];
export const COLORS = ["#ff2bd6", "#ff3b5c", "#ff7a00", "#ffe600", "#7dff2b", "#00ff9c", "#00e5ff", "#2b7bff", "#8a2bff", "#ffffff"];
export const MASKS = [[0, "כל הלב"], [1, "רק בתעלות"], [2, "רק בין התעלות"], [13, "תעלות וקונטור"], [3, "רק הקונטור"]];
export const FADES = [[0, "נשאר"], [3, "3 שניות"], [6, "6 שניות"], [12, "12 שניות"], [30, "30 שניות"]];
export const DEFAULT_SET = { mask: 0, blend: "add", glow: 0.6, op: 1, pulse: 0.25, dim: 0, fade: 0 };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const rng = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const r1 = v => Math.round(v * 10) / 10;

// ---------------- the board: strokes and their picture in heart space ----------------
// out is what gets shown (the colour of the strokes with their white neon cores on top). It is redrawn from the strokes
// only when something is undone, cleared or fading; new points are drawn as they arrive.
export class Board {
  constructor(n = 1024) {
    this.n = n; this.sc = n / SIZE;
    const mk = () => { const c = document.createElement("canvas"); c.width = c.height = n; return c; };
    this.out = mk(); this.base = mk(); this.core = mk();
    this.bx = this.base.getContext("2d"); this.cx = this.core.getContext("2d"); this.ox = this.out.getContext("2d");
    this.strokes = []; this.byId = new Map(); this.set = { ...DEFAULT_SET };
    this.dirty = true; this.version = 0; this.alpha = 1; this.lastFade = 0;
    this.onSet = null; this.onChange = null;
  }
  get empty() { return !this.strokes.length; }
  apply(evs) {
    let full = false;
    for (const e of evs || []) {
      if (!e || typeof e !== "object") continue;
      if (e.t === "b" && typeof e.id === "string" && !this.byId.has(e.id)) {
        const k = BRUSHES.some(b => b[0] === e.k) ? e.k : "neon";
        const s = { id: e.id, cid: e.id.split(":")[0], k, c: /^#[0-9a-f]{6}$/i.test(e.c) ? e.c : "#ff2bd6", w: clamp(+e.w || 3, 0.3, 40),
          m: e.m ? 1 : 0, pts: [], born: performance.now(), end: 0, seed: hash(e.id) };
        this.strokes.push(s); this.byId.set(s.id, s); this.fresh(s);
      } else if (e.t === "p") {
        const s = this.byId.get(e.id); if (!s || !Array.isArray(e.p)) continue;
        for (let i = 0; i + 2 < e.p.length; i += 3) {
          const x = +e.p[i], y = +e.p[i + 1]; if (!isFinite(x) || !isFinite(y)) continue;
          s.pts.push(clamp(x, -20, SIZE + 20), clamp(y, -20, SIZE + 20), clamp(+e.p[i + 2] || 1, 0.1, 2));
          this.paint(s, s.pts.length / 3 - 1);
        }
      } else if (e.t === "e") { const s = this.byId.get(e.id); if (s) s.end = performance.now(); }
      else if (e.t === "u") {
        for (let i = this.strokes.length - 1; i >= 0; i--) if (this.strokes[i].cid === e.cid) { this.byId.delete(this.strokes[i].id); this.strokes.splice(i, 1); full = true; break; }
      } else if (e.t === "x") { this.strokes = []; this.byId.clear(); full = true; }
      else if (e.t === "s") {
        for (const k of Object.keys(DEFAULT_SET)) if (e[k] != null) this.set[k] = typeof DEFAULT_SET[k] === "number" ? clamp(+e[k] || 0, 0, k === "fade" ? 600 : k === "mask" ? 13 : 1) : String(e[k]);
        this.onSet?.(this.set);
      }
    }
    if (full) this.redraw();
    this.onChange?.();
  }
  reset() { this.strokes = []; this.byId.clear(); this.redraw(); }
  // The board as events, to hand it to a relay that started after the strokes were drawn.
  dump() {
    const ev = [];
    for (const s of this.strokes) { ev.push({ t: "b", id: s.id, k: s.k, c: s.c, w: s.w, m: s.m }, { t: "p", id: s.id, p: s.pts.map(r1) }); if (s.end) ev.push({ t: "e", id: s.id }); }
    return ev;
  }
  fresh(s) { s.len = 0; s.carry = 0; s.lw = 0; s.hue = s.seed % 360; }
  redraw() {
    const n = this.n; this.bx.clearRect(0, 0, n, n); this.cx.clearRect(0, 0, n, n);
    for (const s of this.strokes) { this.fresh(s); for (let i = 0; i < s.pts.length / 3; i++) this.paint(s, i); }
    this.dirty = true;
  }
  // Fading strokes: every 60 ms the board is redrawn with each finished stroke as faint as its age; gone ones are dropped.
  tick(now = performance.now()) {
    const f = this.set.fade * 1000;
    if (f > 0 && this.strokes.some(s => s.end) && now - this.lastFade > 60) {
      this.lastFade = now;
      this.strokes = this.strokes.filter(s => !s.end || now - s.end < f || (this.byId.delete(s.id), false));
      const n = this.n; this.bx.clearRect(0, 0, n, n); this.cx.clearRect(0, 0, n, n);
      for (const s of this.strokes) { this.alpha = s.end ? clamp(1 - (now - s.end) / f, 0, 1) : 1; this.fresh(s); for (let i = 0; i < s.pts.length / 3; i++) this.paint(s, i); }
      this.alpha = 1; this.dirty = true;
    }
    if (this.dirty) {
      const n = this.n; this.ox.clearRect(0, 0, n, n); this.ox.drawImage(this.base, 0, 0); this.ox.drawImage(this.core, 0, 0);
      this.dirty = false; this.version++; return true;
    }
    return false;
  }
  // Point i of stroke s (and the line to it from point i-1), drawn into base (colour) and core (white neon core).
  paint(s, i) {
    const P = s.pts, x = P[i * 3], y = P[i * 3 + 1], pr = P[i * 3 + 2];
    const px = i ? P[i * 3 - 3] : x, py = i ? P[i * 3 - 2] : y, d = Math.hypot(x - px, y - py);
    s.len += d;
    for (const mir of s.m ? [0, 1] : [0]) {
      for (const c of [this.bx, this.cx]) { c.save(); c.scale(this.sc, this.sc); if (mir) { c.translate(SIZE, 0); c.scale(-1, 1); } c.lineCap = c.lineJoin = "round"; }
      this.brush(s, i, px, py, x, y, pr, d, mir);
      for (const c of [this.bx, this.cx]) c.restore();
    }
    this.dirty = true;
  }
  brush(s, i, px, py, x, y, pr, d, mir) {
    const B = this.bx, C = this.cx, a = this.alpha, w = s.w * pr, R = rng(s.seed + i * 7919 + mir * 104729);
    const line = (c, col, lw, al = 1) => { c.globalAlpha = a * al; c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.moveTo(px, py); c.lineTo(x + (d ? 0 : 0.001), y); c.stroke(); };
    switch (s.k) {
      case "neon": line(B, s.c, w); line(C, "#ffffff", w * 0.36, 0.85); break;
      case "marker": line(B, s.c, w); break;
      case "brush": {   // thick when slow, thin when fast, like a loaded brush
        const want = s.w * pr * clamp(1.35 - d / (s.w * 0.9), 0.3, 1.35);
        s.lw = i ? s.lw * 0.65 + want * 0.35 : want * 0.7; line(B, s.c, s.lw, 0.95); break;
      }
      case "rainbow": { const col = `hsl(${(s.hue + s.len * 2.2) % 360} 100% 55%)`; line(B, col, w); line(C, "#ffffff", w * 0.32, 0.8); break; }
      case "spray": {
        const n = Math.max(1, Math.round(d / (s.w * 0.25))) * 14; B.fillStyle = s.c;
        for (let k = 0; k < n; k++) {
          const t = R(), r = s.w * 1.3 * pr * Math.sqrt(R()), an = R() * 6.2832, dot = 0.25 + R() * 0.35;
          B.globalAlpha = a * (0.35 + R() * 0.5); B.fillRect(px + (x - px) * t + Math.cos(an) * r, py + (y - py) * t + Math.sin(an) * r, dot, dot);
        }
        break;
      }
      case "dots": case "stars": {
        const gap = s.w * (s.k === "dots" ? 1.7 : 2.6);
        let t = i ? gap - s.carry : 0, last = -1;
        for (; t <= d + 1e-6; t += gap) {
          last = t;
          const k = d ? t / d : 0, qx = px + (x - px) * k, qy = py + (y - py) * k;
          if (s.k === "dots") {
            B.globalAlpha = a; B.fillStyle = s.c; B.beginPath(); B.arc(qx, qy, w * 0.5, 0, 6.2832); B.fill();
            C.globalAlpha = a * 0.8; C.fillStyle = "#fff"; C.beginPath(); C.arc(qx, qy, w * 0.16, 0, 6.2832); C.fill();
          } else {
            const r = w * (0.55 + R() * 0.7), rot = R() * 1.6;
            star(B, qx, qy, r, rot, s.c, a); star(C, qx, qy, r * 0.4, rot, "#fff", a * 0.9);
          }
        }
        s.carry = last >= 0 ? d - last : s.carry + d; break;
      }
      case "eraser":
        for (const c of [B, C]) { c.globalCompositeOperation = "destination-out"; line(c, "#000", s.w * 1.6); c.globalCompositeOperation = "source-over"; }
        break;
    }
  }
}
function star(c, x, y, r, rot, col, a) {
  c.globalAlpha = a; c.fillStyle = col; c.beginPath();
  for (let k = 0; k < 8; k++) { const an = rot + k * Math.PI / 4, rr = k % 2 ? r * 0.28 : r; c.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
  c.closePath(); c.fill();
}

// ---------------- the link to the relay (desktop app): live events in, batched events out ----------------
export class Link {
  // base: "http://host:port" of the relay; key: the code the relay asks of phones; onEvents(evs, replay); onState(on).
  constructor({ base, key = "", cid, onEvents, onState = () => {}, onGuide = () => {} }) {
    Object.assign(this, { base, key, cid, onEvents, onState, onGuide });
    this.q = []; this.busy = false; this.on = false; this.closed = false;
  }
  url(p) { return this.base + p + (this.key ? (p.includes("?") ? "&" : "?") + "k=" + encodeURIComponent(this.key) : ""); }
  start() {
    if (this.closed) return;
    const es = this.es = new EventSource(this.url("/events"));
    es.onopen = () => { this.on = true; this.onState(true); this.flush(); };
    es.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.reset) this.onEvents(m.ev || [], true);
      else if (m.guide) this.onGuide();
      else if (m.cid !== this.cid) this.onEvents(m.ev || [], false);
    };
    // No relay (the browser version) or it went away: try again calmly instead of the browser's every-3-seconds retry.
    es.onerror = () => {
      if (this.on && es.readyState !== EventSource.CLOSED) { this.on = false; this.onState(false); return; }
      this.on = false; this.onState(false); es.close(); clearTimeout(this.rt); this.rt = setTimeout(() => this.start(), 4000);
    };
  }
  stop() { this.closed = true; clearTimeout(this.rt); this.es?.close(); }
  send(evs) {
    this.q.push(...evs); if (this.q.length > 20000) this.q.splice(0, this.q.length - 20000);
    if (!this.ft) this.ft = setTimeout(() => { this.ft = 0; this.flush(); }, 25);
  }
  // One request at a time, so the events arrive in the order they were drawn.
  async flush() {
    if (this.busy || !this.q.length || !this.on) return;
    this.busy = true; const ev = this.q.splice(0, this.q.length);
    try {
      const r = await fetch(this.url("/ev"), { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ cid: this.cid, ev }) });
      if (!r.ok) throw new Error(r.status);
    } catch { this.q.unshift(...ev); }
    this.busy = false;
    if (this.q.length) setTimeout(() => this.flush(), this.on ? 25 : 1000);
  }
}

// ---------------- the painter: the drawing pad and the painter's toolbar (phone page and studio panel) ----------------
const CSS = `
.hp{display:flex;flex-direction:column;gap:8px;color:#e9edf3;font:14px/1.3 Heebo,system-ui,sans-serif;user-select:none;-webkit-user-select:none}
.hp-pad{position:relative;width:100%;aspect-ratio:1;background:#000;border-radius:12px;overflow:hidden;touch-action:none;box-shadow:0 0 0 1px #2a3342 inset}
.hp-pad img,.hp-pad canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.hp-pad img{opacity:.38}.hp-pad.noguide img{display:none}
.hp-tools{display:flex;flex-direction:column;gap:8px}
.hp-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.hp button{appearance:none;border:1px solid #2f3a4b;background:#151b25;color:inherit;border-radius:10px;min-width:42px;height:42px;padding:0 8px;font:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:4px}
.hp button[aria-pressed=true]{border-color:#ff4fd8;background:#3a1438;box-shadow:0 0 10px #ff4fd855}
.hp .hp-b{flex-direction:column;height:52px;min-width:52px;font-size:20px;line-height:1}.hp .hp-b small{font-size:10px;opacity:.85}
.hp .hp-c{width:34px;min-width:34px;height:34px;border-radius:50%;padding:0;border:2px solid #0000;box-shadow:0 0 8px var(--c)}
.hp .hp-c[aria-pressed=true]{border-color:#fff;background:var(--c)}
.hp input[type=color]{width:38px;height:38px;border:0;padding:0;background:none;border-radius:50%}
.hp label{display:flex;gap:8px;align-items:center;flex:1;min-width:150px}.hp label input[type=range]{flex:1;accent-color:#ff4fd8}
.hp select{background:#151b25;color:inherit;border:1px solid #2f3a4b;border-radius:8px;height:36px;font:inherit;flex:1}
.hp-set{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;padding:8px;border:1px solid #2a3342;border-radius:10px}
.hp-set[hidden]{display:none}
.hp-dot{width:10px;height:10px;border-radius:50%;background:#e33;box-shadow:0 0 6px #e33}.hp-dot.on{background:#2e6;box-shadow:0 0 6px #2e6}
`;
let cssDone = false;

// el: the container. board: a Board (its out canvas becomes the pad's picture). emit(evs): where the painter's events go
// (the caller applies them to the board too). cid: this device's id in stroke ids.
export function mountPainter(el, { board, emit, cid, guide = "", connected = null }) {
  if (!cssDone) { const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st); cssDone = true; }
  const st = { k: "neon", c: COLORS[0], w: 3, m: 0, n: 0, guide: true };
  try { Object.assign(st, JSON.parse(localStorage.getItem("heartpaint.tool") || "{}")); } catch {}
  const save = () => { try { localStorage.setItem("heartpaint.tool", JSON.stringify({ k: st.k, c: st.c, w: st.w, m: st.m, guide: st.guide })); } catch {} };
  el.classList.add("hp");
  el.innerHTML = `<div class="hp-pad${st.guide ? "" : " noguide"}"><img alt=""></div>
  <div class="hp-tools">
    <div class="hp-row hp-brushes">${BRUSHES.map(([k, i, n]) => `<button class="hp-b" data-k="${k}" title="${n}">${i}<small>${n}</small></button>`).join("")}</div>
    <div class="hp-row hp-colors">${COLORS.map(c => `<button class="hp-c" data-c="${c}" style="--c:${c};background:${c}" aria-label="${c}"></button>`).join("")}<input type="color" aria-label="צבע אחר"></div>
    <div class="hp-row"><label>עובי <input type="range" class="hp-w" min="0.5" max="20" step="0.5"></label><b class="hp-wv"></b></div>
    <div class="hp-row">
      <button data-a="mirror" title="ציור סימטרי בשני החצאים">🪞 מראה</button>
      <button data-a="undo" title="ביטול הקו האחרון">↶ ביטול</button>
      <button data-a="clear" title="ניקוי כל הציור">🗑️ ניקוי</button>
      <button data-a="guide" title="קווי התעלות ברקע">❤️ תעלות</button>
      <button data-a="set" title="איך הציור נראה על הלב">⚙️ על הלב</button>
      ${connected ? `<span class="hp-dot" title="חיבור לסטודיו"></span>` : ""}
    </div>
    <div class="hp-set" hidden>
      <label>איפה<select data-s="mask">${MASKS.map(([v, n]) => `<option value="${v}">${n}</option>`).join("")}</select></label>
      <label>מיזוג<select data-s="blend"><option value="add">זוהר (מוסיף אור)</option><option value="over">מכסה את האפקט</option></select></label>
      <label>דהייה<select data-s="fade">${FADES.map(([v, n]) => `<option value="${v}">${n}</option>`).join("")}</select></label>
      <label>זוהר ניאון <input type="range" data-s="glow" min="0" max="1" step="0.05"></label>
      <label>פעימה עם המוזיקה <input type="range" data-s="pulse" min="0" max="1" step="0.05"></label>
      <label>עוצמת הציור <input type="range" data-s="op" min="0" max="1" step="0.05"></label>
      <label>החשכת האפקט מתחת <input type="range" data-s="dim" min="0" max="1" step="0.05"></label>
    </div>
  </div>`;
  const $ = s => el.querySelector(s), pad = $(".hp-pad"), img = $(".hp-pad img");
  pad.appendChild(board.out);
  const setGuide = src => { img.src = src || ""; img.hidden = !src; };
  setGuide(guide);
  function sync() {
    el.querySelectorAll("[data-k]").forEach(b => b.setAttribute("aria-pressed", b.dataset.k === st.k));
    el.querySelectorAll("[data-c]").forEach(b => b.setAttribute("aria-pressed", b.dataset.c === st.c));
    $("input[type=color]").value = st.c; $(".hp-w").value = st.w; $(".hp-wv").textContent = st.w + " ס״מ";
    $('[data-a="mirror"]').setAttribute("aria-pressed", !!st.m); $('[data-a="guide"]').setAttribute("aria-pressed", st.guide);
    pad.classList.toggle("noguide", !st.guide);
  }
  function syncSet(s = board.set) {
    el.querySelectorAll("[data-s]").forEach(i => { if (document.activeElement !== i) i.value = s[i.dataset.s]; });
  }
  sync(); syncSet();
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.k) st.k = b.dataset.k;
    else if (b.dataset.c) { st.c = b.dataset.c; if (st.k === "eraser") st.k = "neon"; }
    else if (b.dataset.a === "mirror") st.m = st.m ? 0 : 1;
    else if (b.dataset.a === "guide") st.guide = !st.guide;
    else if (b.dataset.a === "undo") out([{ t: "u", cid }]);
    else if (b.dataset.a === "clear") { if (board.empty || confirm("לנקות את כל הציור מהלב?")) out([{ t: "x" }]); }
    else if (b.dataset.a === "set") { const s = $(".hp-set"); s.hidden = !s.hidden; b.setAttribute("aria-pressed", !s.hidden); }
    sync(); save();
  });
  $("input[type=color]").oninput = e => { st.c = e.target.value; if (st.k === "eraser") st.k = "neon"; sync(); save(); };
  $(".hp-w").oninput = e => { st.w = +e.target.value; sync(); save(); };
  el.querySelectorAll("[data-s]").forEach(i => i.oninput = () => out([{ t: "s", [i.dataset.s]: i.tagName === "SELECT" && i.dataset.s === "blend" ? i.value : +i.value }]));
  function out(evs) { board.apply(evs); emit(evs); }

  // Drawing: every finger (or pen) is its own stroke; points are collected per frame and sent together.
  const live = new Map(); let pend = new Map(), raf = 0;
  const toCm = e => { const r = pad.getBoundingClientRect(); return [r1((e.clientX - r.left) / r.width * SIZE), r1((e.clientY - r.top) / r.height * SIZE)]; };
  const pres = e => e.pointerType === "pen" ? clamp(e.pressure * 1.6, 0.15, 2) : 1;
  const queue = (id, e) => {
    const list = pend.get(id) || []; pend.set(id, list);
    for (const q of e.getCoalescedEvents?.() || [e]) { const [x, y] = toCm(q); const n = list.length; if (n && Math.abs(list[n - 3] - x) + Math.abs(list[n - 2] - y) < 0.15) continue; list.push(x, y, Math.round(pres(q) * 100) / 100); }
    if (!raf) raf = requestAnimationFrame(push);
  };
  function push() {
    raf = 0; const evs = [];
    for (const [id, p] of pend) if (p.length) evs.push({ t: "p", id, p });
    pend = new Map(); if (evs.length) out(evs);
  }
  pad.addEventListener("pointerdown", e => {
    e.preventDefault(); pad.setPointerCapture(e.pointerId);
    const id = `${cid}:${Date.now().toString(36)}${(st.n++).toString(36)}`; live.set(e.pointerId, id);
    out([{ t: "b", id, k: st.k, c: st.c, w: st.w, m: st.m }]); queue(id, e);
  });
  pad.addEventListener("pointermove", e => { const id = live.get(e.pointerId); if (id) queue(id, e); });
  const up = e => { const id = live.get(e.pointerId); if (!id) return; live.delete(e.pointerId); cancelAnimationFrame(raf); push(); out([{ t: "e", id }]); };
  pad.addEventListener("pointerup", up); pad.addEventListener("pointercancel", up);
  pad.addEventListener("contextmenu", e => e.preventDefault());
  board.onSet = s => syncSet(s);
  return {
    setGuide, syncSet,
    setConnected(on) { const d = $(".hp-dot"); if (d) { d.classList.toggle("on", on); d.title = on ? "מחובר לסטודיו" : "אין חיבור לסטודיו"; } },
  };
}

// The cut as a background for the pad: contour and grooves of the current heart, 0..240 cm (from heart-geo.js toSVG).
export const guideSVG = svg => svg.replace(/viewBox="[^"]*"/, `viewBox="0 0 ${SIZE} ${SIZE}"`).replace(/ width="[^"]*" height="[^"]*"/, ` width="${SIZE * 4}" height="${SIZE * 4}"`);
export const svgURL = svg => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

// ---------------- QR code (byte mode, error level L, versions 1-5): the phone opens the painter by scanning it ----------------
const QR_DATA = [0, 19, 34, 55, 80, 108], QR_EC = [0, 7, 10, 15, 20, 26];
function gfMul(a, b) { let r = 0; for (let i = 7; i >= 0; i--) { r = (r << 1) ^ ((r >>> 7) * 0x11d); r ^= ((b >>> i) & 1) * a; } return r & 255; }
function rsRemainder(data, deg) {
  const div = new Array(deg).fill(0); div[deg - 1] = 1; let root = 1;
  for (let i = 0; i < deg; i++) { for (let j = 0; j < deg; j++) { div[j] = gfMul(div[j], root); if (j + 1 < deg) div[j] ^= div[j + 1]; } root = gfMul(root, 2); }
  const res = new Array(deg).fill(0);
  for (const b of data) { const f = b ^ res.shift(); res.push(0); div.forEach((c, i) => res[i] ^= gfMul(c, f)); }
  return res;
}
// Returns rows of booleans (true = dark), or null if the text is too long.
export function qr(text) {
  const bytes = [...new TextEncoder().encode(text)];
  const v = [1, 2, 3, 4, 5].find(v => 4 + 8 + bytes.length * 8 <= QR_DATA[v] * 8); if (!v) return null;
  const bits = []; const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, 8); bytes.forEach(b => put(b, 8));
  const cap = QR_DATA[v] * 8; put(0, Math.min(4, cap - bits.length)); while (bits.length % 8) bits.push(0);
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let p = 0xec; data.length < QR_DATA[v]; p ^= 0xec ^ 0x11) data.push(p);
  const all = data.concat(rsRemainder(data, QR_EC[v]));
  const n = 17 + 4 * v, M = Array.from({ length: n }, () => new Array(n).fill(false)), F = Array.from({ length: n }, () => new Array(n).fill(false));
  const fn = (x, y, d) => { M[y][x] = d; F[y][x] = true; };
  for (let i = 0; i < n; i++) { fn(6, i, i % 2 === 0); fn(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]])
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < n && y >= 0 && y < n) fn(x, y, dist !== 2 && dist !== 4);
    }
  if (v > 1) { const a = n - 7; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fn(a + dx, a + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }
  const format = mask => {
    const d = (1 << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412, g = i => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) fn(8, i, g(i));
    fn(8, 7, g(6)); fn(8, 8, g(7)); fn(7, 8, g(8));
    for (let i = 9; i < 15; i++) fn(14 - i, 8, g(i));
    for (let i = 0; i < 8; i++) fn(n - 1 - i, 8, g(i));
    for (let i = 8; i < 15; i++) fn(8, n - 15 + i, g(i));
    fn(8, n - 8, true);
  };
  format(0);
  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? n - 1 - vert : vert;
      if (!F[y][x] && i < all.length * 8) { M[y][x] = ((all[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!F[y][x] && (x + y) % 2 === 0) M[y][x] = !M[y][x];   // mask 0
  return M;
}
export function qrSVG(text, px = 180) {
  const M = qr(text); if (!M) return "";
  const n = M.length, q = 4, path = [];
  M.forEach((row, y) => row.forEach((d, x) => d && path.push(`M${x + q} ${y + q}h1v1h-1z`)));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + q * 2} ${n + q * 2}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path.join("")}" fill="#000"/></svg>`;
}
