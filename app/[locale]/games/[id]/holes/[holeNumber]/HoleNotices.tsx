'use client';

// De små, ikke-interaktive notisene rundt score-lista på hull-flaten
// (#1716 — ren flytting ut av `HoleClient`). Hver av dem rendrer ingenting
// når vilkåret ikke er oppfylt, akkurat som `&&`-gatene de erstattet.

import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';

/**
 * Stableford-subtittel: «Dine poeng: N». Erstatter den implisitte
 * «Lagets totalsum»-narrativen for solo-modus. Plassert som en stille
 * chip-stil under headeren, før hull-stripa — informativ uten å rope.
 * Bruker tabular-nums for at totalen ikke vippes hver gang tallet
 * oppdaterer.
 */
export function StablefordTotalSubtitle({
  isStableford,
  total,
}: {
  isStableford: boolean;
  total: number | null;
}): JSX.Element | null {
  const t = useTranslations('holes');
  if (!isStableford || total === null) return null;
  return (
    <div
      data-testid="stableford-total-subtitle"
      style={{
        display: 'flex',
        justifyContent: 'center',
        padding: '0 18px 6px',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 10.5,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.18em',
          color: 'var(--text-muted)',
        }}
      >
        {t('entry.myPoints')}{' '}
        <span
          className="score-num"
          style={{
            color: 'var(--accent-text)',
            fontFamily: 'var(--font-serif)',
            fontSize: 13,
            marginLeft: 2,
          }}
        >
          {total}
        </span>
      </span>
    </div>
  );
}

/**
 * WD-banner: vises øverst i score-lista når innlogget spiller er
 * trukket (#386). Lenker til game-home for angre-knapp.
 */
export function WithdrawnBanner({
  withdrawn,
  gameId,
}: {
  withdrawn: boolean;
  gameId: string;
}): JSX.Element | null {
  const t = useTranslations('holes');
  if (!withdrawn) return null;
  return (
    <div
      data-testid="withdrawn-banner"
      style={{
        margin: '0 14px 8px',
        padding: '10px 14px',
        borderRadius: 12,
        border: '1px solid var(--danger)',
        background: 'var(--danger-soft, color-mix(in srgb, var(--danger) 10%, transparent))',
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--text)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      <span>{t('banners.withdrawn')}</span>
      <SmartLink
        href={`/games/${gameId}`}
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text)',
          textDecoration: 'underline',
          textUnderlineOffset: 2,
          whiteSpace: 'nowrap',
        }}
      >
        {t('banners.withdrawnUndo')}
      </SmartLink>
    </div>
  );
}

/**
 * #1058: passiv påminnelse om at flight-kamerater ikke har tastet
 * scoren sin på dette hullet — CTA-en gater ikke lenger på dette (kun
 * på mitt eget/lagets kort), så dette er den eneste nudge-en som er
 * igjen for å fylle inn for en passiv medspiller. Vises i alle
 * moduser med flere kort, inkl. matchplay/skins/wolf der en manglende
 * motstander-score lar hullet stå uavgjort på leaderboardet.
 */
export function MissingFlightScoresHint({
  count,
}: {
  count: number;
}): JSX.Element | null {
  const t = useTranslations('holes');
  if (count <= 0) return null;
  return (
    <div
      data-testid="missing-flight-scores-hint"
      style={{
        textAlign: 'center',
        marginTop: -4,
        marginBottom: 6,
        fontFamily: 'var(--font-sans)',
        fontSize: 11.5,
        color: 'var(--text-muted)',
      }}
    >
      {t('entry.missingFlightScores', { count })}
    </div>
  );
}
