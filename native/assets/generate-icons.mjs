#!/usr/bin/env node
// native/assets/generate-icons.mjs — #1278
//
// One-shot, on-demand generator for the static app-icon set. Renders the two
// master SVGs (native/assets/icon-master-full-bleed.svg,
// native/assets/icon-master-safe-zone.svg) through Playwright chromium — the
// motif uses a <text> glyph in Fraunces and must be screenshotted with the
// real webfont loaded, so this script needs network access to
// fonts.googleapis.com/fonts.gstatic.com. The generated PNGs are committed;
// nothing at build/runtime re-runs this script.
//
// Usage:
//   PW_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium node native/assets/generate-icons.mjs
//   (PW_CHROMIUM_EXECUTABLE_PATH is optional — omit to use Playwright's own
//   bundled/managed browser, e.g. on a dev machine with `npx playwright install`.)
//
// Fails loudly (non-zero exit) if any output's pixel dimensions are wrong or
// the App Store PNG carries an alpha channel — never eyeballed. See
// assertDims / assertNoAlphaChannel below, which read the PNG IHDR chunk
// directly (byte offset 25 = colour type) rather than trusting a library.

import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ASSETS_DIR = __dirname;
const ICONS_PUBLIC_DIR = path.join(ROOT, 'public/icons');

const FOREST = '#1B4332';
const LINEN = '#F8F6F0';

const FULL_BLEED_SVG = readFileSync(path.join(ASSETS_DIR, 'icon-master-full-bleed.svg'), 'utf8');
const SAFE_ZONE_SVG = readFileSync(path.join(ASSETS_DIR, 'icon-master-safe-zone.svg'), 'utf8');

const FONT_LINK =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500&display=swap">';

let failed = false;

