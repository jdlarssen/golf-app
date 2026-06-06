import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { getClubForAdmin } from '@/lib/clubs/getClubForAdmin';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Input } from '@/components/ui/Input';
import { getClubStatusBadge } from '@/lib/clubs/clubStatus';
import { VarighetField } from '../VarighetField';
import { updateClubTerms } from './actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  updated?: string | string[];
  error?: string | string[];
}>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

const ROLE_LABELS: Record<'owner' | 'admin' | 'member', string> = {
  owner: 'Eier',
  admin: 'Admin',
  member: 'Medlem',
};

const requireAdminContext = cache(async () => {
  const supabase = await getServerClient();
  await requireAdmin(supabase);
});

/**
 * /admin/klubber/[id] — admin club governance detail page.
 *
 * Shows all members with role badges, plus an "Avtale"-section for editing
 * member_cap and valid_until (admin-only).
 *
 * Part of #50 (Klubb-eierskap, delegering & tilgangsstyring).
 */
export default async function AdminKlubbDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  await requireAdminContext();

  const { id } = await params;
  const sp = await searchParams;

  const detail = await getClubForAdmin(id);
  if (!detail) notFound();

  const { club, members } = detail;
  const updatedFlag = first(sp.updated);
  const errorCode = first(sp.error);

  // Derive current valid_until date string (YYYY-MM-DD) for the date input
  const currentDateStr = club.valid_until
    ? club.valid_until.slice(0, 10)
    : '';
  const hasValidUntil = Boolean(club.valid_until);

  const statusBadge = getClubStatusBadge(club.valid_until);

  return (
    <AdminShell>
      <TopBar backHref="/admin/klubber" kicker={club.name} />
      <PageHeader title={club.name} />

      {updatedFlag && (
        <div className="mb-6">
          <Banner tone="success">Avtalen er oppdatert.</Banner>
        </div>
      )}

      {errorCode === 'unknown' && (
        <div className="mb-6">
          <Banner tone="error">Noe gikk galt. Prøv igjen.</Banner>
        </div>
      )}

      {/* Members list */}
      <section className="mb-8">
        <h2 className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Medlemmer ({members.length}
          {club.member_cap != null ? ` / ${club.member_cap}` : ''})
        </h2>
        {members.length === 0 ? (
          <Card>
            <p className="font-sans text-sm text-muted">Ingen medlemmer ennå.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {members.map((member) => (
              <Card key={member.userId} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-sans text-[15px] font-medium text-text">
                    {member.name}
                  </span>
                  <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 font-sans text-xs text-muted">
                    {ROLE_LABELS[member.role]}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Avtale section */}
      <section className="mb-8">
        <h2 className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Avtale
        </h2>
        <Card>
          {/* Status line */}
          <div className="mb-4 flex items-center gap-2">
            <span className="font-sans text-sm text-muted">Status:</span>
            <span
              className={`rounded-full border px-2.5 py-0.5 font-sans text-xs font-medium ${statusBadge.className}`}
            >
              {statusBadge.label}
            </span>
          </div>

          <form action={updateClubTerms} className="space-y-5">
            <input type="hidden" name="group_id" value={club.id} />

            <Input
              id="member_cap"
              name="member_cap"
              type="number"
              label="Medlemstak (valgfritt)"
              placeholder="F.eks. 150"
              min={1}
              defaultValue={club.member_cap ?? ''}
              hint="La stå tom for ubegrenset."
            />

            <VarighetField
              defaultMode={hasValidUntil ? 'dato' : 'uendelig'}
              defaultDate={currentDateStr}
            />

            <SubmitButton className="w-full" pendingLabel="Lagrer …">
              Lagre avtale
            </SubmitButton>
          </form>
        </Card>
      </section>
    </AdminShell>
  );
}
