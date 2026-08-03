import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { LinkButton } from '@/components/ui/Button';
import { Kicker } from '@/components/ui/Kicker';
import { PageHeader } from '@/components/ui/PageHeader';
import { routing, type AppLocale } from '@/i18n/routing';
import {
  ARRANGE_AUDIENCES,
  type ArrangeAudience,
} from '@/lib/seo/arrangeAudiences';
import { canonicalPath } from '@/lib/seo/canonical';

type Params = Promise<{ audience: string; locale: string }>;

/** One guide section: an anchor id, a search-friendly heading and its prose. */
type GuideSection = { id: string; heading: string; body: string };
/** One FAQ pair. Same shape as `landing.faq` (AnonLanding), deliberately. */
type FaqEntry = { q: string; a: string };
/** One audience entry under `arrangeGuide.audiences.<slug>`. */
type AudienceContent = {
  metaTitle: string;
  metaDescription: string;
  pageTitle: string;
  pageSubtitle: string;
  intro: string;
  sections: GuideSection[];
  faq: FaqEntry[];
};

// Valid slugs = the shared audience list. Same source the hub's cards and the
// sitemap read, so the three can never drift apart (AGENTS.md trap 4).
const VALID_AUDIENCES = new Set<string>(ARRANGE_AUDIENCES);

const contentKey = (audience: ArrangeAudience) =>
  `audiences.${audience}` as const;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { audience, locale: rawLocale } = await params;
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'arrangeGuide' });
  // Unknown slug renders notFound() below; fall back to the hub's title so the
  // 404 never ships a key name as its <title>.
  if (!VALID_AUDIENCES.has(audience)) return { title: t('metaTitle') };
  const content = t.raw(
    contentKey(audience as ArrangeAudience),
  ) as AudienceContent;
  return {
    title: content.metaTitle,
    description: content.metaDescription,
    alternates: {
      canonical: canonicalPath(locale, `/arranger-golfturnering/${audience}`),
    },
  };
}

/**
 * Målgruppe-underside under pilarsiden «Arranger golfturnering» (#1267,
 * epic #1021 «Vindu ut»). Én rute, tre sider: firmagolf, vennegjeng og
 * klubbkveld. Hub-en tar den generelle how-to-intensjonen; hver underside tar
 * sitt eget long-tail-søk («golfturnering for firmaet», «golfturnering med
 * vennegjengen», «klubbkveld med golfturnering») med egen tittel og
 * beskrivelse, så ingen av dem kannibaliserer hverandre eller forsiden.
 *
 * Auth-valgfri via `AUTH_OPTIONAL_PATH_PATTERN` i proxy.ts — mønsteret dekker
 * allerede understier under `arranger-golfturnering`. IKKE PUBLIC, som ville
 * strippet verified-user-headeren og kostet innloggede bunn-nav-en (fella
 * #1185).
 *
 * Alt innhold fra `arrangeGuide.audiences.<slug>` (no + en). Ingen DB, ingen
 * request-time IO, ingen caching-direktiver: siden er statisk under
 * cacheComponents, akkurat som /spillformater/[slug].
 *
 * `faq` mater BÅDE den synlige FAQ-en og FAQPage-JSON-LD-en fra samme array
 * (AnonLanding-mønsteret), så Googles krav om identisk tekst er oppfylt per
 * konstruksjon. 404 for ugyldig slug.
 */
export default async function ArrangeAudiencePage({
  params,
}: {
  params: Params;
}) {
  const { audience } = await params;

  if (!VALID_AUDIENCES.has(audience)) {
    notFound();
  }

  const t = await getTranslations('arrangeGuide');
  const content = t.raw(
    contentKey(audience as ArrangeAudience),
  ) as AudienceContent;

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: content.faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };

  return (
    <AppShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div data-testid="arrange-guide-audience" className="space-y-10">
        <div>
          <header className="mb-4 flex items-center gap-3">
            <BackLink href="/arranger-golfturnering">
              {t('audienceBackLabel')}
            </BackLink>
          </header>

          <Kicker tone="accent" className="mb-2">
            {t('kicker')}
          </Kicker>
          <PageHeader
            title={content.pageTitle}
            subtitle={content.pageSubtitle}
          />

          <div className="whitespace-pre-line font-sans text-[15px] leading-relaxed text-muted">
            {content.intro}
          </div>
        </div>

        {/* Guiden — hver seksjon er sitt eget ankermål. */}
        <div className="space-y-8">
          {content.sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-6">
              <h2 className="mb-3 font-serif text-[20px] font-medium leading-snug tracking-[-0.015em] text-text">
                {section.heading}
              </h2>
              <div className="whitespace-pre-line font-sans text-[15px] leading-relaxed text-text">
                {section.body}
              </div>
            </section>
          ))}
        </div>

        {/* FAQ — samme array som FAQPage-JSON-LD-en over. */}
        <section>
          <h2 className="font-serif text-[20px] font-medium leading-snug tracking-[-0.015em] text-text">
            {t('faqHeading')}
          </h2>
          <dl className="mt-5 space-y-5">
            {content.faq.map((item) => (
              <div key={item.q}>
                <dt className="font-sans text-[15px] font-semibold text-text">
                  {item.q}
                </dt>
                <dd className="mt-1.5 font-sans text-[14px] leading-relaxed text-muted">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Slutt-CTA — /demo er PUBLIC (proxy.ts), så en anonym leser som kom
            hit fra søk kan prøve appen uten å logge inn først. */}
        <section className="rounded-2xl border border-border bg-surface px-4 py-5 text-center">
          <h2 className="font-serif text-[18px] font-medium tracking-[-0.01em] text-text">
            {t('ctaHeading')}
          </h2>
          <p className="mt-2 font-sans text-[14px] leading-relaxed text-muted">
            {t('ctaBody')}
          </p>
          <div className="mt-4">
            <LinkButton
              href="/demo"
              full
              data-testid="arrange-guide-audience-demo-cta"
            >
              {t('ctaPrimary')}
            </LinkButton>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
