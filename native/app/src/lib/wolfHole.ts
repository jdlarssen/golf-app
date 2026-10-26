// Native (#1832): hvem er Wolf på dette hullet, og hva ble valgt?
//
// Hele spørsmålet er avledet — det finnes ingen kolonne som sier «Anna er Wolf
// på hull 7». Rotasjonen bor i `lib/wolf/wolfRotation.ts` (samme fil webbens
// hull-side kaller, flyttet dit i denne slicen nettopp for å slippe en tredje
// kopi), og badge-teksten er webbens, ord for ord fra `messages/no.json`.
//
// Tre ting er verdt å vite:
//
//  0. **Ulven er motorens (#2314).** Hvem som er ulv, bor i
//     `lib/scoring/modes/wolfTurn.ts`, og hull-skjermen leser motorens rad
//     (`wolfTurnFromEngine`), akkurat som nettsiden. Regelen kalles direkte
//     bare som reserve når motoren ikke kunne kjøre.
//  1. **Rotasjons-sloten er `team_number`.** Det er ikke et lag i wolf — det er
//     rekkefølgen. Webben plukker spillerne som `allPlayers` med `team_number`
//     satt, UTEN å sortere, og uten å filtrere bort trukne spillere. Vi gjør
//     nøyaktig det samme: regelen (`wolfForHole`) slår opp på slot-verdien og
//     sorterer selv i trailing-grenen, så rekkefølgen inn spiller ingen rolle —
//     men ANTALLET gjør det (n styrer både rotasjonslengden og lone/blind-
//     potten), og der ville et WD-filter gitt appen en annen wolf enn webben.
//  2. **Poengene er motorens.** Stillingen regelen ser, er poengene før
//     hullet fra `computeLeaderboard` (`wolfPointsBeforeHole`) — aldri en
//     egen formel her.
//  3. **`undefined` valg er ikke «ingen valg».** Har hentingen ikke lyktes, sier
//     kortet fra i stedet for å tegne en badge som ser autoritativ ut. Samme
//     skille som `ScoringExtras` holder på leaderboard-siden.
//  4. **Tallene er gevinst ganger innsats (#2313).** Et delt hull gjør neste
//     hull dyrere, og regelen bor i `lib/wolf/wolfPayout.ts`, som webben også
//     leser. I en blind runde som pågår vises ingen tall i det hele tatt
//     (#2314): innsatsen røper at et hull ble delt.
import type {
  ModeResult,
  WolfHoleChoice,
} from '../../../../lib/scoring/modes/types';
import {
  catchUpStartHole,
  wolfCatchUpGap,
  wolfUpcoming,
  type WolfRotationRule,
  type WolfTurn,
} from '../../../../lib/scoring/modes/wolfTurn';
import { firstName } from '../../../../lib/firstName';
import {
  resolveHoleWolf,
  type WolfRotationPlayer,
} from '../../../../lib/wolf/wolfRotation';
import {
  wolfPayout,
  wolfStakeForHole,
  type WolfPayout,
} from '../../../../lib/wolf/wolfPayout';
import type { BundlePlayer } from '../data/gameBundle';
import { displayName } from './display';

/** Teksten spilleren får når valgene ikke kunne hentes. */
export const WOLF_CHOICES_UNAVAILABLE =
  'Fikk ikke tak i valgene for dette hullet. De dukker opp når nettet er tilbake.';

export interface WolfPartnerOption {
  userId: string;
  name: string;
  /**
   * Stillingen på knappen («1. · 14 p», #2314). `null` før noen har fått
   * poeng, og alltid i en blind runde som pågår.
   */
  standing: string | null;
  /** Hele knappen for VoiceOver («Partner: Marte, 1. plass, 14 poeng»). */
  accessibilityLabel: string;
}

/**
 * Gangen i hullet, de fire stegene ulven ser over valgene (#2314). Appen
 * fører ikke rekkefølgen på tee: ja og nei sies muntlig.
 */
