// native/app/src/lib/wizardPayload.ts
// Native N6a (#1854): veiviserens tilstand → webbens form-felter.
//
// Dette er MONTERINGEN, ikke reglene. Alt som avgjør noe — spillerantall per
// modus, lagbalanse, `mode_config`-fasongen, feilkodene — bor i den delte
// `buildGameInsertPayload` (`lib/games/gamePayload.ts`). Fila her gjør én ting:
// oversetter et `GameDraft` til nøyaktig de feltnavnene webbens `<form>` sender,
// og lar den delte byggeren dømme.
//
// Derfor er paritetstesten (`wizardPayload.test.ts`) verdt mer enn koden: den
// kjører shim + delt bygger for alle modiene appen lager og krever webbens
// payload-fasong tilbake. Driver feltnavnene, blir den rød.
import {
  buildGameInsertPayload,
  type ParsedPayload,
} from '../../../../lib/games/gamePayload';
import { PRIZE_SLOTS, prizeFieldName, type PrizeDraft } from '../../../../lib/games/prizes';
import {
  gameModeSupportsTeams,
  isClubTournament,
  organiserStartsOnRoster,
  type RegistrationMode,
} from '../../../../lib/games/registration';
import {
  DEFAULT_SHAMBLE_SETUP,
  defaultTeamHandicapPct,
  defaultTeamSizeForMode,
} from '../../../../lib/games/formatSetupDefaults';
import { defaultFlightForTeam } from '../../../../lib/games/teamFormatLimits';
import { isStablefordFamily } from '../../../../lib/scoring/modes/types';
import {
  APP_MODE_LABELS,
  usesTeamAssignment,
  type AppGameMode,
} from './appFormats';
import type { AppRegistrationType } from './registrationCopy';
import { WizardFormData, asSharedFormData } from './wizardFormData';

/**
 * Tee-kjønnet en spiller spiller fra, i webbens UI-alfabet.
 * `M` = herre, `D` = dame, `J` = junior. Oversettes til DB-enumen
 * (`mens`/`ladies`/`juniors`) i `data/createGame.ts`, akkurat som webbens
 * `uiGenderToDb`.
 */
export type TeeGenderUi = 'M' | 'D' | 'J';

export interface DraftPlayer {
  userId: string;
  /** Hvilken tee spilleren spiller fra. Default `'M'` når veiviseren ikke spør. */
  teeGender: TeeGenderUi;
  /**
   * Lag (best ball) eller side (matchplay/greensome), 1-basert.
   *
   * `null` for alle solo-formater OG for wolf — wolf-slottene trekkes ved
   * START (#969), ikke her. I en lag-modus blir en spiller med `null` DROPPET
   * fra payloaden (se {@link orderedSlots}), akkurat som på web.
   */
  teamNumber: number | null;
}

/**
 * Modus-spesifikke oppsett-felter.
 *
 * Flat og valgfri med vilje, ikke en union per modus: veiviseren beholder
 * tilstand når arrangøren bytter format fram og tilbake, og webbens `<form>`
 * bærer nøyaktig samme flate sett. Feltene som ikke gjelder valgt modus,
 * ignoreres av den delte validatoren — det er den som vet hvilke som teller.
 */
