import { notFound } from 'next/navigation';
import { getAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/ui/AdminShell';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { StatusChip, type StatusChipTone } from '@/components/ui/StatusChip';
import { getLigaSnapshot } from '@/lib/league/getLigaSnapshot';
import { getNewGameFormData } from '@/lib/games/newGameFormData';
import { getFriendPlayerOptions } from '@/lib/friends/getFriendPlayerOptions';
import { getClubMemberOptionsForClub } from '@/lib/clubs/getClubMemberOptionsForClub';
import type { PlayerOption } from '@/app/admin/games/new/GameForm';
import { formatShortDateNb } from '@/lib/format/date';
import { LigaRoundRow } from './LigaRoundRow';
import { LigaAddRound } from './LigaAddRound';
import { LigaAddPlayers } from './LigaAddPlayers';
import { LigaRemovePlayer } from './LigaRemovePlayer';
import { LigaStatusActions } from './LigaStatusActions';

/**
 * Shared league-management surface, rendered by two routes (#485):
 *  - `/admin/liga/[id]` (variant="admin") — global admin, inside AdminShell.
 *  - `/klubber/[id]/liga/[ligaId]` (variant="club") — the league's club
 *    owner/admin, inside AppShell with no admin chrome.
 *
 * Both routes gate first with `requireAdminOrClubAdminOfLeague` and pass the
 * caller's `userId` in. The variant only switches the shell and the delete-link
 * base path; every control (status actions, rounds, participants, picker) is
 * identical — there is no duplicated management UI.
 *
 * Co-located in the admin route tree next to its Liga* client sub-components;
 * the club routes import it cross-route, mirroring how `/klubber/[id]/liga/ny`
 * imports `CreateLigaForm` from `@/app/admin/liga/new`.
 */

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
  best_n: 'Beste N runder',
};

const SCORING_LABEL: Record<string, string> = {
  net: 'Netto',
  gross: 'Brutto',
  both: 'Netto og brutto',
};

const MISSED_LABEL: Record<string, string> = {
  penalty: 'Straffescore',
  must_play_all: 'Må spille alle',
};

function preferredName(p: { name: string | null; nickname: string | null }): string {
  return p.nickname?.trim() || p.name?.trim() || 'Ukjent spiller';
}

export type LigaManagementVariant = 'admin' | 'club';

export async function LigaManagement({
  leagueId,
  userId,
  variant,
}: {
  leagueId: string;
  userId: string;
  variant: LigaManagementVariant;
}) {
  const [snapshot, { courses }] = await Promise.all([
    getLigaSnapshot(leagueId),
    getNewGameFormData(),
  ]);

  if (!snapshot) notFound();

  const { league, rounds, participants } = snapshot;

  // #483: deltaker-picker følger ligaens kontekst — klubbmedlemmer for en klubb-
  // liga (speiler #464/#480), ellers vennene dine. Klubb-navn til chrome.
  const groupId = league.group_id;
  // #485: en frittstående liga (group_id null) hører ikke hjemme under /klubber.
  // Nås kun ved at en global admin håndskriver URL-en; behandle som 404 så vi
  // aldri bygger en /klubber/null/...-lenke.
  if (variant === 'club' && !groupId) notFound();
  let invitable: PlayerOption[];
  let clubName: string | null = null;
  if (groupId) {
    const [members, clubRow] = await Promise.all([
      getClubMemberOptionsForClub(groupId),
      getAdminClient().from('groups').select('name').eq('id', groupId).maybeSingle(),
    ]);
    invitable = members;
    clubName = (clubRow.data?.name as string | null | undefined) ?? null;
  } else {
    invitable = await getFriendPlayerOptions(userId);
  }

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

  // #485: klubb-liga hører hjemme under /klubber; frittstående under /admin/liga.
  // Tilbake-lenken er klubb-bevisst i begge varianter (#483-arven gir en vei ut
  // for en klubb-admin som lander på den gamle admin-URL-en). Slett-flaten følger
  // varianten så klubb-admin holder seg i klubb-chrome hele veien.
  const Shell = variant === 'admin' ? AdminShell : AppShell;
  const backHref = groupId ? `/klubber/${groupId}` : '/admin/liga';
  const deleteHref =
    variant === 'club'
      ? `/klubber/${groupId}/liga/${leagueId}/slett`
      : `/admin/liga/${leagueId}/slett`;

  return (
    <Shell>
      <TopBar backHref={backHref} kicker={clubName ?? 'Klubbhuset'} />
      <BrassRibbon kicker={`${groupId ? 'Klubb-liga' : 'Liga'} · ${statusLabel}`} />
      <PageHeader
        title={league.name}
        subtitle={`${formatShortDateNb(league.season_start)} – ${formatShortDateNb(league.season_end)}`}
        action={<StatusChip tone={chipTone} label={statusLabel} />}
      />

      {/* Info-kort */}
      <Card className="mb-5">
        <dl className="space-y-2 font-sans text-[13px]">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Tabell</dt>
            <dd className="text-text font-medium">{SCORING_LABEL[league.scoring] ?? league.scoring}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Sesong-modell</dt>
            <dd className="text-text font-medium">
              {STANDINGS_LABEL[league.standings_model] ?? league.standings_model}
              {league.standings_model === 'best_n' && league.best_n_count
                ? ` (${league.best_n_count})`
                : ''}
            </dd>
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
            href={`/liga/${leagueId}`}
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
            leagueId={leagueId}
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
                  leagueId={leagueId}
                  courseScope={league.course_scope}
                  courses={courses}
                />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <LigaAddRound leagueId={leagueId} />
        </div>
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
                  <LigaRemovePlayer leagueId={leagueId} userId={p.userId} />
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
                leagueId={leagueId}
                players={invitable}
                participantIds={participantIds}
                isClubLeague={Boolean(groupId)}
              />
            </>
          )}
        </Card>
      </section>

      {/* Slett-lenke */}
      <section className="mt-6 text-center">
        <SmartLink
          href={deleteHref}
          className="text-xs text-danger underline-offset-2 hover:underline"
        >
          Slett ligaen
        </SmartLink>
      </section>
    </Shell>
  );
}
