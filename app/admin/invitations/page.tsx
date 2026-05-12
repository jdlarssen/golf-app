import { getServerClient } from '@/lib/supabase/server';
import { BackLink } from '@/components/ui/BackLink';
import { AdminShell } from '@/components/ui/AdminShell';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { MiniRibbon } from '@/components/ui/MiniRibbon';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { sendInvitation } from './actions';

type SearchParams = Promise<{
  status?: string | string[];
  email?: string | string[];
  error?: string | string[];
}>;

const ERROR_MESSAGES: Record<string, string> = {
  email_required: 'Du må fylle inn en e-postadresse.',
  rate_limited: 'Vent litt før du sender en ny invitasjon.',
  log_failed:
    'Invitasjonen ble sendt, men loggføring feilet. Sjekk databasen.',
  unknown: 'Noe gikk galt. Prøv igjen.',
};

const MONTHS_NB = [
  'jan',
  'feb',
  'mar',
  'apr',
  'mai',
  'jun',
  'jul',
  'aug',
  'sep',
  'okt',
  'nov',
  'des',
];

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function shortNb(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getDate()}. ${MONTHS_NB[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

type InvitationRow = {
  id: string;
  email: string;
  created_at: string;
  accepted_at: string | null;
};

export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const status = first(params.status);
  const sentEmail = first(params.email) ?? '';
  const errorCode = first(params.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  const supabase = await getServerClient();
  const { data: invitations, error } = await supabase
    .from('invitations')
    .select('id, email, created_at, accepted_at')
    .order('created_at', { ascending: false })
    .limit(20)
    .returns<InvitationRow[]>();

  // Surface query errors loudly; admins want to know if their audit log is
  // broken rather than silently rendering an empty list.
  if (error) {
    throw error;
  }

  const items = invitations ?? [];
  const acceptedCount = items.filter((i) => i.accepted_at != null).length;
  const pendingCount = items.length - acceptedCount;

  return (
    <AdminShell>
      <div className="-mt-3 mb-2 flex items-center justify-between">
        <BackLink href="/admin">Tilbake</BackLink>
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Sekretariatet
        </p>
        <span className="w-[80px]" aria-hidden />
      </div>

      <BrassRibbon kicker="Invitasjoner · protokoll" />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          Inviter spillere
        </h1>
        <p className="font-sans text-[11.5px] tabular-nums text-muted">
          {items.length} sendte · {acceptedCount} akseptert · {pendingCount} venter
        </p>
      </div>

      {(status === 'sent' || errorMessage) && (
        <div className="mt-4 space-y-2">
          {status === 'sent' && (
            <Banner tone="success">✓ Invitasjon sendt til {sentEmail}.</Banner>
          )}
          {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        </div>
      )}

      <section className="mt-5">
        <MiniRibbon>Send ny</MiniRibbon>
        <div
          className="rounded-xl border border-border bg-surface p-4"
          style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
        >
          <form action={sendInvitation} className="space-y-3">
            <Input
              id="email"
              name="email"
              type="email"
              label="E-postadresse"
              placeholder="spiller@example.com"
              autoComplete="email"
              required
            />
            <Button type="submit" className="w-full">
              Send invitasjon
            </Button>
          </form>
        </div>
      </section>

      <section className="mt-5">
        <MiniRibbon>Sendte invitasjoner</MiniRibbon>
        {items.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface px-5 py-6 text-center text-sm text-muted">
            Ingen invitasjoner sendt ennå.
          </div>
        ) : (
          <div
            className="overflow-hidden rounded-xl border border-border bg-surface"
            style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
          >
            {items.map((inv, i) => {
              const accepted = inv.accepted_at != null;
              return (
                <div
                  key={inv.id}
                  className="reveal-up flex items-center justify-between gap-3 px-3.5 py-3"
                  style={{
                    animationDelay: `${60 + i * 50}ms`,
                    borderTop:
                      i === 0 ? 'none' : '1px solid var(--row-divider-warm)',
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate font-serif text-[15px] font-medium tracking-[-0.005em] text-text">
                      {inv.email}
                    </p>
                    <p className="mt-0.5 font-sans text-[11.5px] tabular-nums text-muted">
                      {shortNb(inv.created_at)}
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-[7px] py-[3px] font-sans text-[9.5px] font-semibold uppercase"
                    style={{
                      letterSpacing: '0.16em',
                      background: accepted
                        ? 'rgba(74, 124, 89, 0.16)'
                        : 'rgba(216, 155, 58, 0.18)',
                      color: accepted ? '#2f5a3c' : '#7a5410',
                    }}
                  >
                    {accepted ? 'Akseptert' : 'Venter'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="mt-6 text-center font-serif text-[11px] italic leading-relaxed text-muted">
        Hver invitasjon blir signert med et magisk lenke-stempel.
      </p>
    </AdminShell>
  );
}