export const WOLF_FLOW_STEPS: readonly string[] = [
  'Blind Wolf? Si det nå, før noen slår.',
  'De andre slår ut i fast rekkefølge, som flytter seg ett hakk for hvert hull. Du slår sist.',
  'Si ja eller nei rett etter hvert utslag. Et ja gir deg partner.',
  'Nei til alle? Da er du Lone Wolf.',
];

/** Linja under stegene. */
export const WOLF_FLOW_HINT = 'Trykk på valget når dere har bestemt dere.';

/** Stillingen i en wolf-runde: plass og poeng per spiller. */
export type WolfStandings = ReadonlyMap<string, { rank: number; points: number }>;

/** Undertekstene i valget, ferdig regnet så kortet ikke har tall-logikk. */
export interface WolfChoiceTexts {
  /** `null` i en blind runde som pågår: partnerknappene har bare navnet. */
  partnerSubtitle: string | null;
  loneSubtitle: string;
  blindSubtitle: string;
  /** Linja under stegene når innsatsen er over 1, ellers `null`. */
  stakeLine: string | null;
}

export interface WolfHoleState {
  /** Spilleren som er Wolf på hullet, eller `null` når vi ikke kan svare. */
  wolfUserId: string | null;
  /** Catch-up-regelen ga hullet til den som ligger sist (#2314). */
  catchUp: boolean;
  /**
   * Linja under merket på et catch-up-hull («Du ligger 5 poeng bak lederen,
   * så du er ulv på dette hullet.»). `null` uten catch-up, og i en blind runde
   * som pågår, der merket står alene.
   */
  catchUpLine: string | null;
  /**
   * Gangen for de andre i flighten, til valget er lagret: «{navn} slår sist og
   * sier ja eller nei …». `null` for ulven selv, og når det ikke gjelder.
   */
  flowLine: string | null;
  /** Er det meg? Porten for om valg-knappene i det hele tatt finnes. */
  iAmWolf: boolean;
  /** Valget som står lagret for hullet, eller `null`. */
  choice: WolfHoleChoice | null;
  /** Kontekstlinja over kortene. `null` = ingen badge (webbens regel). */
  badgeText: string | null;
  /** Rolig forklaring når noe mangler. `null` når alt er som det skal. */
  notice: string | null;
  /** De andre spillerne, som partner-alternativer. Tom når jeg ikke er Wolf. */
  partnerOptions: WolfPartnerOption[];
  /** Skal valg-knappene vises? */
  showChoiceUi: boolean;
  /** Innsatsen på hullet. Alltid 1 i en blind runde som pågår. */
  stake: number;
  /** Gevinsten ganger innsatsen, eller `null` i en blind runde som pågår. */
  payout: WolfPayout | null;
  choiceTexts: WolfChoiceTexts;
}

/**
 * Rotasjonsspillerne slik regelen (`wolfForHole`) vil ha dem.
 *
 * Speiler `computeWolfContext` (`holes/[holeNumber]/holePageScoring.ts`): alle
 * spillere med `team_number` satt, i bundelens egen rekkefølge.
 */
export function wolfRotationPlayers(
  players: readonly BundlePlayer[],
): WolfRotationPlayer[] {
  const rotation: WolfRotationPlayer[] = [];
  for (const player of players) {
    if (player.teamNumber == null) continue;
    rotation.push({ userId: player.userId, teamNumber: player.teamNumber });
  }
  return rotation;
}

/**
 * Motorens wolf-totaler som oppslag (stillingen nå, over alle spilte hull).
 *
 * Alt annet enn et wolf-resultat gir et tomt kart. Regelen leser ikke denne:
 * den ser stillingen FØR hullet (`wolfPointsBeforeHole`, #2314).
 */
export function wolfPointsByUser(result: ModeResult | null): Map<string, number> {
  const points = new Map<string, number>();
  if (result === null || result.kind !== 'wolf') return points;
  for (const player of result.players) {
    points.set(player.userId, player.totalPoints);
  }
  return points;
}

/**
 * Ulven på hullet slik motoren valgte den (#2314), eller `null` når motoren
 * ikke kjørte eller hullet mangler i radene.
 */
