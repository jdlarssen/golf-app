import { SmartLink } from '@/components/ui/SmartLink';
import { getServerClient } from '@/lib/supabase/server';
import { resendInvitation } from '../actions';

type PendingInvitation = {
  id: string;
  email: string;
  created_at: string;
  opened_at: string | null;
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

function shortNb(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}. ${MONTHS_NB[d.getMonth()]}`;
}

/** Human-readable "X siden" relative time for recent timestamps. */
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'akkurat nå';
  if (mins < 60) return `${mins} min siden`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} t siden`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'i går';
  if (days < 7) return `${days} dager siden`;
  // Fall back to short date for older stamps
  return shortNb(iso);
}

export async function PendingInvitations() {
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from('invitations')
    .select('id, email, created_at, opened_at')
    .is('accepted_at', null)
    .order('created_at', { ascending: false })
    .returns<PendingInvitation[]>();

  if (error) throw error;
  const items = data ?? [];

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface px-5 py-6 text-center text-sm text-muted">
        Ingen ventende invitasjoner.
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-surface"
      style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
    >
      {items.map((inv, i) => (
        <PendingRow key={inv.id} inv={inv} index={i} />
      ))}
    </div>
  );
}

function PendingRow({
  inv,
  index,
}: {
  inv: PendingInvitation;
  index: number;
}) {
  return (
    <div
      className="reveal-up flex flex-wrap items-center justify-between gap-2 px-3.5 py-3"
      style={{
        animationDelay: `${60 + index * 50}ms`,
        borderTop: index === 0 ? 'none' : '1px solid var(--row-divider-warm)',
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-serif text-[15px] font-medium tracking-[-0.005em] text-text">
          {inv.email}
        </p>
        <p className="mt-0.5 font-sans text-[11.5px] tabular-nums text-muted">
          Sendt {shortNb(inv.created_at)}
        </p>
        <p className="mt-0.5 font-sans text-[11px] text-muted">
          {inv.opened_at ? (
            <span className="text-[#3a7d44]">
              Har bedt om kode {timeAgo(inv.opened_at)}
            </span>
          ) : (
            <span>Mail sendt, men ikke åpnet ennå</span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <form action={resendInvitation}>
          <input type="hidden" name="id" value={inv.id} />
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center rounded-full border border-border bg-surface px-4 py-2 font-sans text-[13px] font-medium text-text transition hover:bg-row-hover"
          >
            Send på nytt
          </button>
        </form>
        <SmartLink
          href={`/admin/spillere/invitations/${inv.id}/trekk-tilbake`}
          className="inline-flex min-h-[44px] items-center rounded-full border px-4 py-2 font-sans text-[13px] font-medium transition"
          style={{
            borderColor: 'rgba(180, 60, 60, 0.3)',
            color: '#a04040',
          }}
        >
          Trekk tilbake
        </SmartLink>
      </div>
    </div>
  );
}
