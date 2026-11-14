import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Kicker } from '@/components/ui/Kicker';
import { SettingList, SettingRow } from '@/components/ui/SettingRow';
import { DATA_ROWS, DataInventory } from './DataInventory';

/**
 * «Dine data» (#2332): what Tørny stores about the player and who can see it,
 * then «Du bestemmer» — download the file, read the privacy policy — and
 * «Slett konto» on its own at the bottom, as on the app's «Personvern og
 * konto». Design: the «Data-forslag» artboard, with the 31.10 unslop rules
 * (sentence-case section labels, the usual chevrons).
 *
 * The page reads no data. The proxy keeps it behind the login like every
 * other profile route (`proxy.dataPage.test.ts`), and `profile/error.tsx` and
 * `profile/loading.tsx` cover it from the parent segment.
 */
export default async function DataPage() {
  const t = await getTranslations('profile');
  const rows = DATA_ROWS.map((id) => ({
    id,
    title: t(`data.rows.${id}.title`),
    body: t(`data.rows.${id}.body`),
  }));
  return (
    <AppShell>
      <TopBar backHref="/profile" backLabel={t('historikk.backLabel')} kicker={t('kicker')} />

      <div className="space-y-6">
        <header>
          <h1 className="font-serif text-[28px] font-medium leading-tight text-text">{t('data.title')}</h1>
          <p className="mt-0.5 text-[13px] text-muted">{t('data.lede')}</p>
        </header>

        <section aria-labelledby="data-stored">
          <Kicker as="h2" id="data-stored" className="mb-2 px-1">
            {t('data.sectionStored')}
          </Kicker>
          <DataInventory rows={rows} />
          <p className="mt-2 px-1 text-xs text-muted">{t('data.adminLine')}</p>
          <p className="mt-2 px-1 text-xs text-muted">{t('data.processorsLine')}</p>
        </section>

        <section aria-labelledby="data-you-decide">
          <Kicker as="h2" id="data-you-decide" className="mb-2 px-1">
            {t('dataPage.sectionYouDecide')}
          </Kicker>
          <SettingList>
            <SettingRow
              href="/profile/export"
              download
              label={t('data.exportRow')}
              sublabel={t('data.exportSublabel')}
            />
            <SettingRow
              href="/legal/privacy"
              label={t('dataPage.privacyRow')}
              sublabel={t('dataPage.privacySublabel')}
            />
          </SettingList>
          {/* The gap sets the destructive action apart, as on /profile before. */}
          <div className="mt-4">
            <SettingList>
              <SettingRow href="/profile/slett-konto" label={t('deleteRow')} tone="danger" />
            </SettingList>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
