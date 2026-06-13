import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';

/**
 * #361: friendly fallback when a self-signup link points at a game that no
 * longer exists (deleted) or whose short_id is invalid. `page.tsx` calls
 * `notFound()` for those, which renders this instead of a bare 404 dead-end.
 * Public route (whitelisted in proxy.ts), so no auth gating here.
 */
export default async function SignupNotFound() {
  const t = await getTranslations('signup');
  return (
    <AppShell>
      <div className="mt-10 space-y-5">
        <header className="px-1">
          <p className="font-sans text-xs uppercase tracking-[0.12em] text-muted">
            {t('notFoundKicker')}
          </p>
          <h1 className="mt-1 font-serif text-[28px] font-medium leading-snug tracking-[-0.015em] text-text">
            {t('notFoundHeading')}
          </h1>
        </header>

        <Card>
          <div className="space-y-4">
            <p className="font-sans text-sm leading-relaxed text-text">
              {t('notFoundBody')}
            </p>
            <LinkButton href="/" full>
              {t('notFoundButton')}
            </LinkButton>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
