// native/app/src/lib/endGamePlan.ts
// Native N6c (#1856): hva avslutt-skjermen skal tegne — som rene funksjoner.
//
// Skjermen stiller fire spørsmål, og alle fire har et svar som kan regnes ut
// uten React: hvem mangler levering, hvem mangler godkjenning, hvilke LD-/CTP-
// slots skal kåres, og er knappen klar. Regnestykket bor her slik at det kan
// testes uten å rendre noe, og slik at `EndGame.tsx` blir montering.
//
// **Planen gater ikke, den forbereder.** Den ekte porten er
// `finishRound` (`data/endGame.ts`), som har RLS bak seg. Skjermen skal bare
// slippe å tilby et trykk som garantert blir avvist.
//
// **Hvem som mangler, regnes ett sted.** Skjermen navngir hvem som mangler
// levering og godkjenning, skrivingen avviser, og nettsidens kjerne og
// avslutt-sider gjør det samme. Alle leser `lib/games/finishGate.ts` (#2222),
// så de kan ikke bli uenige (AGENTS.md felle 4).
import {
  supportsWithdrawal,
  type GameMode,
} from '../../../../lib/scoring/modes/types';
import { splitFinishRoster } from '../../../../lib/games/finishGate';
import type { EndRoundFailure } from '../data/endGame';
import type { BundleGame, BundlePlayer, GameBundle } from '../data/gameBundle';
import type { SideWinnerRow } from '../data/sideWinners';

/** Valget «Ingen kvalifiserte» — webbens `"none"`, som persisteres som null. */
export const NO_WINNER = 'none';

/**
 * Én slot som skal kåres.
 *
 * `position` er hvilket HULL sideturneringen spilles på (LD-hull 1 eller 2),
 * aldri en plassering. Samme spiller kan vinne begge slots.
 */
export interface FinishSlot {
  /** Stabil nøkkel for state og testID: `ld-1`, `ctp-2`. */
  key: string;
  category: SideWinnerRow['category'];
  position: number;
}

/** Én spiller uten levert kort, og hva appen faktisk kan gjøre med raden. */
export interface MissingEntry {
  player: BundlePlayer;
  /**
   * Kan raden merkes som trukket herfra?
   *
   * Falsk i to tilfeller: formatet kjenner ikke frafall (`supportsWithdrawal`),
   * eller det er arrangørens EGEN rad — `guard_game_players_self_update` (0147)
   * svarer 42501 der, uansett hva appen prøver. Begge krysses av på samme måte,
   * men bare de sanne sendes til frafalls-skrivingen; de andre avsluttes uten
   * kort, slik nettsiden også gjør (`explanationNoWd`).
   */
  withdrawable: boolean;
}

export interface FinishPlan {
  /** Ikke-trukkede spillere, i roster-rekkefølge. Kåringen velges blant disse. */
  active: BundlePlayer[];
  /** Aktive uten levert kort. */
  missing: MissingEntry[];
  /** Aktive som mangler godkjenning. Tom når spillet ikke krever den. */
  unapproved: BundlePlayer[];
  /** Slots som må kåres. Tom når sideturneringen er av eller har null hull. */
  slots: FinishSlot[];
  requirePeerApproval: boolean;
  /**
   * Om formatet i det hele tatt har frafall (#1891).
   *
   * `MissingEntry.withdrawable` svarer ikke på dette alene: den er alltid
   * `false` for arrangørens egen rad, uansett format. Skjermen trenger begge
   * for å vite om «trekk deg»-veien finnes — og en lenke til en side som bare
   * sender deg tilbake er verre enn ingen lenke.
   */
  withdrawalSupported: boolean;
}

/**
 * LD-/CTP-slotene runden har.
 *
 * Speiler `SideWinnersForm`: kun `side_ld_count`/`side_ctp_count` teller.
 * `sideDisabledCategories` (legacy #1139) leses bevisst IKKE — webbens
 * avslutt-skjema leser den heller ikke, og en app som skjulte en slot nettsiden
 * ber om ville lagt igjen en ukåret rad ingen av flatene kunne fylle.
 */
