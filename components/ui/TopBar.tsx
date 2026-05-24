import type { ReactNode } from 'react';
import { BackLink } from './BackLink';
import { HistoryBackLink } from './HistoryBackLink';
import { NotificationBell } from '@/components/notifications/NotificationBell';

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
 *
 * `action` slots a node (typically a `<SmartLink>` chip such as «+ Nytt»)
 * into the right side of the bar — used by admin list pages where we want
 * a quick path to the create flow. The kicker stays centered because it
 * is absolute-positioned at `left-1/2`; the action sits at the end of the
 * flex flow via `ml-auto`. Pass `null` to omit the action while keeping
 * an invisible spacer (so the layout matches sibling pages that DO have
 * an action — useful on filtered list views like the «Resultatprotokoll»
 * where a create-button would be out of place).
 *
 * `userId` (når satt) trigger rendring av en `NotificationBell` lengst til
 * høyre i baren. Bjella er en client component som lytter på Supabase
 * realtime og viser en champagne-prikk når brukeren har uleste varsler.
 * Pages som ikke wirer userId (offentlig /legal/privacy) får ingen bjelle —
 * det gir ingen mening uten innlogget bruker. Layout: [back] [..kicker..]
 * [action ml-auto] [bell] — action sitter til venstre for bjella, så
 * begge er synlige samtidig på admin-flater som har «+ Nytt»-chip.
 */
export function TopBar({
  backHref,
  backLabel = 'Tilbake',
  kicker,
  back = 'link',
  action,
  userId,
}: {
  backHref: string;
  backLabel?: string;
  kicker?: string;
  back?: 'link' | 'history';
  action?: ReactNode;
  userId?: string | null;
}) {
  const hasBell = userId != null;
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
      {action !== undefined && (
        <div className={hasBell ? 'ml-auto' : 'ml-auto'}>
          {action ?? <ActionSpacer />}
        </div>
      )}
      {hasBell && (
        <div className={action === undefined ? 'ml-auto' : 'ml-1'}>
          <NotificationBell userId={userId ?? null} />
        </div>
      )}
    </div>
  );
}

/**
 * Invisible spacer that mirrors the size of a typical chip-action so the
 * flex layout reserves the same right-side space whether or not an action
 * is present. Same dimensions as the «+ Nytt»-chip used in admin lists so
 * the kicker keeps the same effective centering on filtered views.
 */
function ActionSpacer() {
  return (
    <span
      aria-hidden
      className="invisible rounded-full border border-border px-2.5 py-[5px] font-sans text-[10px] font-semibold uppercase tracking-[0.12em]"
    >
      +
    </span>
  );
}
