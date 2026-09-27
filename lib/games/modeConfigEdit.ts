import type { GameModeConfig } from '@/lib/scoring/modes/types';

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
 * `ranking` (#2253) is stamped when a game is created
 * (`stampNewGameModeConfig`) and has no form field. Carrying it keeps a
 * net-to-par game on its rule through an edit; an older game has no key to
 * carry, so an edit never moves it to the new rule.
 */
export const PRESERVED_MODE_CONFIG_KEYS = [
  'team_strokes_override',
  'team_strokes_override_auto',
  'withdrawal_play_on',
  'ranking',
] as const;

/**
 * #2253: stamps the rules a NEW game is created with onto its `mode_config`.
 * Today that is one: a solo strokeplay game ranks on net to par
 * (`ranking: 'net_to_par'`, read by `ranksByNetToPar` in the scoring engine).
 * Every other config is returned unchanged.
 *
 * Called at every insert site that can create a solo strokeplay game — the
 * list, and why the others are exempt, lives in `gamesInsertSites.test.ts`.
 * Only at creation: an edit carries the key via `PRESERVED_MODE_CONFIG_KEYS`
 * and never adds it, so a game played under the old rule keeps it.
 */
export function stampNewGameModeConfig(config: GameModeConfig): GameModeConfig {
  if (config.kind !== 'solo_strokeplay') return config;
  return { ...config, ranking: 'net_to_par' };
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
