import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { requestToJoin } from './actions';

type Params = Promise<{ shortId: string }>;
type SearchParams = Promise<{
  sent?: string | string[];
  error?: string | string[];
}>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * /klubber/bli-med/[shortId] — shareable join-link landing page.
 *
 * States:
 *   - Not logged in → redirect to /login?next=...
 *   - Club not found → 404
 *   - Already a member → confirmation card with link to club
 *   - Pending request exists (sent=1) → «Forespørselen er sendt» banner
 *   - Otherwise → club name + «Be om å bli med» form with optional message
 *
 * Part of #442 (Opprett klubb — eierskap + klubb-scoped oppdagbarhet).
 */
export default async function BliMedPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { shortId } = await params;
  const sp = await searchParams;

  const sent = first(sp.sent) === '1';
  const errorCode = first(sp.error);

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/klubber/bli-med/${shortId}`);
  }

  const admin = getAdminClient();

  // Look up club via admin client — non-member can't read groups via RLS.
  const { data: group } = await admin
    .from('groups')
    .select('id, name')
    .eq('short_id', shortId)
    .maybeSingle<{ id: string; name: string }>();

  if (!group) notFound();

  // Check membership status — use admin client for consistent access.
  const { data: membership } = await admin
    .from('group_members')
    .select('role')
    .eq('group_id', group.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membership) {
    // Already a member — show confirmation and link to club.
    return (
      <AppShell>
        <TopBar backHref="/klubber" kicker="Bli med i klubb" />
        <PageHeader title={group.name} />
        <Card>
          <p className="font-sans text-[15px] text-text mb-4">
            Du er allerede medlem av {group.name}.
          </p>
          <SmartLink
            href={`/klubber/${group.id}`}
            className="block rounded-full bg-primary px-4 py-3 text-center font-sans text-[15px] font-semibold text-white min-h-[44px] flex items-center justify-center"
          >
            Gå til klubben
          </SmartLink>
        </Card>
      </AppShell>
    );
  }

  // Check for existing pending request (to show correct state without ?sent=1).
  const { data: existingRequest } = await admin
    .from('group_join_requests')
    .select('id, status')
    .eq('group_id', group.id)
    .eq('user_id', user.id)
    .maybeSingle<{ id: string; status: string }>();

  const hasPendingRequest = existingRequest?.status === 'pending';
  const showSentState = sent || hasPendingRequest;

  const errorMessages: Record<string, string> = {
    unknown: 'Noe gikk galt. Prøv igjen.',
  };

  return (
    <AppShell>
      <TopBar backHref="/klubber" kicker="Bli med i klubb" />
      <PageHeader
        title={group.name}
        subtitle={
          showSentState
            ? undefined
            : 'Be om å bli med. Eieren godkjenner deg eller avslår.'
        }
      />

      {showSentState && (
        <div className="mb-6">
          <Banner tone="success">
            Forespørselen er sendt. Eieren må godkjenne den før du er med.
          </Banner>
        </div>
      )}

      {errorCode && !showSentState && (
        <div className="mb-6">
          <Banner tone="error">
            {errorMessages[errorCode] ?? 'Noe gikk galt. Prøv igjen.'}
          </Banner>
        </div>
      )}

      {!showSentState && (
        <Card>
          <form action={requestToJoin} className="space-y-4">
            <input type="hidden" name="shortId" value={shortId} />
            <div>
              <label
                htmlFor="join-message"
                className="mb-1.5 block font-sans text-[13px] font-medium text-muted"
              >
                Hilsen (valgfritt)
              </label>
              <textarea
                id="join-message"
                name="message"
                rows={3}
                maxLength={200}
                placeholder="Kort beskjed til eieren (hvem er du?)"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 font-sans text-[15px] text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
              <p className="mt-1 font-sans text-xs text-muted">Maks 200 tegn.</p>
            </div>
            <Button type="submit" className="w-full">
              Be om å bli med
            </Button>
          </form>
        </Card>
      )}
    </AppShell>
  );
}
