#!/usr/bin/env node
// native/assets/generate-icons.mjs — #1278, #1975, #1985
//
// One-shot, on-demand generator for EVERY raster copy of the Tørny mark. Renders
// the three master SVGs (native/assets/icon-master-full-bleed.svg,
// native/assets/icon-master-safe-zone.svg, native/assets/wordmark-master.svg)
// through Playwright chromium — the motif uses <text> glyphs in Fraunces and
// must be screenshotted with the real webfont loaded, so this script needs
// network access to fonts.googleapis.com/fonts.gstatic.com. The generated PNGs
// are committed; nothing at build/runtime re-runs this script.
//
// One run writes the App Store icon, the Android layers, the splash images,
// the Expo app's assets, the web's PWA icons (served at /icon, /icon0 and
// /apple-icon via rewrites in next.config.ts), the Google Play TWA shell's
// icons under native/android/, and the mail header's wordmark PNG. No copy of
// the mark is drawn anywhere else (#1985).
//
// Usage:
//   PW_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium node native/assets/generate-icons.mjs
//   (PW_CHROMIUM_EXECUTABLE_PATH is optional — omit to use Playwright's own
//   bundled/managed browser, e.g. on a dev machine with `npx playwright install`.)
//
//   node native/assets/generate-icons.mjs --preview <dir>
//   Reads the three masters from <dir> instead and writes ONLY
//   <dir>/contact-sheet.png — for laying candidate marks side by side without
//   touching a single shipped file.
//
// Fails loudly (non-zero exit) if any output's pixel dimensions are wrong, an
// opaque output carries an alpha channel, or Fraunces did not load (a silent
// fallback serif is exactly what the #1278 icon shipped with) — never
// eyeballed. See assertDims / assertNoAlphaChannel / assertFrauncesLoaded
// below; the PNG checks read the IHDR chunk directly (byte offset 25 = colour
// type) rather than trusting a library.

import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ASSETS_DIR = __dirname;
const ICONS_PUBLIC_DIR = path.join(ROOT, 'public/icons');
const BRAND_PUBLIC_DIR = path.join(ROOT, 'public/brand');
// Expo-appens egne assets (#1975). `app.json` peker hit, og fram til #1975 lå
// Expo-malen der. Filene skal være BYTE-IDENTISKE med masterne over — det er
// nettopp det `native/app/scripts/store-build-proof.sh` beviser med sha256 før
// hver opplasting.
const EXPO_APP_ASSETS_DIR = path.join(ROOT, 'native/app/assets');
// Google Play-skallet (#1279, Bubblewrap). Ikonene ble bakt inn fra /icon0 og
// maskable-512.png da skallet ble generert; `bubblewrap update` ville hentet
// dem fra prod igjen, så de skrives her i nøyaktig samme størrelser (#1985).
const TWA_DIR = path.join(ROOT, 'native/android');
const TWA_RES_DIR = path.join(TWA_DIR, 'app/src/main/res');
const DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
const TWA_SIZES = {
  ic_launcher: [48, 72, 96, 144, 192], // mipmap-*, from the full-bleed master
  ic_maskable: [82, 123, 164, 246, 328], // mipmap-*, tile + safe-zone motif
  splash: [300, 450, 600, 900, 1200], // drawable-*, full-bleed
  ic_notification_icon: [24, 36, 48, 72, 96], // drawable-*, full-bleed
};

const FOREST = '#1B4332';
const DARK = '#14201A';
const LINEN = '#F8F6F0';
const MAIL_CARD = '#ffffff'; // the mail card's background, baked into the wordmark PNG

const args = process.argv.slice(2);
const previewAt = args.indexOf('--preview');
const PREVIEW_DIR = previewAt >= 0 ? path.resolve(process.cwd(), args[previewAt + 1] ?? '') : null;
if (previewAt >= 0 && !args[previewAt + 1]) {
  console.error('Bruk: node native/assets/generate-icons.mjs --preview <mappe-med-mastere>');
  process.exit(1);
}
const MASTERS_DIR = PREVIEW_DIR ?? ASSETS_DIR;

