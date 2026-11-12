import type { RegistrationMode } from './registration';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import type { HoleSegment } from '@/lib/scoring';
import type { StartType } from './startType';

/**
 * The shapes of the discovery lists (#257, #442, #369, #2258). Kept apart from
 * `getDiscoverableGames.ts`, which reads with the service role and imports
 * `server-only`: the terminliste's pure rules (`terminliste.ts`) and the
 * native app's view of it (`appTerminView.ts`) import these types, and a type
 * import still pulls its file into the app's `tsc` (#2838).
 */

/**
 * Format metadata the terminliste row shows (#2258): «Bane · Format · lag på
 * N», «9 hull», and the seat cap. Game metadata, so the field whitelist
 * (#1022) holds. The selects narrow these Json/text columns with
 * `overrideTypes`, which leaves every other field typed from the select.
 */
export type DiscoverableFormat = {
  game_mode: GameMode;
  mode_config: GameModeConfig;
  hole_segment: HoleSegment;
  /** #2258 PR 2: «første start» / «shotgun» under the clock. */
  start_type: StartType;
};

export type DiscoverableOpenGame = DiscoverableFormat & {
  id: string;
  name: string;
  short_id: string;
  scheduled_tee_off_at: string | null;
  course_name: string | null;
  /**
   * Påmeldingsmåten ER synligheten (flyt 2): `open` → «Meld meg på»,
   * `manual_approval` → «Be om å bli med». `invite_only` er privat og
   * ekskluderes av query-filteret, så det dukker aldri opp her.
   */
  registration_mode: 'open' | 'manual_approval';
};

/**
 * Et klubb-scopet spill (#442). I motsetning til de globale open-spillene er
 * disse synlige for klubbens medlemmer UANSETT `registration_mode` — også
 * `invite_only` (medlemskap ER invitasjonen). `group_name` brukes til badge.
 */
export type DiscoverableClubGame = DiscoverableFormat & {
  id: string;
  name: string;
  short_id: string;
  scheduled_tee_off_at: string | null;
  course_name: string | null;
  registration_mode: RegistrationMode;
  group_name: string;
};

/**
 * Et spill skapt av en venn (#369). Vises i «Fra vennene dine»-seksjonen.
 * `joinMode` avgjør CTA-knappen: 'direct' = «Meld meg på», 'request' =
 * «Be om å bli med». Regler: open → alltid direct; manual_approval +
 * let_friends_skip_gate=true → direct; manual_approval ellers → request.
 */
export type DiscoverableFriendGame = DiscoverableFormat & {
  id: string;
  name: string;
  short_id: string;
  scheduled_tee_off_at: string | null;
  course_name: string | null;
  registration_mode: 'open' | 'manual_approval';
  /**
   * 'direct': vennen kan melde seg på uten godkjenning.
   * 'request': vennen må be om plass.
   */
  joinMode: 'direct' | 'request';
};

export type PendingRequest = {
  id: string;
  game_id: string;
  short_id: string;
  game_name: string;
  team_name: string | null;
  is_team_captain: boolean;
  created_at: string;
};
