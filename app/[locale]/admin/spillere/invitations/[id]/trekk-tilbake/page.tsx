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
import type { AppLocale } from '@/i18n/routing';
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

  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('admin.players.withdrawInvitation');
  const tNav = await getTranslations('admin.nav');

  const { data: inv } = await supabase
    .from('invitations')
    .select('id, email, accepted_at')
    .eq('id', id)
    .maybeSingle();
  if (!inv) notFound();
  if (inv.accepted_at) {
    redirect({ href: '/admin/spillere?error=withdraw_failed', locale });
  }

  return (
    <AdminShell>
      <TopBar backHref="/admin/spillere" kicker={tNav('klubbhus')} />

      <BrassRibbon kicker={t('kicker')} />

      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {t('heading')}
        </h1>
        <p className="font-sans text-[14px] leading-relaxed text-text">
          {t.rich('bodyRich', {
            email: inv!.email,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
        <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted">
          {t('cannotUndo')}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        <form action={withdrawInvitation}>
          <input type="hidden" name="id" value={inv!.id} />
          <SubmitButton
            className="w-full"
            style={{ background: 'var(--danger-deep)', borderColor: 'var(--danger-deep)' }}
            pendingLabel={t('withdrawingBusy')}
          >
            {t('submitButton')}
          </SubmitButton>
        </form>
        <SmartLink
          href="/admin/spillere"
          className="rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text"
        >
          {t('cancel')}
        </SmartLink>
      </div>
    </AdminShell>
  );
}
