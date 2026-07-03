import 'server-only';
import type { InitialValues } from '@/app/[locale]/admin/games/new/GameForm';
import { buildSetupStepInitialValues } from '@/lib/games/setupStepInitialValues';
import {
  ALL_CATEGORY_IDS,
  type SideCategoryId,
} from '@/lib/scoring/sideTournamentConfig';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';

/**
 * Shared by both edit flows: admin's `/admin/games/[id]/edit` (Sekretariatet)
 * and the creator's `/games/[id]/rediger` (#428, AppShell). The pre-fill logic —
 * narrowing side-tournament categories, restoring per-mode `mode_config`, and
 * locking the mode selector for non-draft games — is intricate enough that
 * duplicating it per flow would invite drift. Pure data-mapping; no DB access.
 */

export type EditGameRow = {
  id: string;
  name: string;
  // #624 — banenavn for re-lokalisering av auto-genererte spillnavn ved visning.
  // Ikke brukt av buildEditInitialValues; kun for sidetittelen i edit-flatene.
  courses: { name: string } | null;
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  // Nullable since migration 0011 — drafts may not have a course or tee
  // assigned yet.
  course_id: string | null;
  tee_box_id: string | null;
  scheduled_tee_off_at: string | null;
  hcp_allowance_pct: number;
  require_peer_approval: boolean;
  score_visibility: 'live' | 'reveal';
  side_tournament_enabled: boolean;
  side_ld_count: number;
  side_ctp_count: number;
  // v1.2.0 — `text[]` på DB-siden. Vi narrow til SideCategoryId[] etter load.
  side_disabled_categories: string[];
  // Epic #41 — modus + JSONB-config. Mode-lock-guarden i edit-actions
  // krever at form-en sender disse uendret tilbake for publiserte spill.
  game_mode: GameMode;
  // mode_config JSONB — leses for Texas-spesifikke felt (team_size,
  // team_handicap_pct) som ikke har dedikerte kolonner.
  mode_config: GameModeConfig;
  // #199 — self-påmeldings-akser. Pre-fylles inn i form-en så edit-flyten
  // ikke nullstiller admin's valg.
  registration_mode: 'invite_only' | 'manual_approval' | 'open';
  registration_type: 'solo' | 'team' | 'both';
  // #369 — venn-skip-gate for manual_approval.
  let_friends_skip_gate: boolean;
  // #1049 — startkontingent + betalingsmåte (egne kolonner, ikke mode_config).
  // Valgfrie: edit-flytene selekterer dem (pre-fyller), men revansje-flyten
  // (buildRevansjeInitialValues) utelater dem bevisst — en rematch skal ikke
  // dra med seg penge-oppsettet automatisk, arrangøren bestemmer på nytt.
  entry_fee_kr?: number;
  payment_link?: string | null;
};

export type EditGamePlayerRow = {
  user_id: string;
  // Nullable siden 0030 — solo-modus (stableford) bruker null på begge.
  team_number: number | null;
  flight_number: number | null;
  tee_gender: 'mens' | 'ladies' | 'juniors';
};

/**
 * `datetime-local` inputs want 'YYYY-MM-DDTHH:mm' in browser-local time, but
 * the DB stores `timestamptz` (UTC instant). We pre-format the value in
 * Europe/Oslo wall-clock so the input shows the same time the admin originally
 * picked — regardless of where the browser thinks it is right now.
 */
export function formatForDateTimeLocalInOslo(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  // en-CA produces YYYY-MM-DD HH:MM (24h); reshape to YYYY-MM-DDTHH:mm so it
  // matches what <input type="datetime-local"> emits and accepts.
  const parts = fmt.formatToParts(d);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  return `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}`;
}

