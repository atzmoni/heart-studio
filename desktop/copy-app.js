// Copies the studio (the same files the web version serves) into desktop/app, which the desktop app loads from.
const fs = require("fs"), path = require("path");
const src = path.join(__dirname, ".."), dst = path.join(__dirname, "app");
fs.rmSync(dst, { recursive: true, force: true }); fs.mkdirSync(dst, { recursive: true });
for (const f of fs.readdirSync(src)) if (/^(index\.html|heart-[a-z]+\.js|theme\.(css|js))$/.test(f)) fs.copyFileSync(path.join(src, f), path.join(dst, f));
fs.cpSync(path.join(src, "fonts"), path.join(dst, "fonts"), { recursive: true });
console.log("app files:", fs.readdirSync(dst).join(" "));