const FULL_BLEED_SVG = readFileSync(path.join(MASTERS_DIR, 'icon-master-full-bleed.svg'), 'utf8');
const SAFE_ZONE_SVG = readFileSync(path.join(MASTERS_DIR, 'icon-master-safe-zone.svg'), 'utf8');
const WORDMARK_SVG = readFileSync(path.join(MASTERS_DIR, 'wordmark-master.svg'), 'utf8');

// The variable font with the opsz axis: the masters pin their optical size
// with font-variation-settings, which a static single-weight file ignores.
const FONT_LINK =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&display=swap">';

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

/** Read the outer <svg>'s declared width/height (the wordmark's display size). */
function svgDeclaredSize(svgText) {
  const tag = svgText.match(/<svg[^>]*>/)[0];
  return {
    width: Number(tag.match(/width="([\d.]+)"/)[1]),
    height: Number(tag.match(/height="([\d.]+)"/)[1]),
  };
}

/** Set the width/height attrs on the outer <svg> tag so it renders crisp at the target px size. */
function svgSized(svgText, width, height = width) {
  return svgText.replace(/<svg[^>]*>/, (tag) =>
    tag.replace(/width="[^"]*"/, `width="${width}"`).replace(/height="[^"]*"/, `height="${height}"`),
  );
}

// The full-bleed master marks its background with data-layer="tile". Alone,
// that tile is the Android background layer and the maskable icons' backdrop,
// so the gradient comes from the same master as the App Store icon.
const TILE_ONLY_CSS = 'svg > :not(defs):not(title):not([data-layer="tile"]){display:none;}';

function pageHtml(bodyHtml, backgroundCss, extraCss = '') {
  return `<!doctype html>
<html><head><meta charset="utf-8">${FONT_LINK}
<style>
  html,body{margin:0;padding:0;background:${backgroundCss};}
  svg{display:block;}
  ${extraCss}
</style></head>
<body>${bodyHtml}</body></html>`;
}

async function shoot(browser, { html, width, height, transparent, text = html.includes(FONT_LINK) }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  if (text) await assertFrauncesLoaded(page);
  const buf = await page.screenshot({ omitBackground: !!transparent });
  await page.close();
  return buf;
}

/**
 * Throw unless a Fraunces face actually loaded. The masters name
 * "Fraunces, Georgia, serif", so a blocked font request still renders — in the
 * wrong typeface, and nothing else would notice. `document.fonts.check()` is
 * no guard: it answers true when no face needs loading.
 */
