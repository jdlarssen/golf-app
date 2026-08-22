import type { GameMode } from '@/lib/scoring/modes/types';
import { formatPlayStyle } from '@/lib/scoring/modes/types';
import type { Intent } from '@/lib/wizard/intent';

/**
 * #1385 — «hvordan gjenopptas dette utkastet?».
 *
 * Et utkast lagret i 5-stegs-veiviseren skal gjenopptas i veiviseren, ikke i
 * den stablede GameForm-en. Men veiviseren trenger noe `games`-raden ikke
 * lagrer: arrangement-valget fra steg 1 (`Intent`). Raden har ingen
 * intent-kolonne, så den utledes her — på side-nivå, med vilje utenfor
 * `buildEditInitialValues`: den outputen deles med revansje-prefillen, og en
 * `group_id` emittert der ville stille latt en revansje arve klubb-scopet.
 *
 * Funksjonen er ren og fail-safe: finner den ikke en trygg vei inn i
 * veiviseren, sier den `form` og kalleren monterer GameForm som før. Ingen
 * gren kaster.
 */

/** Intents veiviseren kan gjenoppta et utkast i. Cup har ingen redigeringsgren. */
export type ResumableIntent = Exclude<Intent, 'cup'>;

/** Feltene fra `games`-raden avgjørelsen trenger. */
export type DraftResumeRow = {
  game_mode: GameMode;
  /** Klubb-scope (#442). Satt → klubb-arrangement. */
  group_id?: string | null;
  /** Cup-kobling. Satt → veiviseren er ikke redigeringsflaten (se under). */
  tournament_id?: string | null;
  /** Liga-runde-kobling. Samme fail-closed-regel som cup. */
  league_round_id?: string | null;
};

/**
 * Format-katalogen per intent, slik veiviseren får den servert. Bare `slug`
 * leses her, så både `FormatForIntent` og en test-fixture passer.
 */
export type FormatCatalog = Record<ResumableIntent, readonly { slug: string }[]>;

export type DraftResumePlan =
  | {
      kind: 'wizard';
      intent: ResumableIntent;
      /** Sendes som `defaultGroupId` — veiviseren seeder klubb-velgeren fra den. */
      groupId: string | undefined;
    }
  | { kind: 'form' };

/**
 * Rå intent-avledning fra raden. Rekkefølgen er bevisst: klubb-scopet er et
 * eksplisitt valg arrangøren tok, og slår formatets spillestil (et klubb-spill
 * kan godt være solo slagspill).
 */
function deriveIntent(row: DraftResumeRow): ResumableIntent {
  if (row.group_id) return 'klubb';
  if (formatPlayStyle(row.game_mode) === 'solo') return 'solo';
  return 'kompis';
}

/**
 * `defaultGroupId`-verdien. Tom streng er ingen klubb (samme lesning som
 * `deriveIntent`), og skal ikke tres inn som om den var en klubb-id.
 */
function groupIdOrUndefined(row: DraftResumeRow): string | undefined {
  return row.group_id ? row.group_id : undefined;
}

function catalogHas(
  catalog: FormatCatalog,
  intent: ResumableIntent,
  mode: GameMode,
): boolean {
  return catalog[intent].some((f) => f.slug === mode);
}

export function planDraftResume(
  row: DraftResumeRow,
  catalog: FormatCatalog,
): DraftResumePlan {
  // Fail-closed på begge koblingene: veiviserens cup-gren er en
  // OPPRETTELSES-kortslutning (GameWizard.tsx: `isNewCupFlow`), ikke en
  // redigeringsflate, og liga-runder settes opp fra liga-siden. Et utkast som
  // henger i en cup eller en liga-runde beholder derfor GameForm.
  if (row.tournament_id || row.league_round_id) return { kind: 'form' };

  const intent = deriveIntent(row);

  // Katalog-vakt: steg 2 rendrer bare formatene i katalogen for valgt intent.
  // Ligger utkastets format ikke der, ville arrangøren møtt et steg 2 uten sitt
  // eget format synlig. Kompis er den bredeste katalogen, så vi prøver den —
  // og finnes formatet ikke der heller, faller vi tilbake til GameForm i stedet
  // for å vise en veiviser som ikke kan representere spillet.
  if (catalogHas(catalog, intent, row.game_mode)) {
    return { kind: 'wizard', intent, groupId: groupIdOrUndefined(row) };
  }
  if (catalogHas(catalog, 'kompis', row.game_mode)) {
    return { kind: 'wizard', intent: 'kompis', groupId: groupIdOrUndefined(row) };
  }
  return { kind: 'form' };
}
