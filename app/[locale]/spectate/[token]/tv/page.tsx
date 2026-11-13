import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import QRCode from 'qrcode';
import { getGameBySpectateToken } from '@/lib/games/spectate';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';
import { getAdminClient } from '@/lib/supabase/admin';
import { localizeGameName } from '@/lib/games/autoGameName';
import { formatDisplayLabelKey } from '@/lib/games/formatLabel';
import { revealState, shouldHideNetto } from '@/lib/games/visibility';
import { computeLiveBoard, type LiveBoard } from '@/lib/leaderboard/liveBoard';
import { buildTvFeed, type TvFeedEvent } from '@/lib/leaderboard/tvBoard';
import { canonicalPath } from '@/lib/seo/canonical';
import { requestOrigin } from '@/lib/url/requestOrigin';
import type { AppLocale } from '@/i18n/routing';
import { TvStage } from './TvStage';
import { TvLiveStatus } from './TvLiveStatus';
import { TvBoard, TvMessage } from './TvBoard';
import { TvClock } from './TvClock';
import { TvFeed } from './TvFeed';
import { CeremonyStage } from './CeremonyStage';
import { CeremonyPoller } from './CeremonyPoller';
import { CEREMONY_MAX_STEP, ceremonyAvailable } from '@/lib/games/ceremony';
import { leagueFlightHasNoPlace } from '@/lib/games/finishedResultBadge';
import { loadCeremonyData } from '@/app/[locale]/games/[id]/premieutdeling/ceremonyData';
import { readBoardRows, readCourseName } from '../boardRows';

type Params = Promise<{ token: string }>;
type SearchParams = Promise<{ vist?: string | string[] }>;

