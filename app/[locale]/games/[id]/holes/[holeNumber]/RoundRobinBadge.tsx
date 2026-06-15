'use client';

import { useTranslations } from 'next-intl';
import { roundRobinConstellationForHole } from '@/lib/scoring/modes/roundRobin';
import type { RoundRobinConstellationPlayer } from '@/lib/scoring/modes/roundRobin';
import { HoleContextLine } from '@/components/hole/HoleContextLine';

interface Props {
  holeNumber: number;
  players: RoundRobinConstellationPlayer[];
  myUserId: string;
}

export function RoundRobinBadge({ holeNumber, players, myUserId }: Props) {
  const t = useTranslations('holes.roundRobin');
  const constellation = roundRobinConstellationForHole(holeNumber, players, myUserId);
  if (!constellation) return null;

  const { segment, partnerUserId, opponentUserIds } = constellation;

  const findName = (userId: string) =>
    players.find((p) => p.userId === userId)?.name ?? userId;

  const partnerName = findName(partnerUserId);
  const opp1Name = findName(opponentUserIds[0]);
  const opp2Name = findName(opponentUserIds[1]);

  // #639: rendres som kompakt header-underrad (chromeless) i stedet for et
  // frittstående full-bredde kort — testid videreført så selektorene treffer.
  return (
    <HoleContextLine testId="round-robin-badge" accent>
      {t('badge', { segment, partner: partnerName, opp1: opp1Name, opp2: opp2Name })}
    </HoleContextLine>
  );
}
