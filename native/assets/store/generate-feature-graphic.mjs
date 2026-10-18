#!/usr/bin/env node
// native/assets/store/generate-feature-graphic.mjs — #2561 (E7)
//
// Renders the Google Play feature graphic (1024×500, 24-bit PNG without alpha)
// from the wordmark master, so the mark still has one source
// (`native/assets/wordmark-master.svg`, see `native/assets/README.md`). The
// master's text and ball are reused as-is; only the text fill changes from
// forest to linen, because the graphic sits on the forest tile instead of the
// mail card's white. The line under it is the brand's canonical subordinate
// tagline (`docs/style-and-brand.md`), not new copy.
//
// Usage: node native/assets/store/generate-feature-graphic.mjs
// Needs network access to fonts.googleapis.com/fonts.gstatic.com (Fraunces with
// the opsz axis, and Inter), like generate-icons.mjs. Fails loudly when the
// size is wrong, the PNG carries alpha, or Fraunces did not load.

import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORDMARK = path.join(__dirname, '..', 'wordmark-master.svg');
const OUT = path.join(__dirname, 'play-feature-graphic-1024x500.png');
const WIDTH = 1024;
const HEIGHT = 500;

const FOREST = '#1B4332';
const FOREST_DEEP = '#14201A';
const LINEN = '#F8F6F0';
const TAGLINE = 'Fyr opp golfturneringen på et par minutter';

const FONT_LINK =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&family=Inter:wght@500&display=swap">';

const master = readFileSync(WORDMARK, 'utf8');
if (!master.includes(`fill="${FOREST}"`)) {
  throw new Error(`Fant ikke fill="${FOREST}" i ordmerke-masteren — har masteren endret farge?`);
}
// 400 px wide keeps the master's 275:125 proportions (≈182 px tall).
const wordmark = master
  .replace(`fill="${FOREST}"`, `fill="${LINEN}"`)
  .replace(/<svg[^>]*>/, (tag) =>
    tag.replace(/width="[^"]*"/, 'width="400"').replace(/height="[^"]*"/, 'height="182"'),
  );

const html = `<!doctype html>
<html><head><meta charset="utf-8">${FONT_LINK}
<style>
  html,body{margin:0;padding:0;}
  body{
    width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;
    background:linear-gradient(180deg, ${FOREST} 0%, ${FOREST_DEEP} 100%);
    display:flex;flex-direction:column;align-items:center;justify-content:center;
  }
  svg{display:block;margin-left:18px;}
  p{
    margin:22px 0 0;font-family:Inter, sans-serif;font-weight:500;font-size:30px;
    letter-spacing:-0.2px;color:${LINEN};opacity:0.86;
  }
</style></head>
<body>${wordmark}<p>${TAGLINE}</p></body></html>`;

function ihdr(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf.readUInt8(25) };
}

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE_PATH }
    : {},
);
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const fraunces = await page.evaluate(() =>
    [...document.fonts].some((f) => f.family.replace(/["']/g, '') === 'Fraunces' && f.status === 'loaded'),
  );
  if (!fraunces) throw new Error('Fraunces lastet ikke — sjekk nettilgang til fonts.googleapis.com.');
  const shot = await page.screenshot();
  const png = await sharp(shot).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
  const { width, height, colorType } = ihdr(png);
  if (width !== WIDTH || height !== HEIGHT || colorType !== 2) {
    throw new Error(`Feil format: ${width}x${height}, IHDR color type ${colorType} (forventet ${WIDTH}x${HEIGHT}, type 2)`);
  }
  writeFileSync(OUT, png);
  console.log(`OK    ${path.relative(process.cwd(), OUT)}: ${width}x${height}, IHDR color type ${colorType} (ingen alfakanal)`);
} finally {
  await browser.close();
}
