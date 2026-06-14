import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { BrandMark } from '@/components/ui/BrandMark';
import { ChampagneMedallion } from '@/components/ui/ChampagneMedallion';
import { PinFlag } from '@/components/icons/PinFlag';
import { LinkButton } from '@/components/ui/Button';

/**
 * #612: app-wide, merket 404. Routing er `localePrefix: 'as-needed'` og
 * `proxy.ts` rewriter ALLE stier til `app/[locale]/…`, så denne ene not-found-en
 * fanger både ukjente topp-nivå-stier (skrivefeil/gamle lenker) OG `notFound()`
 * fra nestede sider — f.eks. et påmeldings-varsel som peker til et slettet spill
 * (#613). Den rendres inne i `[locale]`-layouten, så den arver `<html lang>`,
 * NextIntl-provideren og den globale bunn-nav-en uten ekstra plumbing.
 *
 * not-found-komponenter får ingen `params`-prop; locale leses fra
 * request-konteksten via `getTranslations` (next/root-params), samme mønster som
 * `app/[locale]/signup/[shortId]/not-found.tsx`.
 */
export default async function NotFound() {
  const t = await getTranslations('notFound');
  return (
    <AppShell>
      <BrandMark className="mt-2" />
      <section className="mt-10 flex flex-col items-center text-center">
        <ChampagneMedallion className="mb-7">
          <PinFlag size={72} className="text-primary dark:text-text" />
        </ChampagneMedallion>
        <h1 className="font-serif text-[30px] font-medium tracking-[-0.02em] leading-tight text-text">
          {t('heading')}
        </h1>
        <p className="mt-3 max-w-[280px] font-sans text-sm leading-relaxed text-muted">
          {t('body')}
        </p>
        <div className="mt-8 w-full max-w-[280px]">
          <LinkButton href="/" full>
            {t('button')}
          </LinkButton>
        </div>
      </section>
    </AppShell>
  );
}
