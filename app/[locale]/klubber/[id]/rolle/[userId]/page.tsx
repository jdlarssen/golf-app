import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getClubDetail } from '@/lib/clubs/getClubDetail';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { setMemberRole } from './actions';

type Params = Promise<{ id: string; userId: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

const ROLE_LABELS: Record<'owner' | 'admin' | 'member', string> = {
  owner: 'Eier',
  admin: 'Admin',
  member: 'Medlem',
};

const ERROR_MESSAGES: Record<string, string> = {
  last_owner: 'Klubben må ha minst én eier. Gjør et annet medlem til eier først.',
  not_member: 'Fant ikke medlemmet.',
  not_auth: 'Bare eieren kan endre roller.',
  unknown: 'Noe gikk galt. Prøv igjen.',
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * /klubber/[id]/rolle/[userId] — change a member's role within the club.
 *
 * Owner-only page. Shows the target member's current role and lets the owner
 * select a new role (member / admin / owner) via a radio group.
 *
 * Destructive/significant action → dedicated route (repo rule: one door per room).
 *
 * Part of #50 (Klubb-eierskap, delegering & tilgangsstyring).
 */
export default async function EndreMedlemsrollePage({
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

  // Only the owner may change roles.
  if (myRole !== 'owner') {
    redirect(`/klubber/${id}`);
  }

  // Can't change your own role via this route.
  if (targetUserId === user.id) {
    redirect(`/klubber/${id}`);
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
            Endre rolle for {target.name}
          </h1>
          <p className="font-sans text-[13px] leading-relaxed text-muted">
            Eier kan styre alt i klubben. Admin kan legge til og fjerne
            medlemmer. Medlem kan bli med på klubbens runder.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
          <p className="font-sans text-sm text-muted">
            Nåværende rolle:{' '}
            <span className="font-medium text-text">
              {ROLE_LABELS[target.role]}
            </span>
          </p>
        </div>

        <form action={setMemberRole} className="space-y-3">
          <input type="hidden" name="groupId" value={club.id} />
          <input type="hidden" name="targetUserId" value={targetUserId} />

          <fieldset className="space-y-2">
            <legend className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              Ny rolle
            </legend>

            {(
              [
                { value: 'member', label: 'Medlem' },
                { value: 'admin', label: 'Admin' },
                { value: 'owner', label: 'Eier' },
              ] as const
            ).map(({ value, label }) => (
              <label
                key={value}
                className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
              >
                <input
                  type="radio"
                  name="role"
                  value={value}
                  defaultChecked={target.role === value}
                  className="h-4 w-4 accent-primary"
                />
                <span className="font-sans text-sm font-medium text-text">
                  {label}
                </span>
              </label>
            ))}
          </fieldset>

          <SubmitButton className="w-full" pendingLabel="Lagrer …">
            Lagre rolle
          </SubmitButton>
        </form>

        <SmartLink
          href={`/klubber/${id}`}
          className="block rounded-full border border-border bg-surface px-4 py-3 text-center font-sans text-[13px] font-medium text-text min-h-[44px] flex items-center justify-center"
        >
          Avbryt
        </SmartLink>
      </div>
    </AppShell>
  );
}
