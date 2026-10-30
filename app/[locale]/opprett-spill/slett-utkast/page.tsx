import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { first } from '@/lib/url/searchParams';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { ConfirmDeleteDraft } from './ConfirmDeleteDraft';

/**
 * «Slett utkastet» (#2459): the confirmation page for the unfinished new-game
 * setup on Home's «Fortsett der du slapp» card. Dedicated page, as every
 * destructive flow here is (CLAUDE.md), never an inline toggle.
 *
 * The draft lives in this device's localStorage, so the server cannot see it:
 * it only gates on login and hands the signed-in user's id and the `?utkast=`
 * key to the client part, which checks the key against that user's own drafts
 * before it shows or deletes anything.
 */
export default async function SlettUtkastPage({
  searchParams,
}: {
  searchParams: Promise<{ utkast?: string | string[] }>;
}) {
  const locale = await getLocale();
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });

  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: 'resumeDraft.deletePage' });

  return (
    <AppShell>
      <TopBar backHref="/" kicker={t('kicker')} />
      <ConfirmDeleteDraft userId={user.id} draftKey={first(sp.utkast) ?? ''} />
    </AppShell>
  );
}
