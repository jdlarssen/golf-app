'use client';

import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { sponsorLogoUrl } from '@/lib/storage/sponsorLogoUrl';
import type { GamePrize } from '@/lib/games/prizes';

/**
 * #1051/#1052: diskret sponsor-stripe på tavle-flatene (live-tavla,
 * tilskuerlenke, embed). Slott med logo vises som logo (navnet blir alt-tekst
 * — eier-beslutning 2026-07-15); slott med bare navn beholder tekst-
 * oppramsingen «Premier sponset av {A} og {B}» (lokal-korrekt via
 * Intl.ListFormat). Samme logo på flere slott dedupliseres på path; et navn
 * som allerede står med logo gjentas ikke i tekstlinja. Returnerer null når
 * ingen premie har sponsor eller logo.
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

  const logos: Array<{ path: string; alt: string }> = [];
  const seenPaths = new Set<string>();
  const namesWithLogo = new Set<string>();
  for (const p of prizes) {
    if (!p.sponsorLogoPath) continue;
    const name = p.sponsor?.trim() ?? '';
    if (name) namesWithLogo.add(name);
    if (seenPaths.has(p.sponsorLogoPath)) continue;
    seenPaths.add(p.sponsorLogoPath);
    logos.push({ path: p.sponsorLogoPath, alt: name || t('logoAlt') });
  }

  const names = Array.from(
    new Set(
      prizes
        .map((p) => p.sponsor?.trim())
        .filter((s): s is string => s != null && s.length > 0),
    ),
  ).filter((name) => !namesWithLogo.has(name));

  if (logos.length === 0 && names.length === 0) return null;

  // 'no' → 'nb' så Intl gir «og» (norsk konjunksjon) i stedet for engelsk.
  const listLocale = locale === 'no' ? 'nb' : locale;
  const list =
    names.length > 0
      ? new Intl.ListFormat(listLocale, { type: 'conjunction' }).format(names)
      : null;

  return (
    <div
      data-testid="sponsor-strip"
      className={`space-y-1.5 px-4 py-2 ${className ?? ''}`}
    >
      {logos.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {logos.map((logo) => (
            <Image
              key={logo.path}
              src={sponsorLogoUrl(logo.path)}
              alt={logo.alt}
              width={112}
              height={28}
              unoptimized
              // Mørke logoer trenger lys bakplate i dark mode; i light er
              // linen-bakgrunnen nok.
              className="h-7 w-auto max-w-28 object-contain dark:rounded-sm dark:bg-white/90 dark:p-1"
            />
          ))}
        </div>
      )}
      {list && (
        <p className="text-center text-[11px] text-muted">
          {t('sponsorStrip', { sponsors: list })}
        </p>
      )}
    </div>
  );
}
