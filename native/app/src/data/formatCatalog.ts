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
// **Typen styrer lista (#2753).** Veiviseren spør først om arrangementet, og
// formatene leses for den typen: `intent`-filteret og typens egen
// `sort_order`, som nettets `getFormatsForIntent`. Et format admin skrur av
// for typen på nettet, forsvinner uten nytt appbygg.
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
  /** Sant når formatet er markert som primært for typen. */
  isPrimary: boolean;
  /** Typens `sort_order`. Brukes som rekkefølge. */
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
 * Typene som har en formatliste. Cup har sin egen veiviser, og «Solo / test»
 * finnes ikke i appen (eierens valg 01.11).
 */
export type FormatIntent = 'kompis' | 'klubb';

/**
 * De formatene appen OG databasen er enige om for typen, sortert som
 * veiviseren viser dem.
 *
 * Rekkefølgen er `sort_order` stigende med slug som tiebreak — deterministisk,
 * og den følger nettsidens egen prioritering uten at appen har en mening.
 *
 * @throws {Error} når en av de to spørringene feiler. Kalleren MÅ vise den
 *   ærlige noten ({@link FORMAT_CATALOG_FETCH_NOTE}) og ikke en tom liste:
 *   en tom liste betyr «ingenting er aktivt», og det er et annet svar.
 */
export async function fetchFormatCatalog(
  intent: FormatIntent,
): Promise<FormatCatalogEntry[]> {
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
      .eq('intent', intent)
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

  // Én rad per format og type (primærnøkkelen er `format_slug, intent`).
  const visible = new Map<string, IntentMappingRow>(
    (mappingRes.data ?? []).map((row) => [row.format_slug, row]),
  );

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
      isPrimary: mapping.is_primary,
      sortOrder: mapping.sort_order,
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
