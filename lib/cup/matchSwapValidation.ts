/**
 * Guard logic for «bytt spiller i en generert cup-match» (#1473).
 *
 * Pure — no I/O. `swapCupMatchPlayer` (lib/cup/actions.ts) does every read,
 * hands the rows in here, and only writes when this returns `ok`. Keeping the
 * decision in one testable place is the reason the action itself stays a thin
 * read → validate → write shell (and why the guard table is a Type A suite
 * rather than six DB-mock cases).
 *
 * A «bunt» (bundle) is a host match plus every match derived from it
 * (`games.source_game_id = host.id`, splittet cup-dag, #1441 D3). The organiser
 * taps ONE card, but the swap has to catch the out-player everywhere in the
 * bunt — otherwise a frafall on a split day would leave the withdrawn player
 * standing in the back-nine singles.
 */

/** Én match i bunten, med spillersettet sitt. */
export type SwapBundleGame = {
  gameId: string;
  /** `games.status` — hele bunten må være `scheduled` for at bytte er lov. */
  status: string;
  /** `game_players.user_id` for denne matchen (begge lag). */
  playerIds: string[];
};

export type SwapValidationInput = {
  /**
   * Host først, deretter de avledede. Rekkefølgen bæres videre til
   * `gameIds` under, slik at kalleren kan varsle om host-matchen når
   * spilleren står i den.
   */
  bundle: SwapBundleGame[];
  outUserId: string;
  inUserId: string;
  /**
   * Kandidatene for cupen — `getCupCandidatePlayers`-ID-ene, altså venner /
   * klubbmedlemmer / alle profil-fullførte for global admin. Reserven hentes
   * herfra, ikke fra deltakerlista: den som melder forfall kvelden før
   * erstattes typisk av en kompis som aldri rakk å melde seg på.
   *
   * Pending kandidater (venn uten fullført profil) står MED i lista — de
   * avvises av `inProfileCompleted` under, som gir arrangøren en presis
   * beskjed i stedet for et generisk «ikke kandidat».
   */
  candidateIds: string[];
  /**
   * `users.profile_completed_at !== null` for inn-spilleren. Egen sjekk mot
   * users-raden, ikke arvet fra kandidatlista: kandidatlista er bredere enn
   * deltakerlista, og en spiller som aldri har fullført profilen har hverken
   * handicap eller kjønn — hun ville stått i matchen uten spillehandicap.
   */
  inProfileCompleted: boolean;
  /**
   * `group_members.user_id` for klubben — kun klubb-cup. `null` = personlig
   * cup (ingen medlemskaps-sjekk). Egen sjekk ved siden av kandidatlista, av
   * samme grunn genererings-guarden har den (admin/cup/[id]/generer/
   * actions.ts): en klubb-cup skal kun inneholde klubbmedlemmer, og det er
   * `group_members` som er fasit for det.
   */
  clubMemberIds: string[] | null;
};

export type SwapValidationError =
  | 'not_found'
  | 'already_started'
  | 'player_not_in_match'
  | 'already_in_match'
  | 'not_candidate'
  | 'not_member'
  | 'profile_incomplete';

export type SwapValidationResult =
  | {
      ok: true;
      /**
       * Matchene i bunten der out-spilleren faktisk står — de eneste som skal
       * skrives. En avledet match uten out-spilleren røres ikke.
       */
      gameIds: string[];
    }
  | { ok: false; error: SwapValidationError };

/**
 * Guard-rekkefølgen er bevisst: eksistens → status → hvem står hvor →
 * kvalifikasjon. Den strengeste og billigste sjekken først, så feilmeldingen
 * arrangøren får peker på den FØRSTE grunnen byttet ikke går, ikke en
 * tilfeldig av flere.
 */
export function validateMatchSwap(
  input: SwapValidationInput,
): SwapValidationResult {
  const {
    bundle,
    outUserId,
    inUserId,
    candidateIds,
    inProfileCompleted,
    clubMemberIds,
  } = input;

  // 1. Bunten finnes. Tom bunt = kallet peker på noe som ikke er en cup-match.
  if (bundle.length === 0) return { ok: false, error: 'not_found' };

  // 2. Kun før start — HELE bunten må stå urørt. Er back-nine-singelen alt
  //    startet, er handicapene frosset og et bytte ville etterlatt inn-
  //    spilleren uten spillehandicap i en aktiv match.
  if (bundle.some((g) => g.status !== 'scheduled')) {
    return { ok: false, error: 'already_started' };
  }

  // 3. Ut-spilleren må stå i minst én av buntens matcher; inn-spilleren i
  //    ingen av dem (uansett lag — to rader for samme bruker i samme match er
  //    ikke mulig, komposit-PK, og på motsatt lag ville det vært tull).
  const gameIds = bundle
    .filter((g) => g.playerIds.includes(outUserId))
    .map((g) => g.gameId);
  if (gameIds.length === 0) {
    return { ok: false, error: 'player_not_in_match' };
  }
  if (bundle.some((g) => g.playerIds.includes(inUserId))) {
    return { ok: false, error: 'already_in_match' };
  }

  // 4. Inn-spilleren må være en kandidat for cupen — samme sett arrangøren får
  //    velge fra i pickeren. Klient-lister er ikke authz (AGENTS.md-felle #3),
  //    så settet leses på nytt her.
  if (!candidateIds.includes(inUserId)) {
    return { ok: false, error: 'not_candidate' };
  }

  // 5. Klubb-cup: fortsatt medlem? Medlemskap kan trekkes når som helst, og en
  //    klubb-cup skal kun inneholde klubbmedlemmer (speiler generatorens
  //    `not_members`-guard).
  if (clubMemberIds !== null && !clubMemberIds.includes(inUserId)) {
    return { ok: false, error: 'not_member' };
  }

  // 6. Profilen må være fullført. Sist fordi den er den mest spesifikke: den
  //    treffer en spiller som ellers er godkjent, og beskjeden arrangøren får
  //    er da den ene tingen som faktisk mangler.
  if (!inProfileCompleted) {
    return { ok: false, error: 'profile_incomplete' };
  }

  return { ok: true, gameIds };
}
