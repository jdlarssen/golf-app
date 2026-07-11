import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdmin } from '@/lib/admin/auth';
import { getClubDetail } from '@/lib/clubs/getClubDetail';
import { getClubMemberOptionsForClub } from '@/lib/clubs/getClubMemberOptionsForClub';
import { getNewGameFormData } from '@/lib/games/newGameFormData';
import { defaultSeasonDates } from '@/lib/league/defaultSeason';
import { isClubExpired } from '@/lib/clubs/clubStatus';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { CreateLigaForm } from '@/app/[locale]/admin/liga/new/CreateLigaForm';

type Params = Promise<{ id: string }>;

/**
 * /klubber/[id]/liga/ny — opprett en klubb-scopet liga (#480 Fase 1).
 *
 * Gatet til klubbens eier/admin (eller global admin) via requireAdminOrClubAdmin.
 * Deltaker-pickeren mates med klubbens medlemmer (ikke venner), og ligaen lagres
 * med group_id = klubben. Gjenbruker `CreateLigaForm` med klubb-kontekst-props.
 * Frossen klubb → redirect tilbake (tar ikke nye ligaer, speiler «Sett opp runde»).
 */
export default async function NewKlubbLigaPage({ params }: { params: Params }) {
  const { id } = await params;

  const supabase = await getServerClient();
  const { userId } = await requireAdminOrClubAdmin(supabase, id);

  const detail = await getClubDetail(supabase, id, userId);
  if (!detail) notFound();
  if (isClubExpired(detail.club.valid_until)) {
    redirect({ href: `/klubber/${id}`, locale: await getLocale() });
  }

  const t = await getTranslations('liga.create');

  const [{ courses }, members] = await Promise.all([
    getNewGameFormData(),
    getClubMemberOptionsForClub(id),
  ]);

  // Creator pre-selected (if a member) so they can play in the league they set up.
  const me = members.find((p) => p.id === userId) ?? null;
  const invitable = [
    ...(me ? [me] : []),
    ...members.filter((p) => p.id !== userId),
  ];

  // #1178: same server-computed season default as the standalone liga page.
  const { start: defaultSeasonStart, end: defaultSeasonEnd } = defaultSeasonDates(new Date());

  return (
    <AppShell>
      <TopBar backHref={`/klubber/${id}`} kicker={detail.club.name} />
      <BrassRibbon kicker={t('klubbLigaBrassRibbon')} />
      <PageHeader
        title={t('pageTitle')}
        subtitle={t('clubPageSubtitle', { clubName: detail.club.name })}
      />

      <CreateLigaForm
        courses={courses}
        players={invitable}
        meId={me?.id ?? null}
        defaultSeasonStart={defaultSeasonStart}
        defaultSeasonEnd={defaultSeasonEnd}
        groupId={id}
        clubName={detail.club.name}
      />
    </AppShell>
  );
}
