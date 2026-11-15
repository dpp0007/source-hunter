// Draws the Source Hunter logo (a magnifier over a yellow highlight, on a blue tile) to PNG with no dependencies.
import fs from "node:fs";
import zlib from "node:zlib";

const BLUE = [47, 91, 255], WHITE = [255, 255, 255], YEL = [255, 224, 102];

function draw(S) {
  const SS = 4, px = new Uint8Array(S * S * 4);
  const dist = (x, y, x2, y2) => Math.hypot(x - x2, y - y2);
  // distance from point to segment (for the handle)
  const seg = (x, y, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    return dist(x, y, ax + t * dx, ay + t * dy);
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const u = (x + (sx + 0.5) / SS) / S, v = (y + (sy + 0.5) / SS) / S;
      // rounded tile
      const rad = 0.22, qx = Math.max(Math.abs(u - 0.5) - (0.5 - rad), 0), qy = Math.max(Math.abs(v - 0.5) - (0.5 - rad), 0);
      if (Math.hypot(qx, qy) > rad) continue;
      let c = BLUE;
      const d = dist(u, v, 0.43, 0.43);
      if (seg(u, v, 0.62, 0.62, 0.8, 0.8) < 0.055) c = WHITE; // handle
      if (d < 0.27) c = WHITE; // ring
      if (d < 0.2) c = YEL; // lens = highlighted text
      if (d < 0.2 && Math.abs(v - 0.43) < 0.028 && u > 0.31 && u < 0.55) c = BLUE; // a "claim" line through the lens
      r += c[0]; g += c[1]; b += c[2]; a += 1;
    }
    const n = SS * SS, i = (y * S + x) * 4;
    px[i] = a ? r / a : 0; px[i + 1] = a ? g / a : 0; px[i + 2] = a ? b / a : 0; px[i + 3] = (a / n) * 255;
  }
  return px;
}

function png(S, px) {
  const raw = Buffer.alloc(S * (S * 4 + 1));
  for (let y = 0; y < S; y++) { raw[y * (S * 4 + 1)] = 0; Buffer.from(px.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1); }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

fs.mkdirSync("extension/icons", { recursive: true });
for (const S of [16, 32, 48, 128]) fs.writeFileSync(`extension/icons/icon${S}.png`, png(S, draw(S)));
fs.writeFileSync("app/icon.png", png(128, draw(128)));
console.log("icons written");
