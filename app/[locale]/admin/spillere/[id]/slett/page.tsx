import { getTranslations, getLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getDeleteBlockReason } from '@/lib/users/deleteAccount';
import type { AppLocale } from '@/i18n/routing';
import { deleteUser } from './actions';

type Params = Promise<{ id: string }>;

export default async function DeletePlayerPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const supabase = await getServerClient();
  // Self-gate for Fase 4 chunk 2 layout-loosening (#223).
  await requireAdmin(supabase);
  const adminUserId = await getProxyVerifiedUserId();

  const locale = (await getLocale()) as AppLocale;

  const { data: target } = await supabase
    .from('users')
    .select('id, name, email')
    .eq('id', id)
    .maybeSingle();
  if (!target) notFound();

  // Block-betingelser: må re-sjekkes her, ikke bare på detaljsiden.
  if (target.id === adminUserId) {
    redirect({ href: `/admin/spillere/${id}?error=self_delete_forbidden`, locale });
  }

  // #1012: spillhistorikk blokkerer ikke lenger (den anonymiseres), men
  // deltakelse i / arrangering av noe pågående gjør det — delt regel med
  // selv-slett-flyten.
  const blockReason = await getDeleteBlockReason(id);
  if (blockReason === 'admin_account') {
    redirect({ href: `/admin/spillere/${id}?error=self_delete_forbidden`, locale });
  }
  if (blockReason === 'active_engagements') {
    redirect({ href: `/admin/spillere/${id}?error=target_active`, locale });
  }

  const { count: gamePlayerCount } = await supabase
    .from('game_players')
    .select('game_id', { count: 'exact', head: true })
    .eq('user_id', id);
  const hasPlayed = (gamePlayerCount ?? 0) > 0;

  const displayName = target!.name?.trim() || target!.email;
  const firstName = target!.name?.trim().split(/\s+/)[0] || 'Spilleren';
  const tDelete = await getTranslations('admin.players.delete');
  const tNav = await getTranslations('admin.nav');

  return (
    <AdminShell>
      <TopBar
        backHref={`/admin/spillere/${id}`}
        kicker={tNav('klubbhus')}
      />

      <BrassRibbon kicker={tDelete('kicker')} />

      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {tDelete('heading', { name: displayName })}
        </h1>
        <p className="font-sans text-[14px] leading-relaxed text-text">
          {hasPlayed
            ? tDelete('bodyPlayed', { email: target!.email, firstName })
            : tDelete('body', { email: target!.email, firstName })}
        </p>
        <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted">
          {tDelete('cannotUndo')}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        <form action={deleteUser}>
          <input type="hidden" name="id" value={target!.id} />
          <SubmitButton
            className="w-full"
            style={{ background: 'var(--danger-deep)', borderColor: 'var(--danger-deep)' }}
            pendingLabel={tDelete('deletingBusy')}
          >
            {tDelete('submitButton')}
          </SubmitButton>
        </form>
        <SmartLink
          href={`/admin/spillere/${id}`}
          className="rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text"
        >
          {tDelete('cancel')}
        </SmartLink>
      </div>
    </AdminShell>
  );
}
