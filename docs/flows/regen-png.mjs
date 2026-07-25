// Regenererer docs/flows/*.png fra SVG-kildene med aspekt-riktig bredde.
//
// Bakgrunn (#1260): den gamle `qlmanage -t -s 2000`-oppskriften ga en
// 2000x2000-boks. Flyt-SVG-ene er alle bredere enn de er høye, så et kvadratisk
// mål skalerte til bredden og BESKAR innhold til høyre (annoteringsbokser kuttet
// midt i setningen). qlmanage er dessuten macOS-only og kan ikke kjøre i natt-VM-en.
//
// Denne rendreren bruker Playwright chromium (allerede en repo-avhengighet,
// kryssplattform): den leser hver SVGs viewBox, regner ut høyden som følger
// aspektforholdet ved bredde 2000, og tar et skjermbilde. Ingen ny dependency.
//
// Kjør fra repo-rota: `node docs/flows/regen-png.mjs`
// Sett PW_CHROMIUM_EXECUTABLE_PATH om Playwrights bundlede browser-oppslag ikke
// matcher den pre-installerte binæren (#1183).

import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const TARGET_WIDTH = 2000;
const FLOWS_DIR = dirname(fileURLToPath(import.meta.url));

/** Leser viewBox-dimensjonene fra en SVG. Feiler HØYT om den mangler — aldri kvadrat-fallback. */
function readViewBox(svgPath) {
  const svg = readFileSync(svgPath, 'utf8');
  const match = svg.match(/viewBox="([\d.\s-]+)"/);
  if (!match) {
    throw new Error(`Mangler viewBox i ${svgPath} — kan ikke regne ut aspekt-riktig høyde.`);
  }
  const parts = match[1].trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    throw new Error(`Ugyldig viewBox "${match[1]}" i ${svgPath}.`);
  }
  const [, , vbWidth, vbHeight] = parts;
  if (!(vbWidth > 0) || !(vbHeight > 0)) {
    throw new Error(`viewBox har ikke-positiv bredde/høyde i ${svgPath}.`);
  }
  return { vbWidth, vbHeight };
}

const svgFiles = readdirSync(FLOWS_DIR)
  .filter((f) => f.endsWith('.svg'))
  .sort();

if (svgFiles.length === 0) {
  throw new Error(`Ingen SVG-er funnet i ${FLOWS_DIR}.`);
}

const executablePath = process.env.PW_CHROMIUM_EXECUTABLE_PATH || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});

try {
  for (const file of svgFiles) {
    const svgPath = join(FLOWS_DIR, file);
    const { vbWidth, vbHeight } = readViewBox(svgPath);
    const height = Math.round((TARGET_WIDTH * vbHeight) / vbWidth);

    // SVG-ene har eksplisitt width/height lik viewBox, så de rendres i sin
    // intrinsic-størrelse. Vi setter viewporten til nettopp den størrelsen og
    // skalerer opp med deviceScaleFactor, slik at diagrammet FYLLER rammen
    // (ellers havner det lite i øvre venstre hjørne med hvit luft rundt).
    const scale = TARGET_WIDTH / vbWidth;
    const page = await browser.newPage({
      viewport: { width: vbWidth, height: vbHeight },
      deviceScaleFactor: scale,
    });
    await page.goto(pathToFileURL(svgPath).href);
    const pngPath = join(FLOWS_DIR, `${file.slice(0, -4)}.png`);
    await page.screenshot({ path: pngPath });
    await page.close();

    console.log(`${file} → ${TARGET_WIDTH}x${height} (viewBox ${vbWidth}x${vbHeight})`);
  }
} finally {
  await browser.close();
}
