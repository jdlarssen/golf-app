import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { userOf, type CupUserRel } from './cupRoster';
import {
  readWithdrawalPlayOn,
  resolveCupMatchWithdrawal,
  type CupMatchWithdrawal,
} from './cupWithdrawalOutcome';

/**
 * Leser alt bekreftelsessidene for «trekk fra cupen» trenger (#1814): hvilke
 * kamper et trekk faktisk rører, og hva konsekvensen blir for hver av dem —
 * regnet NÅ, med den samme regelmodulen skrivingen senere utleder poengene av.
 * Preview og handling kan derfor aldri si to forskjellige ting.
 *
 * Service-role (#1542): cup-flatene leser med admin-klient, og gaten i ruta ER
 * håndhevelsen. Denne modulen autoriserer INGENTING — kallstedet må ha kjørt
 * `requireAdminOrClubAdminOfCup` (arrangør) eller deltaker-sjekken (spilleren
 * selv) før den kalles.
 */

/** Fourball er den eneste modusen der makkeren kan spille videre alene (E4). */
const PLAY_ON_CAPABLE_MODE = 'fourball_matchplay';

export type CupWithdrawalMatchView = {
  gameId: string;
  matchLabel: string | null;
  gameMode: string;
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  scheduledTeeOffAt: string | null;
  /** Kampen kan få «makkeren spiller alene»-valget (fourball, makker igjen). */
  canPlayOn: boolean;
  /** Arrangørens registrerte valg (`mode_config.withdrawal_play_on`). */
  playOn: boolean;
  /** Makkerens visningsnavn på spillerens egen side — kun når `canPlayOn`. */
  partnerName: string | null;
  /** Motstandersidens visningsnavn, til «walkover til …»-teksten. */
  opponentLabel: string;
  /** Spillerens lag i denne kampen (1/2), til lagnavn i copyen. */
  side: 1 | 2;
  /** Spilleren er allerede trukket fra denne kampen. */
  alreadyWithdrawn: boolean;
  /**
   * Utfallet HVIS spilleren trekker seg nå (eller, når hen alt er trukket,
   * slik det står). `null` = kampen spilles som normalt likevel — det skjer
   * bare i en fourball der makkeren spiller videre alene.
   */
  outcome: CupMatchWithdrawal | null;
};

export type CupWithdrawalContext = {
  tournament: {
    id: string;
    name: string;
    status: 'draft' | 'active' | 'finished';
    group_id: string | null;
    team_1_name: string;
    team_2_name: string;
  };
  player: { userId: string; name: string };
  /** `draft`/`scheduled` — kampene et trekk skriver. */
  pending: CupWithdrawalMatchView[];
  /** `active`/`finished` — røres aldri (E3), listes som «røres ikke». */
  untouched: CupWithdrawalMatchView[];
};

type GameRow = {
  id: string;
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  game_mode: string;
  mode_config: unknown;
  tournament_match_label: string | null;
  scheduled_tee_off_at: string | null;
  created_at: string;
};

type PlayerRow = {
  game_id: string;
  user_id: string;
  team_number: number | null;
  withdrawn_at: string | null;
  users: CupUserRel | CupUserRel[] | null;
};

function displayName(row: PlayerRow | undefined, unknownLabel: string): string {
  const u = userOf(row?.users);
  return u?.nickname?.trim() || u?.name?.trim() || unknownLabel;
}

function sideLabel(rows: PlayerRow[], unknownLabel: string): string {
  if (rows.length === 0) return unknownLabel;
  return rows.map((r) => displayName(r, unknownLabel)).join('/');
}