export function buildEditInitialValues(
  game: EditGameRow,
  playerRows: EditGamePlayerRow[],
): InitialValues {
  // Narrow `text[]` fra DB til SideCategoryId[]. CHECK-constraint i migrasjon
  // 0026 garanterer at alle verdier er gyldige; defensiv filter her fanger en
  // hypotetisk drift hvis nye kategorier landerer i koden uten å være lagt til
  // i DB-constraintet.
  const validIds = new Set<string>(ALL_CATEGORY_IDS);
  const loadedDisabledCategories: SideCategoryId[] = (
    game.side_disabled_categories ?? []
  ).filter((id): id is SideCategoryId => validIds.has(id));

  const playerGenders: Record<string, 'M' | 'D' | 'J'> = {};
  for (const p of playerRows) {
    playerGenders[p.user_id] =
      p.tee_gender === 'ladies' ? 'D' : p.tee_gender === 'juniors' ? 'J' : 'M';
  }

  return {
    name: game.name,
    // course_id / tee_box_id may be null on a draft. The form treats undefined
    // as "not chosen yet", so coerce with ??.
    course_id: game.course_id ?? undefined,
    tee_box_id: game.tee_box_id ?? undefined,
    scheduled_tee_off_at: formatForDateTimeLocalInOslo(
      game.scheduled_tee_off_at,
    ),
    hcp_allowance_pct: String(game.hcp_allowance_pct),
    require_peer_approval: game.require_peer_approval,
    score_visibility: game.score_visibility,
    // Edit flows redirect away from active/finished games, so lock_score_visibility
    // is always false here. Threaded through anyway so the form's lock-state UI
    // stays a function of props, not of where the form happens to be rendered.
    lock_score_visibility: false,
    side_tournament_enabled: game.side_tournament_enabled,
    side_ld_count: game.side_ld_count,
    side_ctp_count: game.side_ctp_count,
    // v1.2.0 — pre-populer kategori-velgeren med det som ligger lagret. For
    // spill opprettet før migrasjon 0026 vil dette være et tomt array (DB
    // default), som tilsvarer Full pakke; vi respekterer det heller enn å
    // overstyre til Klassisk, fordi det er en bevisst lagret state.
    side_disabled_categories: loadedDisabledCategories,
    // Same shape as lock_score_visibility — the status guard means active/finished
    // games never reach this branch. Future-proofed for a hypothetical read-only
    // view of locked games.
    lock_side_tournament: false,
    player_genders: playerGenders,
    players: playerRows.map((p) => ({
      user_id: p.user_id,
      team_number: p.team_number,
      flight_number: p.flight_number,
    })),
    // Epic #41 — pre-fyller modus + lås for ikke-draft spill. Backend
    // mode-lock-guard avviser bytte etter publisering, så UI-en speiler
    // dette ved å vise modus-tile-ene som disabled. Lagstørrelse-en
    // utledes av GameForm fra modus; for Texas leser vi den fra mode_config
    // siden den er valgbar (2 eller 4).
    game_mode: game.game_mode,
    lock_game_mode: game.status !== 'draft',
    // Texas-spesifikke felt: leses fra mode_config (JSONB). Andre modi har
    // ingen ekstra konfig å pre-fylle utover game_mode + (avledet) team_size.
    team_size:
      game.mode_config.kind === 'texas_scramble'
        ? game.mode_config.team_size
        : game.mode_config.kind === 'ambrose'
          ? game.mode_config.team_size
          : game.mode_config.kind === 'florida_scramble'
            ? game.mode_config.team_size
            : game.mode_config.kind === 'stableford' ||
                game.mode_config.kind === 'modified_stableford'
              ? game.mode_config.team_size
              : game.mode_config.kind === 'shamble'
                ? game.mode_config.team_size
                : undefined,
    // Setup-step formats (Wolf/Nassau/Skins/Nines/Shamble): pre-fill stored
    // mode_config fields so useGameFormState restores the admin's choices.
    // buildSetupStepInitialValues returns {} for all other mode kinds.
    ...buildSetupStepInitialValues(game.mode_config),
    texas_team_handicap_pct:
      game.mode_config.kind === 'texas_scramble'
        ? String(game.mode_config.team_handicap_pct)
        : undefined,
    ambrose_team_handicap_pct:
      game.mode_config.kind === 'ambrose'
        ? String(game.mode_config.team_handicap_pct)
        : undefined,
    florida_team_handicap_pct:
      game.mode_config.kind === 'florida_scramble'
        ? String(game.mode_config.team_handicap_pct)
        : undefined,
    // Round Robin (#337): allowance lever i mode_config.allowance_pct. Uten
    // pre-fill resetter edit-lagring den silent til WHS-default (85).
    round_robin_allowance_pct:
      game.mode_config.kind === 'round_robin'
        ? game.mode_config.allowance_pct
        : undefined,
    registration_mode: game.registration_mode,
    registration_type: game.registration_type,
    // #369: pre-fyller venn-skip-gate-checkbox i edit-flyten.
    let_friends_skip_gate: game.let_friends_skip_gate,
    // #1049: pre-fyller startkontingent + betalingsmåte. 0/utelatt → undefined
    // så feltet vises tomt (av) i stedet for «0» (og revansje ikke drar det med).
    entry_fee_kr: (game.entry_fee_kr ?? 0) > 0 ? game.entry_fee_kr : undefined,
    payment_link: game.payment_link ?? undefined,
  };
}
