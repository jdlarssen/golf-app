import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { BackLink } from '@/components/ui/BackLink';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Button } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { deleteUser } from './actions';

type Params = Promise<{ id: string }>;

export default async function DeletePlayerPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const supabase = await getServerClient();
  const adminUserId = await getProxyVerifiedUserId();

  const { data: target } = await supabase
    .from('users')
    .select('id, name, email')
    .eq('id', id)
    .maybeSingle();
  if (!target) notFound();

  // Block-betingelser: må re-sjekkes her, ikke bare på detaljsiden.
  if (target.id === adminUserId) {
    redirect(`/admin/spillere/${id}?error=self_delete_forbidden`);
  }

  const { count: gamePlayerCount } = await supabase
    .from('game_players')
    .select('game_id', { count: 'exact', head: true })
    .eq('user_id', id);

  if ((gamePlayerCount ?? 0) > 0) {
    redirect(`/admin/spillere/${id}?error=still_has_games`);
  }

  const firstName = target.name.trim().split(/\s+/)[0] || 'Spilleren';

  return (
    <AdminShell>
      <div className="-mt-3 mb-2 flex items-center justify-between">
        <BackLink href={`/admin/spillere/${id}`}>Tilbake</BackLink>
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Sekretariatet
        </p>
        <span className="w-[80px]" aria-hidden />
      </div>

      <BrassRibbon kicker="Bekreft sletting" />

      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          Slett {target.name}?
        </h1>
        <p className="font-sans text-[14px] leading-relaxed text-text">
          Kontoen og e-postadressen ({target.email}) frigjøres. {firstName} har
          aldri spilt en runde, så ingen historikk forsvinner.
        </p>
        <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted">
          Handlingen kan ikke angres.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        <form action={deleteUser}>
          <input type="hidden" name="id" value={target.id} />
          <Button
            type="submit"
            className="w-full"
            style={{ background: '#a04040', borderColor: '#a04040' }}
          >
            Bekreft sletting
          </Button>
        </form>
        <SmartLink
          href={`/admin/spillere/${id}`}
          className="rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text"
        >
          Avbryt
        </SmartLink>
      </div>
    </AdminShell>
  );
}
