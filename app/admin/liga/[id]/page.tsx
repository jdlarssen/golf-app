import { notFound } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { StatusChip, type StatusChipTone } from '@/components/ui/StatusChip';
import { getLigaSnapshot } from '@/lib/league/getLigaSnapshot';
import { getNewGameFormData } from '@/lib/games/newGameFormData';
import { formatShortDateNb } from '@/lib/format/date';
import { LigaRoundRow } from './LigaRoundRow';
import { LigaAddPlayers } from './LigaAddPlayers';
import { LigaRemovePlayer } from './LigaRemovePlayer';
import { LigaStatusActions } from './LigaStatusActions';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

const STATUS_TO_CHIP: Record<'draft' | 'active' | 'finished', StatusChipTone> = {
  draft: 'utkast',
  active: 'aktiv',
  finished: 'signert',
};

const STATUS_LABEL: Record<'draft' | 'active' | 'finished', string> = {
  draft: 'Utkast',
  active: 'Pågående',
  finished: 'Avsluttet',
};

const SCOPE_LABEL: Record<string, string> = {
  single_course_single_tee: 'Fast bane og tee',
  single_course: 'Fast bane, tee per runde',
  multi_course: 'Valgfri bane og tee per runde',
};

const STANDINGS_LABEL: Record<string, string> = {
  total: 'Total (sum mot par)',
  average: 'Snitt per runde',
};

const MISSED_LABEL: Record<string, string> = {
  penalty: 'Straffescore',
  must_play_all: 'Må spille alle',
};

function preferredName(p: { name: string | null; nickname: string | null }): string {
  return p.nickname?.trim() || p.name?.trim() || 'Ukjent spiller';
}

export default async function LigaDetailPage({ params }: { params: Params }) {
  const { id } = await params;

  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const [snapshot, { courses, players }] = await Promise.all([
    getLigaSnapshot(id),
    getNewGameFormData(),
  ]);

  if (!snapshot) notFound();

  const { league, rounds, participants } = snapshot;

  const status = league.status as 'draft' | 'active' | 'finished';
  const chipTone = STATUS_TO_CHIP[status];
  const statusLabel = STATUS_LABEL[status];

  // Mirror the server guard in startLeague: ≥1 round + ≥2 participants
  // (the marker rule needs two players to ever produce a counted result).
  const canStart = status === 'draft' && rounds.length >= 1 && participants.length >= 2;
  const canFinish = status === 'active';
  const startHint =
    status === 'draft' && (rounds.length < 1 || participants.length < 2)
      ? 'Du trenger minst 1 runde og 2 deltakere for å starte ligaen.'
      : undefined;

  const participantIds = new Set(participants.map((p) => p.userId));

  return (
    <AdminShell>
      <TopBar backHref="/admin/liga" kicker="Klubbhuset" />
      <BrassRibbon kicker={`Liga · ${statusLabel}`} />
      <PageHeader
        title={league.name}
        subtitle={`${formatShortDateNb(league.season_start)} – ${formatShortDateNb(league.season_end)}`}
        action={<StatusChip tone={chipTone} label={statusLabel} />}
      />

      {/* Info-kort */}
      <Card className="mb-5">
        <dl className="space-y-2 font-sans text-[13px]">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Sesong-modell</dt>
            <dd className="text-text font-medium">{STANDINGS_LABEL[league.standings_model] ?? league.standings_model}</dd>
          </div>
          {league.standings_model === 'total' && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Manglende runde</dt>
              <dd className="text-text font-medium">{MISSED_LABEL[league.missed_round_policy] ?? league.missed_round_policy}</dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Bane-omfang</dt>
            <dd className="text-text font-medium">{SCOPE_LABEL[league.course_scope] ?? league.course_scope}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Runder</dt>
            <dd className="tabular-nums text-text font-medium">{rounds.length}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Deltakere</dt>
            <dd className="tabular-nums text-text font-medium">{participants.length}</dd>
          </div>
        </dl>
        <div className="mt-4 pt-4 border-t border-border">
          <SmartLink
            href={`/liga/${id}`}
            className="text-sm text-primary underline-offset-2 hover:underline"
          >
            Se sesong-tabellen →
          </SmartLink>
        </div>
      </Card>

      {/* Status-handlinger */}
      {status !== 'finished' && (
        <section className="mb-5">
          <LigaStatusActions
            leagueId={id}
            status={status}
            canStart={canStart}
            canFinish={canFinish}
            startHint={startHint}
          />
        </section>
      )}

      {/* Runder */}
      <section className="mb-5">
        <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-3">
          Runder
        </h2>
        {rounds.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              Ingen runder generert. Ligaen ble opprettet med egendefinert frekvens, eller frekvensen ga ingen vinduer i sesong-spennet.
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {rounds.map((round) => (
              <li key={round.id}>
                <LigaRoundRow
                  round={round}
                  leagueId={id}
                  courseScope={league.course_scope}
                  courses={courses}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Deltakere */}
      <section className="mb-5">
        <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-3">
          Deltakere
        </h2>
        <Card>
          {participants.length === 0 ? (
            <p className="text-sm text-muted mb-4">Ingen deltakere ennå.</p>
          ) : (
            <ul className="space-y-1 mb-4">
              {participants.map((p) => (
                <li
                  key={p.userId}
                  className="flex items-center justify-between gap-2 py-1.5"
                >
                  <span className="font-sans text-[14px] text-text">
                    {preferredName(p)}
                  </span>
                  <LigaRemovePlayer leagueId={id} userId={p.userId} />
                </li>
              ))}
            </ul>
          )}

          {status !== 'finished' && (
            <>
              <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-3">
                Legg til deltakere
              </p>
              <LigaAddPlayers
                leagueId={id}
                players={players}
                participantIds={participantIds}
              />
            </>
          )}
        </Card>
      </section>

      {/* Slett-lenke */}
      <section className="mt-6 text-center">
        <SmartLink
          href={`/admin/liga/${id}/slett`}
          className="text-xs text-danger underline-offset-2 hover:underline"
        >
          Slett ligaen
        </SmartLink>
      </section>
    </AdminShell>
  );
}
