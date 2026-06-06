import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { getNewGameFormData } from '@/lib/games/newGameFormData';
import { CreateLigaForm } from './CreateLigaForm';

export default async function NewLigaPage() {
  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const { courses, players } = await getNewGameFormData();

  return (
    <AdminShell>
      <TopBar backHref="/admin/liga" kicker="Klubbhuset" />
      <BrassRibbon kicker="Ny liga" />
      <PageHeader
        title="Opprett liga"
        subtitle="Sett opp en sesong-serie med netto slagspill."
      />

      <CreateLigaForm courses={courses} players={players} />
    </AdminShell>
  );
}
