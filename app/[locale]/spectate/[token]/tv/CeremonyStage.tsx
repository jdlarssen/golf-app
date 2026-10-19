import type { CSSProperties, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ceremonyView, type CeremonyPlace } from '@/lib/games/ceremony';
import type { CeremonyData } from '@/app/[locale]/games/[id]/premieutdeling/ceremonyData';
import {
  ceremonyScore,
  memberNames,
  sidePrizeLabel,
} from '@/app/[locale]/games/[id]/premieutdeling/ceremonyText';
import { TvFit } from './TvFit';
import { CeremonyConfetti } from './CeremonyConfetti';

type Slot = 1 | 2 | 3;

/**
 * The podium as drawn (Premie-forslag.dc.html): 3rd on the left, the winner
 * in the middle, 2nd on the right, standing on one line. Sizes per slot; the
 * winner's revealed card is not drawn and follows the same steps upwards.
 */
const SLOTS: Record<
  Slot,
  { column: string; height: number; medal: number; name: number; score: number; scoreAlpha: string; gap: number }
> = {
  3: { column: 'col-start-1', height: 250, medal: 64, name: 34, score: 20, scoreAlpha: 'text-tv-text/85', gap: 10 },
  1: { column: 'col-start-2', height: 360, medal: 84, name: 48, score: 24, scoreAlpha: 'text-tv-text/95', gap: 14 },
  2: { column: 'col-start-3', height: 300, medal: 72, name: 40, score: 22, scoreAlpha: 'text-tv-text/90', gap: 10 },
};

/** The drawn medallions: a lit sphere with the place in Fraunces. Gold is the winner's alone. */
const MEDAL_FILL: Record<Slot, string> = {
  1: 'radial-gradient(circle at 50% 38%, #f3e3b4 0%, #c9a961 100%)',
  2: 'radial-gradient(circle at 50% 38%, #ffffff 0%, #cfc9bd 100%)',
  3: 'radial-gradient(circle at 50% 38%, #e8c3a4 0%, #b07c52 100%)',
};

const slotOf = (rank: number): Slot => (rank <= 1 ? 1 : rank === 2 ? 2 : 3);
const fitted = (px: number): CSSProperties => ({ fontSize: `calc(${px}px * var(--fit, 1))` });

/**
 * The big screen's prize-giving (#2298), a server component on purpose: only
 * the cards already turned get names, members and numbers, so neither the
 * HTML nor the RSC payload holds the winner before «Avslør vinneren». A hidden
 * card knows only its place.
 *
 * The cards are an `<ol>` in reveal order (3rd, 2nd, winner); the grid puts
 * them 3 | 1 | 2. A place nobody holds (2nd when two share 1st) leaves its
 * column empty so the podium stands. The side prizes sit below once shown.
 */