export function sideSlots(game: BundleGame): FinishSlot[] {
  if (!game.sideTournamentEnabled) return [];
  const slots: FinishSlot[] = [];
  for (let pos = 1; pos <= game.sideLdCount; pos += 1) {
    slots.push({ key: `ld-${pos}`, category: 'longest_drive', position: pos });
  }
  for (let pos = 1; pos <= game.sideCtpCount; pos += 1) {
    slots.push({ key: `ctp-${pos}`, category: 'closest_to_pin', position: pos });
  }
  return slots;
}

/**
 * Alt skjermen trenger å vite om runden, i én gjennomgang av rosteret.
 *
 * Listene kommer fra `splitFinishRoster`, den samme som webbens avslutt-sider
 * leser: trukne spillere er ute av alle tre — de blokkerer hverken levering
 * eller godkjenning, og de kan ikke kåres. `BundlePlayer` har alt de tre
 * stemplene i camelCase, så raden er sin egen stempel-leser.
 *
 * @param organiserUserId den innloggede arrangøren; egen rad kan ikke trekkes.
 */
export function buildFinishPlan(
  bundle: GameBundle,
  organiserUserId: string,
): FinishPlan {
  const { game } = bundle;
  const withdrawalSupported = supportsWithdrawal(game.gameMode as GameMode);
  const roster = splitFinishRoster(
    bundle.players,
    (player) => player,
    game.requirePeerApproval,
  );
  const { active, unapproved } = roster;

  const missing: MissingEntry[] = roster.missing.map((player) => ({
    player,
    withdrawable: withdrawalSupported && player.userId !== organiserUserId,
  }));

  return {
    active,
    missing,
    unapproved,
    withdrawalSupported,
    slots: sideSlots(game),
    requirePeerApproval: game.requirePeerApproval,
  };
}

/**
 * Det som står mellom arrangøren og «Avslutt runden» (#2578).
 *
 * Tre betingelser, og ingen av dem har en snarvei:
 *  1. **Ingen manglende godkjenning.** Den kan ikke krysses bort — verken her
 *     eller i datamodulen. Appen har ingen Sekretariat-overstyring.
 *  2. **Hver manglende levering er kvittert.** Webben lar arrangøren avslutte
 *     uten å huke av noe; her kreves et eksplisitt trykk per rad, slik at
 *     ingen blir stående som «ikke levert» ved et uhell.
 *  3. **Hver slot har et valg** — en spiller eller «Ingen kvalifiserte».
 *     Ingen implisitt null.
 *
 * Både sperren ({@link canFinish}) og linja under knappen («Åpner når …»)
 * leses herfra, så de kan ikke bli uenige (AGENTS.md felle 4).
 */
export interface FinishBlockers {
  /** Leverte kort som venter på godkjenning, i roster-rekkefølge. */
  unapproved: BundlePlayer[];
  /** Spillere uten kort som ikke er huket av. */
  unacknowledged: BundlePlayer[];
  /** Minst én slot mangler et valg. */
  winnersOpen: boolean;
}

export function finishBlockers(
  plan: FinishPlan,
  acknowledged: ReadonlySet<string>,
  choices: Readonly<Record<string, string>>,
): FinishBlockers {
  return {
    unapproved: plan.unapproved,
    unacknowledged: plan.missing
      .filter((entry) => !acknowledged.has(entry.player.userId))
      .map((entry) => entry.player),
    winnersOpen: plan.slots.some((slot) => choices[slot.key] === undefined),
  };
}