export function wolfTurnFromEngine(
  result: ModeResult | null,
  holeNumber: number,
): WolfTurn | null {
  if (result === null || result.kind !== 'wolf') return null;
  const row = result.holes.find((entry) => entry.holeNumber === holeNumber);
  if (!row || !row.wolfUserId) return null;
  return { userId: row.wolfUserId, catchUp: row.catchUp };
}

/**
 * Motorens innsats på hullet (1 som grunn, 2 etter ett delt hull, 3 etter to).
 *
 * Alt annet enn et wolf-resultat gir grunninnsatsen 1, samme som webben når
 * motoren ikke kunne kjøre.
 */
export function wolfStake(result: ModeResult | null, holeNumber: number): number {
  if (result === null || result.kind !== 'wolf') return 1;
  return wolfStakeForHole(result.holes, holeNumber);
}

/**
 * Hullets wolf-tilstand: hvem, hva ble valgt, og hva spilleren skal se.
 *
 * Ren funksjon — ingen nett, ingen React. Kalleren har allerede hentet
 * valgene (`useGameChoices`) og motorens poeng (`computeGameLeaderboard`).
 */
export function wolfHoleState(args: {
  holeNumber: number;
  myUserId: string;
  gameStatus: string;
  players: readonly BundlePlayer[];
  /** `undefined` = hentingen har ikke lyktes. `[]` = ingen har valgt ennå. */
  choices: readonly WolfHoleChoice[] | undefined;
  pointsByUser: Map<string, number>;
  /** Motorens innsats på hullet (`wolfStake`). */
  stake: number;
  /** En blind runde som pågår: ingen poengtall og ingen innsats. */
  hideNumbers: boolean;
  /** Motorens ulv på hullet (`wolfTurnFromEngine`). `null` = motoren mangler. */
  engineTurn?: WolfTurn | null;
  /** Spillets regel, til reserven når motoren mangler. */
  rule?: WolfRotationRule;
  /** Stillingen nå (`wolfStandings`), til partnerknappene. */
  standings?: WolfStandings;
}): WolfHoleState {
  const {
    holeNumber,
    myUserId,
    gameStatus,
    players,
    choices,
    pointsByUser,
    hideNumbers,
    engineTurn = null,
    rule = 'trailing',
    standings,
  } = args;

  if (choices === undefined) {
    return {
      wolfUserId: null,
      catchUp: false,
      catchUpLine: null,
      flowLine: null,
      iAmWolf: false,
      choice: null,
      badgeText: null,
      notice: WOLF_CHOICES_UNAVAILABLE,
      partnerOptions: [],
      showChoiceUi: false,
      stake: 1,
      payout: null,
      // Kortet viser ikke valgene uten valg-lista, så tekstene uten tall holder.
      choiceTexts: choiceTextsFor(null, 1),
    };
  }

  const rotation = wolfRotationPlayers(players);
  const nameOf = (userId: string | null | undefined): string | null => {
    if (!userId) return null;
    const player = players.find((entry) => entry.userId === userId);
    return player ? displayName(player) : null;
  };

  const choice = choices.find((row) => row.holeNumber === holeNumber) ?? null;
  // En lagret rad har forrang: den kan være en admin-override eller en ulv
  // som ble låst før vi rakk å regne på nytt. Ellers er ulven motorens, og
  // regelen kalles selv bare når motoren mangler.
  const turn = resolveHoleWolf({
    holeNumber,
    players: rotation,
    pointsByUser,
    storedWolfUserId: choice?.wolfUserId,
    engineTurn,
    rule,
  });
  const wolfUserId = turn?.userId ?? null;
  const iAmWolf = wolfUserId !== null && wolfUserId === myUserId;
  const stake = hideNumbers ? 1 : args.stake;
  const payout = hideNumbers ? null : wolfPayout(rotation.length, stake);
  const catchUp = turn?.catchUp ?? false;
  const wolfName = nameOf(wolfUserId);
  // Stillingen vises først når noen har fått poeng, og aldri i en blind runde.
  const showStandings =
    !hideNumbers &&
    standings !== undefined &&
    [...standings.values()].some((entry) => entry.points > 0);

  return {
    wolfUserId,
    catchUp,
    catchUpLine:
      catchUp && !hideNumbers && wolfName !== null
        ? catchUpLineFor({
            iAmWolf,
            wolfName,
            gap: wolfCatchUpGap(rotation, pointsByUser),
          })
        : null,
    flowLine:
      !iAmWolf && choice === null && gameStatus === 'active' && wolfName !== null
        ? `${wolfName} slår sist og sier ja eller nei rett etter hvert utslag. Blind Wolf meldes før noen slår.`
        : null,
    iAmWolf,
    choice,
    badgeText: badgeTextFor({ choice, iAmWolf, nameOf, wolfUserId, payout }),
    notice:
      wolfUserId === null
        ? 'Rotasjonen er ikke satt for denne runden ennå.'
        : null,
    partnerOptions: iAmWolf
      ? rotation
          .filter((entry) => entry.userId !== myUserId)
          .map((entry) => {
            const name = nameOf(entry.userId) ?? 'Ukjent spiller';
            const place = showStandings ? standings?.get(entry.userId) : undefined;
            return {
              userId: entry.userId,
              name,
              standing: place ? `${place.rank}. · ${place.points} p` : null,
              accessibilityLabel: place
                ? `Partner: ${name}, ${place.rank}. plass, ${place.points} poeng`
                : `Partner: ${name}`,
            };
          })
      : [],
    // Webbens modal åpner seg kun når spillet er aktivt og hullet står uten
    // valg, og det finnes ingen annen vei inn i den. Samme flate her — ikke en
    // ny regel, bare den samme.
    showChoiceUi: iAmWolf && choice === null && gameStatus === 'active',
    stake,
    payout,
    choiceTexts: choiceTextsFor(payout, stake),
  };
}

