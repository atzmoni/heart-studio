// Painting on the heart from phones (heart-paint.js): a small server on the local network, run by the desktop app.
// Phones on the same Wi-Fi open http://<this computer>:8767/?k=<code> (the studio shows it as a QR code), draw, and send
// their strokes here; the studio and every phone get them back live (Server-Sent Events). No internet, no install.
//
//   GET  /            the painter page (paint.html) and the files it needs
//   GET  /events      live events; the first message replays everything since the last clear
//   POST /ev          { cid, ev: [...] } from a phone or the studio
//   GET  /guide.svg   the heart's cut, drawn behind the pad;  POST /guide (this computer only) replaces it
//   GET  /info        (this computer only) the code and the addresses phones can use
// Phones need the code (a new one each run), so guests on the same Wi-Fi cannot paint without the QR.
const http = require("http"), os = require("os"), fs = require("fs"), path = require("path"), crypto = require("crypto");

const FILES = { "/": "paint.html", "/paint.html": "paint.html", "/heart-paint.js": "heart-paint.js" };
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".woff2": "font/woff2", ".css": "text/css" };
const MAX_LOG = 200000;

function addresses(port, key) {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces()))
    for (const a of list || []) if (a.family === "IPv4" && !a.internal && !/^169\.254\./.test(a.address))
      out.push({ name, url: `http://${a.address}:${port}/?k=${key}` });
  // Wi-Fi first, then wired; virtual adapters (VirtualBox, Hyper-V, VPNs) last.
  const rank = n => /wi-?fi|wlan|wireless/i.test(n) ? 0 : /virtual|vbox|vmware|hyper-v|vethernet|docker|tailscale|zerotier/i.test(n) ? 2 : 1;
  return out.sort((a, b) => rank(a.name) - rank(b.name));
}

function start({ root, port = 8767, log: say = console.log }) {
  const key = String(crypto.randomInt(1000, 10000));
  let log = [], guide = "";
  const subs = new Set();
  const local = req => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
  const send = (res, code, type, body) => {
    res.writeHead(code, { "content-type": type, "cache-control": "no-cache", "access-control-allow-origin": "*", "x-content-type-options": "nosniff" });
    res.end(body);
  };
  const broadcast = msg => { const s = "data: " + JSON.stringify(msg) + "\n\n"; for (const r of subs) r.write(s); };
  const body = (req, max) => new Promise((ok, bad) => {
    const parts = []; let n = 0;
    req.on("data", c => { n += c.length; if (n > max) { bad(new Error("too big")); req.destroy(); } else parts.push(c); });
    req.on("end", () => ok(Buffer.concat(parts).toString("utf8"))); req.on("error", bad);
  });

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x"), p = u.pathname, okKey = local(req) || u.searchParams.get("k") === key;
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type" });
      return res.end();
    }
    try {
      if (req.method === "GET" && FILES[p]) {
        const f = path.join(root, FILES[p]);
        return send(res, 200, TYPES[path.extname(f)], await fs.promises.readFile(f));
      }
      if (req.method === "GET" && p.startsWith("/fonts/") && /^\/fonts\/[\w.-]+\.(woff2|css)$/.test(p))
        return send(res, 200, TYPES[path.extname(p)], await fs.promises.readFile(path.join(root, p)));
      if (req.method === "GET" && p === "/guide.svg") return send(res, 200, "image/svg+xml", guide || `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"/>`);
      if (req.method === "GET" && p === "/info") {
        if (!local(req)) return send(res, 403, "text/plain", "this computer only");
        return send(res, 200, "application/json", JSON.stringify({ key, port, urls: addresses(port, key), phones: subs.size }));
      }
      if (req.method === "POST" && p === "/guide") {
        if (!local(req)) return send(res, 403, "text/plain", "this computer only");
        guide = await body(req, 4 << 20); broadcast({ guide: true }); return send(res, 200, "text/plain", "ok");
      }
      if (!okKey) return send(res, 403, "text/plain", "wrong code: scan the QR in the studio again");
      if (req.method === "GET" && p === "/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", "access-control-allow-origin": "*", connection: "keep-alive" });
        res.write("retry: 1500\n\n" + "data: " + JSON.stringify({ reset: true, ev: log }) + "\n\n");
        subs.add(res); req.on("close", () => subs.delete(res));
        return;
      }
      if (req.method === "POST" && p === "/ev") {
        const m = JSON.parse(await body(req, 2 << 20));
        const cid = String(m.cid || "?").slice(0, 40), ev = Array.isArray(m.ev) ? m.ev.filter(e => e && typeof e === "object" && typeof e.t === "string") : [];
        for (const e of ev) {
          if (e.t === "x") log = [];
          log.push(e);
        }
        if (log.length > MAX_LOG) log = log.slice(log.length - MAX_LOG);
        broadcast({ cid, ev });
        return send(res, 200, "text/plain", "ok");
      }
      send(res, 404, "text/plain", "not found");
    } catch (e) { if (!res.headersSent) send(res, 400, "text/plain", String(e.message || e)); }
  });
  setInterval(() => { for (const r of subs) r.write(": ping\n\n"); }, 15000).unref();
  server.on("error", e => say("paint relay: " + e.message));
  server.listen(port, "0.0.0.0", () => say(`paint relay on port ${port}, code ${key}`));
  return { server, key, port };
}

module.exports = { start, addresses };
