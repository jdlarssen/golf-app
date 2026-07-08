// Discord PR-kort (#1159, Del B), steg 2 av 3: SKJERMBILDER. Kjøres kun når
// decide-steget fant en visuell diff. Resolverer ekte fikstur-verdier mot
// staging, kartlegger endrede filer til ruter (lib/loops/prScreenshots), logger
// inn via OTP-mint (samme rigg som e2e:gate) og tar skjermbilder som
// post-steget fester på Discord-kortet.
//
// Krever npm ci (Playwright + supabase-js). Best-effort: hver rute som feiler
// dropper sitt skjermbilde uten å felle jobben; kortet postes uansett.
//
// Env: staging-secrets (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// E2E_ADMIN_EMAIL, E2E_PLAYER_EMAIL), SCREENSHOT_BASE_URL (default localhost:3000),
// SHOTS_DIR (default pr-shots), CARD_PLAN_PATH.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext } from '@playwright/test';
import { readPlan } from './cardPlan';
import {
  deriveTargetsFromChangedFiles,
  type Fixtures,
  type RouteAuth,
} from '../../lib/loops/prScreenshots';
import {
  adminClient,
  ADMIN_EMAIL,
  cleanupTestGame,
  envReady,
  PLAYER_EMAIL,
  seedActiveStablefordGame,
  signInViaOtp,
  skipReason,
} from '../../e2e/_helpers/games';

const LOG = '[screenshot-routes]';
const BASE_URL = process.env.SCREENSHOT_BASE_URL || 'http://localhost:3000';
const SHOTS_DIR = process.env.SHOTS_DIR || 'pr-shots';
const VIEWPORT = { width: 390, height: 844 }; // mobil (appens primærcase)

// Resolverer fiksturer mot staging. Alt er best-effort: en manglende verdi lar
// bare ruter som trenger den falle bort. Returnerer også en cleanup for seedet data.
async function resolveFixtures(): Promise<{ fixtures: Fixtures; cleanup: () => Promise<void> }> {
  const admin = adminClient();
  const fixtures: Fixtures = {};
  let seededGameId: string | undefined;

  try {
    const g = await seedActiveStablefordGame('shots');
    fixtures.gameId = g.id;
    seededGameId = g.id;
  } catch (err) {
    console.error(`${LOG} seed av test-spill feilet — game-ruter dropper`, err);
  }

  // Beste-effort oppslag; hver query er isolert så én manglende tabell ikke stopper resten.
  const first = async (table: string, col: string): Promise<string | undefined> => {
    try {
      const { data } = await admin.from(table).select(col).not(col, 'is', null).limit(1).maybeSingle();
      return (data as Record<string, string> | null)?.[col];
    } catch {
      return undefined;
    }
  };
  fixtures.courseSlug = await first('courses', 'slug');
  fixtures.clubId = await first('groups', 'id'); // klubber = groups-tabellen
  fixtures.ligaId = await first('leagues', 'id');
  fixtures.cupId = await first('tournaments', 'id');
  if (PLAYER_EMAIL) {
    try {
      const { data } = await admin.from('users').select('id').ilike('email', PLAYER_EMAIL).maybeSingle();
      fixtures.playerId = (data as { id: string } | null)?.id;
    } catch {
      /* best-effort */
    }
  }

  return {
    fixtures,
    cleanup: async () => {
      if (seededGameId) await cleanupTestGame(seededGameId);
    },
  };
}

function sanitize(label: string): string {
  return label.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40);
}

async function main(): Promise<void> {
  const plan = readPlan();
  if (!plan || !plan.pr || !plan.isGui) {
    console.log(`${LOG} ingen visuell diff i planen — hopper over skjermbilder.`);
    return;
  }
  if (!envReady) {
    console.log(`${LOG} staging-env mangler (${skipReason}) — hopper over skjermbilder (best-effort).`);
    return;
  }

  const { fixtures, cleanup } = await resolveFixtures();
  const targets = deriveTargetsFromChangedFiles(plan.changedFiles, fixtures);
  if (targets.length === 0) {
    console.log(`${LOG} ingen ruter resolvert — hopper over.`);
    await cleanup();
    return;
  }
  console.log(`${LOG} ${targets.length} rute(r): ${targets.map((t) => `${t.path}(${t.auth})`).join(', ')}`);

  mkdirSync(SHOTS_DIR, { recursive: true });
  const browser: Browser = await chromium.launch();
  const contexts: Partial<Record<RouteAuth, BrowserContext>> = {};

  const contextFor = async (auth: RouteAuth): Promise<BrowserContext> => {
    if (contexts[auth]) return contexts[auth]!;
    const ctx = await browser.newContext({ baseURL: BASE_URL, viewport: VIEWPORT });
    if (auth !== 'none') {
      const email = auth === 'admin' ? ADMIN_EMAIL : PLAYER_EMAIL;
      const page = await ctx.newPage();
      await signInViaOtp(page, email as string);
      await page.close();
    }
    contexts[auth] = ctx;
    return ctx;
  };

  let taken = 0;
  try {
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      try {
        const ctx = await contextFor(t.auth);
        const page = await ctx.newPage();
        await page.goto(t.path, { waitUntil: 'networkidle', timeout: 30_000 });
        await page.waitForTimeout(800); // la layout/animasjon sette seg
        const file = join(SHOTS_DIR, `${String(i + 1).padStart(2, '0')}-${sanitize(t.label)}.png`);
        await page.screenshot({ path: file });
        await page.close();
        taken++;
        console.log(`${LOG} ✓ ${t.path} → ${file}`);
      } catch (err) {
        console.error(`${LOG} ✗ ${t.path} (${t.auth}) — dropper skjermbildet:`, err instanceof Error ? err.message : err);
      }
    }
  } finally {
    await browser.close();
    await cleanup();
  }
  console.log(`${LOG} ferdig — ${taken}/${targets.length} skjermbilde(r) tatt.`);
}

main().catch((err) => {
  // Best-effort: skjermbilder skal aldri felle kort-jobben.
  console.error(`${LOG} uventet feil (kortet postes uten skjermbilder)`, err);
});
