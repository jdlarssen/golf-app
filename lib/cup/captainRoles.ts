/**
 * Kapteinsrollen på en cup (#1884, etappe 2) — ren logikk, ingen I/O.
 *
 * Lag ble fram til nå utelukkende DERIVERT fra matchene (`getCupSnapshot`).
 * Det holder ikke for kaptein-uttaket: kapteinen må vite hvem som står i
 * stallen hennes FØR første match finnes. `tournament_participants` bærer
 * derfor en varig lagtilhørighet (1/2/utildelt) og et kapteinsflagg
 * (migrasjon 0172), og denne modulen eier reglene rundt dem:
 *
 *  - hvem som kan settes på hvilket lag, og hvem som kan være kaptein
 *  - hvilken rolle en innlogget bruker har i uttaks-flyten
 *  - hvem som får LESE et lags uttak — hemmelighold-regelen selv
 *
 * Hemmeligholdet bor her fordi personlige cup-sider er world-read
 * (`canViewCupPage` → `!groupId` = alltid). En sidegate ville ikke skjult
 * noe; det er lesingen som må gates, og `canSeeTeamLineup` er regelen den
 * lesingen (lib/cup/lineupData) kaller.
 */

/** Lagnummer slik cupen bruker det overalt ellers (game_players.team_number). */
export type CupTeamNumber = 1 | 2;

/** Én rad fra `tournament_participants`, redusert til rolle-feltene. */
export type CupParticipantRole = {
  userId: string;
  /** Varig lagtilhørighet. `null` = utildelt (start-tilstanden for alle). */
  teamNumber: CupTeamNumber | null;
  isCaptain: boolean;
};

export type CupRoleChangeError =
  /** Bruker-id-en står ikke på cupens deltakerliste. */
  | 'not_participant'
  /** Kaptein uten lag — DB-en har samme CHECK (0172). */
  | 'captain_needs_team'
  /** Laget har allerede en annen kaptein. */
  | 'team_taken'
  /** Lagnummeret er hverken 1, 2 eller null. */
  | 'invalid_team';

export type CupRoleChangePlan =
  | { ok: true; row: CupParticipantRole }
  | { ok: false; error: CupRoleChangeError };

function isTeamNumber(value: unknown): value is CupTeamNumber {
  return value === 1 || value === 2;
}

/**
 * Validerer arrangørens ene endring på deltakerlista og returnerer raden som
 * skal skrives.
 *
 * Reglene speiler migrasjon 0172 én-til-én (AGENTS.md-felle 4 — samme regel,
 * begge lag): kaptein krever lag (CHECK), og maks én kaptein per lag (partiell
 * unik indeks). Valideringen her finnes for å gi arrangøren en norsk feilkode
 * i stedet for en rå constraint-violation; DB-en er backstop mot en manipulert
 * payload.
 *
 * Å tømme laget tømmer kapteinsflagget i samme operasjon — ellers ville
 * `captain_needs_team` blitt en blindgate der arrangøren måtte avsette
 * kapteinen først for å kunne flytte hen ut av laget.
 */
export function planCupRoleChange(input: {
  participants: CupParticipantRole[];
  userId: string;
  teamNumber: CupTeamNumber | null;
  isCaptain: boolean;
}): CupRoleChangePlan {
  const { participants, userId, teamNumber, isCaptain } = input;

  if (teamNumber !== null && !isTeamNumber(teamNumber)) {
    return { ok: false, error: 'invalid_team' };
  }
  if (!participants.some((p) => p.userId === userId)) {
    return { ok: false, error: 'not_participant' };
  }
  if (isCaptain && teamNumber === null) {
    return { ok: false, error: 'captain_needs_team' };
  }
  if (isCaptain) {
    const sitting = participants.find(
      (p) => p.isCaptain && p.teamNumber === teamNumber,
    );
    if (sitting && sitting.userId !== userId) {
      return { ok: false, error: 'team_taken' };
    }
  }

  return {
    ok: true,
    row: { userId, teamNumber, isCaptain: teamNumber === null ? false : isCaptain },
  };
}

/** Hva den innloggede brukeren er i uttaks-flyten. */
export type CupLineupRole =
  /** Arrangør (eller klubb-/global admin) — ser alt, kan alt. */
  | { kind: 'organizer' }
  /** Kaptein for ett lag — ser og skriver kun sitt eget uttak. */
  | { kind: 'captain'; teamNumber: CupTeamNumber }
  /** Alle andre: deltakere, tilskuere, utloggede. */
  | { kind: 'none' };

/**
 * Rollen til `userId` i denne cupens uttaks-flyt.
 *
 * Arrangør vinner over kaptein: en arrangør som også kapteiner et lag skal ikke
 * miste nødluka (se begge kladder, lever på vegne av) for sitt eget lag.
 *
 * En kaptein-rad uten lag kan ikke oppstå gjennom `planCupRoleChange` eller
 * DB-ens CHECK, men leses defensivt som `none` — en rolle uten lag har ikke noe
 * uttak å eie.
 */
export function resolveCupLineupRole(input: {
  isOrganizer: boolean;
  participants: CupParticipantRole[];
  userId: string | null;
}): CupLineupRole {
  if (input.isOrganizer) return { kind: 'organizer' };
  if (!input.userId) return { kind: 'none' };
  const row = input.participants.find((p) => p.userId === input.userId);
  if (!row || !row.isCaptain || !isTeamNumber(row.teamNumber)) {
    return { kind: 'none' };
  }
  return { kind: 'captain', teamNumber: row.teamNumber };
}

/**
 * Hemmelighold-regelen: får `role` lese lag `team`s uttak for denne økta?
 *
 * Før avdekking ser arrangøren begge lag (nødluka) og kapteinen kun sitt eget.
 * Ingen andre ser noe — heller ikke lagets egne spillere, som ellers ville vært
 * en lekkasjevei rett til motstanderen.
 *
 * Etter avdekking er alt åpent: matchene er da opprettet, og de er synlige på
 * cup-siden uansett. Å holde slot-lista skjult etterpå ville bare vært et
 * skinn-hemmelighold rundt data som allerede står i `games`.
 */
export function canSeeTeamLineup(input: {
  role: CupLineupRole;
  team: CupTeamNumber;
  revealed: boolean;
}): boolean {
  if (input.revealed) return true;
  if (input.role.kind === 'organizer') return true;
  if (input.role.kind === 'captain') return input.role.teamNumber === input.team;
  return false;
}

/** Deltakerne med varig tilhørighet til `team`, i lista si rekkefølge. */
export function teamRoster(
  participants: CupParticipantRole[],
  team: CupTeamNumber,
): CupParticipantRole[] {
  return participants.filter((p) => p.teamNumber === team);
}

/**
 * Har raden en varig rolle arrangøren eier?
 *
 * Deltaker-synken (`planParticipantRosterSync`) fjerner den som ikke lenger
 * står i noen match. I en kaptein-cup ville den regelen kastet ut både benkede
 * spillere og en ikke-spillende kaptein — begge er på lista med vilje. En rad
 * med lag eller kapteinsflagg er derfor unntatt: den er satt av arrangøren, og
 * bare arrangøren tar den bort.
 */
export function hasPersistentCupRole(
  row: Pick<CupParticipantRole, 'teamNumber' | 'isCaptain'> | undefined | null,
): boolean {
  if (!row) return false;
  return row.teamNumber !== null || row.isCaptain;
}