export interface ModeSetup {
  /** stableford / modified_stableford: 1 = solo, 2 = par (4BBB). Default 1. */
  stablefordTeamSize?: 1 | 2;
  /** greensome_matchplay: HCP-andel 0–100. Default 100 (WHS, som web). */
  greensomeAllowancePct?: number;
  /** wolf: teller brutto eller netto. Default `'net'`. */
  wolfScoring?: 'gross' | 'net';
  /** skins: teller brutto eller netto. Default `'net'`. */
  skinsScoring?: 'gross' | 'net';
  /** nassau (#2755): teller brutto eller netto. Default `'net'`, som på nettet. */
  nassauScoring?: 'gross' | 'net';
  /** wolf / skins / bingo_bango_bongo: kroner per enhet i oppgjøret. */
  krPerUnit?: number;
  /** patsome (#2753): poeng fra netto eller brutto. Default `'net'`, som på nettet. */
  patsomeScoring?: 'gross' | 'net';
  /**
   * #2753 D3b: lagstørrelsen i scramble-familien og shamble. Utelatt =
   * formatets standard (`defaultTeamSizeForMode`, delt med nettet).
   */
  teamSize?: 2 | 3 | 4;
  /**
   * Texas, Ambrose og Florida: lag-handicap i prosent av SUMMEN, slik den delte
   * byggeren lagrer det. Utelatt = formatets standard for lagstørrelsen
   * (`defaultTeamHandicapPct`). 0 er brutto.
   */
  teamHandicapSumPct?: number;
  /** shamble: varianten, antall som teller (champagne) og tellemåten. */
  shambleVariant?: 'shamble' | 'champagne';
  shambleCount?: 1 | 2 | 3;
  shambleScoring?: 'gross' | 'net';
}

/** Feltprefikset den delte byggeren leser for scramble-familien. */
const SCRAMBLE_PREFIX = {
  texas_scramble: 'texas',
  ambrose: 'ambrose',
  florida_scramble: 'florida',
} as const;

export type ScrambleFamilyMode = keyof typeof SCRAMBLE_PREFIX;

export function isScrambleFamily(mode: AppGameMode): mode is ScrambleFamilyMode {
  return mode in SCRAMBLE_PREFIX;
}

/**
 * Lagstørrelsen som gjelder: arrangørens valg, ellers formatets standard. Bare
 * meningsfull for scramble-familien og shamble.
 */
export function effectiveTeamSize(mode: AppGameMode, setup: ModeSetup | undefined): 2 | 3 | 4 {
  return setup?.teamSize ?? (defaultTeamSizeForMode(mode) as 2 | 3 | 4);
}

/**
 * Alt veiviseren har samlet inn. Lever i minnet til publisering — et avbrutt
 * utkast forkastes (draft-lagring er web-eid, jf. kontrakten).
 */
export interface GameDraft {
  name: string;
  gameMode: AppGameMode;
  courseId: string | null;
  teeBoxId: string | null;
  /**
   * Tee-off som ABSOLUTT tidspunkt (ISO 8601, UTC). Bruk {@link teeOffInstant}
   * på datoen fra pickeren. `null` er ikke publiserbart.
   */
  teeOffAt: string | null;
  /** HCP-andel 0–100. Default 100. */
  hcpAllowancePct?: number;
  /** Krever makker-godkjenning av leverte kort. Default false. */
  requirePeerApproval?: boolean;
  /** `'live'` = netto synlig fra hull 1, `'reveal'` = skjult til slutt. Default `'live'`. */
  scoreVisibility?: 'live' | 'reveal';
  /** Sideturnering av/på. Default false. */
  sideTournamentEnabled?: boolean;
  /** Antall longest-drive-HULL, 0–2 (slots, ikke medaljeplasser). */
  sideLdCount?: 0 | 1 | 2;
  /** Antall closest-to-pin-HULL, 0–2. */
  sideCtpCount?: 0 | 1 | 2;
  players: DraftPlayer[];
  setup?: ModeSetup;
  /** #2749: startkontingent i hele kroner per spiller. 0 eller tom = ingen. */
  entryFeeKr?: number;
  /** #2749: Vipps-nummer eller betalingslenke, fritekst. Lagres bare med en kontingent. */
  paymentLink?: string;
  /** #2749: premiebordet, rå tekst per slott som webbens veiviser. Logo finnes ikke i appen. */
  prizes?: PrizeDraft;
  /**
   * #2753: klubben en «Klubb-turnering» hører til, ellers `null`. Med klubb kan
   * runden publiseres uten spillere: medlemmene melder seg på selv
   * (`rosterOptionalAtPublish`). Databasen sjekker medlemskapet
   * (`guard_games_competition_links`).
   */
  groupId?: string | null;
  /**
   * #2840 del 4: hvordan spillerne kommer, og hva man melder på. Utelatt =
   * `invite_only` og `solo`, som før. Lagres slik {@link resolveRegistration}
   * avgjør: en klubbturnering og et format uten lag kan ikke få noe annet.
   */
  registrationMode?: RegistrationMode;
  registrationType?: AppRegistrationType;
  /** «Slipp venner direkte inn». Gjelder bare med `manual_approval`. */
  letFriendsSkipGate?: boolean;
}

