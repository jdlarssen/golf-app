import { useTranslations } from 'next-intl';

/** Id of the `<main>` that SkipLink jumps to; AppShell and AdminShell set it. */
export const MAIN_CONTENT_ID = 'main';

/**
 * First focusable element in AppShell/AdminShell: lets keyboard and
 * screen-reader users jump past the top bar straight to the page content.
 * Visually hidden until focused; the focus ring comes from the global
 * `:focus-visible` rule. The top offset clears the iPhone status bar in the
 * installed PWA.
 */
export function SkipLink() {
  const t = useTranslations('common');
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-[max(0.75rem,env(safe-area-inset-top,0px))] focus:left-3 focus:z-50 focus:inline-flex focus:min-h-[44px] focus:items-center focus:rounded-full focus:bg-primary focus:px-4 focus:text-sm focus:font-medium focus:text-white dark:focus:text-bg focus:shadow-sm"
    >
      {t('skipToContent')}
    </a>
  );
}
