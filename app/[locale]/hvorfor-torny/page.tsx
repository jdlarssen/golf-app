import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { BrandMark } from '@/components/ui/BrandMark';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { routing, type AppLocale } from '@/i18n/routing';
import { canonicalPath } from '@/lib/seo/canonical';
import { SectionHeading, TextLink, FooterLink } from '../marketing-primitives';

const ORIGIN = 'https://tornygolf.no';

type Params = Promise<{ locale: string }>;

/** Én tall-flis: stort tall, liten enhet, to-linjers undertekst. */
type Stat = { value: string; unit: string; label: string };
/** Én rad i sammenligningsmatrisen: hva Tørny gjør, hva som gjelder ellers. */
type MatrixRow = { feature: string; other: string };
/** Én rad på eksempel-tavla. Rekkefølgen i arrayet ER plasseringen. */
type BoardRow = { name: string; points: string };
/** Sideturnerings-chip under tavla. */
type Chip = { icon: string; label: string };
/** Ett ikon-punkt i «Spisset for turneringen». */
type IconPoint = { icon: string; title: string; body: string };
/** Ett FAQ-par. Samme form som `landing.faq`, bevisst. */
type FaqEntry = { q: string; a: string };

function resolveLocale(raw: string): AppLocale {
  return routing.locales.includes(raw as AppLocale)
    ? (raw as AppLocale)
    : routing.defaultLocale;
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'whyTorny' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { canonical: canonicalPath(locale, '/hvorfor-torny') },
  };
}

/**
 * «Dette får du i Tørny» (#1419) — den offentlige sammenligningssida.
 *
 * Svarer på det ene spørsmålet forsiden ikke tar: hvorfor Tørny og ikke en
 * vanlig golf-app? Struktur og all norsk copy er løftet fra den godkjente
 * mockup v3 (`docs/superpowers/specs/2026-07-31-hvorfor-torny-mockup.html`);
 * designbeslutningene bak står i søsterfila `-design.md`. Sida er bevisst
 * visuell — tall-fliser, hake-matrise og eksempel-tavle i stedet for prosa —
 * fordi eieren avviste den tekst-tunge v1.
 *
 * Sammenligningen er generisk: ingen konkurrent navngis, og påstandene om
 * «andre apper» holdes myke («Krever abonnement», «Varierer») så ingenting på
 * sida ruster når andre endrer priser. Copy-vaktene (native app kommer, jf.
 * epic #1276, så poenget er at ingen MÅ installere; gratis-copy beskriver
 * nåtid, aldri evige løfter) er forankret i kontrakten.
 *
 * Auth-valgfri via `AUTH_OPTIONAL_PATH_PATTERN` i proxy.ts — IKKE PUBLIC, som
 * ville strippet verified-user-headeren og kostet innloggede bunn-nav-en
 * (fella #1185 dokumenterer).
 *
 * Helt statisk: ingen DB, ingen request-time IO, ingen caching-direktiver.
 * Tavla er et pyntet eksempel med fiktive navn, ikke ekte data.
 *
 * `faq` mater BÅDE den synlige FAQ-en og FAQPage-JSON-LD-en fra samme array
 * (AnonLanding-mønsteret), så Googles krav om identisk tekst er oppfylt per
 * konstruksjon. Grafen har WebPage + FAQPage og REFERERER WebSite-noden på
 * forsiden — den dupliseres ikke hit.
 */
