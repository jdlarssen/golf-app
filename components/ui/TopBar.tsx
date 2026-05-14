import { BackLink } from './BackLink';
import { HistoryBackLink } from './HistoryBackLink';

/**
 * Sticky viewport-top navigation bar used on every page that has a back link.
 * Replaces the ad-hoc `-mt-3 mb-2 flex items-center justify-between` divs
 * that used to scroll out of view on long pages.
 *
 * - `-mx-5 px-5` cancels AppShell / AdminShell's `px-5` padding so the
 *   backdrop bleed reaches the screen edges.
 * - `-mt-8 pt-5` cancels AppShell's `py-8` top padding so the bar starts
 *   flush with the top of the `<main>` element.
 * - `bg-bg/90 backdrop-blur-sm` gives the blur-through-glass effect as
 *   content scrolls underneath.
 * - `z-30` sits below SyncBanner's `z-40` so the error banner overlays cleanly.
 *
 * `back="history"` switches the chevron to a router.back()-based control
 * for pages that can be reached from any context (e.g. /legal/privacy
 * from the global footer link). `backHref` is then the fallback used
 * when there is no same-origin referrer.
 */
export function TopBar({
  backHref,
  backLabel = 'Tilbake',
  kicker,
  back = 'link',
}: {
  backHref: string;
  backLabel?: string;
  kicker?: string;
  back?: 'link' | 'history';
}) {
  return (
    <div className="sticky top-0 z-30 -mx-5 px-5 bg-bg/90 backdrop-blur-sm -mt-8 pt-5 pb-2 mb-4 relative flex items-center">
      {back === 'history' ? (
        <HistoryBackLink fallbackHref={backHref} ariaLabel={backLabel} />
      ) : (
        <BackLink href={backHref}>{backLabel}</BackLink>
      )}
      {kicker && (
        <p className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          {kicker}
        </p>
      )}
    </div>
  );
}
