import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { routing, type AppLocale } from '@/i18n/routing';
import { canonicalPath } from '@/lib/seo/canonical';
import { appLaunchFlag, appLaunchKey } from '@/lib/app/appLaunch';
import { GetTheApp } from '@/components/app/GetTheApp';
import { DemoGame } from './DemoGame';
import { DemoAppPointer } from './DemoAppPointer';

/**
 * Prøvespill — spillbar demoturnering uten innlogging (#1042, epic #1021-
 * oppfølger). Whitelisted i proxy.ts (PUBLIC_PATH_PATTERN) så uinnloggede når
 * den uten login-runde. Alt er klient-side: siden er en tynn shell rundt
 * <DemoGame/>, ingen data hentes fra server/DB. INGEN `export const runtime`
 * (cacheComponents-fella — kun `npm run build` fanger bruddet).
 *
 * #2562: med `NEXT_PUBLIC_APP_LAUNCH=on` peker siden til appen i stedet
 * (`DemoAppPointer`), og ingen slag føres. Med `ios` står demoen, og en
 * iPhone/iPad får App Store-kortet over den.
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
  const launch = appLaunchFlag();
  return {
    title: t(appLaunchKey('demo', 'pageTitle', launch)),
    description: t(appLaunchKey('demo', 'metaDescription', launch)),
    alternates: { canonical: canonicalPath(locale, '/demo') },
  };
}

export default function DemoPage() {
  const launch = appLaunchFlag();
  if (launch === 'on') {
    return (
      <AppShell>
        <DemoAppPointer />
      </AppShell>
    );
  }
  return (
    <AppShell showVersion={false} flush>
      {launch === 'ios' && (
        <GetTheApp deviceOnly visitor className="mx-4 mt-4" />
      )}
      <DemoGame />
    </AppShell>
  );
}
