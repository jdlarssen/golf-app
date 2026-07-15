'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { SponsorCredit } from '@/components/SponsorCredit';
import type { PrizeAward } from '@/lib/games/prizeAwards';

/**
 * #1051: «Premieutdeling»-seksjonen under podiet på et avsluttet spill. Tar
 * ferdig-koblede premier (linkPrizesToWinners kjøres server-side), grupperer
 * plasseringer (🥇/🥈/🥉) og sideturneringer, og lister vinner(e) per premie.
 * Delt plass lister alle navn. Slott uten vinner er allerede filtrert bort av
 * koblingen. Returnerer null når ingen premier har vinner.
 */

const MEDALS = ['🥇', '🥈', '🥉'] as const;

export function PrizeAwardsCard({ awards }: { awards: PrizeAward[] }) {
  const t = useTranslations('prizes');

  if (awards.length === 0) return null;

  const placements = awards
    .filter((a) => a.prize.category === 'placement')
    .sort((x, y) => x.prize.position - y.prize.position);
  const longestDrive = awards
    .filter((a) => a.prize.category === 'longest_drive')
    .sort((x, y) => x.prize.position - y.prize.position);
  const closestToPin = awards
    .filter((a) => a.prize.category === 'closest_to_pin')
    .sort((x, y) => x.prize.position - y.prize.position);
  const sideCount = longestDrive.length + closestToPin.length;

  function sideLabel(base: string, position: number, total: number): string {
    return total > 1 ? `${base} ${position}` : base;
  }

  return (
    <Card className="mx-4">
      <div className="space-y-4" data-testid="prize-awards-card">
        <h3 className="font-serif text-[19px] font-medium tracking-[-0.01em] text-text">
          {t('awardsTitle')}
        </h3>

        {placements.length > 0 && (
          <ul className="space-y-3">
            {placements.map((a) => (
              <li key={`placement-${a.prize.position}`} className="flex gap-2.5">
                <span aria-hidden className="shrink-0 text-base leading-6">
                  {MEDALS[a.prize.position - 1] ?? '•'}
                </span>
                <AwardLine
                  award={a}
                  label={t('placementLabel', { position: a.prize.position })}
                />
              </li>
            ))}
          </ul>
        )}

        {sideCount > 0 && (
          <ul className="space-y-3 border-t border-border/60 pt-3">
            {longestDrive.map((a) => (
              <li key={`ld-${a.prize.position}`}>
                <AwardLine
                  award={a}
                  label={sideLabel(t('ldLabel'), a.prize.position, longestDrive.length)}
                />
              </li>
            ))}
            {closestToPin.map((a) => (
              <li key={`ctp-${a.prize.position}`}>
                <AwardLine
                  award={a}
                  label={sideLabel(t('ctpLabel'), a.prize.position, closestToPin.length)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function AwardLine({ award, label }: { award: PrizeAward; label: string }) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-text">
        <span className="font-medium">{label}</span>
        <span className="text-muted"> · </span>
        <span className="font-serif">{award.prize.description}</span>
      </p>
      <p className="mt-0.5 font-serif text-base text-text">
        {award.winners.join(' · ')}
      </p>
      <SponsorCredit
        sponsor={award.prize.sponsor}
        sponsorLogoPath={award.prize.sponsorLogoPath}
      />
    </div>
  );
}
