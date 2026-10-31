import { first } from '@/lib/url/searchParams';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { Kicker } from '@/components/ui/Kicker';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { localizeGameName } from '@/lib/games/autoGameName';
import { bringGuestBlock } from '@/lib/games/bringGuest';
import { readMyBroughtGuest, type MyBroughtGuest } from '@/lib/games/broughtGuests';
import { TEE_EMBED } from '@/lib/games/joinTeeGenders';
import { teeAvailabilityOf } from '@/lib/games/teeChoice';
import type { TeeBoxRatings } from '@/lib/games/teeRating';
import { formatHcpDisplay } from '@/lib/handicap/signFormat';
import type { AppLocale } from '@/i18n/routing';
import { bringGuest, removeBroughtGuest } from './actions';
import { BringGuestForm } from './BringGuestForm';

/**
 * «Ta med en gjest» (#2607, fase 2): a signed-up player brings one guest
 * without an account. Screens 2 and 3 of the drawing
 * (https://claude.ai/artifact/7oDymdJH3cRdkqGkReK9JV): the guest card, then
 * «Gjesten din» with the status and «Fjern gjesten».
 *
 * The same gate as the row on the game page (`bringGuestBlock`); anyone else
 * gets a 404. The guest is read with the service role: the guest's request is
 * not the player's own row under RLS.
 */

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ status?: string | string[]; error?: string | string[] }>;

type GameRow = {
  id: string;
  name: string;
  status: string;
  created_by: string | null;
  game_mode: string;
  registration_mode: string;
  registration_type: string;
  signups_closed_at: string | null;
  tournament_id: string | null;
  league_round_id: string | null;
  courses: { name: string } | null;
  tee_boxes: TeeBoxRatings | null;
};

/** The page's own `?error=` codes (from «Fjern gjesten»). */
const ERROR_CODES = new Set(['not_your_guest', 'game_locked', 'db_error']);

export default async function BringGuestPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('game.bringGuest');
  const tPlayers = await getTranslations('game.players');

  const userId = await getProxyVerifiedUserId();
  if (!userId) redirect({ href: '/login', locale });

  const supabase = await getServerClient();
  // The user's client: RLS hides a game the player cannot see (#2445).
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(
      `id, name, status, created_by, game_mode, registration_mode, registration_type, signups_closed_at, tournament_id, league_round_id, courses(name), ${TEE_EMBED}`,
    )
    .eq('id', id)
    .maybeSingle<GameRow>();
  if (gameError) throw gameError;
  if (!game) notFound();

  const admin = getAdminClient();
  const [seatRes, meRes, brought] = await Promise.all([
    admin
      .from('game_players')
      .select('withdrawn_at')
      .eq('game_id', id)
      .eq('user_id', userId)
      .maybeSingle<{ withdrawn_at: string | null }>(),
    admin.from('users').select('is_guest').eq('id', userId).maybeSingle<{ is_guest: boolean }>(),
    readMyBroughtGuest(admin, id, userId),
  ]);
  if (seatRes.error) throw seatRes.error;
  if (meRes.error) throw meRes.error;
  if (!brought.ok) throw new Error('[ta-med-gjest] brought guest read failed');

  if (
    bringGuestBlock(game, {
      userId,
      seat: seatRes.data,
      isGuest: meRes.data?.is_guest === true,
    })
  ) {
    notFound();
  }

  const guest = brought.guest;
  const isManual = game.registration_mode === 'manual_approval';
  const title = localizeGameName(game.name, game.courses?.name ?? null, locale);

  const errorCode = first(sp.error);
  const errorMessage =
    errorCode && ERROR_CODES.has(errorCode) ? t(`errors.${errorCode}` as Parameters<typeof t>[0]) : null;
  const receipt =
    guest && first(sp.status) === 'added' && guest.name
      ? t(guest.status === 'approved' ? 'receiptIn' : 'receiptPending', { name: guest.name })
      : null;

  return (
    <div data-hides-bottom-nav>
      <AppShell showVersion={false}>
        <TopBar backHref={`/games/${id}`} backLabel={t('backToGame')} kicker={title} kickerOneLine />
        <h1 className="-mt-2.5 font-serif text-[26px] font-medium leading-[1.15] text-text">
          {guest ? t('yourGuestHeading') : t('heading')}
        </h1>
        {receipt && (
          <div className="mt-4">
            <Banner tone="success" testId="bring-guest-receipt">
              {receipt}
            </Banner>
          </div>
        )}
        {errorMessage && (
          <div className="mt-4">
            <Banner tone="error" testId="bring-guest-page-error">
              {errorMessage}
            </Banner>
          </div>
        )}
        <p className="mt-2.5 font-sans text-[13px] leading-[1.45] text-muted">
          {guest
            ? t(guest.status === 'approved' ? 'yourGuestIntroIn' : 'yourGuestIntroPending')
            : t('intro')}
        </p>
        <Kicker as="h2" className="mt-[18px] mb-2">
          {t('guestLabel')}
        </Kicker>
        {guest ? (
          <GuestCard
            guest={guest}
            removeAction={removeBroughtGuest.bind(null, id)}
            labels={{
              chip: t(guest.status === 'approved' ? 'chipIn' : 'chipPending'),
              meta: t('guestMeta', {
                hcp: guest.hcpIndex == null ? '–' : formatHcpDisplay(guest.hcpIndex, locale),
                tee: tPlayers(
                  guest.tee === 'D'
                    ? 'guestForm.teeLadies'
                    : guest.tee === 'J'
                      ? 'guestForm.teeJuniors'
                      : 'guestForm.teeMens',
                ),
              }),
              remove: t('remove'),
              removePending: t('removePending'),
            }}
          />
        ) : (
          <>
            <BringGuestForm
              action={bringGuest.bind(null, id)}
              avail={teeAvailabilityOf(game.tee_boxes ?? null)}
            />
            {isManual && (
              <p className="mt-3.5 font-sans text-xs leading-[1.45] text-muted">{t('manualNote')}</p>
            )}
          </>
        )}
      </AppShell>
    </div>
  );
}

/** «HM» for Hilde Moen: the first letter of the first two words. */
function initialsOf(name: string | null): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Screen 3: the guest with the status and «Fjern gjesten». */
function GuestCard({
  guest,
  removeAction,
  labels,
}: {
  guest: MyBroughtGuest;
  removeAction: (formData: FormData) => Promise<void>;
  labels: { chip: string; meta: string; remove: string; removePending: string };
}) {
  return (
    <div
      data-testid="bring-guest-card"
      className="-mx-1 flex flex-col gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-surface-2 font-sans text-xs font-semibold text-muted"
        >
          {initialsOf(guest.name)}
        </span>
        <span className="min-w-0 grow">
          <span className="block truncate font-sans text-[15px] font-semibold text-text">{guest.name}</span>
          <span className="block font-sans text-xs text-muted tabular-nums">{labels.meta}</span>
        </span>
        <span
          data-testid="bring-guest-status"
          className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 font-sans text-[11px] font-semibold ${
            guest.status === 'approved' ? 'bg-primary-soft text-success-text' : 'bg-warning-soft text-warning-text'
          }`}
        >
          {labels.chip}
        </span>
      </div>
      <form action={removeAction}>
        <input type="hidden" name="requestId" value={guest.requestId} />
        <SubmitButton
          variant="secondary"
          size="chip"
          className="w-full"
          pendingLabel={labels.removePending}
          data-testid="bring-guest-remove"
        >
          {labels.remove}
        </SubmitButton>
      </form>
    </div>
  );
}
