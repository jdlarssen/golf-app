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
  /**
   * `game_players.withdrawn_at` (#1814). Valgfri: `formatSideLabel` bryr seg
   * ikke om den, og eldre call-sites/tester som bare navngir en side slipper å
   * fylle den ut. `buildCupRoster` leser den — sammen med kampens status — for
   * «Trukket»-merket.
   */
  withdrawn_at?: string | null;
};

export type CupRosterPlayer = {
  userId: string;
  name: string | null;
  nickname: string | null;
  /**
   * #1814: spilleren har trukket seg fra cupen — minst én av kampene hens som
   * ENNÅ IKKE HAR STARTET er flagget. Hen blir stående på laget (E5), merket
   * «Trukket»; spilte kamper og poeng beholdes. Merket endrer aldri plassering.
   *
   * Startede og ferdigspilte kamper teller ikke: et mykt trekk midtveis i en
   * pågående best ball (#386) er ikke det samme som å trekke seg fra cupen, og
   * arrangørsiden (`CupWithdrawConfirm`) avgjør angre-mot-trekk fra nettopp de
   * ikke-startede radene. Sto merket for begge deler, lovet lenka «Angre
   * trekk» og siden svarte «Trekk fra cupen?».
   *
   * Valgfri for pre-#1814 call-sites/tester som bygger et roster for hånd;
   * `buildCupRoster` setter den alltid. Fravær leses som «ikke trukket».
   */
  withdrawn?: boolean;
};

export type CupRoster = {
  team1: CupRosterPlayer[];
  team2: CupRosterPlayer[];
};

/**
 * Én kamp i cupen: spillerradene dens, og statusen kampen står i. Statusen er
 * med fordi «Trukket» bare gjelder kamper som ennå ikke har startet — se
 * `CupRosterPlayer.withdrawn`.
 */
export type CupRosterGame = {
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  players: readonly CupNamedPlayerRow[];
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
    withdrawn: false,
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
  gamesInOrder: ReadonlyArray<CupRosterGame>,
): CupRoster {
  const team1Map = new Map<string, CupRosterPlayer>();
  const team2Map = new Map<string, CupRosterPlayer>();

  for (const g of gamesInOrder) {
    // Samme grense som `PENDING_STATUSES` i `withdrawalActions` og
    // `cupWithdrawalContext` trekker: en kamp som er i gang eller ferdigspilt
    // er ikke lenger noe å trekke seg fra.
    const notStarted = g.status === 'draft' || g.status === 'scheduled';
    for (const p of g.players) {
      if (p.team_number === 1 && !team1Map.has(p.user_id)) {
        team1Map.set(p.user_id, toRosterPlayer(p));
      }
      if (p.team_number === 2 && !team2Map.has(p.user_id)) {
        team2Map.set(p.user_id, toRosterPlayer(p));
      }
      // #1814: «Trukket» settes av enhver trukket rad i en kamp som ennå ikke
      // har startet — ikke bare det første treffet over; den første kampen i
      // rekkefølgen kan godt være en hen alt har spilt.
      if (notStarted && p.withdrawn_at != null) {
        const row =
          p.team_number === 1
            ? team1Map.get(p.user_id)
            : p.team_number === 2
              ? team2Map.get(p.user_id)
              : undefined;
        if (row) row.withdrawn = true;
      }
    }
  }

  return {
    team1: Array.from(team1Map.values()),
    team2: Array.from(team2Map.values()),
  };
}
