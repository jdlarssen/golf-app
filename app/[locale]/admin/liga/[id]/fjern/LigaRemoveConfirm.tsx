import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/ui/AdminShell';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { participantNames } from '@/lib/format/participantNames';
import { isUuid } from '@/lib/url/isUuid';
import { ligaBasePath } from '@/lib/league/ligaPaths';
import { removeLeaguePlayer } from '@/lib/league/actions';

/**
 * Shared confirm page before an organiser removes a participant from a league
 * (#2244), rendered by two routes:
 *  - `/admin/liga/[id]/fjern/[userId]` (variant="admin") — AdminShell.
 *  - `/klubber/[id]/liga/[ligaId]/fjern/[userId]` (variant="club") — AppShell,
 *    so a club admin never leaves club chrome.
 *
 * The route gates (`requireAdminOrClubAdminOfLeague`); this component
 * authorizes nothing. It reads with the admin client after that gate, like
 * `getLigaSnapshot`, so the player's name shows regardless of users-RLS.
 * `removeLeaguePlayer` redirects on success and failure alike, deriving the
 * door from the league itself.
 *
 * A finished league's table is the season record, so its roster is locked: the
 * page shows why and a way back instead of a button the server refuses
 * (`league_finished`), mirroring the cup's not-draft box.
 */
export type LigaRemoveVariant = 'admin' | 'club';

type LigaT = Awaited<ReturnType<typeof getTranslations<'liga'>>>;

/** Club name for the TopBar kicker, as on the management page (club league only). */
async function clubNameOf(groupId: string | null): Promise<string | null> {
  if (!groupId) return null;
  const { data } = await getAdminClient()
    .from('groups')
    .select('name')
    .eq('id', groupId)
    .maybeSingle();
  return (data?.name as string | null | undefined) ?? null;
}

/**
 * `?error=` → banner text. `remove_failed` is the only code shown; a finished
 * league gets the locked box instead, and an unknown code never reaches the
 * page raw.
 */
function errorMessageFor(
  errorCode: string | undefined,
  finished: boolean,
  t: LigaT,
): string | undefined {
  if (finished || errorCode !== 'remove_failed') return undefined;
  return t('removePlayer.errors.remove_failed');
}

export async function LigaRemoveConfirm({
  leagueId,
  userId,
  variant,
  errorCode,
}: {
  leagueId: string;
  userId: string;
  variant: LigaRemoveVariant;
  errorCode?: string;
}) {
  // A hand-typed id that isn't a UUID is a missing page, not a DB error.
  if (!isUuid(leagueId) || !isUuid(userId)) notFound();

  const t = await getTranslations('liga');
  const admin = getAdminClient();

  const [leagueRes, playerRes] = await Promise.all([
    admin
      .from('leagues')
      .select('id, name, status, group_id')
      .eq('id', leagueId)
      .maybeSingle(),
    admin
      .from('league_players')
      .select('user_id, users!league_players_user_id_fkey(name, nickname)')
      .eq('league_id', leagueId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  if (leagueRes.error) throw leagueRes.error;
  if (playerRes.error) throw playerRes.error;

  const league = leagueRes.data;
  if (!league) notFound();
  // A standalone league does not belong under /klubber (same rule as
  // LigaDeleteConfirm): 404 rather than building a /klubber/null/... link.
  if (variant === 'club' && !league.group_id) notFound();
  // Not (or no longer) a participant: nothing to confirm.
  if (!playerRes.data) notFound();

  const clubName = await clubNameOf(league.group_id);

  const { name, firstName: first } = participantNames(
    playerRes.data.users,
    t('manage.unknownPlayer'),
    t('removePlayer.fallbackFirstName'),
  );

  const finished = league.status === 'finished';
  const errorMessage = errorMessageFor(errorCode, finished, t);

  const Shell = variant === 'admin' ? AdminShell : AppShell;
  const backHref = ligaBasePath(leagueId, variant === 'club' ? league.group_id : null);

  return (
    <Shell>
      <TopBar backHref={backHref} kicker={clubName ?? t('ledger.kicker')} />
      <BrassRibbon kicker={t('removePlayer.brassRibbon')} />

      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {finished
            ? t('removePlayer.lockedHeading')
            : t('removePlayer.heading', { name, league: league.name })}
        </h1>
        {!finished && (
          <>
            <p className="font-sans text-[14px] leading-relaxed text-text">
              {t('removePlayer.body', { firstName: first })}
            </p>
            <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted">
              {t('removePlayer.canReAdd', { firstName: first })}
            </p>
          </>
        )}
      </div>

      {errorMessage && (
        <div className="mt-4">
          <Banner tone="error" testId="liga-remove-error">
            {errorMessage}
          </Banner>
        </div>
      )}

      {finished && (
        <div className="mt-5 rounded-xl border border-border bg-surface px-4 py-3.5">
          <p
            className="font-sans text-[13px] leading-relaxed text-text"
            data-testid="liga-remove-finished"
          >
            {t('removePlayer.lockedBody')}
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2.5">
        {!finished && (
          <form action={removeLeaguePlayer}>
            <input type="hidden" name="league_id" value={league.id} />
            <input type="hidden" name="user_id" value={userId} />
            <SubmitButton
              className="w-full"
              style={{
                background: 'var(--danger-deep)',
                borderColor: 'var(--danger-deep)',
              }}
              pendingLabel={t('removePlayer.pending')}
              data-testid="liga-remove-confirm"
            >
              {t('removePlayer.confirmButton', { firstName: first })}
            </SubmitButton>
          </form>
        )}
        <SmartLink
          href={backHref}
          data-testid="liga-remove-cancel"
          className="flex min-h-[44px] items-center justify-center rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text"
        >
          {finished ? t('removePlayer.back') : t('removePlayer.cancel')}
        </SmartLink>
      </div>
    </Shell>
  );
}
