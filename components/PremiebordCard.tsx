'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { SponsorCredit } from '@/components/SponsorCredit';
import type { GamePrize } from '@/lib/games/prizes';

/**
 * #1051: viser premiebordet til spillerne før (og under) runden — på spill-hjem
 * og i påmeldingsflyten. Gruppert: plasseringer (🥇/🥈/🥉) først, deretter
 * sideturneringer (LD/CTP). Sponsor vises diskret per linje via SponsorCredit
 * (logo når slottet har en, ellers «Sponset av {navn}» — #1052). Returnerer
 * null når det ikke finnes premier (feature av).
 *
 * `variant='full'` (default) pakkes i et eget Card; `variant='compact'` er en
 * rammeløs seksjon ment for innmontering inne i et eksisterende Card (signup).
 *
 * Premie-beskrivelser og sponsornavn er brukerdata — vises verbatim (Reacts
 * escaping holder; ingen mail, ingen dangerouslySetInnerHTML).
 */

const MEDALS = ['🥇', '🥈', '🥉'] as const;

export function PremiebordCard({
  prizes,
  variant = 'full',
}: {
  prizes: GamePrize[];
  variant?: 'full' | 'compact';
}) {
  const t = useTranslations('prizes');

  if (prizes.length === 0) return null;

  const placements = prizes
    .filter((p) => p.category === 'placement')
    .sort((a, b) => a.position - b.position);
  const longestDrive = prizes
    .filter((p) => p.category === 'longest_drive')
    .sort((a, b) => a.position - b.position);
  const closestToPin = prizes
    .filter((p) => p.category === 'closest_to_pin')
    .sort((a, b) => a.position - b.position);
  const sideCount = longestDrive.length + closestToPin.length;

  function sideLabel(base: string, position: number, total: number): string {
    return total > 1 ? `${base} ${position}` : base;
  }

  const body = (
    <div className="space-y-4" data-testid="premiebord-card">
      <h3
        className={
          variant === 'compact'
            ? 'font-serif text-base font-medium tracking-[-0.01em] text-text'
            : 'font-serif text-[19px] font-medium tracking-[-0.01em] text-text'
        }
      >
        {t('boardTitle')}
      </h3>

      {placements.length > 0 && (
        <ul className="space-y-2">
          {placements.map((p) => (
            <li key={`placement-${p.position}`} className="flex gap-2.5">
              <span aria-hidden className="shrink-0 text-base leading-6">
                {MEDALS[p.position - 1] ?? '•'}
              </span>
              <PrizeLine
                label={t('placementLabel', { position: p.position })}
                prize={p}
              />
            </li>
          ))}
        </ul>
      )}

      {sideCount > 0 && (
        <ul className="space-y-2 border-t border-border/60 pt-3">
          {longestDrive.map((p) => (
            <li key={`ld-${p.position}`}>
              <PrizeLine
                label={sideLabel(t('ldLabel'), p.position, longestDrive.length)}
                prize={p}
              />
            </li>
          ))}
          {closestToPin.map((p) => (
            <li key={`ctp-${p.position}`}>
              <PrizeLine
                label={sideLabel(t('ctpLabel'), p.position, closestToPin.length)}
                prize={p}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (variant === 'compact') {
    return (
      <div className="rounded-xl border border-border bg-surface-2 px-4 py-3.5">
        {body}
      </div>
    );
  }
  return <Card>{body}</Card>;
}

function PrizeLine({ label, prize }: { label: string; prize: GamePrize }) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-text">
        <span className="font-medium">{label}</span>
        <span className="text-muted"> · </span>
        <span className="font-serif">{prize.description}</span>
      </p>
      <SponsorCredit
        sponsor={prize.sponsor}
        sponsorLogoPath={prize.sponsorLogoPath}
      />
    </div>
  );
}