/** Er «Avslutt runden» klar? Ja når {@link finishBlockers} ikke har noe igjen. */
export function canFinish(
  plan: FinishPlan,
  acknowledged: ReadonlySet<string>,
  choices: Readonly<Record<string, string>>,
): boolean {
  const blockers = finishBlockers(plan, acknowledged, choices);
  return (
    blockers.unapproved.length === 0 &&
    blockers.unacknowledged.length === 0 &&
    !blockers.winnersOpen
  );
}

/**
 * Tallene i fremdriftskortet (#2578): «6 av 8» og «5 godkjent · 1 venter på
 * godkjenning · 2 mangler kort».
 *
 * Trukne spillere er ute av `plan.active` og teller ikke. Uten krav om
 * godkjenning er `waiting` alltid 0, og `approved` er det samme som
 * `delivered`.
 */
export interface DeliveryCounts {
  total: number;
  delivered: number;
  approved: number;
  waiting: number;
  missing: number;
}

export function deliveryCounts(plan: FinishPlan): DeliveryCounts {
  const total = plan.active.length;
  const missing = plan.missing.length;
  const delivered = total - missing;
  const waiting = plan.unapproved.length;
  return { total, delivered, approved: delivered - waiting, waiting, missing };
}

/**
 * Hvem som faktisk skal merkes som trukket.
 *
 * Kun de avkryssede radene appen HAR lov til å trekke. Egen rad og formater
 * uten frafall er kvittert, ikke trukket — de går videre som `allowMissing`.
 */
export function withdrawUserIds(
  plan: FinishPlan,
  acknowledged: ReadonlySet<string>,
): string[] {
  return plan.missing
    .filter(
      (entry) => entry.withdrawable && acknowledged.has(entry.player.userId),
    )
    .map((entry) => entry.player.userId);
}

/**
 * Hvem som kan kåres (#2284): de aktive, minus dem arrangøren har huket av for
 * frafall i denne avslutningen.
 *
 * Frafallet skrives før kåringen ({@link withdrawUserIds} går først i
 * `finishRound`), så en spiller som både trekkes og kåres i samme trykk er
 * trukket når vinnerne lagres, og databasen (0193) nekter kåringen. Da står
 * frafallet, men arrangøren får høre at ingenting ble lagret. En kvittert rad
 * som ikke trekkes (egen rad, format uten frafall) er fortsatt i runden og kan
 * kåres.
 */
export function winnerCandidates(
  plan: FinishPlan,
  acknowledged: ReadonlySet<string>,
): BundlePlayer[] {
  const leaving = new Set(withdrawUserIds(plan, acknowledged));
  return plan.active.filter((player) => !leaving.has(player.userId));
}

/**
 * Valgene som fortsatt peker på en aktiv spiller (#2284).
 *
 * Trekker en valgt vinner seg mens skjermen står åpen, forsvinner hen fra
 * velgeren ved neste henting, men valget ville blitt stående i `choices`:
 * usynlig i velgeren og sendt på nytt ved neste trykk, der databasen nekter
 * igjen. Et slikt valg droppes, så sloten står tom og knappen er grå til
 * arrangøren velger på nytt. «Ingen kvalifiserte» beholdes.
 *
 * Skjermen regner den ut på hver render i stedet for å skrive over state, og
 * får samme objekt tilbake når ingenting er droppet.
 */
export function activeChoices(
  choices: Readonly<Record<string, string>>,
  active: readonly BundlePlayer[],
): Readonly<Record<string, string>> {
  const activeIds = new Set(active.map((player) => player.userId));
  const kept = Object.entries(choices).filter(
    ([, value]) => value === NO_WINNER || activeIds.has(value),
  );
  if (kept.length === Object.keys(choices).length) return choices;
  return Object.fromEntries(kept);
}

/**
 * Kåringen som rader.
 *
 * `NO_WINNER` blir `winner_user_id: null` — «ingen kvalifiserte» er et valg
 * arrangøren tok, ikke en verdi som mangler. En slot uten valg gir ingen rad;
 * {@link canFinish} sperrer knappen før det kan skje.
 */
