import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Kicker } from '@/components/ui/Kicker';
import { PageHeader } from '@/components/ui/PageHeader';
import { MODE_LABELS, type GameMode } from '@/lib/scoring/modes/types';
import { routing, type AppLocale } from '@/i18n/routing';
import { canonicalPath } from '@/lib/seo/canonical';

type Params = Promise<{ slug: string; locale: string }>;

// Gyldige slugs = alle GameMode-verdier, avledet fra MODE_LABELS-nøklene.
// Avledet (ikke hardkodet liste) så en ny modus automatisk får detaljside —
// unngår «glemte å legge til modus»-driften.
const VALID_MODES = new Set<string>(Object.keys(MODE_LABELS));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, locale: rawLocale } = await params;
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  const tFg = await getTranslations({ locale, namespace: 'formatGuide' });
  if (!VALID_MODES.has(slug)) return { title: tFg('detailFallbackMeta') };
  const mode = slug as GameMode;
  const tModes = await getTranslations({ locale, namespace: 'modes' });
  // Description reuses the format's own summary — already in the catalog, so
  // this stays in sync with the page content instead of drifting as new copy.
  const content = tFg.raw(`content.${mode}` as Parameters<typeof tFg.raw>[0]) as {
    summary: string;
  };
  return {
    title: tModes(mode as Parameters<typeof tModes>[0]) ?? slug,
    description: content.summary,
    alternates: { canonical: canonicalPath(locale, `/spillformater/${slug}`) },
  };
}

/**
 * Detaljside per spillform (#308). Viser sammendrag + punkter + regler_lang
 * (prosa) + regler_eksempel (konkret eksempel i en markert boks). Innhold er
 * katalog-drevet via `formatGuide.content.<slug>` (i18n Fase D, #592).
 * Detaljsiden er per-slug (én per GameMode) — 4BBB-varianten har ingen egen
 * slug og viser stableford-innholdet.
 *
 * 404 for ugyldig slug.
 */
export default async function SpillformDetailPage({ params }: { params: Params }) {
  const { slug } = await params;

  if (!VALID_MODES.has(slug)) {
    notFound();
  }

  const mode = slug as GameMode;

  const tFg = await getTranslations('formatGuide');
  const tModes = await getTranslations('modes');
  const label = tModes(mode as Parameters<typeof tModes>[0]) ?? slug;

  // Content from the message catalog. Detail page is per-slug (team_size 1),
  // so the content key is the mode itself — no variant lookup (i18n Fase D).
  const content = tFg.raw(
    `content.${mode}` as Parameters<typeof tFg.raw>[0],
  ) as {
    summary: string;
    points: string[];
    long?: string;
    example?: string;
  };
  const merged = {
    summary: content.summary,
    points: content.points,
    long: content.long ?? null,
    example: content.example ?? null,
  };

  return (
    <AppShell>
      <header className="mb-6 flex items-center gap-3">
        <BackLink href="/spillformater">{tFg('detailBackLabel')}</BackLink>
      </header>

      <Kicker tone="accent" className="mb-2">
        {tFg('detailKicker')}
      </Kicker>
      <PageHeader title={label} />

      {/* Summary + points */}
      <div className="space-y-3 mt-4">
        <p className="text-[15px] text-muted leading-relaxed">{merged.summary}</p>

        <ul className="space-y-2">
          {merged.points.map((point) => (
            <li key={point} className="flex gap-2 text-sm text-text">
              <span aria-hidden className="mt-[2px] text-primary shrink-0">
                ›
              </span>
              <span className="min-w-0 flex-1">{point}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Long prose — only rendered when seeded in DB */}
      {merged.long && (
        <div className="mt-6">
          <h2 className="font-serif text-[18px] font-medium tracking-[-0.01em] text-text mb-3">
            {tFg('detailHowItWorks')}
          </h2>
          <div className="text-[15px] text-text leading-relaxed whitespace-pre-line">
            {merged.long}
          </div>
        </div>
      )}

      {/* Example callout — only rendered when seeded in DB */}
      {merged.example && (
        <div className="mt-6">
          <h2 className="font-serif text-[18px] font-medium tracking-[-0.01em] text-text mb-3">
            {tFg('detailExample')}
          </h2>
          <div className="rounded-2xl border border-border bg-surface px-4 py-4">
            <p className="text-[14px] text-text leading-relaxed whitespace-pre-line">
              {merged.example}
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}
