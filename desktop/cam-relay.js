// A phone as a live camera for the heart (heart-live.js): a small server on the local network, run by the desktop app.
// Phones on the same Wi-Fi open https://<this computer>:8768/?k=<code> (the studio shows it as a QR code), allow the camera
// and send JPEG frames; the studio reads the newest frame from http://127.0.0.1:8769, which only this computer can reach.
//
// Why HTTPS: a phone's browser lets a page use the camera only over a secure address. There is no internet at events, so
// the relay makes its own certificate (self-signed, kept between runs). The first time, the phone warns about it once:
// "Advanced" -> "Proceed". Nothing leaves the local network.
//
//   https :8768  GET  /            the camera page (cam.html)
//                POST /frame?k=    one JPEG frame from the phone (the newest wins)
//   http  127.0.0.1:8769
//                GET  /info        the code, the addresses phones can use, and how long since the last frame
//                GET  /frame?after=n   the newest frame once it is newer than n (waits up to 3 s, else 204); header x-seq
//
// Run on its own (for the browser version of the studio):  node desktop/cam-relay.js
const https = require("https"), http = require("http"), os = require("os"), fs = require("fs"), path = require("path"), crypto = require("crypto");

// ---------------- a self-signed certificate, built with Node alone (no openssl at the event) ----------------
const der = {
  len(n) { if (n < 128) return Buffer.from([n]); const b = []; while (n) { b.unshift(n & 255); n >>= 8; } return Buffer.from([0x80 | b.length, ...b]); },
  tlv(tag, ...parts) { const body = Buffer.concat(parts); return Buffer.concat([Buffer.from([tag]), der.len(body.length), body]); },
  seq: (...p) => der.tlv(0x30, ...p),
  int: b => der.tlv(0x02, b[0] & 0x80 ? Buffer.concat([Buffer.from([0]), b]) : b),
  oid: hex => der.tlv(0x06, Buffer.from(hex, "hex")),
  time: d => { const y = d.getUTCFullYear(), s = d.toISOString().replace(/[-:T]/g, "").slice(0, 14) + "Z";
    return y < 2050 ? der.tlv(0x17, Buffer.from(s.slice(2))) : der.tlv(0x18, Buffer.from(s)); },
  name: cn => der.seq(der.tlv(0x31, der.seq(der.oid("550403"), der.tlv(0x0c, Buffer.from(cn))))),
};
function makeCert(ips) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const alg = der.seq(der.oid("2a864886f70d01010b"), Buffer.from([0x05, 0x00]));   // sha256WithRSAEncryption
  const now = new Date(Date.now() - 864e5), end = new Date(Date.now() + 10 * 365 * 864e5), cn = der.name("Heart Studio camera");
  // subjectAltName with this computer's addresses (phones accept the warning either way; it just reads better).
  const san = der.seq(der.oid("551d11"), der.tlv(0x04, der.seq(...(ips.length ? ips : ["127.0.0.1"]).map(ip => der.tlv(0x87, Buffer.from(ip.split(".").map(Number)))))));
  const tbs = der.seq(der.tlv(0xa0, der.int(Buffer.from([2]))), der.int(Buffer.concat([Buffer.from([1]), crypto.randomBytes(15)])), alg, cn,
    der.seq(der.time(now), der.time(end)), cn, publicKey.export({ type: "spki", format: "der" }), der.tlv(0xa3, der.seq(san)));
  const sig = crypto.sign("sha256", tbs, privateKey);
  const cert = der.seq(tbs, alg, der.tlv(0x03, Buffer.from([0]), sig));
  const pem = "-----BEGIN CERTIFICATE-----\n" + cert.toString("base64").match(/.{1,64}/g).join("\n") + "\n-----END CERTIFICATE-----\n";
  return { cert: pem, key: privateKey.export({ type: "pkcs8", format: "pem" }), ips };
}

function ipv4() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces()))
    for (const a of list || []) if (a.family === "IPv4" && !a.internal && !/^169\.254\./.test(a.address)) out.push({ name, ip: a.address });
  // Wi-Fi first, then wired; virtual adapters (VirtualBox, Hyper-V, VPNs) last.
  const rank = n => /wi-?fi|wlan|wireless/i.test(n) ? 0 : /virtual|vbox|vmware|hyper-v|vethernet|docker|tailscale|zerotier/i.test(n) ? 2 : 1;
  return out.sort((a, b) => rank(a.name) - rank(b.name));
}

