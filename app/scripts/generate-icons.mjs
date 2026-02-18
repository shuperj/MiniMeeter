import sharp from "sharp";
import pngToIco from "png-to-ico";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(__dirname, "../src-tauri/icons");
const svgPath = resolve(iconsDir, "icon.svg");

const svgBuffer = readFileSync(svgPath);
const sizes = [16, 32, 48, 64, 128, 256];

// Generate PNGs at each size
const pngBuffers = await Promise.all(
  sizes.map((size) =>
    sharp(svgBuffer).resize(size, size).png().toBuffer()
  )
);

// Write 32x32 ICO separately (for small icon uses)
const ico32 = await pngToIco([pngBuffers[1]]); // 32px
writeFileSync(resolve(iconsDir, "32x32.ico"), ico32);

// Write main ICO with multiple sizes
const mainIco = await pngToIco(pngBuffers);
writeFileSync(resolve(iconsDir, "icon.ico"), mainIco);

// Also write a 256px PNG for reference
writeFileSync(resolve(iconsDir, "icon.png"), pngBuffers[5]);

console.log("Generated: icon.ico, 32x32.ico, icon.png");
