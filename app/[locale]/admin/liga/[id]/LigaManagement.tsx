import { notFound } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/ui/AdminShell';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { LinkButton } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { StatusChip } from '@/components/ui/StatusChip';
import { getLigaSnapshot } from '@/lib/league/getLigaSnapshot';
import { getNewGameFormData } from '@/lib/games/newGameFormData';
import { getFriendPlayerOptions } from '@/lib/friends/getFriendPlayerOptions';
import { getClubMemberOptionsForClub } from '@/lib/clubs/getClubMemberOptionsForClub';
import { ligaBasePath } from '@/lib/league/ligaPaths';
import type { PlayerOption } from '@/app/[locale]/admin/games/new/GameForm';
import { formatShortDateLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';
import { LigaRoundRow } from './LigaRoundRow';
import { LigaEmbedControl } from './LigaEmbedControl';
import { LigaAddRound } from './LigaAddRound';
import { LigaAddPlayers } from './LigaAddPlayers';
import { LigaStatusActions } from './LigaStatusActions';

/**
 * Shared league-management surface, rendered by two routes (#485):
 *  - `/admin/liga/[id]` (variant="admin") — global admin, inside AdminShell.
 *  - `/klubber/[id]/liga/[ligaId]` (variant="club") — the league's club
 *    owner/admin, inside AppShell with no admin chrome.
 *
 * Both routes gate first with `requireAdminOrClubAdminOfLeague` and pass the
 * caller's `userId` in. The variant only switches the shell and the delete- and
 * remove-link base path; every control (status actions, rounds, participants,
 * picker) is identical — there is no duplicated management UI.
 *
 * Co-located in the admin route tree next to its Liga* client sub-components;
 * the club routes import it cross-route, mirroring how `/klubber/[id]/liga/ny`
 * imports `CreateLigaForm` from `@/app/admin/liga/new`.
 */

function preferredName(
  p: { name: string | null; nickname: string | null },
  unknownLabel: string,
): string {
  return p.nickname?.trim() || p.name?.trim() || unknownLabel;
}

export type LigaManagementVariant = 'admin' | 'club';

/**
 * A participant row's «Fjern»: a link to the remove-confirm page (#2244). A
 * finished league's table is the season record, so its roster is locked and the
 * link is hidden (the action refuses it too).
 */
function removeLink({
  locked,
  href,
  userId,
  name,
  t,
}: {
  locked: boolean;
  href: string;
  userId: string;
  name: string;
  t: Awaited<ReturnType<typeof getTranslations<'liga'>>>;
}) {
  if (locked) return null;
  return (
    <LinkButton
      href={href}
      variant="ghost"
      data-testid={`liga-remove-${userId}`}
      aria-label={t('removePlayer.removeAria', { name })}
      className="text-danger text-[12px] px-2 py-1 min-h-[44px] rounded-lg"
    >
      {t('removePlayer.removeButton')}
    </LinkButton>
  );
}

/** Success receipt for a `?status=` the league page knows (#2244). */
function receiptBanner(
  statusCode: string | undefined,
  t: Awaited<ReturnType<typeof getTranslations<'liga'>>>,
) {
  if (statusCode !== 'player_removed') return null;
  return (
    <div className="mb-4">
      <Banner tone="success" testId="liga-status-banner">
        {t('manage.statusMessages.player_removed')}
      </Banner>
    </div>
  );
}

export async function LigaManagement({
  leagueId,
  userId,
  variant,
  statusCode,
}: {
  leagueId: string;
  userId: string;
  variant: LigaManagementVariant;
  /** `?status=` from the route — the receipt after a confirmed removal (#2244). */
  statusCode?: string;
}) {
  const [snapshot, { courses }, t, tStatus, locale] = await Promise.all([
    getLigaSnapshot(leagueId),
    getNewGameFormData(),
    getTranslations('liga'),
    getTranslations('gameStatus'),
    getLocale(),
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
  const statusLabel = tStatus(status);

  // Mirror the server guard in startLeague: ≥1 round + ≥2 participants
  // (the marker rule needs two players to ever produce a counted result).
  const canStart = status === 'draft' && rounds.length >= 1 && participants.length >= 2;
  const canFinish = status === 'active';
  const startHint =
    status === 'draft' && (rounds.length < 1 || participants.length < 2)
      ? t('manage.startHint')
      : undefined;

  const participantIds = new Set(participants.map((p) => p.userId));

  // #485: klubb-liga hører hjemme under /klubber; frittstående under /admin/liga.
  // Tilbake-lenken er klubb-bevisst i begge varianter (#483-arven gir en vei ut
  // for en klubb-admin som lander på den gamle admin-URL-en). Slett-flaten følger
  // varianten så klubb-admin holder seg i klubb-chrome hele veien.
  const Shell = variant === 'admin' ? AdminShell : AppShell;
  const backHref = groupId ? `/klubber/${groupId}` : '/admin/liga';
  const doorBase = ligaBasePath(leagueId, variant === 'club' ? groupId : null);
  const deleteHref = `${doorBase}/slett`;
  // #2244: «Fjern» opens a confirm page on the same door, never an inline delete.
  const removeHrefBase = `${doorBase}/fjern`;

  const brassRibbon = groupId
    ? t('manage.brassRibbonClub', { status: statusLabel })
    : t('manage.brassRibbonStandalone', { status: statusLabel });

  const standingsModelText = (() => {
    const base = t(`manage.standingsModelLabel.${league.standings_model}` as `manage.standingsModelLabel.${'total' | 'average' | 'best_n' | 'points'}`);
    if (league.standings_model === 'total') {
      const unit = league.format === 'stroke'
        ? t('manage.infoStandingsUnitPar')
        : t('manage.infoStandingsUnitPoints');
      return `${base}${t('manage.infoStandingsModelSuffix', { unit })}`;
    }
    if (league.standings_model === 'best_n' && league.best_n_count) {
      return `${base} (${league.best_n_count})`;
    }
    return base;
  })();

  return (
    <Shell>
      <TopBar backHref={backHref} kicker={clubName ?? t('ledger.kicker')} />
      <BrassRibbon kicker={brassRibbon} />
      <PageHeader
        title={league.name}
        subtitle={`${formatShortDateLocale(league.season_start, locale as AppLocale)} – ${formatShortDateLocale(league.season_end, locale as AppLocale)}`}
        action={<StatusChip status={status} />}
      />

      {receiptBanner(statusCode, t)}

      {/* Info-kort */}
      <Card className="mb-5">
        <dl className="space-y-2 font-sans text-[13px]">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t('manage.infoFormat')}</dt>
            <dd className="text-text font-medium">
              {t(`manage.formatLabel.${league.format}` as `manage.formatLabel.${'stroke' | 'stableford' | 'modified_stableford'}`) ?? league.format}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t('manage.infoStandingsModel')}</dt>
            <dd className="text-text font-medium">{standingsModelText}</dd>
          </div>
          {league.standings_model === 'total' && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t('manage.infoMissed')}</dt>
              <dd className="text-text font-medium">
                {t(`manage.missedLabel.${league.missed_round_policy}` as `manage.missedLabel.${'penalty' | 'must_play_all'}`) ?? league.missed_round_policy}
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t('manage.infoCourseScope')}</dt>
            <dd className="text-text font-medium">
              {t(`manage.scopeLabel.${league.course_scope}` as `manage.scopeLabel.${'single_course_single_tee' | 'single_course' | 'multi_course'}`) ?? league.course_scope}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t('manage.infoRounds')}</dt>
            <dd className="tabular-nums text-text font-medium">{rounds.length}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t('manage.infoParticipants')}</dt>
            <dd className="tabular-nums text-text font-medium">{participants.length}</dd>
          </div>
        </dl>
        <div className="mt-4 pt-4 border-t border-border">
          <SmartLink
            href={`/liga/${leagueId}`}
            className="tap-extend text-sm text-primary underline-offset-2 hover:underline [--tap-extend:-12px_-8px]"
          >
            {t('manage.standingsLink')}
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
          {t('manage.roundsHeading')}
        </h2>
        {rounds.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              {t('manage.noRoundsYet')}
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
          {t('manage.participantsHeading')}
        </h2>
        <Card>
          {participants.length === 0 ? (
            <p className="text-sm text-muted mb-4">{t('manage.noParticipantsYet')}</p>
          ) : (
            <ul className="space-y-1 mb-4">
              {participants.map((p) => {
                const name = preferredName(p, t('manage.unknownPlayer'));
                return (
                  <li
                    key={p.userId}
                    className="flex items-center justify-between gap-2 py-1.5"
                  >
                    <span className="font-sans text-[14px] text-text">{name}</span>
                    {removeLink({
                      locked: status === 'finished',
                      href: `${removeHrefBase}/${p.userId}`,
                      userId: p.userId,
                      name,
                      t,
                    })}
                  </li>
                );
              })}
            </ul>
          )}

          {status !== 'finished' && (
            <>
              <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-3">
                {t('manage.addParticipantsHeading')}
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

      {/* Embed på klubbsiden (#1024) */}
      <section className="mb-5">
        <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-3">
          {t('embed.heading')}
        </h2>
        <LigaEmbedControl
          leagueId={leagueId}
          spectateToken={league.spectate_token}
          locale={locale}
          leagueName={league.name}
        />
      </section>

      {/* Slett-lenke */}
      <section className="mt-6 text-center">
        <SmartLink
          href={deleteHref}
          className="tap-extend text-xs text-danger underline-offset-2 hover:underline [--tap-extend:-14px_-8px]"
        >
          {t('manage.deleteLink')}
        </SmartLink>
      </section>
    </Shell>
  );
}
