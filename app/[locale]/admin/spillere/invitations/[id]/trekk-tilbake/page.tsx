import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { withdrawInvitation } from '../../../actions';

type Params = Promise<{ id: string }>;

export default async function WithdrawInvitationPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const supabase = await getServerClient();
  // Self-gate for Fase 4 chunk 2 layout-loosening (#223).
  await requireAdmin(supabase);

  const { data: inv } = await supabase
    .from('invitations')
    .select('id, email, accepted_at')
    .eq('id', id)
    .maybeSingle();
  if (!inv) notFound();
  if (inv.accepted_at) {
    redirect('/admin/spillere?error=withdraw_failed');
  }

  return (
    <AdminShell>
      <TopBar backHref="/admin/spillere" kicker="Klubbhuset" />

      <BrassRibbon kicker="Bekreft tilbaketrekking" />

      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          Trekk tilbake invitasjon?
        </h1>
        <p className="font-sans text-[14px] leading-relaxed text-text">
          Invitasjonen til <strong>{inv.email}</strong> forsvinner og
          e-postadressen frigjøres slik at du kan invitere på nytt.
        </p>
        <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted">
          Handlingen kan ikke angres.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        <form action={withdrawInvitation}>
          <input type="hidden" name="id" value={inv.id} />
          <SubmitButton
            className="w-full"
            style={{ background: 'var(--danger-deep)', borderColor: 'var(--danger-deep)' }}
            pendingLabel="Trekker tilbake …"
          >
            Bekreft tilbaketrekking
          </SubmitButton>
        </form>
        <SmartLink
          href="/admin/spillere"
          className="rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text"
        >
          Avbryt
        </SmartLink>
      </div>
    </AdminShell>
  );
}
