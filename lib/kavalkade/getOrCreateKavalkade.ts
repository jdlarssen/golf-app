import 'server-only';

/**
 * Kavalkadens inngangsdør (#2128, epic #1040) — én funksjon, tre svar.
 *
 * Siden (K3) spør her og får enten en lagret kavalkade, en forhåndsvisning
 * (bare for admin, før datoen) eller et «kommer 24. desember».
 *
 * ## Hvorfor raden bygges ved første åpning, og aldri igjen
 *
 * Frysegrensen og åpningstidspunktet er samme instant (`./release.ts`). Siden
 * er skjult til da, og fakta regnes bare på runder avsluttet før da. Første
 * gang noen åpner kavalkaden sin, er dataene altså allerede endelige — raden
 * skrives én gang og trenger verken fingeravtrykk eller regenerering.
 *
 * ## To faner åpnet samtidig
 *
 * Innsettingen er `on conflict do nothing`. Taperen i kappløpet får null rader
 * tilbake, leser raden vinneren skrev, og viser den. Resultatet er én rad,
 * uansett hvor mange faner spilleren har åpne.
 *
 * Lesingen rett etterpå kan komme for tidlig: `on conflict do nothing` venter
 * IKKE på den andre transaksjonen, den hopper over raden så lenge den ikke er
 * commitet. Taperen kan altså få både null rader OG en tom lesing, med raden
 * på plass et øyeblikk senere. Derfor ser vi etter raden noen få ganger med kort
 * pause — hvert forsøk med sin egen `AbortSignal`, ellers gir Next tilbake den
 * memoiserte tomme lesingen uten å gå på nettet (samme felle som
 * `../supabase/transientRetry.ts` beskriver). Er raden fortsatt ikke der,
 * kaster vi: en stille 0-rads skriving er en feil, ikke en suksess (felle 2,
 * `docs/bug-prevention.md`).
 *
 * Reprodusert på staging (#2129): to samtidige åpninger ga én kavalkade og én
 * feilskjerm, og probe-loggen viste fem «lesinger» på 0 ms — altså ingen av dem
 * på nettet.
 *
 * ## Før datoen
 *
 * Ingen rad skrives, og modellen kalles ikke. Admin får se fakta regnet live,
 * uten tekst og uten lagring, så eieren kan sjekke kortene før slippet. Alle
 * andre får `closed` og ser teaseren (K5).
 */

import { getAdminClient } from '@/lib/supabase/admin';
import { buildKavalkadeFacts, type KavalkadeFacts } from './buildKavalkadeFacts';
import { generateKavalkadeNarrative } from './generateKavalkadeNarrative';
import { loadKavalkadeInput } from './loadKavalkadeInput';
import {
  KAVALKADE_CUTOFF,
  KAVALKADE_YEAR,
  isKavalkadeOpen,
  kavalkadeOpensAt,
  type KavalkadeEnv,
} from './release';

/** Den lagrede kavalkaden, slik siden leser den. */
export type StoredKavalkade = {
  facts: KavalkadeFacts;
  /** AI-innledningen. `null` er gyldig: da vises kortene uten tekst. */
  narrative: string | null;
  /** Når raden ble skrevet, som ISO. */
  generatedAt: string;
};

export type KavalkadeView =
  /** Åpen: en lagret rad, med eller uten innledning. */
  | ({ status: 'ready' } & StoredKavalkade)
  /** Admin før datoen: fakta regnet live, ingenting lagret, ingen tekst. */
  | { status: 'preview'; facts: KavalkadeFacts }
  /** Alle andre før datoen. */
  | { status: 'closed'; opensAt: string };

export type GetOrCreateKavalkadeOptions = {
  /** Året. Default `KAVALKADE_YEAR`. */
  year?: number;
  /** «Nå» — injiserbart for tester. Default `new Date()`. */
  now?: Date;
  /** Miljøet åpningstidspunktet leses fra. Default `process.env`. */
  env?: KavalkadeEnv;
};

/**
 * Henter spillerens kavalkade, og bygger den hvis den ikke finnes ennå.
 *
 * `viewerUserId` må være verifisert av kallstedet (`getProxyVerifiedUserId`) —
 * funksjonen leser med service-rollen og stoler på id-en den får.
 *
 * Kaster ved databasefeil. Siden trenger derfor sin egen `error.tsx` (felle 5).
 * Modellen kaster aldri: en kavalkade uten innledning er et gyldig svar.
 *
 * ⚠️ K3: første åpning venter på modellen (`NARRATIVE_TIMEOUT_MS`) FØR raden
 * skrives. Ruta som kaller hit trenger derfor `export const maxDuration = 60`,
 * samme konvensjon som de andre trege flatene i repoet. Uten den kan
 * plattformen kutte førsteåpningen, og da står spilleren igjen uten rad og
 * betaler et nytt modellkall neste gang.
 */
