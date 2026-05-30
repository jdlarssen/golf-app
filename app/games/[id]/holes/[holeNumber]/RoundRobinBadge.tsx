'use client';

import type { CSSProperties } from 'react';
import { roundRobinConstellationForHole } from '@/lib/scoring/modes/roundRobin';
import type { RoundRobinConstellationPlayer } from '@/lib/scoring/modes/roundRobin';

interface Props {
  holeNumber: number;
  players: RoundRobinConstellationPlayer[];
  myUserId: string;
}

const badgeStyle: CSSProperties = {
  margin: '0 14px 8px',
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid var(--accent)',
  background: 'var(--primary-soft)',
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text)',
  textAlign: 'center',
};

export function RoundRobinBadge({ holeNumber, players, myUserId }: Props) {
  const constellation = roundRobinConstellationForHole(holeNumber, players, myUserId);
  if (!constellation) return null;

  const { segment, partnerUserId, opponentUserIds } = constellation;

  const findName = (userId: string) =>
    players.find((p) => p.userId === userId)?.name ?? userId;

  const partnerName = findName(partnerUserId);
  const opp1Name = findName(opponentUserIds[0]);
  const opp2Name = findName(opponentUserIds[1]);

  return (
    <div data-testid="round-robin-badge" style={badgeStyle}>
      Segment {segment}/3 · Du spiller med {partnerName} mot {opp1Name} + {opp2Name}
    </div>
  );
}
