import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { getNewGameFormData } from '@/lib/games/newGameFormData';
import { getFriendPlayerOptions } from '@/lib/friends/getFriendPlayerOptions';
import { CreateLigaForm } from './CreateLigaForm';

export default async function NewLigaPage() {
  const supabase = await getServerClient();
  const { userId } = await requireAdmin(supabase);

  const t = await getTranslations('liga.create');

  // Non-club leagues invite friends only — it nudges people to add friends on
  // Tørny. The creator is offered too (pre-checked) so they can play in their
  // own league. `courses` still comes from the shared form-data helper.
  const [{ courses, players: allPlayers }, friends] = await Promise.all([
    getNewGameFormData(),
    getFriendPlayerOptions(userId),
  ]);
  const me = allPlayers.find((p) => p.id === userId) ?? null;
  const invitable = [...(me ? [me] : []), ...friends.filter((f) => f.id !== userId)];

  return (
    <AdminShell>
      <TopBar backHref="/admin/liga" kicker={t('kicker')} />
      <BrassRibbon kicker={t('brassRibbon')} />
      <PageHeader
        title={t('pageTitle')}
        subtitle={t('pageSubtitle')}
      />

      <CreateLigaForm courses={courses} players={invitable} meId={me?.id ?? null} />
    </AdminShell>
  );
}
