import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { canSeeTeamLineup, teamRoster, type CupTeamNumber } from './captainRoles';
import { loadCupLineupAccess, type CupLineupAccess } from './lineupAccess';
import type { CupSessionFormat } from './cupTemplates';
import type { LineupSlotRow } from './lineupValidation';

/**
 * Lesingen av kaptein-uttaket (#1884) — og dermed hemmeligholdet selv.
 *
 * ⚠️ Dette er håndhevelsen. `cup_lineup_sessions` og `cup_lineup_slots` er
 * deny-by-default (0172: RLS på, ingen policyer), så alt leses med
 * service-role og det finnes INGEN policy bak som fanger en flate som glemmer
 * å filtrere. Motstanderens plasser fjernes her, i `visibleSlots` — ikke i en
 * sidegate, for personlige cup-sider er world-read (`canViewCupPage` →
 * `!groupId` = alltid) og en sidegate ville ikke skjult noe som helst.
 *
 * Regelen selv (hvem ser hva) bor i `canSeeTeamLineup` (captainRoles.ts) og er
 * Type A-testet der. Denne modulen kobler den til databasen.
 */

export type CupLineupPlayer = {
  userId: string;
  displayName: string;
  hcpIndex: number;
};

export type CupLineupTeamView = {
  teamNumber: CupTeamNumber;
  submittedAt: string | null;
  /**
   * `null` betyr «ikke synlig for deg» — ikke «tomt». Flatene skal vise
   * «venter på motstanderen», aldri et tomt uttak som om laget ikke hadde
   * levert.
   */
  slots: LineupSlotRow[] | null;
};

export type CupLineupSessionView = {
  id: string;
  sessionIndex: number;
  format: CupSessionFormat;
  slotCount: number;
  revealedAt: string | null;
  teams: [CupLineupTeamView, CupLineupTeamView];
};

export type CupLineupBoard = {
  access: CupLineupAccess;
  cupName: string;
  cupStatus: string;
  teamNames: Record<CupTeamNumber, string>;
  sessions: CupLineupSessionView[];
  squads: {
    1: CupLineupPlayer[];
    2: CupLineupPlayer[];
    unassigned: CupLineupPlayer[];
  };
};

type UserRel = {
  id: string;
  name: string | null;
  nickname: string | null;
  hcp_index: number | string;
};

function displayNameOf(u: UserRel | undefined, unknownLabel: string): string {
  return u?.nickname?.trim() || u?.name?.trim() || unknownLabel;
}

/**
 * Hele uttaks-tavla for én cup, filtrert til det kalleren har lov til å se.
 *
 * Returnerer `null` når cupen ikke finnes. En bruker uten rolle får tavla med
 * alle uttak skjult (`slots: null`) — flatene bruker `access.role` til å avgjøre
 * om de skal vise noe i det hele tatt.
 */
