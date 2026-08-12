// Regenerates the site's brand assets (favicons, app icons, social image)
// from SVG masters using the design-system palette:
//   paper #faf9f4, ink #191814, ink-3 #6f6a5e, accent #2b4863,
//   hairline rgba(25,24,20,0.34). No rounded corners, no gradients.
//
// Run from the repo root:  node scripts/gen-brand.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const PAPER = "#faf9f4";
const INK = "#191814";
const INK3 = "#6f6a5e";
const ACCENT = "#2b4863";
const RULE = "rgba(25,24,20,0.34)";
const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = "'Courier New', monospace";

// --- Monogram master: "NP" initials over the favicon's hairline + accent dot.
const monogram = (viewBox = 512) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}">
  <rect width="${viewBox}" height="${viewBox}" fill="${PAPER}"/>
  <text x="${viewBox / 2}" y="${viewBox * 0.645}" text-anchor="middle"
        font-family="${SERIF}" font-size="${viewBox * 0.45}" font-weight="bold" fill="${INK}">NP</text>
  <line x1="${viewBox * 0.293}" y1="${viewBox * 0.772}" x2="${viewBox * 0.648}" y2="${viewBox * 0.772}"
        stroke="${RULE}" stroke-width="${viewBox * 0.01}"/>
  <circle cx="${viewBox * 0.684}" cy="${viewBox * 0.772}" r="${viewBox * 0.021}" fill="${ACCENT}"/>
</svg>`;

// --- Social banner: "Nithin Purushothama" full-name banner, 1200 x 630.
const banner = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${PAPER}"/>
  <rect x="36" y="36" width="1128" height="558" fill="none" stroke="${RULE}" stroke-width="2"/>
  <text x="96" y="258" font-family="${SERIF}" font-size="92" font-weight="bold" fill="${INK}">Nithin Purushothama</text>
  <line x1="96" y1="300" x2="344" y2="300" stroke="${RULE}" stroke-width="3"/>
  <circle cx="352" cy="300" r="5.5" fill="${ACCENT}"/>
  <text x="96" y="348" font-family="${MONO}" font-size="26" letter-spacing="7" fill="${INK3}">ANALOG · MIXED-SIGNAL IC DESIGNER</text>
</svg>`;

const out = (name) => `public/${name}`;

async function main() {
  // favicon.svg (vector, served to browsers)
  writeFileSync(out("favicon.svg"), monogram(64));

  // Multi-size PNGs
  const icoSizes = [16, 32, 48, 180, 192, 512];
  const pngs = {};
  for (const s of icoSizes) {
    pngs[s] = await sharp(Buffer.from(monogram(512))).resize(s, s).png().toBuffer();
  }

  // Named PNGs
  writeFileSync(out("apple-touch-icon.png"), pngs[180]);
  writeFileSync(out("android-chrome-192x192.png"), pngs[192]);
  writeFileSync(out("android-chrome-512x512.png"), pngs[512]);

  // favicon.ico — ICO container with embedded PNGs (16/32/48/180/192/512)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(icoSizes.length, 4);
  const entries = [];
  const chunks = [header];
  let offset = 6 + 16 * icoSizes.length;
  icoSizes.forEach((s) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(s > 255 ? 0 : s, 0); // width (0 = 256)
    entry.writeUInt8(s > 255 ? 0 : s, 1); // height
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit depth
    entry.writeUInt32LE(pngs[s].length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    chunks.push(pngs[s]);
    offset += pngs[s].length;
  });
  chunks.splice(1, 0, ...entries);
  writeFileSync(out("favicon.ico"), Buffer.concat(chunks));

  // Social preview 1200 x 630
  writeFileSync(out("og-image.png"), await sharp(Buffer.from(banner)).png().toBuffer());

  console.log("brand assets written to public/:");
  for (const f of [
    "favicon.svg",
    "favicon.ico",
    "apple-touch-icon.png",
    "android-chrome-192x192.png",
    "android-chrome-512x512.png",
    "og-image.png",
  ])
    console.log("  " + f);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
