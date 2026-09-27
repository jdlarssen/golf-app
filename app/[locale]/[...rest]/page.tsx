import { notFound } from 'next/navigation';

/**
 * Catch-all for URLs that match no route under `[locale]` (e.g. `/venner`,
 * which only has the `/venner/legg-til/[code]` child). Without it, Next serves
 * its built-in English 404 — outside the `[locale]` layout, so no `<html lang>`,
 * no app chrome and no way home. Calling `notFound()` here renders the branded
 * `app/[locale]/not-found.tsx` inside the layout instead. This is next-intl's
 * documented pattern for a `[locale]` root («Catching unknown routes»).
 *
 * A catch-all segment has the lowest routing priority, so every real route
 * (static or dynamic) still wins. Auth is unchanged: proxy.ts runs first, and
 * an anonymous visitor to an unknown non-public path is still sent to /login.
 */
export default function CatchAllPage() {
  notFound();
}
