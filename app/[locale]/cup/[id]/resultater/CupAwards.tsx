import { useLocale, useTranslations } from 'next-intl';
import { formatPoints } from '@/lib/cup/formatPoints';
import type { CupMvpAward, CupUnderperformerAward } from '@/lib/cup/computeCupAwards';

/**
 * Cupens to seremonikåringer på resultatsiden (#1508). Ren, ikke-async
 * server-komponent — ingen `'use client'`, ingen klient-JS.
 *
 * MVP får gull-aksenten (samme champagne-tint som vinnerlagets totalkort);
 * «dro ned mest» står nøytralt under — den er en humor-kåring i kompis-tonen
 * og skal aldri se ut som en gapestokk.
 *
 * Begge kåringene kan være null (ingen datagrunnlag), og da vises de ikke.
 * Aggregeringen bor i `computeCupAwards` — her er det ren visning.
 */

const GOLD_CARD_STYLE = {
  background: 'linear-gradient(180deg, rgba(201, 169, 97, 0.12), rgba(201, 169, 97, 0.04))',
  borderColor: 'rgba(201, 169, 97, 0.45)',
  borderWidth: '1px',
  borderStyle: 'solid',
} as const;

export function CupAwards({
  mvp,
  underperformer,
}: {
  mvp: CupMvpAward | null;
  underperformer: CupUnderperformerAward | null;
}) {
  const t = useTranslations('cup');
  const locale = useLocale();

  if (!mvp && !underperformer) return null;

  // Delt kåring: «Per og Pål». 'no' → 'nb' så Intl gir norsk konjunksjon
  // (samme grep som SponsorStrip).
  const listLocale = locale === 'no' ? 'nb' : locale;
  const join = (names: string[]) =>
    new Intl.ListFormat(listLocale, { type: 'conjunction' }).format(names);

  return (
    <section className="mb-8" data-testid="cup-awards">
      <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">
        {t('results.awardsHeading')}
      </h2>

      {mvp && (
        <div className="rounded-2xl p-5 text-center" style={GOLD_CARD_STYLE} data-testid="cup-award-mvp">
          <p
            className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: 'var(--accent)' }}
          >
            {t('results.mvpLabel')}
          </p>
          <p className="font-serif text-2xl text-text mt-1.5 leading-tight">{join(mvp.names)}</p>
          <p className="text-xs text-muted mt-1 tabular-nums">
            {t('results.mvpValue', { points: formatPoints(mvp.points) })}
          </p>
        </div>
      )}

      {underperformer && (
        <div
          className="mt-3 rounded-2xl border border-border bg-surface p-4 text-center"
          data-testid="cup-award-underperformer"
        >
          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            {t('results.underperformerLabel')}
          </p>
          <p className="font-serif text-lg text-text mt-1.5 leading-tight">
            {join(underperformer.names)}
          </p>
          <p className="text-xs text-muted mt-1 tabular-nums">
            {t('results.underperformerValue', { strokes: underperformer.overPar })}
          </p>
        </div>
      )}
    </section>
  );
}
