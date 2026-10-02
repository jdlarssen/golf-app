import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { BrandMark } from '@/components/ui/BrandMark';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { SectionHeading, TextLink, FooterLink } from './marketing-primitives';
import { getFormatGuideEntries } from '@/lib/formats/buildFormatGuide';
import { FEATURED_FORMAT_KEYS } from '@/lib/formats/featuredFormats';
import { getPublicDiscoverableGames } from '@/lib/games/getPublicDiscoverableGames';
import { getRegistrationSeats } from '@/lib/games/getRegistrationSeats';
import { AnonDiscoverySection } from './finn-turneringer/AnonDiscoverySection';
import { LandingLiveBoard } from './LandingLiveBoard';
import { FRAMES } from './landingLiveBoardFrames';
import type { ArrangeAudience } from '@/lib/seo/arrangeAudiences';
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

type FaqEntry = { q: string; a: string };

export async function AnonLanding({ locale }: { locale: AppLocale }) {
  const t = await getTranslations('landing');
  const formatEntries = await getFormatGuideEntries();
  const byKey = new Map(formatEntries.map((entry) => [entry.key, entry]));
  const formatCards = FEATURED_FORMAT_KEYS.map((key) => byKey.get(key)).filter(
    (entry): entry is NonNullable<typeof entry> => Boolean(entry),
  );

  // ETT array mater både synlig FAQ og FAQPage-JSON-LD (Googles krav om
  // identisk tekst — oppfylt per konstruksjon).
  const faq = t.raw('faq') as FaqEntry[];

  // Snarveiene under knappene går til undersidene av «Arranger golfturnering»,
  // med titlene fra «For hvem»-kortene lenger ned.
  const audienceChips: { audience: ArrangeAudience; label: string }[] = [
    { audience: 'vennegjeng', label: t('audience.friendsTitle') },
    { audience: 'firmagolf', label: t('audience.companyTitle') },
    { audience: 'klubbkveld', label: t('audience.clubTitle') },
  ];

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
        {/* 1 · Grønn topp (#2261): topprad, hero, tavlekort, knapper og
            snarveier, som artboardet «Forslag: levende tavle på forsiden».
            På telefon går flaten kant i kant og fyller første skjerm (lvh, så
            den holder seg grønn også med Safaris verktøylinjer skjult); before-
            flaten farger overskrollet over den. Fra 28rem (AppShells max-w-md)
            blir den et kort inne i kolonnen. */}
        <section
          data-focus-surface="strong"
          className="relative -mx-5 -mt-8 min-h-[100lvh] bg-surface-strong px-5 pb-10 before:absolute before:inset-x-0 before:bottom-full before:h-[100lvh] before:bg-surface-strong dark:ring-1 dark:ring-border min-[28rem]:mx-0 min-[28rem]:mt-0 min-[28rem]:min-h-0 min-[28rem]:rounded-[28px] min-[28rem]:before:hidden"
        >
          <div className="-mr-2 flex items-center justify-between pt-[10px]">
            <BrandMark tone="onStrong" size="hero" />
            <div className="flex items-center gap-2">
              <LocaleSwitcher variant="onStrong" />
              <SmartLink
                href="/login"
                data-testid="anon-login-cta"
                className="inline-flex h-[46px] items-center rounded-full border border-on-strong/40 px-4 text-sm leading-[normal] font-semibold text-on-strong"
              >
                {t('loginCta')}
              </SmartLink>
            </div>
          </div>

          <div className="pt-7">
            {/* `wrap`, ikke den globale `pretty`: Safari veier hele avsnittet
                og kan flytte «et» ned på linje 3. */}
            <h1
              className="font-serif text-[38px] leading-[1.08] font-medium text-on-strong"
              style={{ textWrap: 'wrap' }}
            >
              {t('hero.h1Pre')}
              <em className="text-accent-on-strong">{t('hero.h1Gold')}</em>
              {t('hero.h1Post')}
            </h1>
            <p className="mt-3 text-[15px] leading-normal text-on-strong/85">
              {t('hero.sub')}
            </p>
          </div>

          <LandingLiveBoard
            className="mt-[22px]"
            kickers={FRAMES.map((frame) =>
              t('liveBoard.kicker', { hole: frame.hole }),
            )}
            live={t('liveBoard.live')}
            pointsSuffix={t('liveBoard.points')}
            caption={t('liveBoard.caption')}
          />

          <div className="flex flex-col gap-2.5 pt-6">
            <LinkButton
              href="/demo"
              full
              variant="onStrongGold"
              data-testid="anon-demo-cta"
              className="h-[54px] text-base"
            >
              {t('hero.primaryCta')}
            </LinkButton>
            <LinkButton
              href="/login"
              full
              variant="onStrongOutline"
              className="h-14 text-base"
            >
              {t('hero.secondaryCta')}
            </LinkButton>
          </div>
          <p className="pt-3 text-center text-xs leading-[15px] text-on-strong/80">
            {t('hero.trust')}
          </p>

          <nav
            aria-label={t('hero.audienceNav')}
            className="-mx-1 flex flex-wrap justify-center gap-2 pt-5"
          >
            {audienceChips.map(({ audience, label }) => (
              <SmartLink
                key={audience}
                href={`/arranger-golfturnering/${audience}`}
                className="inline-flex h-11 items-center rounded-full bg-on-strong/10 px-3.5 text-[13px] leading-[normal] font-medium text-on-strong"
              >
                {label}
              </SmartLink>
            ))}
          </nav>
        </section>

        {/* 2 · Slik funker det ─────────────────────────────────────── */}
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

        {/* 3 · Spillformer ─────────────────────────────────────────── */}
        <section>
          <SectionHeading>{t('formats.heading')}</SectionHeading>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {formatCards.map((entry) => (
              <SmartLink
                key={entry.key}
                href={`/spillformater/${entry.mode}`}
                data-testid="anon-format-card"
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
            <TextLink href="/spillformater">{t('formats.linkLabel')}</TextLink>
          </div>
        </section>

        {/* 4 · For hvem ────────────────────────────────────────────── */}
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

        {/* 5 · Norske baner ────────────────────────────────────────── */}
        <section>
          <SectionHeading>{t('courses.heading')}</SectionHeading>
          <p className="mt-3 font-sans text-[15px] leading-relaxed text-muted">
            {t('courses.body')}
          </p>
          <div className="mt-4">
            <TextLink href="/baner">{t('courses.linkLabel')}</TextLink>
          </div>
        </section>

        {/* 6 · Åpne turneringer (valgfri, eneste DB-seksjon) ────────── */}
        <Suspense fallback={null}>
          <AnonOpenGames
            heading={t('openGames.heading')}
            linkLabel={t('openGames.linkLabel')}
          />
        </Suspense>

        {/* 7 · Spørsmål og svar ────────────────────────────────────── */}
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

        {/* 8 · Slutt-CTA (rekkefølgen snus: login primær) ─────────── */}
        <section className="text-center">
          <h2 className="font-serif text-[26px] font-medium leading-tight tracking-[-0.015em] text-text">
            {t('endCta.headingPre')}
            {goldHeadingGold && (
              <span data-testid="end-cta-gold" className="text-accent-text">
                {goldHeadingGold}
              </span>
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

        {/* 9 · Bunnlenker ─────────────────────────────────────────── */}
        <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 border-t border-border pt-8 font-sans text-[13px] text-muted">
          <FooterLink href="/hvorfor-torny">{t('footer.whyTorny')}</FooterLink>
          <FooterLink href="/arranger-golfturnering">
            {t('footer.guide')}
          </FooterLink>
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
  // #2258: plass-linja per rad (et tall, aldri navn). `now` etter oppslagene.
  const seats = await getRegistrationSeats(games);
  const now = new Date();
  return (
    <section>
      <SectionHeading>{heading}</SectionHeading>
      <div className="mt-5">
        <AnonDiscoverySection games={games} seats={seats} now={now} />
      </div>
      <div className="mt-4">
        <TextLink href="/finn-turneringer">{linkLabel}</TextLink>
      </div>
    </section>
  );
}

// ─── Presentasjons-helpere ─────────────────────────────────────────────────
// SectionHeading/TextLink/FooterLink deles med /hvorfor-torny og bor i
// ./marketing-primitives (#1419). Det som står igjen her er forside-spesifikt.

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