export async function loadCupWithdrawalContext(args: {
  tournamentId: string;
  userId: string;
  unknownLabel: string;
  /** Tidspunktet trekket regnes fra. Injiserbart så testene slipper klokka. */
  now?: Date;
}): Promise<CupWithdrawalContext | null> {
  const { tournamentId, userId, unknownLabel } = args;
  const nowIso = (args.now ?? new Date()).toISOString();
  const admin = getAdminClient();

  const { data: tournament, error: tErr } = await admin
    .from('tournaments')
    .select('id, name, status, group_id, team_1_name, team_2_name')
    .eq('id', tournamentId)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!tournament) return null;

  const { data: gameRows, error: gErr } = await admin
    .from('games')
    .select(
      'id, status, game_mode, mode_config, tournament_match_label, scheduled_tee_off_at, created_at',
    )
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true });
  if (gErr) throw gErr;
  const games = (gameRows ?? []) as GameRow[];
  if (games.length === 0) {
    return {
      tournament: tournament as CupWithdrawalContext['tournament'],
      player: { userId, name: unknownLabel },
      pending: [],
      untouched: [],
    };
  }

  const { data: playerRows, error: pErr } = await admin
    .from('game_players')
    .select(
      'game_id, user_id, team_number, withdrawn_at, users!game_players_user_id_fkey(name, nickname)',
    )
    .in(
      'game_id',
      games.map((g) => g.id),
    );
  if (pErr) throw pErr;
  const players = (playerRows ?? []) as unknown as PlayerRow[];

  const byGame = new Map<string, PlayerRow[]>();
  for (const row of players) {
    const arr = byGame.get(row.game_id) ?? [];
    arr.push(row);
    byGame.set(row.game_id, arr);
  }

  const pending: CupWithdrawalMatchView[] = [];
  const untouched: CupWithdrawalMatchView[] = [];
  let playerName = unknownLabel;

  for (const game of games) {
    const rows = byGame.get(game.id) ?? [];
    const me = rows.find((r) => r.user_id === userId);
    if (!me || (me.team_number !== 1 && me.team_number !== 2)) continue;
    const side = me.team_number as 1 | 2;
    if (playerName === unknownLabel) playerName = displayName(me, unknownLabel);

    const sameSide = rows.filter((r) => r.team_number === side && r.user_id !== userId);
    const opponents = rows.filter((r) => r.team_number === (side === 1 ? 2 : 1));
    const activePartners = sameSide.filter((r) => r.withdrawn_at == null);
    const canPlayOn =
      game.game_mode === PLAY_ON_CAPABLE_MODE && activePartners.length > 0;
    const playOn = readWithdrawalPlayOn(game.mode_config);

    // Regn utfallet med spilleren markert trukket. Er hen alt trukket, står
    // tidspunktet som det er — da viser siden hva som ALLEREDE gjelder.
    const outcome = resolveCupMatchWithdrawal({
      status: game.status,
      gameMode: game.game_mode,
      scheduledTeeOffAt: game.scheduled_tee_off_at,
      playOn,
      players: rows
        .filter((r) => r.team_number === 1 || r.team_number === 2)
        .map((r) => ({
          userId: r.user_id,
          side: r.team_number as 1 | 2,
          withdrawnAt: r.user_id === userId ? (r.withdrawn_at ?? nowIso) : r.withdrawn_at,
        })),
    });

    const view: CupWithdrawalMatchView = {
      gameId: game.id,
      matchLabel: game.tournament_match_label,
      gameMode: game.game_mode,
      status: game.status,
      scheduledTeeOffAt: game.scheduled_tee_off_at,
      canPlayOn,
      playOn,
      partnerName: canPlayOn ? sideLabel(activePartners, unknownLabel) : null,
      opponentLabel: sideLabel(opponents, unknownLabel),
      side,
      alreadyWithdrawn: me.withdrawn_at != null,
      outcome,
    };

    // E3: startede og ferdige kamper røres aldri av et trekk.
    if (game.status === 'active' || game.status === 'finished') untouched.push(view);
    else pending.push(view);
  }

  return {
    tournament: tournament as CupWithdrawalContext['tournament'],
    player: { userId, name: playerName },
    pending,
    untouched,
  };
}
