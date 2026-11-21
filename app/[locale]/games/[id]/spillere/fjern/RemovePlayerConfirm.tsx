import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAdminClient } from '@/lib/supabase/admin';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { participantNames } from '@/lib/format/participantNames';
import { formatListLocale } from '@/lib/i18n/format';
import { isUuid } from '@/lib/url/isUuid';
import { guestNamesOf, readBroughtGuests } from '@/lib/games/broughtGuests';
import type { GameStatus } from '@/lib/games/status';
import type { AppLocale } from '@/i18n/routing';
import { removePlayerFromGame } from '../actions';

/**
 * Confirm page before an organiser removes a player from a round that has not
 * started (audit 2026-11-20). Destructive flows get their own page, never an
 * inline button (repo rule; pattern: `admin/games/[id]/slett`, the cup's
 * `spillere/fjern`). The page names the guests the player brought, because
 * they leave in the same transaction (the trigger in 0229, #2607).
 *
 * The route gates (`requireAdminOrCreator`); this component authorizes
 * nothing. It reads with the admin client after that gate, like «Styr
 * spillere» itself, so names and guests show regardless of RLS.
 *
 * A round that has started, or a cup match the organiser cannot change, goes
 * back to «Styr spillere» with the same error the action gives, instead of a
 * button the server is certain to refuse.
 */
export async function RemovePlayerConfirm({
  gameId,
  userId,
  isAdmin,
}: {
  gameId: string;
  userId: string;
  isAdmin: boolean;
}) {
  // A hand-typed id that isn't a UUID is a missing page, not a DB error.
  if (!isUuid(gameId) || !isUuid(userId)) notFound();

  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('game.players');
  const admin = getAdminClient();
  const backHref = `/games/${gameId}/spillere`;

  const [gameRes, playerRes] = await Promise.all([
    admin
      .from('games')
      .select('id, status, tournament_id')
      .eq('id', gameId)
      .maybeSingle<{ id: string; status: GameStatus; tournament_id: string | null }>(),
    admin
      .from('game_players')
      .select('user_id, users!game_players_user_id_fkey(name, nickname)')
      .eq('game_id', gameId)
      .eq('user_id', userId)
      .maybeSingle<{
        user_id: string;
        users: { name: string | null; nickname: string | null } | null;
      }>(),
  ]);
  if (gameRes.error) throw gameRes.error;
  if (playerRes.error) throw playerRes.error;

  const game = gameRes.data;
  if (!game) notFound();
  // Not (or no longer) on the roster: nothing to confirm.
  if (!playerRes.data) notFound();

  if (game.tournament_id !== null && !isAdmin) {
    redirect({ href: `${backHref}?error=cup_roster_locked`, locale });
  }
  if (game.status !== 'draft' && game.status !== 'scheduled') {
    redirect({ href: `${backHref}?error=roster_locked`, locale });
  }

  const { name, firstName } = participantNames(
    playerRes.data.users,
    t('pendingPlayerName'),
    t('remove.fallbackFirstName'),
  );

  // The guests leave with the player. A failed read cannot name them, so the
  // page says the rule instead of claiming there are none.
  const guests = await readBroughtGuests(admin, gameId, userId);
  const guestNames = guests.ok ? guestNamesOf(guests.guests) : null;

  return (
    <AppShell>
      <TopBar backHref={backHref} kicker={t('kicker')} />
      <BrassRibbon kicker={t('remove.brassRibbon')} />

      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {t('remove.heading', { name })}
        </h1>
        <p className="font-sans text-[14px] leading-relaxed text-text">
          {t('remove.body', { firstName })}
        </p>
        {guestNames === null ? (
          <p
            className="mt-2 font-sans text-[14px] leading-relaxed text-text"
            data-testid="remove-player-guests-unknown"
          >
            {t('remove.guestsUnknown', { firstName })}
          </p>
        ) : guestNames.length > 0 ? (
          <p
            className="mt-2 font-sans text-[14px] leading-relaxed text-text"
            data-testid="remove-player-guests"
          >
            {t('remove.guests', {
              count: guestNames.length,
              names: formatListLocale(guestNames, locale),
              firstName,
            })}
          </p>
        ) : null}
        <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted">
          {t('remove.canReAdd', { firstName })}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        <form action={removePlayerFromGame.bind(null, gameId)}>
          <input type="hidden" name="user_id" value={userId} />
          <SubmitButton
            className="w-full"
            style={{
              background: 'var(--danger-deep)',
              borderColor: 'var(--danger-deep)',
            }}
            pendingLabel={t('remove.pending')}
            data-testid="remove-player-confirm"
          >
            {t('remove.confirmButton', { firstName })}
          </SubmitButton>
        </form>
        <SmartLink
          href={backHref}
          data-testid="remove-player-cancel"
          className="flex min-h-[44px] items-center justify-center rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text"
        >
          {t('remove.cancel')}
        </SmartLink>
      </div>
    </AppShell>
  );
}