export async function loadCupLineupBoard(
  tournamentId: string,
  unknownLabel: string,
): Promise<CupLineupBoard | null> {
  const access = await loadCupLineupAccess(tournamentId);
  const admin = getAdminClient();

  const { data: cup } = await admin
    .from('tournaments')
    .select('name, status, team_1_name, team_2_name')
    .eq('id', tournamentId)
    .maybeSingle();
  if (!cup) return null;

  const { data: sessionRows } = await admin
    .from('cup_lineup_sessions')
    .select(
      'id, session_index, format, slot_count, revealed_at, team_1_submitted_at, team_2_submitted_at',
    )
    .eq('tournament_id', tournamentId)
    .order('session_index', { ascending: true });

  const sessionIds = (sessionRows ?? []).map((r) => r.id as string);
  const { data: slotRows } = sessionIds.length
    ? await admin
        .from('cup_lineup_slots')
        .select('session_id, team_number, slot_index, seat, user_id')
        .in('session_id', sessionIds)
    : { data: [] as never[] };

  // Navnene til alle som er nevnt: deltakerlista + alt som står i en plass.
  // Admin-client fordi en kaptein ikke ser fremmede `users`-rader under RLS —
  // samme grep som deltakerlista i Spillere-rommet.
  const namedIds = Array.from(
    new Set([
      ...access.participants.map((p) => p.userId),
      ...(slotRows ?? []).map((r) => r.user_id as string),
    ]),
  );
  const { data: userRows } = namedIds.length
    ? await admin
        .from('users')
        .select('id, name, nickname, hcp_index')
        .in('id', namedIds)
    : { data: [] as never[] };
  const userById = new Map<string, UserRel>(
    ((userRows ?? []) as UserRel[]).map((u) => [u.id, u]),
  );

  const toPlayer = (userId: string): CupLineupPlayer => {
    const u = userById.get(userId);
    return {
      userId,
      displayName: displayNameOf(u, unknownLabel),
      hcpIndex: Number(u?.hcp_index ?? 0),
    };
  };

  const sessions: CupLineupSessionView[] = (sessionRows ?? []).map((row) => {
    const sessionId = row.id as string;
    const revealedAt = (row.revealed_at as string | null) ?? null;
    const submittedAt: Record<CupTeamNumber, string | null> = {
      1: (row.team_1_submitted_at as string | null) ?? null,
      2: (row.team_2_submitted_at as string | null) ?? null,
    };

    const teamView = (team: CupTeamNumber): CupLineupTeamView => ({
      teamNumber: team,
      // Leveringsstatusen er ALDRI hemmelig: motstanderen skal se at laget har
      // levert (det er halve spenningen), bare ikke hva som står i uttaket.
      submittedAt: submittedAt[team],
      slots: canSeeTeamLineup({
        role: access.role,
        team,
        revealed: revealedAt !== null,
      })
        ? (slotRows ?? [])
            .filter(
              (s) => s.session_id === sessionId && s.team_number === team,
            )
            .map((s) => ({
              slotIndex: s.slot_index as number,
              seat: s.seat as 1 | 2,
              userId: s.user_id as string,
            }))
            .sort(
              (a, b) => a.slotIndex - b.slotIndex || a.seat - b.seat,
            )
        : null,
    });

    return {
      id: sessionId,
      sessionIndex: row.session_index as number,
      format: row.format as CupSessionFormat,
      slotCount: row.slot_count as number,
      revealedAt,
      teams: [teamView(1), teamView(2)],
    };
  });

  return {
    access,
    cupName: cup.name as string,
    cupStatus: cup.status as string,
    teamNames: {
      1: (cup.team_1_name as string | null) ?? 'Lag 1',
      2: (cup.team_2_name as string | null) ?? 'Lag 2',
    },
    sessions,
    squads: {
      1: teamRoster(access.participants, 1).map((p) => toPlayer(p.userId)),
      2: teamRoster(access.participants, 2).map((p) => toPlayer(p.userId)),
      unassigned: access.participants
        .filter((p) => p.teamNumber === null)
        .map((p) => toPlayer(p.userId)),
    },
  };
}

/**
 * Kapteinens egen stall som rene bruker-id-er — det `validateLineupSubmission`
 * sjekker uttaket mot. Egen helper så skrivestien slipper å dra hele tavla
 * (og alle navneoppslagene) inn for å validere ett skjema.
 */
export function squadUserIds(
  access: CupLineupAccess,
  team: CupTeamNumber,
): string[] {
  return teamRoster(access.participants, team).map((p) => p.userId);
}

/**
 * Hvor mange kamper cupens ÅPNEDE, ikke-avdekkede uttaks-økter kommer til å
 * lage (#1884).
 *
 * Match-taket for en personlig cup må telle disse i tillegg til `games`: en
 * åpnet økt er en forpliktelse om å opprette akkurat så mange kamper når begge
 * kapteiner har levert, og avdekkingen sjekker ikke taket selv (da ville to
 * leverte uttak kunne ende uten kamper). Både `openCupLineupSession` og
 * generer-veiviserens `createCupMatchesFromPlan` bruker den, så regelen har
 * ett hjem — uten det kunne veiviseren og uttaket hver for seg holde seg under
 * taket og til sammen sprenge det.
 *
 * Returnerer `null` når tellingen ikke kunne gjøres. Kallerne skal da feile
 * LUKKET: et tak vi ikke kan regne ut, er et tak vi ikke håndhever (I3).
 */
export async function countPendingLineupSlots(
  tournamentId: string,
): Promise<number | null> {
  const { data, error } = await getAdminClient()
    .from('cup_lineup_sessions')
    .select('slot_count')
    .eq('tournament_id', tournamentId)
    .is('revealed_at', null);
  if (error) {
    console.error('[cup] countPendingLineupSlots failed', {
      tournamentId,
      error,
    });
    return null;
  }
  return (data ?? []).reduce((sum, r) => sum + (r.slot_count as number), 0);
}
