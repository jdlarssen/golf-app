// native/app/src/data/formatCatalog.ts
// Native N6a (#1854): hvilke formater veiviseren faktisk kan tilby akkurat nå.
//
// Gaten er tre-lags, og alle tre må si ja:
//
//  1. **Appen** — `APP_SUPPORTED_MODES` (`lib/appFormats.ts`). De åtte modiene
//     appen har skjermer for. Konstant, ingen DB involvert.
//  2. **DB-en** — `formats.is_active` ∧ `format_intent_mapping.is_visible`.
//     Admin kan slå av et format på nettsiden, og da skal det forsvinne fra
//     appen uten at appen slippes på nytt.
//  3. **Rosteret** — `fitsPlayerCount` (delt, ren TS). Wolf med to spillere er
//     ikke wolf. Kravet vises på kortet; selve fit-sjekken gjør `rosterLimits`.
//
// **Hvorfor tabellene leses direkte og ikke via webbens helper.**
// `getFormatsForIntent` og `isValidActiveGameMode` åpner begge med
// `import 'server-only'` og bruker service-role-klienten. Appen har ingen
// service-role og skal ikke få en. SELECT-policyene på begge tabellene er
// `to public` men gatet på `is_admin() OR auth.role() = 'authenticated'` — en
// innlogget app leser dem fint under vanlig RLS.
//
// **Intent-steget utgår.** Webben trenger intents for å ordne 22 formater;
// appen har 8 og viser dem flatt (kontraktens Key Decision). Derfor spør vi
// ikke om intent i det hele tatt — et format teller som synlig hvis det er
// synlig i MINST ÉN intent.
//
// **Fetch KASTER ved feil.** Samme regel som `choices.ts` og `gameBundle.ts`:
// tom liste er et gyldig svar («admin har slått av alt»), en feilet henting er
// det ikke. En tom formatliste som ser autoritativ ut er verre enn en ærlig
// «fikk ikke hentet» — arrangøren ville trodd appen ikke kan opprette spill.
import {
  APP_MODE_LABELS,
  APP_SUPPORTED_MODES,
  isAppSupportedMode,
  type AppGameMode,
} from '../lib/appFormats';
import { supabase } from '../supabase';

/** Ett format slik format-steget i veiviseren viser det. */
export interface FormatCatalogEntry {
  slug: AppGameMode;
  /** Norsk navn, speilet fra `messages/no.json` (låst av paritetstest). */
  label: string;
  /** Ikon-nøkkelen webben bruker. Appen kan mappe den til sitt eget ikon. */
  iconKey: string;
  /** Sant når formatet er markert som primært i minst én intent. */
  isPrimary: boolean;
  /** Laveste `sort_order` blant de synlige mappingene. Brukes som rekkefølge. */
  sortOrder: number;
}

/** Rå PostgREST-fasong. Ingen skjerm ser den — mappingen skjer under. */
interface FormatRow {
  slug: string;
  icon_key: string;
}

interface IntentMappingRow {
  format_slug: string;
  is_primary: boolean;
  sort_order: number;
}

const SUPPORTED_SLUGS: string[] = [...APP_SUPPORTED_MODES];

/**
 * De formatene appen OG databasen er enige om, sortert som veiviseren viser dem.
 *
 * Rekkefølgen er `sort_order` stigende med slug som tiebreak — deterministisk,
 * og den følger nettsidens egen prioritering uten at appen har en mening.
 *
 * @throws {Error} når en av de to spørringene feiler. Kalleren MÅ vise den
 *   ærlige noten ({@link FORMAT_CATALOG_FETCH_NOTE}) og ikke en tom liste:
 *   en tom liste betyr «ingenting er aktivt», og det er et annet svar.
 */
export async function fetchFormatCatalog(): Promise<FormatCatalogEntry[]> {
  const [formatsRes, mappingRes] = await Promise.all([
    supabase
      .from('formats')
      .select('slug, icon_key')
      .eq('is_active', true)
      .in('slug', SUPPORTED_SLUGS)
      .returns<FormatRow[]>(),
    supabase
      .from('format_intent_mapping')
      .select('format_slug, is_primary, sort_order')
      .eq('is_visible', true)
      .in('format_slug', SUPPORTED_SLUGS)
      .returns<IntentMappingRow[]>(),
  ]);

  if (formatsRes.error) {
    throw new Error(`fetchFormatCatalog(formats): ${formatsRes.error.message}`);
  }
  if (mappingRes.error) {
    throw new Error(
      `fetchFormatCatalog(format_intent_mapping): ${mappingRes.error.message}`,
    );
  }

  // Et format kan være mappet til flere intents. Slå dem sammen: primært hvis
  // det er primært NOEN steder, og med den laveste sort_order-en det har.
  const visible = new Map<string, { isPrimary: boolean; sortOrder: number }>();
  for (const row of mappingRes.data ?? []) {
    const seen = visible.get(row.format_slug);
    visible.set(row.format_slug, {
      isPrimary: (seen?.isPrimary ?? false) || row.is_primary,
      sortOrder: Math.min(seen?.sortOrder ?? row.sort_order, row.sort_order),
    });
  }

  const entries: FormatCatalogEntry[] = [];
  for (const row of formatsRes.data ?? []) {
    // `.in(...)` filtrerer alt på DB-siden; guarden er her fordi den også er
    // type-guarden som gjør `slug` til en `AppGameMode`.
    if (!isAppSupportedMode(row.slug)) continue;
    const mapping = visible.get(row.slug);
    if (!mapping) continue;
    entries.push({
      slug: row.slug,
      label: APP_MODE_LABELS[row.slug],
      iconKey: row.icon_key,
      isPrimary: mapping.isPrimary,
      sortOrder: mapping.sortOrder,
    });
  }

  return entries.sort(
    (a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug),
  );
}


/**
 * Teksten arrangøren får når hentingen feilet.
 *
 * Egen konstant, ikke en tom liste: #1832-guardrailen. «Ingen formater» og
 * «vi vet ikke hvilke formater som finnes» er to ulike svar, og bare det ene
 * betyr at det er noe galt med nettet.
 */
export const FORMAT_CATALOG_FETCH_NOTE =
  'Fikk ikke hentet formatene. Sjekk nettet og prøv igjen.';
