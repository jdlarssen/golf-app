import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getClubDetail } from '@/lib/clubs/getClubDetail';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { removeMember } from './actions';

type Params = Promise<{ id: string; userId: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

const ERROR_MESSAGES: Record<string, string> = {
  sole_owner:
    'Klubben må ha minst én eier. Overfør eierskap til et annet medlem først.',
  remove_failed: 'Noe gikk galt. Prøv igjen.',
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * /klubber/[id]/fjern/[userId] — dedicated remove-member confirm page.
 *
 * Owner/admin only. Shows the target member's name and a confirm button.
 * The removeMember action blocks if the target is the sole owner.
 *
 * Destructive action → dedicated route (repo rule: never inline toggle /
 * <details> for destructive flows).
 *
 * Part of #442 (Opprett klubb — eierskap + klubb-scoped oppdagbarhet).
 */
export default async function FjernMedlemPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id, userId: targetUserId } = await params;
  const sp = await searchParams;

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const detail = await getClubDetail(supabase, id, user.id);
  if (!detail) notFound();

  const { club, members, myRole } = detail;

  // Only owner/admin may access this page.
  if (myRole !== 'owner' && myRole !== 'admin') {
    redirect(`/klubber/${id}`);
  }

  // Prevent removing yourself via this route (use /forlat instead).
  if (targetUserId === user.id) {
    redirect(`/klubber/${id}/forlat`);
  }

  const target = members.find((m) => m.userId === targetUserId);
  if (!target) notFound();

  const errorCode = first(sp.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  return (
    <AppShell>
      <TopBar backHref={`/klubber/${id}`} kicker={club.name} />

      {errorMessage && (
        <div className="mb-6">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <div className="space-y-6">
        <div className="px-1">
          <h1 className="mb-2 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
            Fjern «{target.name}»?
          </h1>
          <p className="font-sans text-[13px] leading-relaxed text-muted">
            {target.name} mister tilgang til klubbens turneringer med én gang. En
            eier kan legge dem til igjen.
          </p>
        </div>

        <div
          className="rounded-xl border px-4 py-3.5"
          style={{ borderColor: 'rgba(180, 60, 60, 0.18)' }}
        >
          <p className="font-sans text-sm text-text">
            Du fjerner <strong>{target.name}</strong> fra{' '}
            <strong>{club.name}</strong>.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <form action={removeMember}>
            <input type="hidden" name="groupId" value={club.id} />
            <input type="hidden" name="targetUserId" value={targetUserId} />
            <SubmitButton
              className="w-full"
              style={{
                background: 'var(--danger-deep)',
                borderColor: 'var(--danger-deep)',
              }}
              pendingLabel="Fjerner …"
            >
              Fjern fra klubben
            </SubmitButton>
          </form>
          <SmartLink
            href={`/klubber/${id}`}
            className="rounded-full border border-border bg-surface px-4 py-3 text-center font-sans text-[13px] font-medium text-text min-h-[44px] flex items-center justify-center"
          >
            Avbryt
          </SmartLink>
        </div>
      </div>
    </AppShell>
  );
}