// No token lookup here, so the title says nothing about the game.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('spectate.tv');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/**
 * Storskjermen (#2275): the live board for the TV in the clubhouse — the same
 * game as the live link, laid out for five metres away. Public, no login: the
 * `spectate_token` is the whole authorisation, checked in the same order as
 * `SpectatePage`, and the service-role client is only taken after it. A
 * finished game and a game hiding its net results read no scores.
 */
export default async function SpectateTvPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { token } = await params;

  const found = await getGameBySpectateToken(token);
  if (!found) notFound();

  const gwp = await getGameWithPlayers(found.id);
  if (!gwp) notFound();

  const { game, players } = gwp;
  if (game.status === 'draft' || game.status === 'scheduled') notFound();

  const admin = getAdminClient();
  const live = game.status === 'active';
  // #2712, #2850: a league flight has no winner, so no prize-giving and no
  // «se hvem som vant».
  const leagueFlight = leagueFlightHasNoPlace(game.league_round_id != null);

  const [locale, t, tModes, courseName, origin] = await Promise.all([
    getLocale(),
    getTranslations('spectate.tv'),
    getTranslations('modes'),
    readCourseName(admin, game.course_id),
    requestOrigin(),
  ]);

  const gameName = localizeGameName(game.name, courseName, locale as AppLocale);
  const formatLabel = tModes(
    formatDisplayLabelKey(game.game_mode, game.mode_config) as Parameters<typeof tModes>[0],
  );
  const overline = courseName ? `${courseName} · ${formatLabel}` : formatLabel;

  const spectateUrl = `${origin}${canonicalPath(locale as AppLocale, `/spectate/${token}`)}`;
  // = --tv-ink / --on-strong in app/globals.css; qrcode needs hex.
  const qrSvg = await QRCode.toString(spectateUrl, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 0,
    color: { dark: '#1A2E1F', light: '#ECE5D2' },
  });

  const scene = (opts: {
    holesPlayed: number | null;
    main: ReactNode;
    feed?: { events: TvFeedEvent[]; board: LiveBoard };
  }) => (
    <main className="relative h-dvh w-full cursor-none overflow-hidden bg-tv-bg text-tv-text">
      <TvStage>
        <div className="flex h-full gap-9 px-11 py-9 leading-[normal]">
          <div className="flex min-w-0 grow flex-col gap-[18px]">
            <div className="flex items-end justify-between gap-6">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-tv-text/75">
                  {overline}
                </p>
                <h1 className="mt-1.5 overflow-x-clip font-serif text-[56px] leading-[1.05] font-medium text-ellipsis whitespace-nowrap">
                  {gameName}
                </h1>
              </div>
              <TvLiveStatus live={live} holesPlayed={opts.holesPlayed} />
            </div>
            {opts.main}
          </div>
          <div className="flex w-[300px] shrink-0 flex-col gap-4">
            <TvClock />
            {opts.feed && <TvFeed events={opts.feed.events} rows={opts.feed.board.rows} />}
            <div
              className={`flex items-center gap-3.5 rounded-[18px] bg-on-strong p-4 text-tv-ink ${
                opts.feed ? '' : 'mt-auto'
              }`}
            >
              {/* As drawn, the 84 px code gives a little to the text beside it
                  (82.5 px in the artboard); never more, so a longer title such
                  as the finished screen's does not shrink it further. */}
              <div
                role="img"
                aria-label={t('qrAria')}
                data-testid="tv-qr"
                className="size-[84px] min-w-[82.5px] [&>svg]:size-full"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <div>
                <p className="font-serif text-[20px] font-semibold">
                  {live ? t('qrTitle') : t('finishedQrTitle')}
                </p>
                <p className="mt-0.5 text-[13px]">{live ? t('qrBody') : leagueFlight ? t('finishedQrBodyResult') : t('finishedQrBody')}</p>
              </div>
            </div>
          </div>
        </div>
      </TvStage>
    </main>
  );

  if (game.status === 'finished') {
    // #2298: a podium format can hold a prize-giving the organiser drives
    // from the phone. The step is read fresh, and the poller asks for it on
    // «Ferdig spilt» too, so «Start premieutdelingen» reaches the TV.
    if (ceremonyAvailable(game.game_mode, game.league_round_id != null)) {
      const { data: state, error } = await admin
        .from('games')
        .select('ceremony_step')
        .eq('id', found.id)
        .single<{ ceremony_step: number | null }>();
      // Thrown on purpose: tv/error.tsx retries by itself.
      if (error) throw error;
      const poller = <CeremonyPoller token={token} step={state.ceremony_step} />;
      if (state.ceremony_step !== null) {
        const data = await loadCeremonyData(gwp);
        // The drawing has no clock or QR column: the podium takes the screen.
        return (
          <main className="relative h-dvh w-full cursor-none overflow-hidden bg-tv-bg text-tv-text">
            <TvStage>
              <CeremonyStage
                gameName={gameName}
                data={data}
                step={state.ceremony_step}
                // min(vist, step): the address is anyone's to change. It only
                // stills animation; which cards show is the real step alone.
                played={Math.min(playedBeforeReload(await searchParams), state.ceremony_step)}
              />
            </TvStage>
            {poller}
          </main>
        );
      }
      return scene({
        holesPlayed: null,
        main: (
          <>
            <TvMessage>{t('finishedBody')}</TvMessage>
            {poller}
          </>
        ),
      });
    }
    // A finished game shows the result's QR code; it reads no scores (#1542).
    return scene({ holesPlayed: null, main: <TvMessage>{t('finishedBody')}</TvMessage> });
  }
  // Net hidden until the end (reveal): nothing to show, and nothing read.
  if (shouldHideNetto(revealState(game.score_visibility, game.status))) {
    return scene({ holesPlayed: null, main: <TvMessage>{t('hiddenBody')}</TvMessage> });
  }

  // Thrown on purpose: tv/error.tsx retries by itself.
  const { holesRows, scoresRows } = await readBoardRows(admin, game, found.id);

  const board = computeLiveBoard({ gameId: found.id, game, players, holesRows, scoresRows });
  if (!board) {
    return scene({ holesPlayed: null, main: <TvMessage>{t('unsupportedBody')}</TvMessage> });
  }

  const events = buildTvFeed({ rows: board.rows, players, holesRows, scoresRows });
  return scene({
    holesPlayed: board.holesPlayed,
    main: <TvBoard board={board} />,
    feed: { events, board },
  });
}

/**
 * `?vist=k` — set by the poller's reload: the steps the TV had already
 * animated. Anything else is none (a plain open animates every turned card).
 */
function playedBeforeReload(sp: { vist?: string | string[] }): number {
  const raw = Array.isArray(sp.vist) ? sp.vist[0] : sp.vist;
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= CEREMONY_MAX_STEP ? n : 0;
}
