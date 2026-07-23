import { Suspense, type ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { BrandMark } from '@/components/ui/BrandMark';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { getFormatGuideEntries } from '@/lib/formats/buildFormatGuide';
import { getPublicDiscoverableGames } from '@/lib/games/getPublicDiscoverableGames';
import { AnonDiscoverySection } from './finn-turneringer/AnonDiscoverySection';
import type { AppLocale } from '@/i18n/routing';

/**
 * Offentlig forside (#1265, epic #1021 «Vindu ut»). Den anonyme grenen av `/`:
 * en fremmed — eller Googlebot — leser hva Tørny er UTEN å logge inn. Proxyen
 * gjør `/` auth-valgfri (AUTH_OPTIONAL_PATH_PATTERN); innloggede når aldri hit
 * (page.tsx returnerer denne kun for `!userId`), så innlogget-hjem er urørt.
 *
 * All copy fra `landing.*`-katalogen (no + en). Ingen DB unntatt den valgfrie
 * «åpne turneringer»-seksjonen, som er Suspense-wrappet så treghet/feil aldri
 * blokkerer det statiske salgs-skallet. Forsiden er lenkenav, ikke pilarside:
 * tynne seksjoner sender autoritet ned til /spillformater/[mode] og /baner,
 * som eier longtail-en. JSON-LD (@graph) rendres kun her — innlogget hjem skal
 * ikke bære markup for en side den ikke viser.
 */

const ORIGIN = 'https://tornygolf.no';

// De seks formatkortene: én per katalogseksjon, spennet fra kompis (Skins,
// Wolf) til klubb (best ball, matchplay). Keys = GameMode-verdier (verifisert
// mot lib/formats/buildFormatGuide CATALOG), så detalj-lenken er `/spillformater/<mode>`.
const FORMAT_KEYS = [
  'stableford',
  'texas_scramble',
  'best_ball',
  'singles_matchplay',
  'skins',
  'wolf',
] as const;

type FaqEntry = { q: string; a: string };
type BoardRow = { name: string; points: string };

export async function AnonLanding({ locale }: { locale: AppLocale }) {
  const t = await getTranslations('landing');
  const formatEntries = await getFormatGuideEntries();
  const byKey = new Map(formatEntries.map((entry) => [entry.key, entry]));
  const formatCards = FORMAT_KEYS.map((key) => byKey.get(key)).filter(
    (entry): entry is NonNullable<typeof entry> => Boolean(entry),
  );

  // ETT array mater både synlig FAQ og FAQPage-JSON-LD (Googles krav om
  // identisk tekst — oppfylt per konstruksjon).
  const faq = t.raw('faq') as FaqEntry[];
  const boardRows = t.raw('board.rows') as BoardRow[];

  const inLanguage = locale === 'no' ? 'nb' : 'en';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${ORIGIN}/#website`,
        name: 'Tørny',
        url: ORIGIN,
        inLanguage,
        publisher: { '@id': `${ORIGIN}/#organization` },
      },
      {
        '@type': 'Organization',
        '@id': `${ORIGIN}/#organization`,
        name: 'Tørny',
        url: ORIGIN,
        logo: `${ORIGIN}/icon`,
      },
      {
        '@type': 'WebApplication',
        '@id': `${ORIGIN}/#app`,
        name: 'Tørny',
        url: ORIGIN,
        description: t('metaDescription'),
        applicationCategory: 'SportsApplication',
        operatingSystem: 'Any',
        inLanguage: ['nb', 'en'],
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'NOK' },
      },
      {
        '@type': 'FAQPage',
        '@id': `${ORIGIN}/#faq`,
        mainEntity: faq.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
  };

  const goldHeadingGold = t('endCta.headingGold');

  return (
    <AppShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div data-testid="anon-landing" className="space-y-14">
        {/* 1 · Topprad ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <BrandMark />
          <div className="flex items-center gap-3">
            <LocaleSwitcher />
            <SmartLink
              href="/login"
              data-testid="anon-login-cta"
              className="inline-flex min-h-[44px] items-center font-sans text-sm font-medium text-text hover:text-primary"
            >
              {t('loginCta')}
            </SmartLink>
          </div>
        </div>

        {/* 2 · Hero ────────────────────────────────────────────────── */}
        <section className="text-center">
          <h1 className="font-serif text-[34px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
            {t('hero.h1')}
          </h1>
          <p className="mx-auto mt-4 max-w-[340px] font-sans text-[15px] leading-relaxed text-muted">
            {t('hero.sub')}
          </p>
          <div className="mt-7 flex flex-col gap-3">
            <LinkButton href="/demo" full data-testid="anon-demo-cta">
              {t('hero.primaryCta')}
            </LinkButton>
            <LinkButton href="/login" full variant="secondary">
              {t('hero.secondaryCta')}
            </LinkButton>
          </div>
          <p className="mt-4 font-sans text-xs text-muted">{t('hero.trust')}</p>
        </section>

        {/* 3 · Slik funker det ─────────────────────────────────────── */}
        <section>
          <SectionHeading>{t('how.heading')}</SectionHeading>
          <ol className="mt-5 list-none space-y-4 p-0">
            <Step
              number={1}
              title={t('how.step1Title')}
              body={t('how.step1Body')}
              linkHref="/baner"
              linkLabel={t('how.step1LinkLabel')}
            />
            <Step
              number={2}
              title={t('how.step2Title')}
              body={t('how.step2Body')}
              linkHref="/login"
              linkLabel={t('how.step2LinkLabel')}
            />
            <Step
              number={3}
              title={t('how.step3Title')}
              body={t('how.step3Body')}
            />
          </ol>
        </section>

        {/* 4 · Tavle-smakebit ──────────────────────────────────────── */}
        <section>
          <SectionHeading>{t('board.heading')}</SectionHeading>
          <Card className="mt-5 p-5">
            <table className="w-full font-sans text-sm">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                  <th className="pb-2 text-left font-semibold">
                    {t('board.colPlayer')}
                  </th>
                  <th className="pb-2 text-right font-semibold">
                    {t('board.colPoints')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {boardRows.map((row, index) => {
                  const isLeader = index === 0;
                  return (
                    <tr
                      key={row.name}
                      className="border-t border-border first:border-t-0"
                    >
                      <td
                        className={`py-2 font-serif text-[17px] ${
                          isLeader ? 'text-accent' : 'text-text'
                        }`}
                      >
                        {isLeader && (
                          <span aria-hidden className="mr-1.5">
                            🏆
                          </span>
                        )}
                        {row.name}
                      </td>
                      <td
                        className={`py-2 text-right font-serif text-[17px] tabular-nums ${
                          isLeader ? 'text-accent' : 'text-text'
                        }`}
                      >
                        {row.points}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <div className="mt-4">
            <TextLink href="/demo">{t('board.linkLabel')}</TextLink>
          </div>
        </section>

        {/* 5 · Spillformer ─────────────────────────────────────────── */}
        <section>
          <SectionHeading>{t('formats.heading')}</SectionHeading>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {formatCards.map((entry) => (
              <SmartLink
                key={entry.key}
                href={`/spillformater/${entry.mode}`}
                data-testid="anon-format-card"
                className="flex min-h-[44px] flex-col gap-1.5 rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-primary-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
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
            <TextLink href="/spillformater">{t('formats.linkLabel')}</TextLink>
          </div>
        </section>

        {/* 6 · For hvem ────────────────────────────────────────────── */}
        <section>
          <SectionHeading>{t('audience.heading')}</SectionHeading>
          <p className="mt-3 font-sans text-[15px] leading-relaxed text-muted">
            {t('audience.intro')}
          </p>
          <div className="mt-5 space-y-3">
            <AudienceCard
              title={t('audience.friendsTitle')}
              body={t('audience.friendsBody')}
            />
            <AudienceCard
              title={t('audience.companyTitle')}
              body={t('audience.companyBody')}
            />
            <AudienceCard
              title={t('audience.clubTitle')}
              body={t('audience.clubBody')}
            />
          </div>
        </section>

        {/* 7 · Norske baner ────────────────────────────────────────── */}
        <section>
          <SectionHeading>{t('courses.heading')}</SectionHeading>
          <p className="mt-3 font-sans text-[15px] leading-relaxed text-muted">
            {t('courses.body')}
          </p>
          <div className="mt-4">
            <TextLink href="/baner">{t('courses.linkLabel')}</TextLink>
          </div>
        </section>

        {/* 8 · Åpne turneringer (valgfri, eneste DB-seksjon) ────────── */}
        <Suspense fallback={null}>
          <AnonOpenGames
            heading={t('openGames.heading')}
            linkLabel={t('openGames.linkLabel')}
          />
        </Suspense>

        {/* 9 · Spørsmål og svar ────────────────────────────────────── */}
        <section>
          <SectionHeading>{t('faqHeading')}</SectionHeading>
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

        {/* 10 · Slutt-CTA (rekkefølgen snus: login primær) ─────────── */}
        <section className="text-center">
          <h2 className="font-serif text-[26px] font-medium leading-tight tracking-[-0.015em] text-text">
            {t('endCta.headingPre')}
            {goldHeadingGold && (
              <span className="text-accent">{goldHeadingGold}</span>
            )}
            {t('endCta.headingPost')}
          </h2>
          <p className="mx-auto mt-3 max-w-[320px] font-sans text-[14px] leading-relaxed text-muted">
            {t('endCta.body')}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <LinkButton href="/login" full>
              {t('endCta.primaryCta')}
            </LinkButton>
            <TextLink href="/demo" className="text-center">
              {t('endCta.secondaryCta')}
            </TextLink>
          </div>
        </section>

        {/* 11 · Bunnlenker ─────────────────────────────────────────── */}
        <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 border-t border-border pt-8 font-sans text-[13px] text-muted">
          <FooterLink href="/spillformater">{t('footer.formats')}</FooterLink>
          <FooterLink href="/baner">{t('footer.courses')}</FooterLink>
          <FooterLink href="/demo">{t('footer.demo')}</FooterLink>
          <FooterLink href="/finn-turneringer">
            {t('footer.openGames')}
          </FooterLink>
          <FooterLink href="/login">{t('footer.login')}</FooterLink>
          <FooterLink href="/legal/privacy">{t('footer.privacy')}</FooterLink>
        </nav>
      </div>
    </AppShell>
  );
}

// ─── Åpne turneringer (Suspense-barn) ──────────────────────────────────────
// Tom liste → hele seksjonen rendres ikke (ingen tom-tilstand på en salgsside).
async function AnonOpenGames({
  heading,
  linkLabel,
}: {
  heading: string;
  linkLabel: string;
}) {
  const games = await getPublicDiscoverableGames();
  if (games.length === 0) return null;
  return (
    <section>
      <SectionHeading>{heading}</SectionHeading>
      <div className="mt-5">
        <AnonDiscoverySection games={games} />
      </div>
      <div className="mt-4">
        <TextLink href="/finn-turneringer">{linkLabel}</TextLink>
      </div>
    </section>
  );
}

// ─── Presentasjons-helpere ─────────────────────────────────────────────────

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-serif text-[22px] font-medium leading-snug tracking-[-0.015em] text-text">
      {children}
    </h2>
  );
}

function Step({
  number,
  title,
  body,
  linkHref,
  linkLabel,
}: {
  number: number;
  title: string;
  body: string;
  linkHref?: string;
  linkLabel?: string;
}) {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft font-serif text-[15px] font-medium tabular-nums text-primary"
      >
        {number}
      </span>
      <div>
        <p className="font-sans text-[15px] font-semibold text-text">{title}</p>
        <p className="mt-1 font-sans text-[14px] leading-relaxed text-muted">
          {body}
        </p>
        {linkHref && linkLabel && (
          <div className="mt-1.5">
            <TextLink href={linkHref}>{linkLabel}</TextLink>
          </div>
        )}
      </div>
    </li>
  );
}

function AudienceCard({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-5">
      <h3 className="font-serif text-[17px] font-medium text-text">{title}</h3>
      <p className="mt-1.5 font-sans text-[14px] leading-relaxed text-muted">
        {body}
      </p>
    </Card>
  );
}

function TextLink({
  href,
  children,
  className = '',
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <SmartLink
      href={href}
      className={`inline-flex min-h-[44px] items-center font-sans text-sm font-medium text-primary hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${className}`}
    >
      {children}
      <span aria-hidden className="ml-1">
        →
      </span>
    </SmartLink>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <SmartLink
      href={href}
      className="inline-flex min-h-[44px] items-center hover:text-primary"
    >
      {children}
    </SmartLink>
  );
}
