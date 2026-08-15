import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { LinkButton } from '@/components/ui/Button';
import { Kicker } from '@/components/ui/Kicker';
import { PageHeader } from '@/components/ui/PageHeader';
import { SmartLink } from '@/components/ui/SmartLink';
import { getFormatGuideEntries } from '@/lib/formats/buildFormatGuide';
import { FEATURED_FORMAT_KEYS } from '@/lib/formats/featuredFormats';
import { routing, type AppLocale } from '@/i18n/routing';
import { ARRANGE_AUDIENCES } from '@/lib/seo/arrangeAudiences';
import { canonicalPath } from '@/lib/seo/canonical';

type Params = Promise<{ locale: string }>;

/** One guide section: an anchor id, a search-friendly heading and its prose. */
type GuideSection = { id: string; heading: string; body: string };
/** One FAQ pair. Same shape as `landing.faq` (AnonLanding), deliberately. */
type FaqEntry = { q: string; a: string };
/** The two catalog fields an audience card shows — the subpage's own headline. */
type AudienceCard = { pageTitle: string; pageSubtitle: string };

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'arrangeGuide' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: canonicalPath(locale, '/arranger-golfturnering'),
    },
  };
}

/**
 * Pilarside «Arranger golfturnering» (#1267, epic #1021 «Vindu ut»).
 *
 * Den offentlige how-to-siden, og hub for de tre målgruppe-undersidene. En
 * fremmed (eller Googlebot) leser hele den generelle oppskriften på å arrangere
 * en golfturnering UTEN å logge inn, og velger deretter kort inn i sin egen
 * variant: firmagolf, vennegjeng eller klubbkveld (`[audience]/page.tsx`).
 * Forsiden tar verktøy-intensjonen («golfturnering app»); denne siden tar den
 * generelle how-to-intensjonen, og hver underside sitt eget long-tail-søk — så
 * metadataene her målretter bevisst andre fraser enn `landing.metaTitle` og enn
 * undersidene (ingen kannibalisering).
 *
 * Auth-valgfri via `AUTH_OPTIONAL_PATH_PATTERN` i proxy.ts — IKKE PUBLIC, som
 * ville strippet verified-user-headeren og kostet innloggede bunn-nav-en
 * (fella #1185 dokumenterer).
 *
 * Alt innhold fra `arrangeGuide.*`-katalogen (no + en). Ingen DB, ingen
 * request-time IO, ingen caching-direktiver: siden er statisk under
 * cacheComponents, akkurat som /spillformater.
 *
 * `faq` mater BÅDE den synlige FAQ-en og FAQPage-JSON-LD-en fra samme array
 * (AnonLanding-mønsteret), så Googles krav om identisk tekst er oppfylt per
 * konstruksjon. Kun FAQPage: Google fjernet HowTo-rich-results i 2023.
 */
