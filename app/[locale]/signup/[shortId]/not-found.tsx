import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { NotFoundView } from '@/components/NotFoundView';

/**
 * #361: friendly fallback when a self-signup link points at a game that no
 * longer exists (deleted) or whose short_id is invalid. `page.tsx` calls
 * `notFound()` for those, which renders this instead of a bare 404 dead-end.
 * Public route (whitelisted in proxy.ts), so no auth gating here.
 *
 * #2287: the out of bounds page with the signup's own text, and the open
 * tournament list as a way on for the player who came to sign up.
 */
export default async function SignupNotFound() {
  const t = await getTranslations('signup');
  const tNotFound = await getTranslations('notFound');
  return (
    <AppShell flush>
      <div data-testid="not-found">
        <NotFoundView
          kicker={t('notFoundKicker')}
          heading={t('notFoundHeading')}
          body={t('notFoundBody')}
          homeLabel={t('notFoundButton')}
          homeHref="/"
          findLabel={tNotFound('findTournaments')}
          findHref="/finn-turneringer"
        />
      </div>
    </AppShell>
  );
}
