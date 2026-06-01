import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import type { GameStatus } from '@/lib/games/status';
import type { GameMode } from '@/lib/scoring/modes/types';
import { supportsWithdrawal } from '@/lib/scoring';
import { formatTeeOffDate } from '@/lib/format/teeOff';
import { submitWithdraw } from './actions';

/**
 * Dedikert konfirmasjons-side for self-withdraw fra et spill (#199 chunk 11).
 *
 * Vi følger Tørny-konvensjonen for destruktive admin-actions: aldri inline-
 * modal eller `<details>`-toggle, alltid en egen rute med tydelig advarsel
 * og avbryt-link. Speiler `/profile/slett-konto` strukturelt — Banner +
 * info-kort + button + cancel-link.
 *
 * Gating:
 *   - Bruker må være authenticated (proxy redirecter ellers).
 *   - Spillet må eksistere.
 *   - Bruker må være påmeldt (game_players-rad finnes).
 *   - Spillet må være pre-active (draft / scheduled).
 *
 * Hvis noen av disse failer, redirecter vi tilbake til `/games/[id]` med
 * en error-param — fronten viser ikke en stillstands-side fordi
 * destinasjonen alt har all kontekst.
 */

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

const ERROR_MESSAGES: Record<string, string> = {
  withdraw_failed:
    'Klarte ikke å trekke deg fra spillet. Prøv igjen, eller si fra til arrangøren.',
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  game_mode: GameMode;
  scheduled_tee_off_at: string | null;
  courses: { name: string } | null;
};

export default async function TrekkFraPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const errorCode = first(sp.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect('/login');
  }

  const supabase = await getServerClient();

  const { data: game } = await supabase
    .from('games')
    .select('id, name, status, game_mode, scheduled_tee_off_at, courses(name)')
    .eq('id', id)
    .maybeSingle<GameRow>();

  if (!game) notFound();

  // Sjekk at brukeren faktisk er påmeldt og at spillet er pre-active.
  // Hvis ikke: redirect tilbake — det er ikke noe meningsfullt å vise her.
  const { data: player } = await supabase
    .from('game_players')
    .select('user_id')
    .eq('game_id', id)
    .eq('user_id', userId)
    .maybeSingle<{ user_id: string }>();

  if (!player) {
    redirect(`/games/${id}`);
  }

  const isPreStart = game.status === 'draft' || game.status === 'scheduled';
  const isActiveWithdrawable =
    game.status === 'active' && supportsWithdrawal(game.game_mode);

  if (!isPreStart && !isActiveWithdrawable) {
    redirect(`/games/${id}`);
  }

  const teeOffDate = game.scheduled_tee_off_at
    ? formatTeeOffDate(new Date(game.scheduled_tee_off_at))
    : null;

  return (
    <AppShell userId={userId}>
      <TopBar
        backHref={`/games/${id}`}
        backLabel="Tilbake til spillet"
        kicker="Trekk deg"
      />

      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          Trekk deg fra «{game.name}»?
        </h1>
        <p className="font-sans text-[13px] leading-relaxed text-muted">
          {[game.courses?.name, teeOffDate].filter(Boolean).join(' · ')}
        </p>
      </div>

      {errorMessage && (
        <div className="mt-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <div className="mt-5">
        <Banner tone="warning">
          {isActiveWithdrawable
            ? 'Du trekker deg fra et pågående spill. Scorene dine teller ikke i resultatet, og scorekortet ditt låses. Du kan angre så lenge spillet pågår.'
            : 'Du forsvinner fra påmeldings-lista og scorekortet åpner ikke for deg ved tee-off. Arrangøren får automatisk beskjed hvis du var på lag.'}
        </Banner>
      </div>

      <div className="mt-5 rounded-xl border border-border bg-surface px-4 py-3.5">
        <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Dette skjer
        </p>
        {isActiveWithdrawable ? (
          <>
            <ul className="space-y-1 font-sans text-[13px] text-text">
              <li>Scorene dine teller ikke i rangeringen</li>
              <li>Scorekortet ditt låses for ny inntasting</li>
              <li>Du vises som «Trukket» under leaderboarden</li>
            </ul>
            <p className="mt-3 font-sans text-[12px] leading-relaxed text-muted">
              Du kan angre og gjenoppta spillet fra startsiden så lenge spillet
              er aktivt.
            </p>
          </>
        ) : (
          <>
            <ul className="space-y-1 font-sans text-[13px] text-text">
              <li>Påmeldingen din slettes</li>
              <li>Eventuell forespørsel om å bli med slettes også</li>
              <li>Lag-medlemmer og kaptein får varsel hvis du var på lag</li>
            </ul>
            <p className="mt-3 font-sans text-[12px] leading-relaxed text-muted">
              Hvis du ombestemmer deg, kan du melde deg på igjen så lenge
              påmelding fortsatt er åpen.
            </p>
          </>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        <form action={submitWithdraw}>
          <input type="hidden" name="gameId" value={game.id} />
          <Button
            type="submit"
            className="w-full"
            style={{
              background: 'var(--danger-deep)',
              borderColor: 'var(--danger-deep)',
            }}
          >
            Trekk meg fra spillet
          </Button>
        </form>
        <SmartLink
          href={`/games/${id}`}
          className="rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text"
        >
          Avbryt
        </SmartLink>
      </div>
    </AppShell>
  );
}
