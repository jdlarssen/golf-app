import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Link } from '@/i18n/navigation';
import { routing, type AppLocale } from '@/i18n/routing';
import { canonicalPath } from '@/lib/seo/canonical';
import { DATA_CONTROLLER_NAME } from '../dataController';

type Params = Promise<{ locale: string }>;

// #2561: the public account-deletion page Google Play asks for. Public via
// PUBLIC_PATH_PATTERN in proxy.ts (`/legal/...`), so it renders logged out.
// What the text says is deleted or kept follows lib/users/deleteAccount.ts
// and the `anonymize_user` function in the database.
export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'legal.deleteAccount' });
  return {
    title: t('metaTitle'),
    alternates: { canonical: canonicalPath(locale, '/legal/slett-konto') },
  };
}

const linkClass = 'font-medium text-primary underline underline-offset-2';

export default async function DeleteAccountInfoPage() {
  const t = await getTranslations('legal.deleteAccount');

  const mailto = (chunks: React.ReactNode) => (
    <a href="mailto:personvern@tornygolf.no" className={linkClass}>
      {chunks}
    </a>
  );
  // Locale-aware links, so /en/legal/slett-konto stays in English. The
  // profile page needs a login; the proxy sends a logged-out visitor there first.
  const deleteLink = (chunks: React.ReactNode) => (
    <Link href="/profile/slett-konto" className={linkClass}>
      {chunks}
    </Link>
  );
  const privacyLink = (chunks: React.ReactNode) => (
    <Link href="/legal/privacy" className={linkClass}>
      {chunks}
    </Link>
  );

  return (
    <AppShell>
      <TopBar
        backHref="/"
        backLabel={t('backLabel')}
        kicker={t('kicker')}
        kickerIsPageTitle
        back="history"
      />

      <div className="space-y-8 text-sm leading-relaxed text-text">
        <section>
          <p className="text-text">{t('intro', { name: DATA_CONTROLLER_NAME })}</p>
        </section>

        <section>
          <h2 className="font-serif text-xl font-medium text-text mb-3">
            {t('inAppHeading')}
          </h2>
          <p className="text-text">{t('inAppBody')}</p>
        </section>

        <section>
          <h2 className="font-serif text-xl font-medium text-text mb-3">
            {t('webHeading')}
          </h2>
          <p className="text-text">{t.rich('webBody', { link: deleteLink })}</p>
        </section>

        <section>
          <h2 className="font-serif text-xl font-medium text-text mb-3">
            {t('noLoginHeading')}
          </h2>
          <p className="text-text">{t.rich('noLoginBody', { mailto })}</p>
        </section>

        <section>
          <h2 className="font-serif text-xl font-medium text-text mb-3">
            {t('deletedHeading')}
          </h2>
          <p className="text-text mb-2">{t('deletedIntro')}</p>
          <ul className="list-disc list-outside pl-5 space-y-1 text-text">
            <li>{t('deletedItem1')}</li>
            <li>{t('deletedItem2')}</li>
            <li>{t('deletedItem3')}</li>
            <li>{t('deletedItem6')}</li>
            <li>{t('deletedItem4')}</li>
            <li>{t('deletedItem5')}</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-xl font-medium text-text mb-3">
            {t('keptHeading')}
          </h2>
          <ul className="list-disc list-outside pl-5 space-y-1 text-text">
            <li>{t('keptItem1')}</li>
            <li>{t('keptItem2')}</li>
            <li>{t('keptItem3')}</li>
            <li>{t('keptItem4')}</li>
            <li>{t('keptItem5')}</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-xl font-medium text-text mb-3">
            {t('blockedHeading')}
          </h2>
          <p className="text-text mb-2">{t('blockedIntro')}</p>
          <ul className="list-disc list-outside pl-5 space-y-1 text-text">
            <li>{t('blockedItem1')}</li>
            <li>{t('blockedItem2')}</li>
            <li>{t('blockedItem3')}</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-xl font-medium text-text mb-3">
            {t('whenHeading')}
          </h2>
          <p className="text-text mb-2">{t('whenBody')}</p>
          <p className="text-text">{t.rich('privacyBody', { link: privacyLink })}</p>
        </section>
      </div>
    </AppShell>
  );
}
