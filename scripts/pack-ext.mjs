// Packages the extension for a deployed app: node scripts/pack-ext.mjs https://your-app.vercel.app
// Rewrites the app URL (config.js + manifest host_permissions) and writes public/source-hunter-extension.zip,
// so anyone who can open the site can download and load the extension. Zip is written by hand (forward slashes, works on every OS).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const app = (process.argv[2] || "").replace(/\/+$/, "");
if (!/^https:\/\/[\w.-]+$/.test(app)) { console.error("usage: node scripts/pack-ext.mjs https://your-app.vercel.app"); process.exit(1); }

const ROOT = "source-hunter-extension";
const files = [];
const walk = (dir, rel = "") => {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f), r = rel ? `${rel}/${f}` : f;
    fs.statSync(p).isDirectory() ? walk(p, r) : files.push({ name: `${ROOT}/${r}`, data: fs.readFileSync(p), src: r });
  }
};
walk("extension");

for (const f of files) {
  if (f.src === "config.js") f.data = Buffer.from(`// Where the Source Hunter app runs.\nself.APP = "${app}";\n`);
  if (f.src === "manifest.json") {
    const m = JSON.parse(f.data.toString());
    m.host_permissions = [`${app}/*`];
    f.data = Buffer.from(JSON.stringify(m, null, 2) + "\n");
  }
}
files.push({
  name: `${ROOT}/README.txt`,
  data: Buffer.from(
    `Source Hunter extension\n=======================\n1. Open chrome://extensions\n2. Turn on "Developer mode" (top right)\n3. Click "Load unpacked" and choose this folder (the one containing manifest.json)\n\n` +
    `Use it: highlight a claim on any page and click "Trace it", or click the toolbar icon with nothing selected to scan the page (Claim Radar).\nApp: ${app}\n`,
  ),
});

// ---- minimal zip writer (deflate)
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
const locals = [], central = [];
let offset = 0;
for (const f of files) {
  const name = Buffer.from(f.name), comp = zlib.deflateRawSync(f.data, { level: 9 }), crc = zlib.crc32(f.data);
  const head = Buffer.concat([u32(0x04034b50), u16(20), u16(0x0800), u16(8), u16(0), u16(0x21), u32(crc), u32(comp.length), u32(f.data.length), u16(name.length), u16(0), name]);
  locals.push(head, comp);
  central.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(8), u16(0), u16(0x21), u32(crc), u32(comp.length), u32(f.data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
  offset += head.length + comp.length;
}
const cd = Buffer.concat(central);
const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(offset), u16(0)]);
fs.mkdirSync("public", { recursive: true });
fs.writeFileSync("public/source-hunter-extension.zip", Buffer.concat([...locals, cd, end]));
console.log(`wrote public/source-hunter-extension.zip (${files.length} files) for ${app}`);
