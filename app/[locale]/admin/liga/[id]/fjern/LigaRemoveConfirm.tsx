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
import { firstName } from '@/lib/firstName';
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
 */
export type LigaRemoveVariant = 'admin' | 'club';

type UserRel = { name: string | null; nickname: string | null };

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

  const rel = playerRes.data.users as UserRel | UserRel[] | null;
  const user = Array.isArray(rel) ? (rel[0] ?? null) : rel;
  const preferred = user?.nickname?.trim() || user?.name?.trim() || '';
  const name = preferred || t('manage.unknownPlayer');
  const first = firstName(preferred) ?? t('removePlayer.fallbackFirstName');

  // `remove_failed` is the action's only `?error=` code; an unknown code is
  // ignored rather than shown raw.
  const errorMessage =
    errorCode === 'remove_failed' ? t('removePlayer.errors.remove_failed') : undefined;

  // The add-players picker is hidden once a league is finished, so only then
  // is the removal final.
  const finished = league.status === 'finished';

  const Shell = variant === 'admin' ? AdminShell : AppShell;
  const backHref = ligaBasePath(leagueId, variant === 'club' ? league.group_id : null);

  return (
    <Shell>
      <TopBar backHref={backHref} kicker={t('ledger.kicker')} />
      <BrassRibbon kicker={t('removePlayer.brassRibbon')} />

      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {t('removePlayer.heading', { name, league: league.name })}
        </h1>
        <p className="font-sans text-[14px] leading-relaxed text-text">
          {t('removePlayer.body', { firstName: first })}
        </p>
        <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted">
          {finished
            ? t('removePlayer.cannotReAdd')
            : t('removePlayer.canReAdd', { firstName: first })}
        </p>
      </div>

      {errorMessage && (
        <div className="mt-4">
          <Banner tone="error" testId="liga-remove-error">
            {errorMessage}
          </Banner>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2.5">
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
        <SmartLink
          href={backHref}
          data-testid="liga-remove-cancel"
          className="flex min-h-[44px] items-center justify-center rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text"
        >
          {t('removePlayer.cancel')}
        </SmartLink>
      </div>
    </Shell>
  );
}