/** Påmeldingen slik runden lagres. */
export interface ResolvedRegistration {
  mode: RegistrationMode;
  type: AppRegistrationType;
  letFriendsSkipGate: boolean;
}

/**
 * Påmeldingen som gjelder, ut fra arrangørens valg (#2840 del 4).
 *
 * - En klubbturnering er låst til `invite_only` og `solo` (#643, #2753): medlemskapet
 *   er invitasjonen.
 * - Et format uten lag (`gameModeSupportsTeams`) får alltid `solo`. Den delte byggeren
 *   ville ellers svart `team_registration_unsupported_mode`.
 * - «Slipp venner direkte inn» gjelder bare «De ber om plass, jeg godkjenner», som i
 *   byggeren.
 *
 * Veiviseren og payloaden leser begge denne, så skjermen aldri viser et valg som ikke
 * blir lagret.
 */
export function resolveRegistration({
  clubScoped,
  gameMode,
  mode = 'invite_only',
  type = 'solo',
  letFriendsSkipGate = false,
}: {
  clubScoped: boolean;
  gameMode: AppGameMode | null;
  mode?: RegistrationMode;
  type?: AppRegistrationType;
  letFriendsSkipGate?: boolean;
}): ResolvedRegistration {
  if (clubScoped) return { mode: 'invite_only', type: 'solo', letFriendsSkipGate: false };
  return {
    mode,
    type: gameMode !== null && gameModeSupportsTeams(gameMode) ? type : 'solo',
    letFriendsSkipGate: mode === 'manual_approval' && letFriendsSkipGate,
  };
}

/**
 * Med lagpåmelding via lenken står ingen på lista fra start (#2840, eierens valg og
 * tegningen). Lagene melder seg på selv: arrangøren fra runden etter publisering, de andre
 * fra lenken. En som sto på lista uten lag, ville fått `already_registered` både på eget
 * lag og på en kapteins (#2072). Regelen bor i `organiserStartsOnRoster`; her er bare
 * filteret, og det gjelder også spillere valgt før påmeldingen ble byttet.
 */
export function rosterForRegistration<T extends { userId: string }>(
  players: readonly T[],
  registration: Pick<ResolvedRegistration, 'mode' | 'type'>,
): T[] {
  return organiserStartsOnRoster(registration.mode, registration.type) ? [...players] : [];
}

/** Påmeldingen for et utkast: {@link resolveRegistration} med utkastets klubb og format. */
export function draftRegistration(draft: GameDraft): ResolvedRegistration {
  return resolveRegistration({
    clubScoped: isClubTournament({ groupId: draft.groupId, tournamentId: null }),
    gameMode: draft.gameMode,
    mode: draft.registrationMode,
    type: draft.registrationType,
    letFriendsSkipGate: draft.letFriendsSkipGate,
  });
}

/** En ferdig utfylt spiller-slot, slik `player_${i}_*` bærer den. */
interface PlayerSlot {
  userId: string;
  team: number | null;
  flight: number | null;
}

/**
 * Trenger denne modusen at hver spiller får et lag/side FØR publisering?
 *
 * Eksportert fordi veiviser-skjermen må stille nøyaktig samme spørsmål: den
 * som svarer «nei» her, dropper spillere uten lag i {@link orderedSlots}. Sto
 * regelen to steder, ville en skjerm uten lag-UI stille publisert en runde med
 * færre spillere enn arrangøren valgte.
 *
 * `usesTeamAssignment` dekker de tre lag-sluggene. Par-stableford (4BBB) har
 * ingen egen slug — den er `stableford`/`modified_stableford` med
 * `stablefordTeamSize: 2` — og er derfor det ekstra leddet.
 */