/** Linja under catch-up-merket. `gap` er avstanden før hullet. */
function catchUpLineFor(args: { iAmWolf: boolean; wolfName: string; gap: number }): string {
  const { iAmWolf, wolfName, gap } = args;
  return iAmWolf
    ? `Du ligger ${gap} poeng bak lederen, så du er ulv på dette hullet.`
    : `${wolfName} ligger ${gap} poeng bak lederen og er ulv på dette hullet.`;
}

/**
 * Stillingen fra motoren: plass og poeng per spiller. Tomt kart uten et
 * wolf-resultat.
 */
export function wolfStandings(result: ModeResult | null): WolfStandings {
  const standings = new Map<string, { rank: number; points: number }>();
  if (result === null || result.kind !== 'wolf') return standings;
  for (const line of result.players) {
    standings.set(line.userId, { rank: line.rank, points: line.totalPoints });
  }
  return standings;
}

/** Én kolonne i «Wolf-rekkefølgen». */
export interface WolfOrderColumn {
  hole: number;
  /** «Deg», fornavnet, eller «Avgjøres». */
  label: string;
  isMine: boolean;
  /** Hele teksten for VoiceOver («Hull 17: avgjøres etter hull 16»). */
  accessibilityLabel: string;
}

export interface WolfOrderStripState {
  columns: WolfOrderColumn[];
  /** Regelen for de siste hullene, når stripa når dit. Ellers `null`. */
  ruleLine: string | null;
}

/**
 * «Wolf-rekkefølgen» under hullhodet (#2314): dette hullet og de tre neste,
 * til og med 18. Bare i en aktiv runde med minst tre i rotasjonen.
 *
 * Hullet du står på har ulven fra hull-tilstanden (`currentWolfUserId`), så
 * stripa og kortet aldri er uenige. Resten er `wolfUpcoming`.
 */