/** Read a PNG buffer's IHDR width/height (big-endian, offsets 16 and 20). */
function ihdrDims(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Read a PNG buffer's IHDR colour type (offset 25). Type 2 = truecolor, no alpha. */
function ihdrColorType(buf) {
  return buf.readUInt8(25);
}

function assertDims(label, buf, wantWidth, wantHeight) {
  const { width, height } = ihdrDims(buf);
  if (width !== wantWidth || height !== wantHeight) {
    console.error(`FEIL  ${label}: IHDR ${width}x${height}, forventet ${wantWidth}x${wantHeight}`);
    failed = true;
    return;
  }
  console.log(`OK    ${label}: IHDR ${width}x${height}`);
}

function assertNoAlphaChannel(label, buf) {
  const colorType = ihdrColorType(buf);
  if (colorType !== 2) {
    console.error(`FEIL  ${label}: IHDR color type ${colorType}, forventet 2 (ingen alfakanal)`);
    failed = true;
    return;
  }
  console.log(`OK    ${label}: IHDR color type ${colorType} (ingen alfakanal)`);
}

/** Set the width/height attrs on the outer <svg> tag so it renders crisp at the target px size. */
function svgSized(svgText, size) {
  return svgText.replace(/<svg[^>]*>/, (tag) =>
    tag.replace(/width="[^"]*"/, `width="${size}"`).replace(/height="[^"]*"/, `height="${size}"`),
  );
}

function pageHtml(bodyHtml, backgroundCss) {
  return `<!doctype html>
<html><head><meta charset="utf-8">${FONT_LINK}
<style>
  html,body{margin:0;padding:0;background:${backgroundCss};}
  svg{display:block;}
</style></head>
<body>${bodyHtml}</body></html>`;
}

async function shoot(browser, { html, width, height, transparent }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const buf = await page.screenshot({ omitBackground: !!transparent });
  await page.close();
  return buf;
}

async function main() {
  mkdirSync(ICONS_PUBLIC_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM_EXECUTABLE_PATH || undefined,
  });

  try {
    // 1. App Store 1024×1024 — full-bleed, no alpha channel required.
    const rawAppstore = await shoot(browser, {
      html: pageHtml(svgSized(FULL_BLEED_SVG, 1024), FOREST),
      width: 1024,
      height: 1024,
      transparent: false,
    });
    const appstoreBuf = await sharp(rawAppstore).flatten({ background: FOREST }).png().toBuffer();
    const appstorePath = path.join(ASSETS_DIR, 'appstore-1024.png');
    writeFileSync(appstorePath, appstoreBuf);
    assertDims('appstore-1024.png', appstoreBuf, 1024, 1024);
    assertNoAlphaChannel('appstore-1024.png', appstoreBuf);

    // 2. Android adaptive-icon foreground layer — safe-zone motif, transparent bg.
    const fgBuf = await shoot(browser, {
      html: pageHtml(svgSized(SAFE_ZONE_SVG, 432), 'transparent'),
      width: 432,
      height: 432,
      transparent: true,
    });
    writeFileSync(path.join(ASSETS_DIR, 'android-foreground-432.png'), fgBuf);
    assertDims('android-foreground-432.png', fgBuf, 432, 432);

    // 3. Android adaptive-icon background layer — solid forest fill.
    //    Generated with sharp directly (no text/webfont involved, no need for
    //    a browser); hex documented again in native/assets/README.md.
    const bgBuf = await sharp({
      create: { width: 432, height: 432, channels: 4, background: FOREST },
    })
      .flatten({ background: FOREST })
      .png()
      .toBuffer();
    writeFileSync(path.join(ASSETS_DIR, 'android-background-432.png'), bgBuf);
    assertDims('android-background-432.png', bgBuf, 432, 432);

    // 4. Maskable web-app icons — forest bg full-bleed + safe-zone motif on top.
    const maskableHtml = (size) =>
      pageHtml(
        `<div style="position:relative;width:${size}px;height:${size}px;background:${FOREST};">` +
          `<div style="position:absolute;inset:0;">${svgSized(SAFE_ZONE_SVG, size)}</div></div>`,
        FOREST,
      );
    const maskable192 = await shoot(browser, {
      html: maskableHtml(192),
      width: 192,
      height: 192,
      transparent: false,
    });
    writeFileSync(path.join(ICONS_PUBLIC_DIR, 'maskable-192.png'), maskable192);
    assertDims('public/icons/maskable-192.png', maskable192, 192, 192);

    const maskable512 = await shoot(browser, {
      html: maskableHtml(512),
      width: 512,
      height: 512,
      transparent: false,
    });
    writeFileSync(path.join(ICONS_PUBLIC_DIR, 'maskable-512.png'), maskable512);
    assertDims('public/icons/maskable-512.png', maskable512, 512, 512);

    // 5. iOS splash logo — safe-zone motif alone, transparent, for #1283's storyboard
    //    (composited there onto the linen background_color at runtime).
    const splashBuf = await shoot(browser, {
      html: pageHtml(svgSized(SAFE_ZONE_SVG, 512), 'transparent'),
      width: 512,
      height: 512,
      transparent: true,
    });
    writeFileSync(path.join(ASSETS_DIR, 'ios-splash-logo.png'), splashBuf);
    assertDims('ios-splash-logo.png', splashBuf, 512, 512);

    // 6. Contact sheet — everything above, laid out for a PR screenshot, plus a
    //    circle-clipped preview of the maskable icon (clip-path: circle(40%),
    //    i.e. the 80%-diameter maskable safe zone) so cropping is visible
    //    directly in the image rather than needing an external tool.
    // Fixed tile width is load-bearing: without it a flex column item sizes
    // to its widest child, and the label text is wider than the 160px image
    // — that desynced the layout math and pushed the last tile off-canvas
    // during development. Transparent-bg icons (foreground/splash) are shown
    // on a forest backdrop, not the page's linen background — the motif's
    // cream fill (#F8F6F0) is the *same colour* as linen, so it silently
    // vanishes against it otherwise.
    const b64 = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
    const TILE = 160;
    const tile = (label, dataUri, bg) =>
      `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;width:${TILE}px;">
         <div style="width:${TILE}px;height:${TILE}px;background:${bg};display:flex;align-items:center;justify-content:center;overflow:hidden;">
           <img src="${dataUri}" width="${TILE}" height="${TILE}" />
         </div>
         <span style="font:12px/1.3 sans-serif;color:#1B4332;text-align:center;">${label}</span>
       </div>`;
    const CANVAS_W = 1450;
    const CANVAS_H = 360;
    const contactHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;padding:32px;background:${LINEN};font-family:sans-serif;box-sizing:border-box;width:${CANVAS_W}px;height:${CANVAS_H}px;}
      h1{font-size:16px;color:#1B4332;margin:0 0 24px;}
      .row{display:flex;gap:24px;align-items:flex-start;}
    </style></head><body>
      <h1>Tørny — statisk ikonpakke (#1278)</h1>
      <div class="row">
        ${tile('App Store 1024 (ned til 160px)', b64(appstoreBuf), 'transparent')}
        ${tile('Android foreground 432 (ned til 160px)', b64(fgBuf), FOREST)}
        ${tile('Android background 432', b64(bgBuf), 'transparent')}
        ${tile('maskable-192', b64(maskable192), 'transparent')}
        ${tile('maskable-512 (ned til 160px)', b64(maskable512), 'transparent')}
        ${tile('iOS splash-logo 512 (ned til 160px)', b64(splashBuf), FOREST)}
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;width:${TILE}px;">
          <div style="width:${TILE}px;height:${TILE}px;clip-path:circle(40%);overflow:hidden;">
            <img src="${b64(maskable512)}" width="${TILE}" height="${TILE}" />
          </div>
          <span style="font:12px/1.3 sans-serif;color:#1B4332;text-align:center;">maskable-512, sirkel-maskert<br/>(clip-path: circle(40%))</span>
        </div>
      </div>
    </body></html>`;
    const contactBuf = await shoot(browser, {
      html: contactHtml,
      width: CANVAS_W,
      height: CANVAS_H,
      transparent: false,
    });
    writeFileSync(path.join(ASSETS_DIR, 'preview-contact-sheet.png'), contactBuf);
    assertDims('preview-contact-sheet.png', contactBuf, CANVAS_W, CANVAS_H);
  } finally {
    await browser.close();
  }

  if (failed) {
    console.error('\nFERDIG MED FEIL — én eller flere mekaniske sjekker mislyktes (se over).');
    process.exit(1);
  }
  console.log('\nOK — alle filer generert og verifisert.');
}

main().catch((err) => {
  console.error('generate-icons.mjs feilet uventet:', err);
  process.exit(1);
});
