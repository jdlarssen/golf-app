import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { NotFoundView } from '@/components/NotFoundView';

/**
 * #612: the branded 404 for `notFound()` thrown by a page under `[locale]` —
 * e.g. a signup notification that points to a deleted game (#613). It renders
 * inside the `[locale]` layout, so it inherits `<html lang>` and the NextIntl
 * provider without extra plumbing. The bottom nav is hidden: the out of bounds
 * page (#2287) draws none, and both its buttons work signed in and out.
 *
 * Addresses no route matches never get here: they go to
 * `app/global-not-found.tsx` (#2292), which renders outside this layout.
 *
 * not-found components get no `params` prop; the locale comes from the
 * request context via `getTranslations` (next/root-params), same pattern as
 * `app/[locale]/signup/[shortId]/not-found.tsx`.
 */
export default async function NotFound() {
  const t = await getTranslations('notFound');
  return (
    <AppShell flush>
      <div data-testid="not-found">
        <NotFoundView
          kicker={t('kicker')}
          heading={t('heading')}
          body={t('body')}
          homeLabel={t('button')}
          homeHref="/"
          findLabel={t('findTournaments')}
          findHref="/finn-turneringer"
        />
      </div>
    </AppShell>
  );
}