export function wolfOrderStrip(args: {
  holeNumber: number;
  myUserId: string;
  gameStatus: string;
  players: readonly BundlePlayer[];
  choices: readonly WolfHoleChoice[] | undefined;
  pointsBefore: Map<string, number>;
  rule: WolfRotationRule;
  currentWolfUserId: string | null;
}): WolfOrderStripState | null {
  const { holeNumber, myUserId, gameStatus, players, choices, pointsBefore, rule } = args;
  const rotation = wolfRotationPlayers(players);
  if (gameStatus !== 'active' || rotation.length < 3) return null;

  const labelOf = (userId: string | null): string => {
    if (userId === null) return 'Ukjent';
    if (userId === myUserId) return 'Deg';
    const player = players.find((entry) => entry.userId === userId);
    return player ? (firstName(displayName(player)) ?? displayName(player)) : 'Ukjent';
  };

  const upcoming = wolfUpcoming({
    fromHole: holeNumber,
    count: 4,
    players: rotation,
    pointsBefore,
    choices: choices ?? [],
    rule,
  });
  const columns = upcoming.map((entry): WolfOrderColumn => {
    if ('settlesAfterHole' in entry) {
      return {
        hole: entry.hole,
        label: 'Avgjøres',
        isMine: false,
        accessibilityLabel: `Hull ${entry.hole}: avgjøres etter hull ${entry.settlesAfterHole}`,
      };
    }
    const userId = entry.hole === holeNumber ? args.currentWolfUserId : entry.wolfUserId;
    const label = labelOf(userId);
    return {
      hole: entry.hole,
      label,
      isMine: userId !== null && userId === myUserId,
      accessibilityLabel: `Hull ${entry.hole}: ${label}`,
    };
  });

  const n = rotation.length;
  const start = catchUpStartHole(n, rule);
  const reachesEnd = columns.some((column) => column.hole >= start);
  return {
    columns,
    ruleLine: reachesEnd
      ? rule === 'catch_up'
        ? `Fra hull ${start}: ligger den som er sist, minst ${n} poeng bak lederen, blir den ulv. Ellers går rundgangen videre.`
        : `Fra hull ${start} blir den som ligger sist etter forrige hull, Wolf.`
      : null,
  };
}

/**
 * Undertekstene i valget, ord for ord fra webbens `holes.wolf`-nøkler.
 *
 * Uten `payout` (blind runde som pågår) står det verken poeng eller innsats.
 */
function choiceTextsFor(payout: WolfPayout | null, stake: number): WolfChoiceTexts {
  if (payout === null) {
    return {
      partnerSubtitle: null,
      loneSubtitle: 'Alene mot resten',
      blindSubtitle: 'Meldt før utslag',
      stakeLine: null,
    };
  }
  return {
    partnerSubtitle: `Vinner-siden får ${payout.partnerEach} hver`,
    loneSubtitle: `Alene mot resten. Vinner du, får du ${payout.lone}.`,
    blindSubtitle: `Meldt før utslag. Vinner du, får du ${payout.blind}.`,
    stakeLine: stake > 1 ? `Innsatsen er ${stake} ganger etter delte hull.` : null,
  };
}

/**
 * Badge-teksten, ord for ord fra webbens `holes.wolf`-nøkler.
 *
 * `null` der webben også gir `null`: ukjent wolf, eller et partner-valg der
 * partneren ikke finnes i rosteret.
 */
function badgeTextFor(args: {
  choice: WolfHoleChoice | null;
  iAmWolf: boolean;
  nameOf: (userId: string | null | undefined) => string | null;
  wolfUserId: string | null;
  payout: WolfPayout | null;
}): string | null {
  const { choice, iAmWolf, nameOf, wolfUserId, payout } = args;
  const wolfName = nameOf(wolfUserId);
  if (wolfName === null) return null;

  if (choice === null) {
    return iAmWolf
      ? 'Du er Wolf på dette hullet'
      : `Wolf: ${wolfName} — venter på valg`;
  }
  if (choice.choice === 'partner') {
    const partnerName = nameOf(choice.partnerUserId);
    return partnerName === null
      ? null
      : `Wolf: ${wolfName} — partner: ${partnerName}`;
  }
  // #465: lone-gevinsten er n, blind n+2, og #2313: begge ganger innsatsen på
  // hullet. I en blind runde som pågår står det ingen tall (#2314).
  if (choice.choice === 'lone') {
    return payout
      ? `Wolf: ${wolfName} (Lone Wolf — ${payout.lone} poeng)`
      : `Wolf: ${wolfName} (Lone Wolf)`;
  }
  return payout
    ? `Wolf: ${wolfName} (Blind Wolf — ${payout.blind} poeng)`
    : `Wolf: ${wolfName} (Blind Wolf)`;
}
