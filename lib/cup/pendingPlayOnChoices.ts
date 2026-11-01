import type { CupMatchInput } from './computeCupLeaderboard';
import { remainingPartnerName } from './cupSoloPartner';

/**
 * #1814 (E4): et selv-trekk i en fourball etterlater et valg bare ARRANGØREN
 * kan ta — skal makkeren spille alene, eller avgjøres kampen etter regelen? Uten
 * venter-banneret lå valget nede på ett av mange kampkort, og ingen tok det.
 *
 * Fravær av `withdrawal_play_on` = ingen har bestemt seg (`playOnChoicePending`
 * fra `cupMatchEntry`); et registrert valg — også «etter regelen» — fjerner
 * kampen herfra. Kamper uten en makker igjen å spille alene faller ut med
 * `remainingPartnerName === null`.
 */
export function pendingPlayOnChoices(
  matches: readonly CupMatchInput[],
  nameOf: (userId: string) => string,
  fallbackLabel: string,
): { gameId: string; label: string; partner: string }[] {
  const rows = matches
    .filter((m) => m.playOnChoicePending)
    .map((m) => ({
      gameId: m.gameId,
      label: m.matchLabel ?? fallbackLabel,
      partner: remainingPartnerName(m, nameOf),
    }));
  return rows.filter(
    (m): m is { gameId: string; label: string; partner: string } => m.partner !== null,
  );
}
