'use client';

import { useRouter } from 'next/navigation';

/**
 * Did this tab come to the current page from a Tørny page? (#2746 rule 7:
 * «går tilbake hvis nettleseren oppgir at du kom fra en side i Tørny».)
 *
 * The Navigation API answers for the whole tab: `canGoBack` is true when the
 * entry before this one is from the same site, whether it was reached with a
 * full load or a client-side navigation. A form that sends you on replaces
 * itself (`i18n/navigation.test.ts`), so it leaves no entry to go back to.
 *
 * `document.referrer` alone was the bug (#2332): it names the first page load
 * and is not updated by client-side navigations, so after opening Tørny from
 * the home screen or a link and clicking through, the arrow went to the fixed
 * target instead of back. Browsers without the Navigation API keep the
 * referrer check, as before.
 */
function cameFromTornyPage(): boolean {
  const navigation = (window as { navigation?: { canGoBack?: unknown } }).navigation;
  if (typeof navigation?.canGoBack === 'boolean') return navigation.canGoBack;
  const ref = document.referrer;
  if (!ref) return false;
  try {
    return new URL(ref).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Back link that prefers browser history (so users return to the page
 * they actually came from) and falls back to a static href when there
 * is no same-origin referrer — e.g. when the page was opened directly
 * via a deep link or shared URL.
 *
 * Visual style mirrors `BackLink` exactly so the two are interchangeable
 * inside `TopBar`.
 */
export function HistoryBackLink({
  fallbackHref,
  ariaLabel,
}: {
  fallbackHref: string;
  ariaLabel: string;
}) {
  const router = useRouter();

  function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    if (cameFromTornyPage()) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="tap-extend -ml-2 inline-flex h-8 w-8 items-center justify-center text-lg text-text"
    >
      ‹
    </button>
  );
}