export default async function HvorforTornyPage({
  params,
}: {
  params: Params;
}) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations('whyTorny');

  const stats = t.raw('stats') as Stat[];
  const matrixRows = t.raw('matrix.rows') as MatrixRow[];
  const boardRows = t.raw('board.rows') as BoardRow[];
  const chips = t.raw('board.chips') as Chip[];
  const iconPoints = t.raw('points.items') as IconPoint[];
  const faq = t.raw('faq') as FaqEntry[];

  const canonical = canonicalPath(locale, '/hvorfor-torny');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${ORIGIN}${canonical}#webpage`,
        url: `${ORIGIN}${canonical}`,
        name: t('metaTitle'),
        description: t('metaDescription'),
        inLanguage: locale === 'no' ? 'nb' : 'en',
        // Referanse, ikke duplikat: WebSite-noden defineres på forsiden.
        isPartOf: { '@id': `${ORIGIN}/#website` },
      },
      {
        '@type': 'FAQPage',
        '@id': `${ORIGIN}${canonical}#faq`,
        mainEntity: faq.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
  };

  return (
    <AppShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div data-testid="why-torny" className="space-y-12">
        {/* 1 · Topprad ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <BrandMark />
          <div className="flex items-center gap-3">
            <LocaleSwitcher />
            <SmartLink
              href="/login"
              data-testid="why-torny-login-cta"
              className="inline-flex min-h-[44px] items-center font-sans text-sm font-medium text-text hover:text-primary"
            >
              {t('loginCta')}
            </SmartLink>
          </div>
        </div>

        {/* 2 · Hero ────────────────────────────────────────────────── */}
        <section className="text-center">
          <h1 className="font-serif text-[33px] font-medium leading-[1.12] tracking-[-0.02em] text-text">
            {t('hero.h1')}
          </h1>
          <p className="mx-auto mt-3.5 max-w-[320px] font-sans text-[15px] leading-relaxed text-muted">
            {t('hero.sub')}
          </p>
        </section>

        {/* 3 · Tall-fliser ─────────────────────────────────────────── */}
        {/* Store frittstående tall bruker proporsjonale siffer (INGEN
            tabular-nums) — tabulære siffer er for kolonner som skal
            bunnjusteres, som poengkolonnen på tavla under. */}
        <section>
          <div className="grid grid-cols-2 gap-3">
            {stats.map((stat, index) => (
              <StatTile key={stat.label} stat={stat} gold={index === 0} />
            ))}
          </div>
        </section>

        {/* 4 · Hake-matrisen ───────────────────────────────────────── */}
        <section>
          <SectionHeading>{t('matrix.heading')}</SectionHeading>
          <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface">
            <table className="w-full table-fixed">
              <thead>
                <tr className="bg-surface-2 font-sans text-[10.5px] font-bold uppercase tracking-[0.1em]">
                  <th scope="col" className="px-4 py-3 text-left">
                    <span className="sr-only">{t('matrix.featureCol')}</span>
                  </th>
                  <th scope="col" className="w-[74px] px-1 py-3 text-primary">
                    {t('matrix.colTorny')}
                  </th>
                  <th
                    scope="col"
                    className="w-[92px] px-1 py-3 text-muted opacity-70"
                  >
                    {t('matrix.colOther')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {matrixRows.map((row) => (
                  <tr key={row.feature} className="border-t border-border">
                    <th
                      scope="row"
                      className="py-3 pl-4 pr-2 text-left font-sans text-[13.5px] font-medium leading-snug text-text"
                    >
                      {row.feature}
                    </th>
                    <td className="px-1 py-3 text-center">
                      <span className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full bg-primary-soft font-sans text-sm font-bold text-success-text">
                        <span aria-hidden>✓</span>
                        <span className="sr-only">{t('matrix.yesLabel')}</span>
                      </span>
                    </td>
                    <td className="px-1 py-3 text-center font-sans text-[11.5px] leading-tight text-muted opacity-75">
                      {row.other}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 5 · Spenningen er innebygd ──────────────────────────────── */}
        {/* Rent pyntekort: fiktive navn, ingen datahenting. */}
        <section>
          <SectionHeading>{t('board.heading')}</SectionHeading>
          <Card className="mt-4 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-serif text-[16px] font-medium text-text">
                {t('board.cardTitle')}
              </span>
              <span className="inline-flex items-center gap-1.5 font-sans text-[10.5px] font-bold uppercase tracking-[0.1em] text-success-text">
                <span
                  aria-hidden
                  className="h-[7px] w-[7px] shrink-0 rounded-full bg-success"
                />
                {t('board.liveLabel')}
              </span>
            </div>
            <div className="mt-2.5">
              {boardRows.map((row, index) => {
                const isLeader = index === 0;
                return (
                  <div
                    key={row.name}
                    className={`flex items-center justify-between border-t border-border py-2.5 font-serif text-[16px] first:border-t-0 ${
                      isLeader ? 'text-accent-text' : 'text-text'
                    }`}
                  >
                    <span>
                      {isLeader && (
                        <span aria-hidden className="mr-1.5">
                          🏆
                        </span>
                      )}
                      {row.name}
                    </span>
                    <span className="tabular-nums">{row.points}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3.5 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <span
                  key={chip.label}
                  className="rounded-full bg-primary-soft px-3 py-1.5 font-sans text-[12px] font-semibold text-primary"
                >
                  <span aria-hidden className="mr-1">
                    {chip.icon}
                  </span>
                  {chip.label}
                </span>
              ))}
            </div>
          </Card>
        </section>

        {/* 6 · Spisset for turneringen ─────────────────────────────── */}
        <section>
          <SectionHeading>{t('points.heading')}</SectionHeading>
          <div className="mt-4 space-y-3">
            {iconPoints.map((point) => (
              <div
                key={point.title}
                className="flex items-center gap-3.5 rounded-2xl border border-border bg-surface px-4 py-3.5"
              >
                <span
                  aria-hidden
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-[20px]"
                >
                  {point.icon}
                </span>
                <span className="font-sans text-[14px] font-semibold leading-snug text-text">
                  {point.title}
                  <small className="mt-0.5 block font-sans text-[12.5px] font-normal leading-snug text-muted">
                    {point.body}
                  </small>
                </span>
              </div>
            ))}
          </div>
          {/* Mørkegrønt sitatkort. `surface-strong` er deep forest i BEGGE
              modus (dark --primary er sage og ville invertert kontrasten), så
              linen + gull holder seg lesbare. */}
          <p className="mt-5 rounded-2xl bg-surface-strong px-5 py-6 text-center font-serif text-[18px] leading-snug tracking-[-0.01em] text-bg-tint">
            {t('points.quotePre')}
            <span className="text-accent">{t('points.quoteGold')}</span>
            {t('points.quotePost')}
          </p>
        </section>

        {/* 7 · Spørsmål og svar ────────────────────────────────────── */}
        {/* Samme array som FAQPage-JSON-LD-en over. */}
        <section>
          <SectionHeading>{t('faqHeading')}</SectionHeading>
          <dl className="mt-4 space-y-4">
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

        {/* 8 · Slutt-CTA ───────────────────────────────────────────── */}
        {/* /demo er PUBLIC i proxy.ts, så en anonym leser kan prøve appen
            uten å logge inn først. */}
        <section className="text-center">
          <h2 className="font-serif text-[26px] font-medium leading-tight tracking-[-0.015em] text-text">
            {t('endCta.headingPre')}
            <span className="text-accent-text">{t('endCta.headingGold')}</span>
            {t('endCta.headingPost')}
          </h2>
          <p className="mx-auto mt-3 max-w-[300px] font-sans text-[14px] leading-relaxed text-muted">
            {t('endCta.body')}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <LinkButton href="/demo" full data-testid="why-torny-demo-cta">
              {t('endCta.primaryCta')}
            </LinkButton>
            <TextLink href="/login" className="justify-center">
              {t('endCta.secondaryCta')}
            </TextLink>
          </div>
        </section>

        {/* 9 · Bunnlenker ──────────────────────────────────────────── */}
        <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 border-t border-border pt-8 font-sans text-[13px] text-muted">
          <FooterLink href="/spillformater">{t('footer.formats')}</FooterLink>
          <FooterLink href="/baner">{t('footer.courses')}</FooterLink>
          <FooterLink href="/demo">{t('footer.demo')}</FooterLink>
          <FooterLink href="/login">{t('footer.login')}</FooterLink>
          <FooterLink href="/legal/privacy">{t('footer.privacy')}</FooterLink>
        </nav>
      </div>
    </AppShell>
  );
}

// ─── Sidespesifikke presentasjons-helpere ──────────────────────────────────
// Delt med forsiden: SectionHeading/TextLink/FooterLink (../marketing-primitives).
// Under her bor kun det denne sida eier alene.

/**
 * Tall-flis. `gold` er kun på «0 kr» — gull er reservert til det ene tallet
 * som skal treffe hardest, i tråd med palett-regelen om at champagne brukes
 * til høydepunkter, ikke som generell aksent.
 */
function StatTile({ stat, gold }: { stat: Stat; gold: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-5 text-center">
      <div
        className={`font-serif text-[44px] font-medium leading-none tracking-[-0.02em] ${
          gold ? 'text-accent-text' : 'text-primary'
        }`}
      >
        {stat.value}
        {stat.unit && <span className="text-[22px]">{stat.unit}</span>}
      </div>
      <div className="mt-2 whitespace-pre-line font-sans text-[12.5px] leading-snug text-muted">
        {stat.label}
      </div>
    </div>
  );
}
