import type { GameModeConfig } from '@/lib/scoring/modes/types';
import { supportsNetToParRanking } from '@/lib/scoring/tiebreaker';

/**
 * `mode_config`-nøkler som IKKE eies av redigeringsskjemaet.
 *
 * De settes av andre flyter — cup-generatoren skriver `team_strokes_override`
 * (arrangørens manuelle lag-slag for greensome, #1441 D10) rett inn i
 * `games.mode_config` — og har ingen felt i edit-skjemaet. Validatoren i
 * `gamePayload.ts` kjenner dem derfor ikke, og bygger en config uten dem.
 *
 * `team_strokes_override_auto` er med her på forhånd: den kommer med #1628,
 * og hører til samme eier (cup-/startflyten, aldri skjemaet). Står den i
 * lista fra før, arver den riktig oppførsel den dagen den lander.
 *
 * `withdrawal_play_on` (#1814) hører hjemme her av nøyaktig samme grunn:
 * arrangørens «makkeren spiller alene»-valg på en cup-fourball skrives av
 * trekk-flyten, ikke av edit-skjemaet. Uten den i lista nullet en lagring av
 * kampen valget, og en avgjort kamp våknet stille til live igjen.
 *
 * `ranking` (#2253) is stamped when a game is created, or when a draft
 * switches format (`stampNewGameModeConfig`, `editedModeConfig`), and has no
 * form field. Carrying it keeps a net-to-par game on its rule through an
 * edit; an older game has no key to carry, so an edit that keeps the format
 * never moves it to the new rule.
 */
export const PRESERVED_MODE_CONFIG_KEYS = [
  'team_strokes_override',
  'team_strokes_override_auto',
  'withdrawal_play_on',
  'ranking',
] as const;

/**
 * #2253 / #2625: stamps the rules a NEW game is created with onto its
 * `mode_config`. Today that is one: solo strokeplay, the team strokeplay
 * formats (best ball, Texas/Ambrose/Florida scramble, shamble), the points
 * formats (stableford, modified stableford, patsome) and Nassau rank on net to
 * par (`ranking: 'net_to_par'`, read by `ranksByNetToPar` in the scoring
 * engine). Every other config is returned unchanged.
 *
 * Called at every insert site that can create one of those formats — the
 * list, and why the others are exempt, lives in `gamesInsertSites.test.ts`.
 * At creation, or when a draft switches format (`editedModeConfig`). An edit
 * that keeps the format carries the key via `PRESERVED_MODE_CONFIG_KEYS` and
 * never adds it, so a game played under the old rule keeps it.
 */
export function stampNewGameModeConfig(config: GameModeConfig): GameModeConfig {
  if (!supportsNetToParRanking(config)) return config;
  return { ...config, ranking: 'net_to_par' };
}

/**
 * #2625: the `mode_config` an edit of a game saves. A draft that switches
 * format is still a new game, so the new format is stamped like at creation;
 * otherwise the keys the form does not own are carried over
 * (`carryPreservedModeConfigKeys`), and an edit never adds the flag to a game
 * created without it. Only a draft can switch format (the edit action's
 * mode-lock).
 */
export function editedModeConfig(existing: unknown, next: GameModeConfig): GameModeConfig {
  const previousKind =
    existing !== null && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>).kind
      : undefined;
  if (previousKind !== undefined && previousKind !== next.kind) {
    return stampNewGameModeConfig(next);
  }
  return carryPreservedModeConfigKeys(existing, next);
}

/**
 * Bærer de ikke-skjemaeide nøklene fra den lagrede `mode_config` over i den
 * skjemaet nettopp bygde, slik at en redigering ikke sletter dem.
 *
 * #1677: edit-actionen skrev `mode_config: payload.mode_config` og ERSTATTET
 * dermed hele JSONB-en med validator-output. Enhver redigering av en planlagt
 * cup-greensome — også «lagre uten å endre noe» — nullet arrangørens
 * lag-slag-forslag.
 *
 * Bevisst IKKE en generell `{...existing, ...next}`-merge: skjemaet skal kunne
 * FJERNE nøkler det eier (`kr_per_unit` utelates når feltet tømmes,
 * `gamePayload.ts`), og en blind merge ville gjenopplivet dem. Kun nøklene i
 * `PRESERVED_MODE_CONFIG_KEYS` bæres over, og bare når:
 *
 *  - `existing` faktisk er et objekt (rader kan ha `null`/rusk i JSONB-en), og
 *  - `existing.kind === next.kind` — en draft kan bytte modus, og et
 *    greensome-felt har ingen mening i en best-ball-config, og
 *  - nøkkelen mangler i `next` — skriver skjemaet den selv en dag, vinner den.
 *
 * Ellers returneres `next` uendret.
 */
export function carryPreservedModeConfigKeys(
  existing: unknown,
  next: GameModeConfig,
): GameModeConfig {
  if (existing === null || typeof existing !== 'object') return next;
  if (Array.isArray(existing)) return next;

  const previous = existing as Record<string, unknown>;
  const candidate = next as unknown as Record<string, unknown>;
  if (previous.kind !== candidate.kind) return next;

  let carried: Record<string, unknown> | null = null;
  for (const key of PRESERVED_MODE_CONFIG_KEYS) {
    if (!(key in previous)) continue;
    if (key in candidate) continue;
    carried ??= { ...candidate };
    carried[key] = previous[key];
  }

  return (carried ?? next) as GameModeConfig;
}