export function CeremonyStage({
  gameName,
  data,
  step,
}: {
  gameName: string;
  data: CeremonyData;
  step: number;
}) {
  const t = useTranslations('ceremony');
  const tc = useTranslations('leaderboard.common');
  const tp = useTranslations('prizes');
  const view = ceremonyView(data.steps, step);
  const shown = new Set(view.shown);
  const sideShown = shown.has('side');

  const placeTitle = (place: CeremonyPlace) =>
    place.lines.length > 1 ? tc('tiedRank', { rank: place.rank }) : t('placeTitle', { rank: place.rank });
  const units = { points: tc('poengLabel'), net: tc('slagLabel'), toPar: tc('vsParLabel') };
  const unknown = tc('unknownPlayer');

  // Reveal order: from the lowest place up to the winner.
  const places = [...data.places].sort((a, b) => b.rank - a.rank);

  return (
    <div
      data-testid="ceremony-stage"
      className="flex h-full flex-col gap-[26px] px-12 py-10 leading-[normal]"
    >
      <div className="text-center">
        <p className="text-[15px] font-semibold tracking-[0.34em] text-tv-text/75 uppercase">{t('title')}</p>
        <h1 className="mt-1.5 overflow-x-clip font-serif text-[52px] font-medium text-ellipsis whitespace-nowrap">
          {gameName}
        </h1>
        <div aria-hidden className="mx-auto mt-3.5 h-px w-[140px] bg-tv-gold/70" />
      </div>

      <ol className="grid grow grid-cols-[1fr_1.25fr_1fr] items-end gap-7" data-testid="ceremony-podium">
        {places.map((place) => {
          const slot = slotOf(place.rank);
          const isShown = shown.has(place);
          const isCurrent = view.current === place;
          return (
            <li
              key={`${place.rank}-${isShown ? 'shown' : 'hidden'}`}
              data-testid="ceremony-card"
              data-slot={slot}
              data-shown={isShown ? 'true' : 'false'}
              data-current={isCurrent ? 'true' : undefined}
              className={`relative row-start-1 ${SLOTS[slot].column}`}
            >
              {isShown ? (
                <ShownCard
                  place={place}
                  slot={slot}
                  current={isCurrent}
                  title={place.lines.length > 1 ? placeTitle(place) : null}
                  teamLabel={(number) => tc('teamLabel', { number })}
                  names={(line) => memberNames(line, data.names, unknown)}
                  score={(line) => ceremonyScore(line, units)}
                  srTitle={placeTitle(place)}
                  confettiKey={slot === 1 && isCurrent ? step : null}
                />
              ) : (
                <HiddenCard
                  slot={slot}
                  title={
                    slot !== 1
                      ? t('placeTitle', { rank: place.rank })
                      : place.lines.length > 1
                        ? t('tv.hiddenWinners')
                        : t('tv.hiddenWinner')
                  }
                  body={slot === 1 && place.lines.length > 1 ? t('tv.hiddenBodyMany') : t('tv.hiddenBody')}
                  sr={t('tv.hiddenSr', { place: t('placeTitle', { rank: place.rank }) })}
                />
              )}
            </li>
          );
        })}
      </ol>

      {sideShown && data.sidePrizes.length > 0 && (
        // Turned like a card: it rises in once, and carries the current card's
        // ring and lighter fill while it is the step shown last. The drawing
        // shows it at rest (2nd place current): plain 0.08 boxes.
        <ul
          className="reveal-up flex justify-center gap-[18px]"
          data-testid="ceremony-side"
          data-current={view.current === 'side' ? 'true' : undefined}
        >
          {data.sidePrizes.map((p) => (
            <li
              key={`${p.category}-${p.position}`}
              className={`rounded-[14px] px-5 py-3 text-[18px] ${
                view.current === 'side' ? 'bg-tv-text/12 ring-2 ring-tv-text/35' : 'bg-tv-text/8'
              }`}
            >
              <span className="text-[13px] font-semibold tracking-[0.2em] text-tv-text/75 uppercase">
                {sidePrizeLabel(p, { ld: tp('ldLabel'), ctp: tp('ctpLabel') })}
              </span>
              <br />
              {data.names[p.winnerUserId] ?? unknown}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Medal({ slot, size }: { slot: Slot; size: number }) {
  return (
    <span
      aria-hidden
      data-testid="ceremony-medal"
      className="flex shrink-0 items-center justify-center rounded-full font-serif font-semibold text-tv-ink"
      style={{ width: size, height: size, background: MEDAL_FILL[slot], fontSize: Math.round(size * 0.44) }}
    >
      {slot}
    </span>
  );
}

function ShownCard({
  place,
  slot,
  current,
  title,
  teamLabel,
  names,
  score,
  srTitle,
  confettiKey,
}: {
  place: CeremonyPlace;
  slot: Slot;
  current: boolean;
  /** «Delt 2. plass» on a shared place; a single holder needs no title. */
  title: string | null;
  teamLabel: (number: number) => string;
  names: (line: CeremonyPlace['lines'][number]) => string[];
  score: (line: CeremonyPlace['lines'][number]) => { value: string; unit: string };
  srTitle: string;
  confettiKey: number | null;
}) {
  const size = SLOTS[slot];
  const first = place.lines[0]!;
  const { value, unit } = score(first);
  const shared = place.lines.length > 1;
  const isTeam = first.teamNumber !== null;

  let body: ReactNode;
  if (!isTeam) {
    body = place.lines.map((line) => (
      <p key={line.key} className="font-serif font-medium break-words" style={fitted(size.name)}>
        {names(line).join(', ')}
      </p>
    ));
  } else if (!shared) {
    body = (
      <>
        <p className="font-serif font-medium" style={fitted(size.name)}>
          {teamLabel(first.teamNumber!)}
        </p>
        <p className="mt-1 break-words text-tv-text/80" style={fitted(18)} data-testid="ceremony-members">
          {names(first).join(' · ')}
        </p>
      </>
    );
  } else {
    body = place.lines.map((line) => (
      <p key={line.key} className="break-words" style={fitted(22)} data-testid="ceremony-members">
        <span className="font-serif font-medium">{teamLabel(line.teamNumber!)}</span>
        <span className="text-tv-text/80"> · {names(line).join(', ')}</span>
      </p>
    ));
  }

  const frame =
    slot === 1
      ? 'border-2 border-tv-gold/70 bg-tv-gold/12'
      : current
        ? 'bg-tv-text/12 ring-2 ring-tv-text/35'
        : 'bg-tv-text/8';

  return (
    <div
      className={`reveal-up flex flex-col items-center justify-center rounded-[22px] p-[26px] text-center ${frame}`}
      style={{ height: size.height, gap: size.gap }}
    >
      {confettiKey !== null && <CeremonyConfetti key={confettiKey} />}
      <span className="sr-only">{srTitle}</span>
      <Medal slot={slot} size={size.medal} />
      {title && (
        <p className="shrink-0 text-[15px] font-semibold tracking-[0.2em] text-tv-text/75 uppercase" aria-hidden>
          {title}
        </p>
      )}
      <TvFit className="flex min-h-0 w-full shrink flex-col items-center justify-center">{body}</TvFit>
      {/* Inter with proportional digits, as drawn: `.score-num` would set
          Fraunces, and the numbers stand alone, so nothing needs aligning. */}
      <p className={`shrink-0 ${size.scoreAlpha}`} style={{ fontSize: size.score }}>
        {value} {unit}
      </p>
    </div>
  );
}

function HiddenCard({ slot, title, body, sr }: { slot: Slot; title: string; body: string; sr: string }) {
  const size = SLOTS[slot];
  return (
    <div
      className="flex flex-col items-center justify-center rounded-[22px] border-2 border-dashed border-tv-gold/60 bg-tv-text/3 p-[26px] text-center"
      style={{ height: size.height, gap: 14 }}
    >
      <span className="sr-only">{sr}</span>
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center rounded-full border-2 border-tv-gold/70 font-serif font-semibold text-tv-lead-total"
        // The drawing's ring is 84 px inside its 2 px border (content-box): 88 px in all.
        style={{ width: size.medal + 4, height: size.medal + 4, fontSize: Math.round(size.medal * 0.476) }}
      >
        ?
      </span>
      <p aria-hidden className="font-serif font-medium" style={{ fontSize: size.name === 48 ? 40 : size.name }}>
        {title}
      </p>
      <p aria-hidden className="text-[18px] text-tv-text/80">
        {body}
      </p>
    </div>
  );
}
