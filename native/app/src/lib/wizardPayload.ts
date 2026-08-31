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
// kjører shim + delt bygger for alle åtte modiene og krever webbens
// payload-fasong tilbake. Driver feltnavnene, blir den rød.
import {
  buildGameInsertPayload,
  type ParsedPayload,
} from '../../../../lib/games/gamePayload';
import { isStablefordFamily } from '../../../../lib/scoring/modes/types';
import {
  APP_MODE_LABELS,
  usesTeamAssignment,
  type AppGameMode,
} from './appFormats';
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
  /** wolf / skins / bingo_bango_bongo: kroner per enhet i oppgjøret. */
  krPerUnit?: number;
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
}

/** En ferdig utfylt spiller-slot, slik `player_${i}_*` bærer den. */
interface PlayerSlot {
  userId: string;
  team: number | null;
  flight: number | null;
}

/**
 * Webbens default-flight: lag 1 og 2 spiller i flight 1, lag 3 og 4 i flight 2
 * (`useGameFormState.ts:1023`). Gjelder KUN best ball — alle andre lag-formater
 * setter flight = lag.
 *
 * Flight er ikke valgfritt å utelate: DB-CHECK-en
 * `game_players_team_flight_consistency` krever at lag og flight er satt
 * sammen eller null sammen.
 */
function bestBallDefaultFlight(team: number): number {
  return team === 1 || team === 2 ? 1 : 2;
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
          draft.gameMode === 'best_ball' ? bestBallDefaultFlight(team) : team,
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
 * Feltene appen IKKE setter (`entry_fee_kr`, `payment_link`, premie-slottene,
 * `group_id`, `tournament_id`) er utenfor scope i v1 og faller til webbens egne
 * defaults i byggeren: kontingent 0, ingen lenke, tomt premiebord, ingen
 * klubb-/cup-kobling.
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

  // Appen inviterer alltid eksplisitt. Verdien er ikke bare en default:
  // `buildGameInsertPayload` degraderer modus-valideringen til 'draft' når
  // registration_mode er noe ANNET enn 'invite_only' (gamePayload.ts:2205), og
  // da ville spillerantall-portene stilltiende sluttet å gjelde.
  form.set('registration_mode', 'invite_only');
  form.set('registration_type', 'solo');

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
  form.set('kr_per_unit', setup.krPerUnit ?? null);

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
  // Alle valgte spillere får sitt felt, også de en lag-modus dropper — feltet
  // leses uansett kun for spillere som ER i payloaden.
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
 * tee-kjønn leses videre fra form-dataen av de andre delte parserne.
 */
export function buildDraftPayload(draft: GameDraft): {
  form: WizardFormData;
  payload: ParsedPayload;
} {
  const form = draftToFormData(draft);
  return {
    form,
    payload: buildGameInsertPayload(asSharedFormData(form), 'publish'),
  };
}
