// Heart Studio for Windows: the studio in its own window, with no server and no browser around it.
// It always asks for the strong graphics card (the RTX on a laptop with two GPUs), never slows down when the window is in
// the background (the projector keeps running while you work in another window), and allows the microphone, MIDI and
// the projector window by itself. The page is served from app/ under a fixed private address (heart://studio), so the
// calibration and the settings it saves stay between runs.
const { app, BrowserWindow, protocol, session, shell } = require("electron");
const fs = require("fs"), path = require("path");

app.commandLine.appendSwitch("force_high_performance_gpu");
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

protocol.registerSchemesAsPrivileged([{ scheme: "heart", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const ROOT = path.join(__dirname, "app");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const ALLOW = new Set(["media", "midi", "midiSysex", "fullscreen", "window-management", "window-placement", "clipboard-sanitized-write"]);

if (!app.requestSingleInstanceLock()) app.quit();

app.whenReady().then(() => {
  protocol.handle("heart", async req => {
    let p = decodeURIComponent(new URL(req.url).pathname); if (p === "/") p = "/index.html";
    const f = path.normalize(path.join(ROOT, p));
    if (!f.startsWith(ROOT + path.sep)) return new Response("forbidden", { status: 403 });
    try { return new Response(await fs.promises.readFile(f), { headers: { "content-type": TYPES[path.extname(f)] || "application/octet-stream" } }); }
    catch { return new Response("not found", { status: 404 }); }
  });
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(ALLOW.has(perm)));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => ALLOW.has(perm));

  const win = new BrowserWindow({ width: 1600, height: 960, backgroundColor: "#0d1117", title: "Heart Studio", autoHideMenuBar: true,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, sandbox: true } });
  // The projector window the studio opens (window.open) stays inside the app; any other link opens in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === "about:blank") return { action: "allow", overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: "#000000", title: "Heart · projector", webPreferences: { backgroundThrottling: false } } };
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("before-input-event", (e, i) => { if (i.type === "keyDown" && i.key === "F11") { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); } });
  win.loadURL("heart://studio/index.html");
  win.on("closed", () => app.quit());
});
app.on("second-instance", () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
app.on("window-all-closed", () => app.quit());
