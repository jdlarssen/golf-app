import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { routing, type AppLocale } from '@/i18n/routing';
import { DemoGame } from './DemoGame';

// smoke-test #1159: trigger Discord PR-kort (workflow_run + skjermbilde av /demo).
// Fjernes etter verifisering.

/**
 * Prøvespill — spillbar demoturnering uten innlogging (#1042, epic #1021-
 * oppfølger). Whitelisted i proxy.ts (PUBLIC_PATH_PATTERN) så uinnloggede når
 * den uten login-runde. Alt er klient-side: siden er en tynn shell rundt
 * <DemoGame/>, ingen data hentes fra server/DB. INGEN `export const runtime`
 * (cacheComponents-fella — kun `npm run build` fanger bruddet).
 */

type Params = Promise<{ locale: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'demo' });
  return { title: t('pageTitle') };
}

export default function DemoPage() {
  return (
    <AppShell showVersion={false}>
      <DemoGame />
    </AppShell>
  );
}
