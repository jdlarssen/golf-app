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

/** One rules section: a search-friendly sub-heading plus its prose body. */
type ContentSection = { heading: string; body: string };
/** One FAQ pair. Same shape as `landing.faq` (AnonLanding), deliberately. */
type FaqEntry = { q: string; a: string };

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
 * Detaljside per spillform (#308, utvidet i #1266). Viser sammendrag + punkter
 * + regel-prosa + konkret eksempel + FAQ. Innhold er katalog-drevet via
 * `formatGuide.content.<slug>` (i18n Fase D, #592). Detaljsiden er per-slug
 * (én per GameMode) — 4BBB-varianten har ingen egen slug og viser
 * stableford-innholdet.
 *
 * Regel-prosaen finnes i to former i katalogen: `sections[]` (mellomtitler +
 * avsnitt) for formatene som er skrevet ut i full lengde, og det flate
 * `long`-feltet for resten. `sections` vinner når det finnes; formatene som har
 * det, har ikke `long` i det hele tatt, så det er aldri to kilder til samme
 * tekst.
 *
 * `faq` er valgfritt og mater BÅDE den synlige FAQ-en og FAQPage-JSON-LD-en fra
 * samme array (AnonLanding-mønsteret) — Googles krav om identisk tekst er
 * dermed oppfylt per konstruksjon. Sider uten `faq` får ingen markup.
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
    sections?: ContentSection[];
    faq?: FaqEntry[];
  };
  const sections = content.sections?.length ? content.sections : null;
  const faq = content.faq?.length ? content.faq : null;
  const merged = {
    summary: content.summary,
    points: content.points,
    long: content.long ?? null,
    example: content.example ?? null,
  };

  const faqJsonLd = faq && {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };

  return (
    <AppShell>
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}

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

      {/* Rules prose — sections when the format is written out in full,
          otherwise the flat long field. Never both. */}
      {sections ? (
        <div className="mt-6 space-y-6">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-serif text-[18px] font-medium tracking-[-0.01em] text-text mb-3">
                {section.heading}
              </h2>
              <div className="text-[15px] text-text leading-relaxed whitespace-pre-line">
                {section.body}
              </div>
            </section>
          ))}
        </div>
      ) : (
        merged.long && (
          <div className="mt-6">
            <h2 className="font-serif text-[18px] font-medium tracking-[-0.01em] text-text mb-3">
              {tFg('detailHowItWorks')}
            </h2>
            <div className="text-[15px] text-text leading-relaxed whitespace-pre-line">
              {merged.long}
            </div>
          </div>
        )
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

      {/* FAQ — same array as the FAQPage JSON-LD above */}
      {faq && (
        <div className="mt-6">
          <h2 className="font-serif text-[18px] font-medium tracking-[-0.01em] text-text mb-3">
            {tFg('detailFaqHeading')}
          </h2>
          <dl className="space-y-4">
            {faq.map((item) => (
              <div key={item.q}>
                <dt className="font-sans text-[15px] font-medium text-text">
                  {item.q}
                </dt>
                <dd className="mt-1 text-[15px] text-muted leading-relaxed">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </AppShell>
  );
}
