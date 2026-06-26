'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import type { SeasonSummary } from '@/lib/stats/seasonStats';

type Props = {
  /** Sesonger nyeste år først (fra `computeSeasonStats`). */
  seasons: SeasonSummary[];
};

const BRAG_KEYS = ['holeInOne', 'eagle', 'birdie', 'turkey'] as const;

/**
 * «Sesongen din» (#946) — sesong-recap øverst i Statistikk-fanen. År-velger +
 * runder/snitt/beste + bragd-stripe, med en «sammenlignet med i fjor»-delta.
 * Snowman vises bevisst SEPARAT fra bragdene (en snømann er ikke en bragd).
 *
 * Klient-komponent fordi år-velgeren trenger lokal state; tallene er regnet i
 * `computeSeasonStats`, så denne er rent presentasjonell.
 */
export function SeasonRecapPanel({ seasons }: Props) {
  const t = useTranslations('profile.historikk');
  const [selectedYear, setSelectedYear] = useState<number | null>(
    seasons[0]?.year ?? null,
  );

  if (seasons.length === 0) {
    return (
      <Card>
        <h2 className="font-serif text-base font-medium text-text mb-1">
          {t('seasonHeading')}
        </h2>
        <p className="font-sans text-sm text-muted leading-relaxed">
          {t('seasonEmpty')}
        </p>
      </Card>
    );
  }

  const selected = seasons.find((s) => s.year === selectedYear) ?? seasons[0];
  const previous = seasons.find((s) => s.year === selected.year - 1) ?? null;

  const brags = BRAG_KEYS.map((key) => ({
    key,
    count: selected.achievements[key],
    label: t(`seasonBrag_${key}` as Parameters<typeof t>[0]),
  })).filter((b) => b.count > 0);

  const snowmen = selected.achievements.snowman;

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 pt-4 pb-3">
        <h2 className="font-serif text-base font-medium text-text leading-snug">
          {t('seasonHeading')}
        </h2>
        <p className="font-sans text-sm text-muted mt-0.5">
          {t('seasonSubtitle')}
        </p>
      </div>

      {seasons.length > 1 && (
        <div
          className="flex gap-2 overflow-x-auto px-5 pb-3"
          role="tablist"
          aria-label={t('seasonYearAriaLabel')}
        >
          {seasons.map((s) => {
            const active = s.year === selected.year;
            return (
              <button
                key={s.year}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedYear(s.year)}
                className={`shrink-0 rounded-full px-4 min-h-[36px] font-sans text-sm tabular-nums transition-colors ${
                  active
                    ? 'bg-primary text-white'
                    : 'border border-border text-muted hover:text-text'
                }`}
              >
                {s.year}
              </button>
            );
          })}
        </div>
      )}

      <div className="border-t border-border px-5 py-4">
        <div className="grid grid-cols-3 gap-3">
          <SeasonStatTile
            label={t('seasonColRounds')}
            value={String(selected.rounds)}
            delta={previous ? selected.rounds - previous.rounds : null}
          />
          <SeasonStatTile
            label={t('seasonColAvg')}
            value={
              selected.grossAverage != null ? String(selected.grossAverage) : '–'
            }
            delta={
              previous &&
              selected.grossAverage != null &&
              previous.grossAverage != null
                ? selected.grossAverage - previous.grossAverage
                : null
            }
          />
          <SeasonStatTile
            label={t('seasonColBest')}
            value={selected.bestRound != null ? String(selected.bestRound) : '–'}
            delta={
              previous &&
              selected.bestRound != null &&
              previous.bestRound != null
                ? selected.bestRound - previous.bestRound
                : null
            }
          />
        </div>

        {previous && (
          <p className="mt-2 font-sans text-xs text-muted">
            {t('seasonVsPrevious', { year: String(previous.year) })}
          </p>
        )}

        {brags.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              {t('seasonBragderLabel')}
            </p>
            <div className="flex flex-wrap gap-2">
              {brags.map((b) => (
                <span
                  key={b.key}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-3 py-1 font-sans text-[13px] text-text"
                >
                  <span>{b.label}</span>
                  <span className="font-semibold tabular-nums text-primary">
                    {b.count}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {snowmen > 0 && (
          <p className="mt-3 font-sans text-xs text-muted">
            {t('seasonSnowman', { count: snowmen })}{' '}
            <span className="opacity-80">{t('seasonSnowmanCaption')}</span>
          </p>
        )}
      </div>
    </Card>
  );
}

function SeasonStatTile({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: number | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg/50 px-3 py-3 text-center">
      <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-muted leading-none mb-1.5">
        {label}
      </p>
      <p className="font-serif text-2xl font-medium text-text tabular-nums leading-none">
        {value}
      </p>
      {delta != null && delta !== 0 && (
        <p className="mt-1.5 font-sans text-[11px] tabular-nums text-muted leading-none">
          {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
        </p>
      )}
    </div>
  );
}
