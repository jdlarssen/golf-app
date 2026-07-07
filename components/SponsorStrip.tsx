'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { GamePrize } from '@/lib/games/prizes';

/**
 * #1051: diskret sponsor-stripe på tavle-flatene (live-tavla, tilskuerlenke,
 * embed). «Premier sponset av {A} og {B}» — distinkte sponsornavn fra prizes,
 * deduplisert, med lokal-korrekt oppramsing (norsk «og», ingen Oxford-komma via
 * Intl.ListFormat). Returnerer null når ingen premie har sponsor.
 */
export function SponsorStrip({
  prizes,
  className,
}: {
  prizes: GamePrize[];
  className?: string;
}) {
  const t = useTranslations('prizes');
  const locale = useLocale();

  const sponsors = Array.from(
    new Set(
      prizes
        .map((p) => p.sponsor?.trim())
        .filter((s): s is string => s != null && s.length > 0),
    ),
  );
  if (sponsors.length === 0) return null;

  // 'no' → 'nb' så Intl gir «og» (norsk konjunksjon) i stedet for engelsk.
  const listLocale = locale === 'no' ? 'nb' : locale;
  const list = new Intl.ListFormat(listLocale, {
    type: 'conjunction',
  }).format(sponsors);

  return (
    <p
      className={`px-4 py-2 text-center text-[11px] text-muted ${className ?? ''}`}
    >
      {t('sponsorStrip', { sponsors: list })}
    </p>
  );
}
