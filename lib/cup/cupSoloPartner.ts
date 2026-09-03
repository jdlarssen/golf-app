import type { CupMatchInput } from './computeCupLeaderboard';

/**
 * Hvem står igjen alene på den trukne siden? (#1814, E4)
 *
 * Brukes to steder som må si det SAMME navnet: fourball-panelet på hvert
 * kampkort (`CupMatchList`) og venter-banneret øverst i cup-styringen
 * (`CupManagement`). Da panelet eide utledningen selv, fantes den bare der —
 * banneret ville måttet gjette.
 *
 * `null` når det ikke finnes noen makker å spille alene: kampen har ingen
 * registrert trekk, begge sider har trukket seg, eller hele den trukne siden
 * er borte (ingen ball igjen å slå — kampen er avgjort uansett flagg).
 */
export function remainingPartnerName(
  match: Pick<CupMatchInput, 'withdrawal' | 'team1UserIds' | 'team2UserIds'>,
  nameOf: (userId: string) => string,
): string | null {
  const w = match.withdrawal;
  if (!w || w.withdrawnSide === 'both') return null;
  const sideIds =
    (w.withdrawnSide === 1 ? match.team1UserIds : match.team2UserIds) ?? [];
  const remaining = sideIds.filter((uid) => !w.withdrawnUserIds.includes(uid));
  if (remaining.length === 0) return null;
  return remaining.map(nameOf).join('/');
}