export function draftNeedsTeamAssignment(draft: GameDraft): boolean {
  return (
    usesTeamAssignment(draft.gameMode) || isParStableford(draft.gameMode, draft.setup)
  );
}

/**
 * Er dette par-stableford (4BBB)?
 *
 * ⚠️ Modusen MÅ være med i spørsmålet. `stablefordTeamSize` er et felt på et
 * delt `setup`-objekt, og veiviseren lar arrangøren bytte format etter at
 * oppsett-steget er besøkt. Uten mode-leddet ble et «Par»-valg gjort på
 * stableford hengende ved når hen så gikk tilbake og valgte wolf: wolf fikk et
 * lag-grid den ikke skal ha, og siden {@link orderedSlots} DROPPER spillere
 * uten lag-tildeling i en lag-modus, ble payloaden tom — publisering døde med
 * «Formatet trenger flere spillere» mens tre spillere sto valgt. Feltet finnes
 * bare i stableford-familiens eget oppsett-UI, så arrangøren kunne ikke engang
 * angre valget. Funnet av evaluatoren i #1854.
 *
 * Familie-medlemskapet leses fra den DELTE `isStablefordFamily`, ikke en lokal
 * liste — samme kilde som webben ruter på.
 */
export function isParStableford(
  mode: AppGameMode,
  setup: ModeSetup | undefined,
): boolean {
  return isStablefordFamily(mode) && setup?.stablefordTeamSize === 2;
}

/**
 * Spillerne i den rekkefølgen `player_0…player_n` skal bære dem.
 *
 * Lag-modi: sortert på lag stigende (stabilt innen laget), og spillere UTEN
 * lag-tildeling droppes — nøyaktig som webbens `orderedPayload`. Å sende dem
 * med tom lag-verdi ville gitt `bad_team` fra den delte validatoren i både
 * draft og publish, altså en feilmelding i stedet for et halvferdig utkast.
 *
 * Solo-modi og wolf: alle spillere, lag og flight `null`.
 */
function orderedSlots(draft: GameDraft): PlayerSlot[] {
  if (!draftNeedsTeamAssignment(draft)) {
    return draft.players.map((p) => ({
      userId: p.userId,
      team: null,
      flight: null,
    }));
  }

  return draft.players
    .filter((p) => p.teamNumber !== null)
    .map((p, index) => ({ player: p, index }))
    // Stabil sortering: `Array.prototype.sort` er stabil i moderne JS-motorer,
    // men indeksen står som eksplisitt tiebreak så rekkefølgen er lest ut av
    // koden og ikke ut av en motor-garanti.
    .sort((a, b) => a.player.teamNumber! - b.player.teamNumber! || a.index - b.index)
    .map(({ player }) => {
      const team = player.teamNumber!;
      return {
        userId: player.userId,
        team,
        flight:
          // Best ball: webbens standard-flight, to par per flight
          // (`defaultFlightForTeam`, #2148). Alle andre lag-formater setter
          // flight = lag. Flight kan ikke utelates: DB-CHECK-en
          // `game_players_team_flight_consistency` krever lag og flight sammen.
          draft.gameMode === 'best_ball' ? defaultFlightForTeam(team) : team,
      };
    });
}

/**
 * Tidspunktet fra datetimepickeren som absolutt ISO-tid.
 *
 * ⚠️ Her lå en ekte feil (funnet på simulator 2026-08-31, første publisering
 * fra appen): tee-off ble lagret én time feil. Veien var pickerens `Date` →
 * veggklokke-streng → delt `parseOsloDateTimeLocal`. Den helperen velger
 * sommer- eller vintertid ved å STRENG-SAMMENLIGNE `Intl`-utdata mot `'GMT+2'`
 * (`lib/games/gamePayload.ts`). Den sammenligningen slår til i Node og i
 * nettlesere, men ikke under Hermes — så en dato i august fikk vintertidens
 * `+01:00`, og 23:00 ble lagret som 22:00Z i stedet for 21:00Z.
 *
 * Webben MÅ gå veien om veggklokke: `<input type="datetime-local">` har ingen
 * tidssone, så Oslo er den eneste fornuftige tolkningen. Appen har derimot
 * pickerens `Date` — et faktisk øyeblikk — og trenger ikke gjette. Vi bruker
 * det direkte. Da stemmer det arrangøren ser i pickeren med det som lagres, og
 * med det {@link formatTeeOff} viser etterpå: alle tre er enhetens lokaltid.
 *
 * Konsekvens verdt å kjenne: på en enhet i en annen tidssone lagrer appen
 * øyeblikket arrangøren faktisk valgte, mens webben ville lest samme tall som
 * Oslo-tid. Appen er selvkonsistent; det er den som er riktig av de to.
 */