// The certificate is kept in dir, so the phone's "proceed" is for the same certificate every run; a new one is made only
// when this computer's addresses changed (another network).
function loadCert(dir, ips) {
  const f = dir && path.join(dir, "cam-cert.json");
  try { const c = JSON.parse(fs.readFileSync(f, "utf8")); if (ips.every(ip => c.ips?.includes(ip))) return c; } catch {}
  const c = makeCert(ips);
  try { if (f) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(f, JSON.stringify(c)); } } catch {}
  return c;
}

function start({ root, dir, port = 8768, localPort = 8769, log: say = console.log } = {}) {
  const key = String(crypto.randomInt(1000, 10000)), nets = ipv4();
  let frame = null, seq = 0, at = 0, waiters = [], phones = new Map();
  const send = (res, code, type, body, extra = {}) => {
    res.writeHead(code, { "content-type": type, "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-expose-headers": "x-seq", ...extra });
    res.end(body);
  };
  const wake = () => { const w = waiters; waiters = []; for (const f of w) f(); };

  // The phones' side (HTTPS, any address on the network, needs the code).
  const tls = loadCert(dir, nets.map(n => n.ip));
  const pub = https.createServer({ key: tls.key, cert: tls.cert }, async (req, res) => {
    const u = new URL(req.url, "https://x"), p = u.pathname;
    try {
      if (req.method === "GET" && (p === "/" || p === "/cam.html")) return send(res, 200, "text/html; charset=utf-8", await fs.promises.readFile(path.join(root, "cam.html")));
      if (req.method === "POST" && p === "/frame") {
        if (u.searchParams.get("k") !== key) { req.resume(); return send(res, 403, "text/plain", "wrong code: scan the QR in the studio again"); }
        const parts = []; let n = 0;
        for await (const c of req) { n += c.length; if (n > 3 << 20) return send(res, 413, "text/plain", "too big"); parts.push(c); }
        frame = Buffer.concat(parts); seq++; at = Date.now(); phones.set(req.socket.remoteAddress, at); wake();
        return send(res, 200, "text/plain", String(seq));
      }
      send(res, 404, "text/plain", "not found");
    } catch (e) { try { send(res, 500, "text/plain", String(e.message || e)); } catch {} }
  });
  // The studio's side (plain HTTP, this computer only).
  const loc = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x"), p = u.pathname;
    if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET" }); return res.end(); }
    if (p === "/info") {
      const now = Date.now(); for (const [k, t] of phones) if (now - t > 5000) phones.delete(k);
      return send(res, 200, "application/json", JSON.stringify({ key, port, urls: nets.map(n => ({ name: n.name, url: `https://${n.ip}:${port}/?k=${key}` })), phone: at ? (now - at) / 1000 : null, phones: phones.size }));
    }
    if (p === "/frame") {
      const after = +u.searchParams.get("after") || 0;
      const reply = () => frame && seq !== after ? send(res, 200, "image/jpeg", frame, { "x-seq": String(seq) }) : send(res, 204, "text/plain", "");
      if (frame && seq !== after) return reply();
      const t = setTimeout(() => { waiters = waiters.filter(f => f !== go); reply(); }, 3000);
      const go = () => { clearTimeout(t); reply(); };
      waiters.push(go); req.on("close", () => { clearTimeout(t); waiters = waiters.filter(f => f !== go); });
      return;
    }
    send(res, 404, "text/plain", "not found");
  });
  pub.on("error", e => say("cam relay (phones):", e.message));
  loc.on("error", e => say("cam relay (studio):", e.message));
  pub.listen(port, "0.0.0.0", () => say(`phone camera: ${nets.map(n => `https://${n.ip}:${port}/?k=${key}`).join("  ") || "no network"}`));
  loc.listen(localPort, "127.0.0.1");
  return { key, close() { pub.close(); loc.close(); } };
}

module.exports = { start, makeCert };
if (require.main === module) start({ root: path.join(__dirname, ".."), dir: path.join(os.homedir(), ".heart-studio") });
