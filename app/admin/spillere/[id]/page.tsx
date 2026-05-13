import { notFound } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { BackLink } from '@/components/ui/BackLink';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { updateUser } from './actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  status?: string | string[];
  error?: string | string[];
}>;

const ERROR_MESSAGES: Record<string, string> = {
  name_required: 'Navn må fylles ut.',
  hcp_out_of_range: 'Handicap må være mellom -10 og 54.',
  update_failed: 'Klarte ikke lagre endringene.',
  not_admin: 'Du har ikke tilgang.',
  self_delete_forbidden: 'Du kan ikke slette din egen konto.',
  still_has_games: 'Spilleren har spillhistorikk og kan ikke slettes.',
  auth_delete_failed:
    'Klarte ikke slette kontoen — den har sannsynligvis data knyttet til seg (invitasjoner sendt, baner opprettet eller scores skrevet) som blokkerer sletting. Sjekk Vercel-loggene.',
  email_invalid: 'Ugyldig e-postadresse.',
  email_in_use: 'E-postadressen er allerede registrert.',
  email_update_failed: 'Klarte ikke oppdatere e-postadressen. Prøv igjen.',
  email_change_blocked_active_game:
    'Kan ikke endre e-post mens spilleren er i et aktivt spill.',
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const MONTHS_NB = [
  'jan', 'feb', 'mar', 'apr', 'mai', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'des',
];
function shortNb(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}. ${MONTHS_NB[d.getMonth()]} ${d.getFullYear()}`;
}

/** Relative time in Norwegian, e.g. "3 minutter siden", "2 dager siden" */
function relativeNb(iso: string | null | undefined): string {
  if (!iso) return 'Aldri';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return 'Akkurat nå';
  if (mins < 60) return `${mins} minutter siden`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'time' : 'timer'} siden`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? 'dag' : 'dager'} siden`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? 'måned' : 'måneder'} siden`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? 'år' : 'år'} siden`;
}

export default async function PlayerDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const status = first(sp.status);
  const errorCode = first(sp.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  const supabase = await getServerClient();
  const adminUserId = await getProxyVerifiedUserId();

  const { data: target, error } = await supabase
    .from('users')
    .select('id, name, nickname, email, hcp_index, is_admin, created_at, last_seen_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!target) notFound();

  // Count game_players rows (used for block-condition and activity stats).
  const { count: gamePlayerCount } = await supabase
    .from('game_players')
    .select('game_id', { count: 'exact', head: true })
    .eq('user_id', id);

  const isSelf = target.id === adminUserId;
  const hasPlayed = (gamePlayerCount ?? 0) > 0;
  const canDelete = !isSelf && !hasPlayed;

  // Pending invitees have NULL name until they finish profile.
  const displayName = target.name?.trim() || target.email;

  let deleteBlockReason: string | null = null;
  if (isSelf) deleteBlockReason = 'Du kan ikke slette din egen konto.';
  else if (hasPlayed) {
    const firstName = target.name?.trim().split(/\s+/)[0] || 'Spilleren';
    deleteBlockReason = `${firstName} har spilt ${gamePlayerCount} ${
      gamePlayerCount === 1 ? 'runde' : 'runder'
    }. Slett spillene først hvis du vil fjerne kontoen.`;
  }

  return (
    <AdminShell>
      <div className="-mt-3 mb-2 flex items-center justify-between">
        <BackLink href="/admin/spillere">Tilbake</BackLink>
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Sekretariatet
        </p>
        <span className="w-[80px]" aria-hidden />
      </div>

      <BrassRibbon kicker="Spillerprofil" />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {displayName}
        </h1>
        {target.nickname && (
          <p className="font-serif text-[14px] italic text-muted">
            ({target.nickname})
          </p>
        )}
        <p className="mt-1 font-sans text-[11.5px] tabular-nums text-muted">
          {target.email} · Registrert {shortNb(target.created_at)}
          {target.is_admin && ' · Super-admin'}
        </p>
      </div>

      {(status === 'updated' || errorMessage) && (
        <div className="mt-4 space-y-2">
          {status === 'updated' && (
            <Banner tone="success">Endringene er lagret.</Banner>
          )}
          {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        </div>
      )}

      {/* Activity section */}
      <section className="mt-5">
        <p className="mb-1.5 px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Aktivitet
        </p>
        <div
          className="rounded-xl border border-border bg-surface px-4 py-3.5"
          style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
        >
          <dl className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <dt className="font-sans text-[13px] text-muted">Sist innlogget</dt>
              <dd className="font-sans text-[13px] tabular-nums text-text">
                {relativeNb(target.last_seen_at)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="font-sans text-[13px] text-muted">Antall spill</dt>
              <dd className="font-sans text-[13px] tabular-nums text-text">
                {gamePlayerCount ?? 0}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Edit form */}
      <section className="mt-5">
        <div
          className="rounded-xl border border-border bg-surface p-4"
          style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
        >
          <form action={updateUser} className="space-y-3">
            <input type="hidden" name="id" value={target.id} />
            <Input
              id="name"
              name="name"
              label="Navn"
              defaultValue={target.name ?? ''}
              required
            />
            <Input
              id="nickname"
              name="nickname"
              label="Kallenavn"
              defaultValue={target.nickname ?? ''}
              placeholder="Valgfritt"
            />
            <Input
              id="email"
              name="email"
              type="email"
              label="E-post"
              defaultValue={target.email}
              required
            />
            <Input
              id="hcp_index"
              name="hcp_index"
              type="number"
              step="0.1"
              min="-10"
              max="54"
              label="Handicap-indeks"
              defaultValue={target.hcp_index.toString()}
              required
            />
            <Button type="submit" className="w-full">
              Lagre endringer
            </Button>
          </form>
        </div>
      </section>

      <section className="mt-6">
        <p className="mb-1.5 px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Faresone
        </p>
        <div
          className="rounded-xl border bg-surface px-4 py-3.5"
          style={{
            borderColor: 'rgba(180, 60, 60, 0.18)',
            boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)',
          }}
        >
          {canDelete ? (
            <div className="text-center">
              <SmartLink
                href={`/admin/spillere/${target.id}/slett`}
                className="font-sans text-[13px] font-medium"
                style={{ color: '#a04040' }}
              >
                Slett spilleren
              </SmartLink>
            </div>
          ) : (
            <p className="text-center font-sans text-[12.5px] text-muted">
              {deleteBlockReason}
            </p>
          )}
        </div>
      </section>
    </AdminShell>
  );
}
