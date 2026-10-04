import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Kicker } from '@/components/ui/Kicker';
import { gameIdFromNext } from '@/lib/games/onboardingGame';
import { completeProfile } from './actions';
import { getOnboardingGame } from './getOnboardingGame';
import { OnboardingFields } from './OnboardingFields';
import { OnboardingGameCard } from './OnboardingGameCard';
import { first, resolveErrorCode } from '@/lib/url/searchParams';
import { safeInternalPath } from '@/lib/url/safeInternalPath';

type SearchParams = Promise<{
  error?: string | string[];
  next?: string | string[];
  name?: string | string[];
  hcp_index?: string | string[];
  hcp_plus?: string | string[];
  invite_notice?: string | string[];
}>;

// The set of valid error codes that map to a catalog key.
const KNOWN_ERROR_CODES = new Set([
  'name_required',
  'hcp_invalid',
  'unknown',
] as const);

export default async function CompleteProfile({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const t = await getTranslations('onboarding');

  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect('/login');
  }
  const supabase = await getServerClient();

  const params = await searchParams;
  // #356: carry the post-onboarding destination (e.g. a game-scoped invitee's
  // `/games/[id]`) through the profile step so the user lands there afterwards.
  const next = safeInternalPath(first(params.next)) ?? '/';

  // #748: echo submitted values back into the form after a validation bounce
  // so the user doesn't have to retype everything.
  const echoName = first(params.name) ?? '';
  const echoHcpIndex = first(params.hcp_index) ?? '';
  const echoHcpPlus = first(params.hcp_plus) === 'on';

  // If the user has already completed their profile, send them on. The trigger
  // pre-creates a placeholder row with profile_completed_at = NULL, so the row
  // existing is not enough on its own.
  const { data: existing } = await supabase
    .from('users')
    .select('profile_completed_at')
    .eq('id', userId)
    .maybeSingle();

  if (existing?.profile_completed_at) {
    redirect(next);
  }

  // #2350: the round the player came from (`next=/games/<id>`, via the
  // profile gate) waits for them on a card. Anything else — signup and cup
  // links, `/` — gives no query and no card.
  const gameId = gameIdFromNext(next);
  const game = gameId ? await getOnboardingGame(supabase, userId, gameId) : null;

  const errorCode = resolveErrorCode(first(params.error), KNOWN_ERROR_CODES, 'unknown');
  const errorMessage = errorCode ? t(`errors.${errorCode}`) : undefined;

  // #2212: verifyCode lands an invitee here when the round they were invited
  // to had already started. Only the flag travels in the URL — never a game
  // name — so nobody can craft a link that renders arbitrary text.
  const showGameStartedNotice = first(params.invite_notice) === 'game_started';

  // Artboard «Profilstart-forslag»: the page lays out its own edges (text 20 px
  // from the side, the game card 16 px), and the column fills the screen so
  // «Sett i gang» stands at the bottom. The version footer follows below the
  // fold.
  return (
    <AppShell flush>
      <div className="flex min-h-dvh flex-col">
        <header className="px-5 pt-[22px]">
          <Kicker tone="accent" className="leading-[normal]">
            {t('kicker')}
          </Kicker>
          <h1 className="mt-1.5 font-serif text-[28px] leading-[1.15] font-medium text-text">
            {t('heading')}
          </h1>
        </header>

        {game && <OnboardingGameCard game={game} />}

        {(showGameStartedNotice || errorMessage) && (
          <div className="flex flex-col gap-3 px-5 pt-5">
            {showGameStartedNotice && (
              <Banner tone="info" testId="invite-notice-game-started">
                {t('inviteNoticeGameStarted')}
              </Banner>
            )}
            {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
          </div>
        )}

        <form action={completeProfile} className="flex flex-1 flex-col">
          <input type="hidden" name="next" value={next} />
          <OnboardingFields
            initialName={echoName}
            initialMagnitude={echoHcpIndex}
            initialPlus={echoHcpPlus}
          />

          <div className="mt-auto px-5 pt-4 pb-5">
            {/* `!`: the Button base writes font-medium, tracking-tight and a
                shadow; the artboard's pill is 600, normal tracking, flat. */}
            <SubmitButton
              className="h-[52px] w-full text-[15px] leading-[normal] font-semibold! tracking-normal! [box-shadow:none]!"
              pendingLabel={t('submitPending')}
            >
              {t('submitButton')}
            </SubmitButton>
            <p className="mt-2 text-center text-xs leading-[normal] text-muted">
              {t('footnote')}
            </p>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
