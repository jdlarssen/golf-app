/**
 * Roster- og navne-bygging for en cup-snapshot (#1522, utdrag fra
 * `getCupSnapshot`). Rene funksjoner over `game_players`-rader — zero IO,
 * derfor Type-A-testbar uten admin-client-mocks.
 *
 * To ansvar, samme datakilde (spillerradene med `users`-joinen):
 *  - `buildCupRoster` — de distinkte spillerne per lag, på tvers av alle
 *    kampene i cupen.
 *  - `formatSideLabel` — visnings-navnet for ÉN side i én kamp.
 *
 * Rekkefølgen er en del av kontrakten: rosteret bygges kamp for kamp i den
 * rekkefølgen kampene kommer (created_at asc fra `getCupSnapshot`), og innen
 * hver kamp i radrekkefølgen fra Supabase. Første treff per bruker vinner —
 * en spiller som er med i flere kamper står én gang, på laget fra sin første
 * kamp. UI-en lister rosteret i denne rekkefølgen.
 */

/** `users`-joinen. Supabase JS typer FK-joins som array selv på many-to-one. */
export type CupUserRel = { name: string | null; nickname: string | null };

/** Minste spillerrad-form roster/navne-byggingen trenger. */
export type CupNamedPlayerRow = {
  user_id: string;
  team_number: number | null;
  users: CupUserRel | CupUserRel[] | null;
};

export type CupRosterPlayer = {
  userId: string;
  name: string | null;
  nickname: string | null;
};

export type CupRoster = {
  team1: CupRosterPlayer[];
  team2: CupRosterPlayer[];
};

/** Normaliserer Supabase-joinens array-eller-objekt-form til ett objekt. */
export function userOf(rel: CupUserRel | CupUserRel[] | null | undefined): CupUserRel | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}

function preferredName(
  p: { name: string | null; nickname: string | null } | null,
  unknownLabel: string,
): string {
  if (!p) return unknownLabel;
  return p.nickname?.trim() || p.name?.trim() || unknownLabel;
}

/**
 * Bygger en visnings-label for en sides spillere. Singles (1 spiller) → ett
 * navn. Fourball (2 spillere) → «Navn1/Navn2», sortert deterministisk via
 * eksisterende `user_id`-rekkefølge fra Supabase-queriet. Tom side →
 * `unknownLabel` som defensiv fallback. #217.
 */
export function formatSideLabel(
  sidePlayers: readonly CupNamedPlayerRow[],
  unknownLabel: string,
): string {
  if (sidePlayers.length === 0) return unknownLabel;
  if (sidePlayers.length === 1) return preferredName(userOf(sidePlayers[0].users), unknownLabel);
  return sidePlayers.map((p) => preferredName(userOf(p.users), unknownLabel)).join('/');
}

function toRosterPlayer(p: CupNamedPlayerRow): CupRosterPlayer {
  const u = userOf(p.users);
  return {
    userId: p.user_id,
    name: u?.name ?? null,
    nickname: u?.nickname ?? null,
  };
}

/**
 * Distinkte spillere gruppert på `team_number`, på tvers av alle kampene i
 * cupen. Tar spillerradene ÉN gruppe per kamp, i kamp-rekkefølge — grupperingen
 * (og dermed rekkefølgen) eies av kalleren.
 *
 * Spillere uten `team_number` (verken 1 eller 2) havner i ingen av lagene.
 */
export function buildCupRoster(
  playersByGameInOrder: ReadonlyArray<readonly CupNamedPlayerRow[]>,
): CupRoster {
  const team1Map = new Map<string, CupRosterPlayer>();
  const team2Map = new Map<string, CupRosterPlayer>();

  for (const gPlayers of playersByGameInOrder) {
    for (const p of gPlayers) {
      if (p.team_number === 1 && !team1Map.has(p.user_id)) {
        team1Map.set(p.user_id, toRosterPlayer(p));
      }
      if (p.team_number === 2 && !team2Map.has(p.user_id)) {
        team2Map.set(p.user_id, toRosterPlayer(p));
      }
    }
  }

  return {
    team1: Array.from(team1Map.values()),
    team2: Array.from(team2Map.values()),
  };
}