export function toSideWinners(
  slots: readonly FinishSlot[],
  choices: Readonly<Record<string, string>>,
): SideWinnerRow[] {
  const rows: SideWinnerRow[] = [];
  for (const slot of slots) {
    const choice = choices[slot.key];
    if (choice === undefined) continue;
    rows.push({
      category: slot.category,
      position: slot.position,
      winner_user_id: choice === NO_WINNER ? null : choice,
    });
  }
  return rows;
}

/** Én kåringsrad på bekreft-siden: vinneren, eller `null` for «Ingen kvalifiserte». */
export interface SlotWinner {
  slot: FinishSlot;
  winner: BundlePlayer | null;
}

/** Det bekreft-siden viser under «Dette lagres» (#2578). */
export interface ConfirmSummary {
  /** Spillerne i resultatet: de aktive minus dem som trekkes (beslutning 6). */
  resultCount: number;
  /** Av dem: hvor mange som har levert. */
  deliveredCount: number;
  /** Huket av og trekkes ({@link withdrawUserIds}). */
  withdrawn: BundlePlayer[];
  /** Huket av, men kan ikke trekkes: avsluttes uten kort. */
  noCard: BundlePlayer[];
  /** Én rad per slot med et valg, i `plan.slots`-rekkefølge. */
  winners: SlotWinner[];
}

/**
 * Oppsummeringen før noe låses.
 *
 * @param choices valgene som fortsatt gjelder ({@link activeChoices}). Knappen
 *   til bekreft-siden er sperret til hver slot har et valg, så en slot uten
 *   valg gir ingen rad.
 */
export function confirmSummary(
  plan: FinishPlan,
  acknowledged: ReadonlySet<string>,
  choices: Readonly<Record<string, string>>,
): ConfirmSummary {
  const leaving = new Set(withdrawUserIds(plan, acknowledged));
  const withdrawn = plan.missing
    .filter((entry) => leaving.has(entry.player.userId))
    .map((entry) => entry.player);
  const noCard = plan.missing
    .filter(
      (entry) =>
        acknowledged.has(entry.player.userId) && !leaving.has(entry.player.userId),
    )
    .map((entry) => entry.player);
  const resultCount = plan.active.length - withdrawn.length;
  const winners: SlotWinner[] = [];
  for (const slot of plan.slots) {
    const choice = choices[slot.key];
    if (choice === undefined) continue;
    winners.push({
      slot,
      winner:
        choice === NO_WINNER
          ? null
          : (plan.active.find((player) => player.userId === choice) ?? null),
    });
  }
  return {
    resultCount,
    deliveredCount: resultCount - noCard.length,
    withdrawn,
    noCard,
    winners,
  };
}

/**
 * Sender avslaget skjermen tilbake til lista (#2578, beslutning 7)?
 *
 * Tre grunner betyr at lista på skjermen er utdatert: et avkrysset kort kom
 * inn (`withdraw-after-submit`, `-partial`, #1896), eller en valgt vinner har
 * trukket seg (`winner-withdrawn`, #2284). Da hentes bundelen på nytt, og
 * arrangøren må se lista igjen for å gjøre noe med det. De andre avslagene
 * løses ikke av en ny liste, så bekreft-siden står med setningen.
 *
 * Ingen `default`-gren: en ny kode i `EndRoundFailure` gir rød `tsc` her.
 */
export function returnsToList(reason: EndRoundFailure): boolean {
  switch (reason) {
    case 'withdraw-after-submit':
    case 'withdraw-after-submit-partial':
    case 'winner-withdrawn':
      return true;
    case 'no-session':
    case 'offline':
    case 'not-found':
    case 'cup-game':
    case 'not-active':
    case 'no-players':
    case 'not-all-submitted':
    case 'not-all-approved':
    case 'withdrawal-unsupported':
    case 'db-withdraw':
    case 'db-winners':
    case 'rls-denied':
    case 'no-rows':
    case 'db':
      return false;
  }
}
