// native/app/src/lib/endGamePlan.ts
// Native N6c (#1856): hva avslutt-skjermen skal tegne — som rene funksjoner.
//
// Skjermen stiller fire spørsmål, og alle fire har et svar som kan regnes ut
// uten React: hvem mangler levering, hvem mangler godkjenning, hvilke LD-/CTP-
// slots skal kåres, og er knappen klar. Regnestykket bor her slik at det kan
// testes uten å rendre noe, og slik at `EndGame.tsx` blir montering.
//
// **Planen gater ikke, den forbereder.** Den ekte porten er
// `finishRound` (`data/endGame.ts`), som speiler `endGameCore` og har RLS bak
// seg. Blir de to uenige, er det datamodulen som har rett — skjermen skal bare
// slippe å tilby et trykk som garantert blir avvist.
//
// **`needsPeerApproval` bor her, ikke i datamodulen.** Regelen leses to steder
// (skjermen navngir hvem som mangler, skrivingen avviser), og en regel har ett
// hjem (AGENTS.md felle 4). Datamodulen importerer den herfra.
import {
  supportsWithdrawal,
  type GameMode,
} from '../../../../lib/scoring/modes/types';
import type { BundleGame, BundlePlayer, GameBundle } from '../data/gameBundle';
import type { SideWinnerRow } from '../data/sideWinners';

/**
 * Mangler denne raden en peer-godkjenning?
 *
 * Tar de to stemplene, ikke en rad: skjermen leser camelCase fra bundelen og
 * skrivingen leser snake_case fra PostgREST, og regelen skal ikke kjenne noen
 * av delene.
 *
 * Begge halvdelene av paret fanges. «Levert, ikke godkjent» er webbens egen
 * gren (`endGameCore:194-196`). «Godkjent, ikke levert» er uoppnåelig i dag —
 * `reopenScorecard` nuller begge i samme UPDATE — men den er fail-closed for en
 * fremtidig sti som bare nuller den ene.
 */
export function needsPeerApproval(
  submittedAt: string | null,
  approvedAt: string | null,
): boolean {
  const submitted = submittedAt !== null;
  const approved = approvedAt !== null;
  return (submitted && !approved) || (!submitted && approved);
}

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
 * Trukne spillere er ute av alle tre listene — de blokkerer hverken levering
 * eller godkjenning, og de kan ikke kåres. Samme filter som webbens
 * `/games/[id]/avslutt` (`active`-lista der).
 *
 * @param organiserUserId den innloggede arrangøren; egen rad kan ikke trekkes.
 */
export function buildFinishPlan(
  bundle: GameBundle,
  organiserUserId: string,
): FinishPlan {
  const { game } = bundle;
  const withdrawalSupported = supportsWithdrawal(game.gameMode as GameMode);
  const active = bundle.players.filter((player) => player.withdrawnAt === null);

  const missing: MissingEntry[] = active
    .filter((player) => player.submittedAt === null)
    .map((player) => ({
      player,
      withdrawable: withdrawalSupported && player.userId !== organiserUserId,
    }));

  const unapproved = game.requirePeerApproval
    ? active.filter((player) =>
        needsPeerApproval(player.submittedAt, player.approvedAt),
      )
    : [];

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
 * Er «Avslutt runden» klar?
 *
 * Tre betingelser, og ingen av dem har en snarvei:
 *  1. **Ingen manglende godkjenning.** Den kan ikke krysses bort — verken her
 *     eller i datamodulen. Appen har ingen Sekretariat-overstyring.
 *  2. **Hver manglende levering er kvittert.** Webben lar arrangøren avslutte
 *     uten å huke av noe; her kreves et eksplisitt trykk per rad, slik at
 *     ingen blir stående som «ikke levert» ved et uhell.
 *  3. **Hver slot har et valg** — en spiller eller «Ingen kvalifiserte».
 *     Ingen implisitt null.
 */
export function canFinish(
  plan: FinishPlan,
  acknowledged: ReadonlySet<string>,
  choices: Readonly<Record<string, string>>,
): boolean {
  if (plan.unapproved.length > 0) return false;
  if (!plan.missing.every((entry) => acknowledged.has(entry.player.userId))) {
    return false;
  }
  return plan.slots.every((slot) => choices[slot.key] !== undefined);
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