export async function getOrCreateKavalkade(
  viewerUserId: string,
  options: GetOrCreateKavalkadeOptions = {},
): Promise<KavalkadeView> {
  const year = options.year ?? KAVALKADE_YEAR;
  const now = options.now ?? new Date();
  const env = options.env ?? process.env;
  const supabase = getAdminClient();

  if (!isKavalkadeOpen(now, env)) {
    const opensAt = kavalkadeOpensAt(env).toISOString();
    if (!(await isAdmin(viewerUserId))) return { status: 'closed', opensAt };

    // Admin-forhåndsvisning: regnet her og nå, lagret ingen steder. Runder som
    // spilles mellom forhåndsvisningen og slippet kommer til — men ingen runde
    // som ikke teller ved slippet er med, for frysegrensen er alltid
    // KAVALKADE_CUTOFF og aldri «nå».
    return { status: 'preview', facts: await computeFacts(viewerUserId, year) };
  }

  const existing = await readStoredKavalkade(viewerUserId, year);
  if (existing) return { status: 'ready', ...existing };

  const facts = await computeFacts(viewerUserId, year);
  const narrative = await generateKavalkadeNarrative(facts);

  const inserted = await supabase
    .from('kavalkades')
    // `ignoreDuplicates` gir taperen i et kappløp 0 rader i stedet for en
    // unik-feil — «on conflict do nothing» over PostgREST.
    .upsert(
      { user_id: viewerUserId, year, facts, narrative },
      { onConflict: 'user_id,year', ignoreDuplicates: true },
    )
    .select('facts, narrative, generated_at')
    .returns<KavalkadeRow[]>();

  if (inserted.error) {
    throw new Error(`getOrCreateKavalkade: insert failed: ${inserted.error.message}`);
  }

  const row = inserted.data?.[0];
  if (row) return { status: 'ready', ...toStored(row) };

  // 0 rader: enten tapte vi kappløpet (da finnes raden straks), eller
  // skrivingen traff ingenting — og det siste er en feil som skal høres.
  const afterRace = await waitForWinnersRow(viewerUserId, year);
  if (!afterRace) {
    throw new Error(
      `getOrCreateKavalkade: insert affected 0 rows and no row exists (user ${viewerUserId}, year ${year})`,
    );
  }
  console.warn('[getOrCreateKavalkade] lost the insert race, using the stored row', {
    year,
  });
  return { status: 'ready', ...afterRace };
}

/**
 * Pausene mellom forsøkene på å lese raden vinneren skrev, i millisekunder.
 * Vinneren commiter i løpet av noen få millisekunder; lista gir den et halvt
 * sekund til sammen før vi kaller det en feil. Første lesing skjer straks, så
 * et kappløp som allerede er avgjort koster ingen ekstra ventetid.
 */
const WINNER_ROW_RETRY_DELAYS_MS = [20, 60, 150, 300];

/**
 * Leser raden om og om igjen til den er synlig, eller til pausene er brukt opp.
 *
 * `null` betyr at ingen annen transaksjon skrev raden — altså at skrivingen vår
 * traff null rader uten en konflikt, som er en ekte feil.
 */
async function waitForWinnersRow(
  viewerUserId: string,
  year: number,
): Promise<StoredKavalkade | null> {
  for (let attempt = 0; ; attempt += 1) {
    // Ny signal per forsøk: Next deduper GET-er til samme URL innenfor én
    // render, og signalet er opt-out-en.
    const row = await readStoredKavalkade(
      viewerUserId,
      year,
      new AbortController().signal,
    );
    if (row) return row;
    if (attempt >= WINNER_ROW_RETRY_DELAYS_MS.length) return null;
    await new Promise((resolve) =>
      setTimeout(resolve, WINNER_ROW_RETRY_DELAYS_MS[attempt]),
    );
  }
}

type KavalkadeRow = {
  facts: KavalkadeFacts;
  narrative: string | null;
  generated_at: string;
};

/**
 * Leser raden hvis den finnes. Feil på lesingen kaster — aldri «ingen rad».
 *
 * Eksportert for kort-ruta (#2130), som skal lese den lagrede kavalkaden og
 * ALDRI bygge en ny: et bilde-kall skal verken koste et modellkall eller
 * skrive en rad. Finnes ingen rad, svarer ruta 404.
 */
export async function readStoredKavalkade(
  viewerUserId: string,
  year: number,
  signal?: AbortSignal,
): Promise<StoredKavalkade | null> {
  const query = getAdminClient()
    .from('kavalkades')
    .select('facts, narrative, generated_at')
    .eq('user_id', viewerUserId)
    .eq('year', year);
  const { data, error } = await (signal ? query.abortSignal(signal) : query)
    .maybeSingle<KavalkadeRow>();

  // #877: en defaultet feil blir stille til «ingen data» — og her ville det
  // betydd en ny generering oppå en rad som allerede finnes.
  if (error) {
    throw new Error(`getOrCreateKavalkade: read failed: ${error.message}`);
  }
  return data ? toStored(data) : null;
}

function toStored(row: KavalkadeRow): StoredKavalkade {
  return {
    facts: row.facts,
    narrative: row.narrative,
    generatedAt: row.generated_at,
  };
}

/** Fakta regnet fra bunnen. Frysegrensen er alltid `KAVALKADE_CUTOFF`. */
async function computeFacts(
  viewerUserId: string,
  year: number,
): Promise<KavalkadeFacts> {
  const input = await loadKavalkadeInput(viewerUserId, {
    year,
    cutoff: KAVALKADE_CUTOFF,
  });
  return buildKavalkadeFacts(input);
}

/** Er spilleren admin? En feil her leses som «nei» — porten er fail-closed. */
async function isAdmin(viewerUserId: string): Promise<boolean> {
  const { data, error } = await getAdminClient()
    .from('users')
    .select('is_admin')
    .eq('id', viewerUserId)
    .maybeSingle<{ is_admin: boolean | null }>();

  if (error) {
    console.error('[getOrCreateKavalkade] admin lookup failed', { error });
    return false;
  }
  return data?.is_admin === true;
}
