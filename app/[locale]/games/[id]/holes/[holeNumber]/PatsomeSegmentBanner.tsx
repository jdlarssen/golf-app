import { useTranslations } from 'next-intl';

/**
 * Viser aktivt Patsome-segment på gjeldende hull med en kort regelforklaring.
 * Rent presentasjonskomponent — ingen logikk, ingen API-kall.
 *
 * Segment-grenser (hardkodet som i scoring-modulen):
 *   1–6   → 4BBB
 *   7–12  → Greensome
 *   13–18 → Foursomes
 */
export function PatsomeSegmentBanner({ holeNumber }: { holeNumber: number }) {
  const t = useTranslations('holes.patsome');
  const segment =
    holeNumber <= 6 ? 'fourball' : holeNumber <= 12 ? 'greensome' : 'foursomes';

  const config = {
    fourball: {
      labelKey: 'fourballLabel' as const,
      ruleKey: 'fourballRule' as const,
    },
    greensome: {
      labelKey: 'greensomeLabel' as const,
      ruleKey: 'greensomeRule' as const,
    },
    foursomes: {
      labelKey: 'foursomesLabel' as const,
      ruleKey: 'foursomesRule' as const,
    },
  } as const;

  const { labelKey, ruleKey } = config[segment];

  return (
    <div className="mb-3 rounded-md border border-border bg-bg/60 px-3 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="font-serif text-sm font-semibold text-primary">
          {t(labelKey)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted">{t(ruleKey)}</p>
    </div>
  );
}
