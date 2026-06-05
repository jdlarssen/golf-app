import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getClubDetail } from '@/lib/clubs/getClubDetail';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { leaveClub } from './actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

const ERROR_MESSAGES: Record<string, string> = {
  sole_owner:
    'Klubben må ha minst én eier. Overfør eierskap til et annet medlem først.',
  leave_failed: 'Noe gikk galt. Prøv igjen.',
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * /klubber/[id]/forlat — dedicated leave-club confirm page.
 *
 * Shows the club name and a confirm button. The leaveClub action blocks
 * if the caller is the sole owner.
 *
 * Destructive action → dedicated route (repo rule: never inline toggle /
 * <details> for destructive flows).
 *
 * Part of #442 (Opprett klubb — eierskap + klubb-scoped oppdagbarhet).
 */
export default async function ForlatKlubbPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const detail = await getClubDetail(supabase, id, user.id);
  if (!detail) notFound();

  const { club } = detail;
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
            Forlat «{club.name}»?
          </h1>
          <p className="font-sans text-[13px] leading-relaxed text-muted">
            Du mister tilgang til klubbens turneringer. Eieren kan legge deg til
            igjen om du ber om det.
          </p>
        </div>

        <div
          className="rounded-xl border px-4 py-3.5"
          style={{ borderColor: 'rgba(180, 60, 60, 0.18)' }}
        >
          <p className="font-sans text-sm text-text">
            Du forlater <strong>{club.name}</strong>. Handlingen kan ikke angres.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <form action={leaveClub}>
            <input type="hidden" name="groupId" value={club.id} />
            <Button
              type="submit"
              className="w-full"
              style={{
                background: 'var(--danger-deep)',
                borderColor: 'var(--danger-deep)',
              }}
            >
              Forlat klubben
            </Button>
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