export function teeOffInstant(date: Date): string {
  return date.toISOString();
}

/** Navnet et navnløst utkast får, så `name_required` aldri møter arrangøren. */
export function defaultGameName(mode: AppGameMode): string {
  return APP_MODE_LABELS[mode];
}

/**
 * Veiviserens tilstand som form-felter, med webbens navn.
 *
 * Kontingenten, betalingslenka og premie-slottene (#2749) har webbens navn, og
 * de delte parserne avgjør resten: lenka lagres bare med en kontingent, et tomt
 * premie-felt lagres ikke, og slott formatet ikke har, beskjæres
 * (`parsePrizesFromFormData` i `data/createGame.ts`). Logo-feltet er alltid tomt:
 * appen laster ikke opp logoer. Feltene appen IKKE setter (`group_id`,
 * `tournament_id`) faller til webbens defaults: ingen klubb-/cup-kobling.
 */
export function draftToFormData(draft: GameDraft): WizardFormData {
  const form = new WizardFormData();
  const setup = draft.setup ?? {};

  form.set('name', draft.name.trim() || defaultGameName(draft.gameMode));
  form.set('game_mode', draft.gameMode);
  form.set('course_id', draft.courseId ?? '');
  form.set('tee_box_id', draft.teeBoxId ?? '');
  form.set('hcp_allowance_pct', draft.hcpAllowancePct ?? 100);
  // Checkbox-semantikk: webben tester mot strengen 'on', ikke mot 'true'.
  if (draft.requirePeerApproval) form.set('require_peer_approval', 'on');
  form.set('score_visibility', draft.scoreVisibility ?? 'live');
  form.set('scheduled_tee_off_at', draft.teeOffAt ?? '');

  // #2840 del 4: arrangørens valg, som nettets veiviser sender dem. Med påmelding
  // er lista valgfri ved publisering: den delte byggeren kjører da formatets
  // validator som 'draft' (`rosterOptionalAtPublish`), og spillerantallet sjekkes
  // ved start. Uten valg står `invite_only` og `solo`, og antallet gjelder som før.
  // Bryteren sendes som nettets skjulte felt: '1' når den er på.
  const registration = draftRegistration(draft);
  form.set('registration_mode', registration.mode);
  form.set('registration_type', registration.type);
  form.set('let_friends_skip_gate', registration.letFriendsSkipGate ? '1' : '');

  const sideEnabled = draft.sideTournamentEnabled === true;
  form.set('side_tournament_enabled', sideEnabled ? 'true' : 'false');
  form.set('side_ld_count', sideEnabled ? (draft.sideLdCount ?? 0) : 0);
  form.set('side_ctp_count', sideEnabled ? (draft.sideCtpCount ?? 0) : 0);

  // Modus-oppsett. Feltene skrives kun når de er satt, så en modus som ikke
  // bruker dem ser en tom form akkurat som på web.
  form.set('stableford_team_size', setup.stablefordTeamSize ?? null);
  // Greensome MÅ ha en andel ved publisering — tomt felt gir `bad_allowance`
  // fra den delte validatoren. 100 er webbens egen draft-default (WHS).
  form.set(
    'greensome_allowance_pct',
    draft.gameMode === 'greensome_matchplay'
      ? (setup.greensomeAllowancePct ?? 100)
      : (setup.greensomeAllowancePct ?? null),
  );
  form.set('wolf_scoring', setup.wolfScoring ?? null);
  form.set('skins_scoring', setup.skinsScoring ?? null);
  form.set('nassau_scoring', setup.nassauScoring ?? null);
  form.set('kr_per_unit', setup.krPerUnit ?? null);
  form.set('patsome_scoring', setup.patsomeScoring ?? null);
  // #2753 D3b: scramble-familien og shamble, med nettets standarder der
  // arrangøren ikke har valgt. Lag-handicapet MÅ være satt for scramble: tomt
  // felt gir `bad_allowance` fra den delte byggeren.
  if (isScrambleFamily(draft.gameMode)) {
    const prefix = SCRAMBLE_PREFIX[draft.gameMode];
    const size = effectiveTeamSize(draft.gameMode, setup);
    form.set(`${prefix}_team_size`, size);
    form.set(
      `${prefix}_team_handicap_pct`,
      setup.teamHandicapSumPct ?? defaultTeamHandicapPct(draft.gameMode, size),
    );
  }
  if (draft.gameMode === 'shamble') {
    form.set('shamble_team_size', effectiveTeamSize('shamble', setup));
    form.set('shamble_variant', setup.shambleVariant ?? DEFAULT_SHAMBLE_SETUP.variant);
    form.set('shamble_count', setup.shambleCount ?? DEFAULT_SHAMBLE_SETUP.count);
    form.set('shamble_scoring', setup.shambleScoring ?? DEFAULT_SHAMBLE_SETUP.scoring);
  }

  form.set('entry_fee_kr', draft.entryFeeKr ?? 0);
  form.set('payment_link', draft.paymentLink ?? '');
  for (const slot of PRIZE_SLOTS) {
    const prize = draft.prizes?.[slot.key];
    form.set(prizeFieldName(slot.key, 'desc'), prize?.description ?? '');
    form.set(prizeFieldName(slot.key, 'sponsor'), prize?.sponsor ?? '');
    form.set(prizeFieldName(slot.key, 'logo'), '');
  }

  const slots = orderedSlots(draft);
  slots.forEach((slot, i) => {
    form.set(`player_${i}_id`, slot.userId);
    // Tom streng for null, som webbens hidden inputs (GameForm.tsx:598-608).
    form.set(`player_${i}_team`, slot.team ?? '');
    form.set(`player_${i}_flight`, slot.flight ?? '');
  });

  // Tee-kjønn nøkles på BRUKER-ID, ikke på slot-indeks. To ulike konvensjoner i
  // samme form er lett å bomme på; webbens `actions.ts:295` leser
  // `player_${p.user_id}_gender` mens slottene over er indeksbaserte.
  //
  // Appen leser IKKE dette feltet selv (#2007): `data/createGame.ts` henter
  // tee-settet rett fra `draft.players`, som bærer det typet. Feltet settes
  // likevel, for web-form-pariteten er hele oppgaven til denne fila — webbens
  // `actions.ts` leser nøyaktig denne nøkkelen fra en ekte `<form>`, og
  // `wizardPayload.test.ts` låser det.
  for (const player of draft.players) {
    form.set(`player_${player.userId}_gender`, player.teeGender);
  }

  return form;
}

/**
 * Utkastet gjennom den delte byggeren.
 *
 * Returnerer BÅDE form-dataen og payloaden fordi publiseringen trenger begge:
 * payloaden bærer spillerne og `mode_config`, mens tee-off, sideturnering og
 * premier leses videre fra form-dataen av de andre delte parserne. Tee-kjønn
 * hører ikke lenger til den lista (#2007) — det leses fra utkastet.
 */
export function buildDraftPayload(draft: GameDraft): {
  form: WizardFormData;
  payload: ParsedPayload;
} {
  const form = draftToFormData(draft);
  return {
    form,
    payload: buildGameInsertPayload(asSharedFormData(form), 'publish', {
      clubScoped: isClubTournament({ groupId: draft.groupId, tournamentId: null }),
    }),
  };
}
