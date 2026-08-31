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
import type {
  ModeResult,
  WolfHoleChoice,
} from '../../../../lib/scoring/modes/types';
import {
  determineWolfForHole,
  type WolfRotationPlayer,
} from '../../../../lib/wolf/wolfRotation';
import type { BundlePlayer } from '../data/gameBundle';
import { displayName } from './display';

/** Teksten spilleren får når valgene ikke kunne hentes. */
export const WOLF_CHOICES_UNAVAILABLE =
  'Fikk ikke tak i valgene for dette hullet. De dukker opp når nettet er tilbake.';

export interface WolfPartnerOption {
  userId: string;
  name: string;
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
}): WolfHoleState {
  const { holeNumber, myUserId, gameStatus, players, choices, pointsByUser } = args;

  if (choices === undefined) {
    return {
      wolfUserId: null,
      iAmWolf: false,
      choice: null,
      badgeText: null,
      notice: WOLF_CHOICES_UNAVAILABLE,
      partnerOptions: [],
      showChoiceUi: false,
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

  return {
    wolfUserId,
    iAmWolf,
    choice,
    badgeText: badgeTextFor({ choice, iAmWolf, nameOf, wolfUserId, n: rotation.length }),
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
  n: number;
}): string | null {
  const { choice, iAmWolf, nameOf, wolfUserId, n } = args;
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
  // #465: lone-gevinsten er n, blind n + 2 — tallene webbens copy viser.
  if (choice.choice === 'lone') {
    return `Wolf: ${wolfName} (Lone Wolf — ${n} poeng)`;
  }
  return `Wolf: ${wolfName} (Blind Wolf — ${n + 2} poeng)`;
}