async function assertFrauncesLoaded(page) {
  const loaded = await page.evaluate(() =>
    [...document.fonts].some((f) => f.family.replace(/["']/g, '') === 'Fraunces' && f.status === 'loaded'),
  );
  if (!loaded) {
    throw new Error('Fraunces lastet ikke — sjekk nettilgang til fonts.googleapis.com/fonts.gstatic.com.');
  }
}

/** PNG with any alpha flattened onto `background` — IHDR colour type 2. */
function opaque(buf, background) {
  return sharp(buf).flatten({ background }).png().toBuffer();
}

async function render(browser) {
  const cache = new Map();
  /** Full-bleed master at `size` px, opaque. Cached: several outputs share sizes. */
  async function fullBleedAt(size) {
    if (!cache.has(size)) {
      const raw = await shoot(browser, {
        html: pageHtml(svgSized(FULL_BLEED_SVG, size), FOREST),
        width: size,
        height: size,
        transparent: false,
      });
      cache.set(size, await opaque(raw, FOREST));
    }
    return cache.get(size);
  }
  /** Tile + safe-zone motif at `size` px (maskable icons), opaque. */
  async function maskableAt(size) {
    const raw = await shoot(browser, {
      html: pageHtml(
        `<div style="position:relative;width:${size}px;height:${size}px;">` +
          `<div style="position:absolute;inset:0;">${svgSized(FULL_BLEED_SVG, size)}</div>` +
          `<div style="position:absolute;inset:0;">${svgSized(SAFE_ZONE_SVG, size)}</div></div>`,
        FOREST,
        // Scope the tile-only rule to the first svg; the motif svg stays whole.
        TILE_ONLY_CSS.replace('svg >', 'div > div:first-child > svg >'),
      ),
      width: size,
      height: size,
      transparent: false,
    });
    return opaque(raw, FOREST);
  }

  const out = {};

  // 1. App Store 1024×1024 — full-bleed, no alpha channel required.
  out.appstore = await fullBleedAt(1024);

  // 2. Android adaptive-icon foreground layer — safe-zone motif, transparent bg.
  out.foreground = await shoot(browser, {
    html: pageHtml(svgSized(SAFE_ZONE_SVG, 432), 'transparent'),
    width: 432,
    height: 432,
    transparent: true,
  });

  // 3. Android adaptive-icon background layer — the full-bleed master's tile alone.
  out.background = await opaque(
    await shoot(browser, {
      html: pageHtml(svgSized(FULL_BLEED_SVG, 432), FOREST, TILE_ONLY_CSS),
      width: 432,
      height: 432,
      transparent: false,
      text: false, // the tile has no glyphs, so no font is ever requested
    }),
    FOREST,
  );

  // 4. Maskable web-app icons — tile full-bleed + safe-zone motif on top.
  out.maskable192 = await maskableAt(192);
  out.maskable512 = await maskableAt(512);

  // 5. iOS splash logo — safe-zone motif alone, transparent (composited onto the
  //    splash background at runtime; the Expo app's dark splash uses it).
  out.splashLogo = await shoot(browser, {
    html: pageHtml(svgSized(SAFE_ZONE_SVG, 512), 'transparent'),
    width: 512,
    height: 512,
    transparent: true,
  });

  // 6. Web PWA icons (#1985) — served at /icon, /icon0 and /apple-icon.
  out.icon192 = await fullBleedAt(192);
  out.icon512 = await fullBleedAt(512);
  out.appleIcon180 = await fullBleedAt(180);

  // 7. Google Play TWA shell icons (#1985) — same sizes Bubblewrap baked in.
  out.twa = { store_icon: await fullBleedAt(512) };
  for (const [name, sizes] of Object.entries(TWA_SIZES)) {
    out.twa[name] = [];
    for (const size of sizes) {
      out.twa[name].push(name === 'ic_maskable' ? await maskableAt(size) : await fullBleedAt(size));
    }
  }

  // 8. Mail header wordmark (#1985) — 2× its declared display size, on the mail
  //    card's white baked in (not transparent): forest text on a transparent
  //    PNG disappears when Gmail/Outlook darken the card in dark mode.
  const wm = svgDeclaredSize(WORDMARK_SVG);
  out.wordmarkSize = wm;
  out.wordmarkMail = await opaque(
    await shoot(browser, {
      html: pageHtml(svgSized(WORDMARK_SVG, wm.width * 2, wm.height * 2), MAIL_CARD),
      width: wm.width * 2,
      height: wm.height * 2,
      transparent: false,
    }),
    MAIL_CARD,
  );
  // Web wordmark sizes for the contact sheet: the master is drawn at a
  // 100-unit font size and 40 px tall = a 32 px font, so scale from there.
  const wmAtFont = async (fontPx) => {
    const k = fontPx / 32;
    const w = Math.round(wm.width * k);
    const h = Math.round(wm.height * k);
    return shoot(browser, {
      html: pageHtml(svgSized(WORDMARK_SVG, w, h), LINEN),
      width: w,
      height: h,
      transparent: false,
    });
  };
  out.wordmarkSm = await wmAtFont(20); // BrandMark size="sm" (text-xl)
  out.wordmarkLg = await wmAtFont(48); // BrandMark size="lg" (text-5xl, /login)

  out.contactSheet = await contactSheet(browser, out);
  return out;
}

// Contact sheet — the whole set laid out for a PR screenshot: the icon at the
// sizes people actually see (1024 down to 29 px, on light and dark home
// screens, with the iOS corner mask), the circle-masked maskable icon and the
// Android adaptive icon (their crop is visible in the image itself), both
// splashes, and the wordmark at web and mail sizes.
// Fixed tile widths are load-bearing: without them a flex column item sizes to
// its widest child (the label), which desynced the layout during #1278.
// Transparent-bg motifs are shown on a dark backdrop: the motif's cream fill
// (#F8F6F0) is the *same colour* as linen, so it silently vanishes there.
const CANVAS_W = 1480;
const CANVAS_H = 900;
async function contactSheet(browser, out) {
  const b64 = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
  const resize = async (buf, size) => sharp(buf).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer();
  const smalls = [];
  for (const size of [180, 60, 40, 29]) smalls.push({ size, buf: await resize(out.appstore, size) });
  // iOS squircle approximated by a 22.37 % corner radius.
  const iosIcon = (buf, size) =>
    `<img src="${b64(buf)}" width="${size}" height="${size}" style="border-radius:${(size * 0.2237).toFixed(1)}px;display:block;" />`;
  const label = (text) => `<span style="font:12px/1.3 sans-serif;color:${FOREST};text-align:center;">${text}</span>`;
  const cell = (inner, text, width) =>
    `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;width:${width}px;">${inner}${label(text)}</div>`;
  const homeScreen = (bg, textColor, name) =>
    `<div style="display:flex;gap:20px;align-items:flex-end;padding:18px 20px;background:${bg};border-radius:18px;">
       ${smalls
         .map(
           ({ size, buf }) =>
             `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;">${iosIcon(buf, size)}<span style="font:11px sans-serif;color:${textColor};">${size} px</span></div>`,
         )
         .join('')}
     </div>${label(name)}`;
  const box = (inner, bg, size, extra = '') =>
    `<div style="width:${size}px;height:${size}px;background:${bg};display:flex;align-items:center;justify-content:center;overflow:hidden;${extra}">${inner}</div>`;
  const img = (buf, w, h = w) => `<img src="${b64(buf)}" width="${w}" height="${h}" style="display:block;" />`;
  const wmBox = (buf, w, h, bg, text) =>
    cell(
      `<div style="padding:16px;background:${bg};border-radius:8px;display:flex;align-items:center;justify-content:center;min-height:${h + 32}px;">${img(buf, w, h)}</div>`,
      text,
      Math.max(w + 32, 160),
    );
  const wm = out.wordmarkSize;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;padding:28px;background:${LINEN};font-family:sans-serif;box-sizing:border-box;width:${CANVAS_W}px;height:${CANVAS_H}px;overflow:hidden;}
      h1{font-size:16px;color:${FOREST};margin:0 0 18px;}
      h2{font-size:13px;color:#5C5347;margin:22px 0 10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;}
      .row{display:flex;gap:24px;align-items:flex-end;}
    </style></head><body>
      <h1>Tørny — merket fra én generator-kjøring (#1985)</h1>
      <h2>App-ikon</h2>
      <div class="row">
        ${cell(iosIcon(await resize(out.appstore, 200), 200), 'App Store 1024 (vist i 200 px, iOS-maske)', 200)}
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">${homeScreen('#E9E4D8', FOREST, 'Lys hjemskjerm')}</div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">${homeScreen('#0B0F0D', '#F8F6F0', 'Mørk hjemskjerm')}</div>
      </div>
      <h2>Android, PWA og splash</h2>
      <div class="row">
        ${cell(box(img(out.maskable512, 160), 'transparent', 160, 'clip-path:circle(40%);'), 'maskable-512, sirkel-maskert<br/>(maskable safe-zone 80 %)', 160)}
        ${cell(
          `<div style="position:relative;width:160px;height:160px;clip-path:circle(33.3%);">
             <img src="${b64(out.background)}" width="160" height="160" style="position:absolute;inset:0;" />
             <img src="${b64(out.foreground)}" width="160" height="160" style="position:absolute;inset:0;" />
           </div>`,
          'Android adaptive-ikon<br/>(forgrunn på bakgrunn, sirkel 66 %)',
          160,
        )}
        ${cell(box(img(out.splashLogo, 120), DARK, 160), 'Mørk splash<br/>(motivet på #14201A)', 160)}
        ${cell(box(img(out.appstore, 90), LINEN, 160, `outline:1px solid #E4DCC8;`), 'Lys splash<br/>(flisen på linen)', 160)}
        ${cell(box(img(out.twa.ic_notification_icon[4], 96), 'transparent', 160), 'Play-skallet: varselikon 96', 160)}
      </div>
      <h2>Ordmerke</h2>
      <div class="row">
        ${wmBox(out.wordmarkSm, out.wordmarkSm.readUInt32BE(16), out.wordmarkSm.readUInt32BE(20), LINEN, 'sm (text-xl, 20 px) — sidetopp')}
        ${wmBox(out.wordmarkLg, out.wordmarkLg.readUInt32BE(16), out.wordmarkLg.readUInt32BE(20), LINEN, 'lg (text-5xl, 48 px) — /login')}
        ${wmBox(out.wordmarkMail, wm.width, wm.height, MAIL_CARD, `e-post (${wm.width}×${wm.height}, PNG i 2×)`)}
      </div>
    </body></html>`;
  return shoot(browser, { html, width: CANVAS_W, height: CANVAS_H, transparent: false });
}

function write(file, buf) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, buf);
}

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM_EXECUTABLE_PATH || undefined,
  });

  let out;
  try {
    out = await render(browser);
  } finally {
    await browser.close();
  }

  if (PREVIEW_DIR) {
    write(path.join(PREVIEW_DIR, 'contact-sheet.png'), out.contactSheet);
    assertDims(path.relative(ROOT, path.join(PREVIEW_DIR, 'contact-sheet.png')), out.contactSheet, CANVAS_W, CANVAS_H);
  } else {
    // 1–5: native/assets + public/icons (#1278).
    write(path.join(ASSETS_DIR, 'appstore-1024.png'), out.appstore);
    assertDims('appstore-1024.png', out.appstore, 1024, 1024);
    assertNoAlphaChannel('appstore-1024.png', out.appstore);
    write(path.join(ASSETS_DIR, 'android-foreground-432.png'), out.foreground);
    assertDims('android-foreground-432.png', out.foreground, 432, 432);
    write(path.join(ASSETS_DIR, 'android-background-432.png'), out.background);
    assertDims('android-background-432.png', out.background, 432, 432);
    write(path.join(ICONS_PUBLIC_DIR, 'maskable-192.png'), out.maskable192);
    assertDims('public/icons/maskable-192.png', out.maskable192, 192, 192);
    write(path.join(ICONS_PUBLIC_DIR, 'maskable-512.png'), out.maskable512);
    assertDims('public/icons/maskable-512.png', out.maskable512, 512, 512);
    write(path.join(ASSETS_DIR, 'ios-splash-logo.png'), out.splashLogo);
    assertDims('ios-splash-logo.png', out.splashLogo, 512, 512);

    // 6. Web PWA icons (#1985). next.config.ts rewrites /icon, /icon0 and
    //    /apple-icon here, so installed PWAs, sw.js and the TWA keep their URLs.
    for (const [file, buf, size] of [
      ['icon-192.png', out.icon192, 192],
      ['icon-512.png', out.icon512, 512],
      ['apple-icon-180.png', out.appleIcon180, 180],
    ]) {
      write(path.join(ICONS_PUBLIC_DIR, file), buf);
      assertDims(`public/icons/${file}`, buf, size, size);
      assertNoAlphaChannel(`public/icons/${file}`, buf);
    }

    // 7. Google Play TWA shell (#1985) — twa-manifest.json is left alone.
    write(path.join(TWA_DIR, 'store_icon.png'), out.twa.store_icon);
    assertDims('native/android/store_icon.png', out.twa.store_icon, 512, 512);
    for (const [name, sizes] of Object.entries(TWA_SIZES)) {
      const kind = name.startsWith('ic_launcher') || name === 'ic_maskable' ? 'mipmap' : 'drawable';
      sizes.forEach((size, i) => {
        const rel = `${kind}-${DENSITIES[i]}/${name}.png`;
        write(path.join(TWA_RES_DIR, rel), out.twa[name][i]);
        assertDims(`native/android/…/res/${rel}`, out.twa[name][i], size, size);
      });
    }

    // 8. Mail header wordmark (#1985) — lib/mail/wordmark.ts points at it.
    const wm = out.wordmarkSize;
    write(path.join(BRAND_PUBLIC_DIR, 'wordmark-mail@2x.png'), out.wordmarkMail);
    assertDims('public/brand/wordmark-mail@2x.png', out.wordmarkMail, wm.width * 2, wm.height * 2);
    assertNoAlphaChannel('public/brand/wordmark-mail@2x.png', out.wordmarkMail);

    // 9. Contact sheet.
    write(path.join(ASSETS_DIR, 'preview-contact-sheet.png'), out.contactSheet);
    assertDims('preview-contact-sheet.png', out.contactSheet, CANVAS_W, CANVAS_H);

    // 10. Expo-appens assets (#1975) — samme buffere som over, skrevet dit
    //     `native/app/app.json` peker. Ingen egen render: filene SKAL være
    //     identiske med masterne, og bevis-skriptet sammenligner dem med sha256.
    //     Splash: LYS bruker den heldekkende flisen (appstore), ikke motivet
    //     — motivets T er fylt #F8F6F0, nøyaktig samme farge som den lyse
    //     splash-bakgrunnen, så motivet ville vært usynlig der. MØRK bruker
    //     motivet (splashLogo), som har god kontrast mot #14201A.
    write(path.join(EXPO_APP_ASSETS_DIR, 'icon.png'), out.appstore);
    assertDims('native/app/assets/icon.png', out.appstore, 1024, 1024);
    assertNoAlphaChannel('native/app/assets/icon.png', out.appstore);
    write(path.join(EXPO_APP_ASSETS_DIR, 'splash-icon.png'), out.appstore);
    assertDims('native/app/assets/splash-icon.png', out.appstore, 1024, 1024);
    write(path.join(EXPO_APP_ASSETS_DIR, 'splash-icon-dark.png'), out.splashLogo);
    assertDims('native/app/assets/splash-icon-dark.png', out.splashLogo, 512, 512);
    write(path.join(EXPO_APP_ASSETS_DIR, 'android-icon-foreground.png'), out.foreground);
    assertDims('native/app/assets/android-icon-foreground.png', out.foreground, 432, 432);
    write(path.join(EXPO_APP_ASSETS_DIR, 'android-icon-background.png'), out.background);
    assertDims('native/app/assets/android-icon-background.png', out.background, 432, 432);
  }

  if (failed) {
    console.error('\nFERDIG MED FEIL — én eller flere mekaniske sjekker mislyktes (se over).');
    process.exit(1);
  }
  console.log(PREVIEW_DIR ? '\nOK — kontaktarket er generert.' : '\nOK — alle filer generert og verifisert.');
}

main().catch((err) => {
  console.error('generate-icons.mjs feilet uventet:', err);
  process.exit(1);
});
