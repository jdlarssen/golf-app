// Native (#1832): hvem er Wolf på dette hullet, og hva ble valgt?
//
// Hele spørsmålet er avledet — det finnes ingen kolonne som sier «Anna er Wolf
// på hull 7». Rotasjonen bor i `lib/wolf/wolfRotation.ts` (samme fil webbens
// hull-side kaller, flyttet dit i denne slicen nettopp for å slippe en tredje
// kopi), og badge-teksten er webbens, ord for ord fra `messages/no.json`.
//
// Tre ting er verdt å vite:
//
//  1. **Rotasjons-sloten er `team_number`.** Det er ikke et lag i wolf — det er
//     rekkefølgen. Webben plukker spillerne som `allPlayers` med `team_number`
//     satt, UTEN å sortere, og uten å filtrere bort trukne spillere. Vi gjør
//     nøyaktig det samme: `determineWolfForHole` slår opp på slot-verdien og
//     sorterer selv i trailing-grenen, så rekkefølgen inn spiller ingen rolle —
//     men ANTALLET gjør det (n styrer både rotasjonslengden og lone/blind-
//     potten), og der ville et WD-filter gitt appen en annen wolf enn webben.
//  2. **Poengene er motorens.** Trailing-wolf (hull R+1..18) er «den som ligger
//     sist», og det tallet kommer fra `computeLeaderboard` via
//     `wolfPointsByUser` — aldri en egen formel her.
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
  determineWolfForHole,
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
}

/** Undertekstene i valget, ferdig regnet så kortet ikke har tall-logikk. */
export interface WolfChoiceTexts {
  /** `null` i en blind runde som pågår: partnerknappene har bare navnet. */
  partnerSubtitle: string | null;
  loneSubtitle: string;
  blindSubtitle: string;
  /** Linja under «Velg før utslag» når innsatsen er over 1, ellers `null`. */
  stakeLine: string | null;
}

export interface WolfHoleState {
  /** Spilleren som er Wolf på hullet, eller `null` når vi ikke kan svare. */
  wolfUserId: string | null;
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
 * Rotasjonsspillerne slik `determineWolfForHole` vil ha dem.
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
 * Motorens wolf-totaler som oppslag, til trailing-wolf-regelen.
 *
 * Alt annet enn et wolf-resultat gir et tomt kart — og da faller
 * `determineWolfForHole` tilbake på slot-rekkefølgen, akkurat som webben gjør
 * når `pointsByUser` er `undefined`.
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
}): WolfHoleState {
  const {
    holeNumber,
    myUserId,
    gameStatus,
    players,
    choices,
    pointsByUser,
    hideNumbers,
  } = args;

  if (choices === undefined) {
    return {
      wolfUserId: null,
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
  // En lagret rad har forrang over rotasjonen: den kan være en admin-override
  // eller en trailing-wolf som ble låst før vi rakk å regne på nytt.
  const wolfUserId = determineWolfForHole(
    holeNumber,
    rotation,
    pointsByUser,
    choice?.wolfUserId,
  );
  const iAmWolf = wolfUserId !== null && wolfUserId === myUserId;
  const stake = hideNumbers ? 1 : args.stake;
  const payout = hideNumbers ? null : wolfPayout(rotation.length, stake);

  return {
    wolfUserId,
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
          .map((entry) => ({
            userId: entry.userId,
            name: nameOf(entry.userId) ?? 'Ukjent spiller',
          }))
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
