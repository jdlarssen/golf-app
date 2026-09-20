import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { KavalkadeDeck } from '@/components/kavalkade/KavalkadeDeck';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getOrCreateKavalkade } from '@/lib/kavalkade/getOrCreateKavalkade';
import {
  buildKavalkadeDeck,
  isKavalkadeEmpty,
} from '@/lib/kavalkade/kavalkadeCards';
import { KAVALKADE_YEAR } from '@/lib/kavalkade/release';
import type { AppLocale } from '@/i18n/routing';

/**
 * Kavalkaden — golfåret ditt som bla-bar kortstokk (#2129, epic #1040).
 *
 * Tre tilstander, alle fra `getOrCreateKavalkade` (#2128):
 *
 *  - `closed`: før 24. desember. Vanlige spillere får «Kavalkaden kommer», og
 *    siden skriver ingen rad og kaller ikke modellen.
 *  - `preview`: admin før datoen. Fakta regnet live mot frysegrensen, ingen
 *    lagring, ingen innledningstekst.
 *  - `ready`: den lagrede raden, med eller uten innledning.
 *
 * Har spilleren ingen ferdige runder i året, viser vi en tom tilstand i stedet
 * for en kortstokk uten kort.
 *
 * Andre år enn `KAVALKADE_YEAR` finnes ikke: 2025 og tidligere er et ikke-mål i
 * kontrakten, og 2027 er ikke automatisert.
 */

// Første åpning venter på språkmodellen FØR raden skrives (advarselen i
// `getOrCreateKavalkade`). Uten denne kan plattformen kutte kallet midtveis, og
// spilleren står igjen uten rad og betaler et nytt modellkall neste gang.
export const maxDuration = 60;

type Params = Promise<{ year: string }>;

export default async function KavalkadePage({ params }: { params: Params }) {
  const { year: yearParam } = await params;
  if (Number(yearParam) !== KAVALKADE_YEAR) notFound();

  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('kavalkade');

  const userId = await getProxyVerifiedUserId();
  if (!userId) redirect({ href: '/login', locale });

  const view = await getOrCreateKavalkade(userId as string);

  if (view.status === 'closed') {
    return (
      <KavalkadeShell kicker={t('kicker')}>
        <Card data-testid="kavalkade-closed">
          <Kicker>{t('kicker')}</Kicker>
          <h1 className="mt-2 font-serif text-2xl font-medium leading-tight text-text">
            {t('closedHeading')}
          </h1>
          <p className="mt-3 font-sans text-sm leading-relaxed text-muted">
            {t('closedBody')}
          </p>
        </Card>
      </KavalkadeShell>
    );
  }

  const facts = view.facts;
  const narrative = view.status === 'ready' ? view.narrative : null;

  if (isKavalkadeEmpty(facts)) {
    return (
      <KavalkadeShell kicker={t('kicker')}>
        {view.status === 'preview' && <PreviewBanner label={t('previewBadge')} />}
        <Card data-testid="kavalkade-empty">
          <Kicker>{t('kicker')}</Kicker>
          <h1 className="mt-2 font-serif text-2xl font-medium leading-tight text-text">
            {t('emptyHeading', { year: facts.year })}
          </h1>
          <p className="mt-3 font-sans text-sm leading-relaxed text-muted">
            {t('emptyBody')}
          </p>
        </Card>
      </KavalkadeShell>
    );
  }

  return (
    <KavalkadeShell kicker={t('kicker')}>
      {view.status === 'preview' && <PreviewBanner label={t('previewBadge')} />}
      <h1 className="mb-4 font-serif text-2xl font-medium leading-tight text-text tabular-nums">
        {t('heading', { year: facts.year })}
      </h1>
      <KavalkadeDeck
        deck={buildKavalkadeDeck(facts, narrative)}
        locale={locale}
      />
    </KavalkadeShell>
  );
}

function KavalkadeShell({
  kicker,
  children,
}: {
  kicker: string;
  children: ReactNode;
}) {
  return (
    <AppShell>
      <TopBar backHref="/profile" kicker={kicker} />
      <div className="space-y-4">{children}</div>
    </AppShell>
  );
}

/** Admin-forhåndsvisningen sier tydelig at ingen andre ser dette ennå. */
function PreviewBanner({ label }: { label: string }) {
  return (
    <Banner tone="info" testId="kavalkade-preview">
      {label}
    </Banner>
  );
}