export default async function ArrangerGolfturneringPage() {
  const t = await getTranslations('arrangeGuide');

  const sections = t.raw('sections') as GuideSection[];
  const faq = t.raw('faq') as FaqEntry[];

  // Format-velgeren gjenbruker den delte kureringen (lib/formats/featuredFormats)
  // og katalog-byggeren, så etiketter og sammendrag er de samme som på forsiden
  // og /spillformater — én editorial liste, ett hjem.
  const formatEntries = await getFormatGuideEntries();
  const byKey = new Map(formatEntries.map((entry) => [entry.key, entry]));
  const formatCards = FEATURED_FORMAT_KEYS.map((key) => byKey.get(key)).filter(
    (entry): entry is NonNullable<typeof entry> => Boolean(entry),
  );

  const faqJsonLd = {
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div data-testid="arrange-guide" className="space-y-10">
        <div>
          <header className="mb-4 flex items-center gap-3">
            <BackLink href="/">{t('backLabel')}</BackLink>
          </header>

          <Kicker tone="accent" className="mb-2">
            {t('kicker')}
          </Kicker>
          <PageHeader
            title={t('pageTitle')}
            subtitle={t('pageSubtitle')}
          />

          <div className="whitespace-pre-line font-sans text-[15px] leading-relaxed text-muted">
            {t('intro')}
          </div>
        </div>

        {/* Målgruppe-kort — hub-ens viktigste veivalg, derfor over ankermenyen.
            Titler og ingresser leses fra undersidenes egne katalog-felt, så
            kortet og siden det peker på aldri kan si to ulike ting. */}
        <section>
          <h2 className="font-serif text-[20px] font-medium leading-snug tracking-[-0.015em] text-text">
            {t('audiencesHeading')}
          </h2>
          <p className="mt-3 font-sans text-[15px] leading-relaxed text-muted">
            {t('audiencesIntro')}
          </p>
          <div className="mt-5 grid gap-3">
            {ARRANGE_AUDIENCES.map((audience) => {
              const card = t.raw(`audiences.${audience}`) as AudienceCard;
              return (
                <SmartLink
                  key={audience}
                  href={`/arranger-golfturnering/${audience}`}
                  data-testid="arrange-guide-audience-card"
                  className="flex min-h-[44px] flex-col gap-1.5 rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-primary-soft"
                >
                  <span className="font-serif text-[17px] leading-tight text-text">
                    {card.pageTitle}
                  </span>
                  <span className="font-sans text-[13px] leading-snug text-muted">
                    {card.pageSubtitle}
                  </span>
                </SmartLink>
              );
            })}
          </div>
        </section>

        {/* Ankermeny — siden er lang, så leseren skal kunne hoppe. Vanlig <a>,
            ikke SmartLink: en ren fragment-href har ingen rute å prefetche. */}
        <nav aria-labelledby="toc-heading">
          <h2
            id="toc-heading"
            className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted"
          >
            {t('tocHeading')}
          </h2>
          <ul className="mt-3 space-y-1">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="inline-flex min-h-[44px] items-center font-sans text-sm text-primary hover:text-primary-hover"
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Guiden — hver seksjon er sitt eget ankermål. */}
        <div className="space-y-8">
          {sections.map((section) => (
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

        {/* Format-velger */}
        <section>
          <h2 className="font-serif text-[20px] font-medium leading-snug tracking-[-0.015em] text-text">
            {t('formats.heading')}
          </h2>
          <p className="mt-3 font-sans text-[15px] leading-relaxed text-muted">
            {t('formats.intro')}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {formatCards.map((entry) => (
              <SmartLink
                key={entry.key}
                href={`/spillformater/${entry.mode}`}
                data-testid="arrange-guide-format-card"
                className="flex min-h-[44px] flex-col gap-1.5 rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-primary-soft"
              >
                <span className="font-serif text-[16px] leading-tight text-text">
                  {entry.label}
                </span>
                <span className="font-sans text-[12px] leading-snug text-muted">
                  {entry.summary}
                </span>
              </SmartLink>
            ))}
          </div>
          <div className="mt-4">
            <SmartLink
              href="/spillformater"
              className="inline-flex min-h-[44px] items-center font-sans text-sm font-medium text-primary hover:text-primary-hover"
            >
              {t('formats.linkLabel')}
              <span aria-hidden className="ml-1">
                →
              </span>
            </SmartLink>
          </div>
        </section>

        {/* FAQ — samme array som FAQPage-JSON-LD-en over. */}
        <section>
          <h2 className="font-serif text-[20px] font-medium leading-snug tracking-[-0.015em] text-text">
            {t('faqHeading')}
          </h2>
          <dl className="mt-5 space-y-5">
            {faq.map((item) => (
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
          <div className="mt-4 flex flex-col gap-3">
            <LinkButton href="/demo" full data-testid="arrange-guide-demo-cta">
              {t('ctaPrimary')}
            </LinkButton>
            <LinkButton href="/" full variant="secondary">
              {t('ctaSecondary')}
            </LinkButton>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
