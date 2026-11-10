// A phone as a live camera for the heart, over the local Wi-Fi (no internet, no app to install).
// The desktop app runs a small relay (desktop/cam-relay.js): the phone opens https://<this computer>:8768/?k=<code> (the studio
// shows it as a QR code), allows its camera and sends JPEG frames; the studio pulls the newest frame from the relay on
// http://127.0.0.1:8769 and paints it on a canvas whose stream becomes the studio's video, so every camera effect
// (206-215, the depth sculptures 223-225) and the "video on the heart" slider work with the phone as with a USB camera.
export const RELAY = "http://127.0.0.1:8769";

export class PhoneCam {
  constructor(base = RELAY) {
    this.base = base; this.cv = document.createElement("canvas"); this.cv.width = 640; this.cv.height = 480;
    this.cx = this.cv.getContext("2d"); this.on = false; this.seq = 0; this.n = 0; this.fps = 0; this.last = 0; this.onstatus = null;
  }
  // { key, urls: [{ name, url }], phone: seconds since the last frame or null } or null when there is no relay.
  async info() {
    try { const r = await fetch(this.base + "/info", { cache: "no-store" }); return r.ok ? await r.json() : null; } catch { return null; }
  }
  start() {
    if (this.on) return this.stream;
    this.on = true; this.ac = new AbortController();
    this.cx.fillStyle = "#000"; this.cx.fillRect(0, 0, this.cv.width, this.cv.height);
    this.stream = this.cv.captureStream(30);
    this.loop(); return this.stream;
  }
  stop() { this.on = false; this.ac?.abort(); this.stream?.getTracks().forEach(t => t.stop()); this.stream = null; }
  status(s) { this.onstatus?.(s); }
  async loop() {
    let t0 = performance.now(), k = 0;
    while (this.on) {
      try {
        // Long poll: the relay answers as soon as a newer frame than this.seq arrives (or 204 after a while).
        const r = await fetch(`${this.base}/frame?after=${this.seq}`, { cache: "no-store", signal: this.ac.signal });
        if (r.status === 204) { this.status("wait"); continue; }
        if (!r.ok) throw new Error(r.status);
        this.seq = +r.headers.get("x-seq") || this.seq + 1;
        const bmp = await createImageBitmap(await r.blob());
        if (bmp.width !== this.cv.width || bmp.height !== this.cv.height) { this.cv.width = bmp.width; this.cv.height = bmp.height; }
        this.cx.drawImage(bmp, 0, 0); bmp.close?.();
        k++; this.last = performance.now();
        if (this.last - t0 > 1000) { this.fps = Math.round(k * 1000 / (this.last - t0)); k = 0; t0 = this.last; this.status("live"); }
      } catch (e) {
        if (!this.on) break;
        this.status("norelay"); await new Promise(ok => setTimeout(ok, 1500));
      }
    }
  }
}

// ---------------- QR code (byte mode, error level L, versions 1-5), so the phone opens the camera page by scanning ----------------
const QR_DATA = [0, 19, 34, 55, 80, 108], QR_EC = [0, 7, 10, 15, 20, 26];
function gfMul(a, b) { let r = 0; for (let i = 7; i >= 0; i--) { r = (r << 1) ^ ((r >>> 7) * 0x11d); r ^= ((b >>> i) & 1) * a; } return r & 255; }
function rsRemainder(data, deg) {
  const div = new Array(deg).fill(0); div[deg - 1] = 1; let root = 1;
  for (let i = 0; i < deg; i++) { for (let j = 0; j < deg; j++) { div[j] = gfMul(div[j], root); if (j + 1 < deg) div[j] ^= div[j + 1]; } root = gfMul(root, 2); }
  const res = new Array(deg).fill(0);
  for (const b of data) { const f = b ^ res.shift(); res.push(0); div.forEach((c, i) => res[i] ^= gfMul(c, f)); }
  return res;
}
// Rows of booleans (true = dark), or null if the text is too long.
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
  const d = 1 << 3; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
  const b = ((d << 10) | r) ^ 0x5412, g = i => ((b >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) fn(8, i, g(i));
  fn(8, 7, g(6)); fn(8, 8, g(7)); fn(7, 8, g(8));
  for (let i = 9; i < 15; i++) fn(14 - i, 8, g(i));
  for (let i = 0; i < 8; i++) fn(n - 1 - i, 8, g(i));
  for (let i = 8; i < 15; i++) fn(8, n - 15 + i, g(i));
  fn(8, n - 8, true);
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
export function qrSVG(text, px = 170) {
  const M = qr(text); if (!M) return "";
  const n = M.length, q = 4, path = [];
  M.forEach((row, y) => row.forEach((d, x) => d && path.push(`M${x + q} ${y + q}h1v1h-1z`)));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + q * 2} ${n + q * 2}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path.join("")}" fill="#000"/></svg>`;
}
