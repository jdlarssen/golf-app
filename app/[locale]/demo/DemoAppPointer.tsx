import { getTranslations } from 'next-intl/server';
import { BrandMark } from '@/components/ui/BrandMark';
import { GetTheApp } from '@/components/app/GetTheApp';
import { TextLink } from '../marketing-primitives';

/**
 * `/demo` once the app is in both stores (#2562, the owner's answer on #2281:
 * «Pek til appen etter lansering»). The demo round is not run; the page
 * points to the app instead. The server render and a PC show both badges, a
 * phone its own store. The website itself still works, so the last line
 * offers the way in through the browser.
 */
export async function DemoAppPointer() {
  const t = await getTranslations('demo.pointer');
  return (
    <div data-testid="demo-app-pointer" className="space-y-5">
      <BrandMark />
      <div>
        <h1 className="font-serif text-[30px] leading-[1.1] font-medium text-text">
          {t('title')}
        </h1>
        <p className="mt-3 font-sans text-[15px] leading-relaxed text-muted">
          {t('body')}
        </p>
      </div>
      <GetTheApp variant="badges" />
      <TextLink href="/login">{t('webLink')}</TextLink>
    </div>
  );
}
