'use client';

import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';
import { setPlayerFlight, setTeeInterval, suggestFlightAssignment } from '../flightActions';
import {
  buildStartlist,
  flightSlots,
  moveTargets,
  type StartlistFlight,
  type StartlistPlayer,
} from '@/lib/games/startlist';
import { formatHcpDisplay } from '@/lib/handicap/signFormat';
import {
  TEE_INTERVAL_CHOICES,
  startGroupTeeOffAt,
  startGroupsOf,
} from '@/lib/games/flightTeeTimes';
import { formatTeeOffTimeLocale } from '@/lib/i18n/format';
import type { GameMode } from '@/lib/scoring/modes/types';
import { useOnline } from '@/hooks/useOnline';
import type { AppLocale } from '@/i18n/routing';

/** An active player as the page sends it: names resolved on the server. */
export type StartlistaPlayer = StartlistPlayer & {
  /** On the chip and in the strip: the first name, or the full one when two share it. */
  shortName: string;
  /** For screen readers: «Marte Lie, HCP 9,4», «Flytt Marte Lie til flight 2». */
  fullName: string;
  initials: string;
};

/** Where focus goes once the server has answered (#2289). */
export type StartlistaFocus = { kind: 'flight'; flight: number } | { kind: 'heading' } | null;

export function flightSectionId(n: number): string {
  return `startlista-flight-${n}`;
}

type Move = { userId: string; flight: number };

/**
 * #2451: what the cards need for their start times, or `null` for a round
 * that has none (a cup match, league round or derived game). `interval` null:
 * a round from before #2451, everyone out at the tee-off.
 */
export type StartlistaStartTimes = {
  gameMode: GameMode;
  teamSize: number;
  teeOffAt: string | null;
  interval: number | null;
};

/**
 * «Foreslå inndeling» sits in the page's top, outside this component. Its
 * form fires this event so the answer (the h1 gets focus) also comes when the
 * URL is the same as last time (`?status=flight_suggested` twice).
 */
const FOCUS_REQUEST = 'startlista:focus-request';

/**
 * The Startlista (#2289, artboard «Forslag: startlista»): the flights as cards
 * side by side, a player moved with two taps. Tap a chip, then the flight; tap
 * the chip again, «Avbryt» or Esc to let go. The rules (targets, order,
 * averages) live in `lib/games/startlist.ts`.
 *
 * The move is optimistic: the chip lands at once, and the server's answer
 * (a redirect back here) replaces the list. On `flight_full` the player is
 * back where they were and the banner says why.
 */
export function StartlistaClient({
  gameId,
  players,
  focus,
  headingId,
  startTimes = null,
}: {
  gameId: string;
  players: StartlistaPlayer[];
  focus: StartlistaFocus;
  headingId: string;
  startTimes?: StartlistaStartTimes | null;
}) {
  const t = useTranslations('admin.game.flights');
  const locale = useLocale() as AppLocale;
  const online = useOnline();
  const [, startTransition] = useTransition();
  const [optimisticPlayers, applyMove] = useOptimistic(players, (state, move: Move) =>
    state.map((p) => (p.user_id === move.userId ? { ...p, flight_number: move.flight } : p)),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // #2451: the chosen interval lands at once, like a move; the server's answer
  // (a redirect back here) replaces it.
  const [interval, applyInterval] = useOptimistic(
    startTimes?.interval ?? null,
    (_state, next: number) => next,
  );

  const startlist = buildStartlist(optimisticPlayers);
  const selected = optimisticPlayers.find((p) => p.user_id === selectedId) ?? null;
  const targets = selected ? moveTargets(startlist, selected.user_id) : [];
  const targetSet = new Set(targets);
  const slots = flightSlots(startlist, targets);

  // Focus follows each answer from the server, not the URL: two moves to the
  // same flight give the same URL, but a new `players` array. The ref is set
  // on the first load and by every move, and cleared once focus is given.
  const focusPending = useRef(true);
  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    if (!focus) return;
    const el = document.getElementById(
      focus.kind === 'flight' ? flightSectionId(focus.flight) : headingId,
    );
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: focus.kind === 'flight' ? 'center' : 'start' });
  }, [players, focus, headingId]);

  useEffect(() => {
    const request = () => {
      focusPending.current = true;
    };
    window.addEventListener(FOCUS_REQUEST, request);
    return () => window.removeEventListener(FOCUS_REQUEST, request);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedId]);

  function moveTo(flight: number) {
    if (!selected || !online) return;
    const userId = selected.user_id;
    // Outside the transition, so the selection lets go at once.
    setSelectedId(null);
    focusPending.current = true;
    startTransition(async () => {
      applyMove({ userId, flight });
      await setPlayerFlight(gameId, userId, flight);
    });
  }

  function chooseInterval(minutes: number) {
    if (!online || minutes === interval) return;
    focusPending.current = true;
    startTransition(async () => {
      applyInterval(minutes);
      await setTeeInterval(gameId, minutes);
    });
  }

  // #2451: a card's start time, through the shared rule. Only with an
  // interval, a tee-off and more than one start group; else no card has one.
  const teeOffAt = startTimes?.teeOffAt ?? null;
  const timed =
    startTimes != null &&
    interval != null &&
    teeOffAt != null &&
    startGroupsOf({
      game_mode: startTimes.gameMode,
      team_size: startTimes.teamSize,
      scheduled_tee_off_at: teeOffAt,
      tee_interval_minutes: interval,
      players: optimisticPlayers.map((p) => ({ ...p, team_number: null })),
    }).length > 0;
  const clock = (iso: string) => formatTeeOffTimeLocale(new Date(iso), locale);
  const cardTime = (n: number) =>
    timed && teeOffAt != null && interval != null ? clock(startGroupTeeOffAt(teeOffAt, n, interval)) : null;
  const cardTitle = (n: number) => {
    const time = cardTime(n);
    return (
      <>
        {/* A real space, so a screen reader hears «09:10 Flight 2». */}
        {time && <span className="mr-1 tabular-nums">{time}</span>}
        {time && ' '}
        {t('flightOptionN', { n })}
      </>
    );
  };

  const hcp = (value: number) => formatHcpDisplay(value, locale);
  const chip = (p: StartlistaPlayer, unassigned: boolean) => (
    <PlayerChip
      key={p.user_id}
      player={p}
      label={`${p.shortName} · ${hcp(p.hcpIndex)}`}
      ariaLabel={t('chipLabel', { name: p.fullName, hcp: hcp(p.hcpIndex) })}
      pressed={p.user_id === selectedId}
      unassigned={unassigned}
      onPress={() => setSelectedId((cur) => (cur === p.user_id ? null : p.user_id))}
    />
  );
  const meta = (flight: StartlistFlight | null) =>
    flight && flight.avgHcpIndex !== null
      ? t('flightMeta', { count: flight.members.length, avg: hcp(flight.avgHcpIndex) })
      : t('emptyFlight');

  const stripText = !online
    ? t('offline')
    : selected
      ? t.rich('selectedStrip', {
          name: selected.shortName,
          b: (chunks) => <span className="font-semibold">{chunks}</span>,
        })
      : null;

  return (
    <div className="-mx-1 leading-[normal]">
      {/* Mounted always, so a screen reader hears the strip when it appears. */}
      <p role="status" className="sr-only">
        {stripText}
      </p>
      {stripText && (
        <div
          data-focus-surface="strong"
          className="mt-3 flex items-center justify-between gap-2.5 rounded-xl bg-select-strip px-3 py-2.5 text-[13px] text-bg dark:text-bg-tint"
        >
          <span aria-hidden>{stripText}</span>
          {selected && (
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="tap-extend h-9 shrink-0 rounded-full border border-[rgba(248,246,240,0.4)] px-2.5 text-[12px] font-semibold [--tap-extend:-5px_0]"
            >
              {t('cancel')}
            </button>
          )}
        </div>
      )}

      {startTimes && (
        <TeeIntervalChoice
          interval={interval}
          teeOffAt={teeOffAt}
          online={online}
          onChoose={chooseInterval}
        />
      )}

      <div className="mt-3 flex flex-col gap-2.5">
        {slots.map(({ number, flight }) => {
          const titleId = `${flightSectionId(number)}-title`;
          if (selected && targetSet.has(number)) {
            return (
              <section
                key={number}
                id={flightSectionId(number)}
                tabIndex={-1}
                aria-labelledby={titleId}
              >
                <button
                  type="button"
                  data-target-flight={number}
                  disabled={!online}
                  onClick={() => moveTo(number)}
                  aria-label={t('moveHereLabel', { name: selected.fullName, n: number })}
                  aria-describedby={`${titleId}-meta`}
                  className="group block w-full rounded-2xl border-2 border-dashed border-primary bg-move-target p-3 text-left disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-2"
                >
                  <span className="flex items-baseline justify-between">
                    <span id={titleId} className="font-serif text-[17px] font-semibold">
                      {cardTitle(number)}
                    </span>
                    <span id={`${titleId}-meta`} className="text-[12px] text-muted">
                      {meta(flight)}
                    </span>
                  </span>
                  <span className="mt-2 block text-[13px] font-semibold text-primary group-disabled:text-muted">
                    {t('moveHere', { name: selected.shortName })}
                  </span>
                </button>
              </section>
            );
          }
          return (
            <section
              key={number}
              id={flightSectionId(number)}
              tabIndex={-1}
              aria-labelledby={titleId}
              className="rounded-2xl border border-border bg-surface p-3"
            >
              <div className="flex items-baseline justify-between">
                <h2 id={titleId} className="font-serif text-[17px] font-semibold">
                  {cardTitle(number)}
                </h2>
                <span className="text-[12px] text-muted">{meta(flight)}</span>
              </div>
              {flight && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {flight.members.map((p) => chip(p, false))}
                </div>
              )}
            </section>
          );
        })}

        {startlist.unassigned.length > 0 && (
          <section
            aria-labelledby="startlista-unassigned"
            className="rounded-2xl border border-dashed border-warning bg-surface p-3"
          >
            <div className="flex items-baseline justify-between">
              <h2 id="startlista-unassigned" className="text-[15px] font-semibold">
                {t('unassignedHeading')}
              </h2>
              <span className="text-[12px] font-semibold text-warning-text">
                {t('playerCount', { count: startlist.unassigned.length })}
              </span>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {startlist.unassigned.map((p) => chip(p, true))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * #2451: «Tid mellom flightene» over the cards: 8, 10 and 12 minutes, 44 px
 * high, as on step 4 of the wizard (`Nyttspill-forslag-starttider`). The line
 * over them says when the first flight goes out, or «Alle går ut 09:00» for a
 * round from before #2451, where no choice is pressed until the organiser
 * taps one. Grey and inert without a connection, like the moves.
 */
function TeeIntervalChoice({
  interval,
  teeOffAt,
  online,
  onChoose,
}: {
  interval: number | null;
  teeOffAt: string | null;
  online: boolean;
  onChoose: (minutes: number) => void;
}) {
  const t = useTranslations('admin.game.flights');
  const locale = useLocale() as AppLocale;
  const time = teeOffAt ? formatTeeOffTimeLocale(new Date(teeOffAt), locale) : null;
  const status =
    interval == null
      ? time
        ? t('teeAllOut', { time })
        : t('teeAllOutNoTime')
      : time
        ? t('teeFirstOut', { time })
        : null;
  return (
    <section aria-labelledby="startlista-tee-interval" className="mt-4" data-testid="tee-interval">
      <div className="flex items-baseline justify-between gap-3 px-1 pb-2">
        <h2 id="startlista-tee-interval" className="text-xs font-semibold text-muted">
          {t('teeIntervalHeading')}
        </h2>
        {status && <span className="text-xs font-medium text-muted">{status}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {TEE_INTERVAL_CHOICES.map((minutes) => {
          const selected = interval === minutes;
          return (
            <button
              key={minutes}
              type="button"
              aria-pressed={selected}
              disabled={!online}
              data-testid={`tee-interval-${minutes}`}
              onClick={() => onChoose(minutes)}
              className={`h-11 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                selected
                  ? 'bg-primary text-white dark:text-bg'
                  : 'border border-border bg-surface text-text hover:bg-primary-soft'
              }`}
            >
              {t('teeIntervalChoice', { minutes })}
            </button>
          );
        })}
      </div>
      {!online && <p className="px-1 pt-2 text-xs text-muted">{t('teeIntervalOffline')}</p>}
    </section>
  );
}

/**
 * A player chip: initials, name and index. 40 px tall as drawn; `tap-extend`
 * makes the tap target 44 px, measured from the padding box (the plain chip
 * has a 1 px border, the selected one none, as the artboard draws them).
 */
function PlayerChip({
  player,
  label,
  ariaLabel,
  pressed,
  unassigned,
  onPress,
}: {
  player: StartlistaPlayer;
  label: string;
  ariaLabel: string;
  pressed: boolean;
  unassigned: boolean;
  onPress: () => void;
}) {
  const shape = pressed
    ? 'border-0 bg-primary text-white dark:text-bg [--tap-extend:-2px_0]'
    : 'border border-border bg-bg text-text [--tap-extend:-3px_0]';
  // The selected disc keeps forest initials at night too (#ece5d2 under
  // --surface-strong); --primary would turn sage there, 2,1:1.
  const disc = pressed
    ? 'bg-on-strong text-surface-strong'
    : unassigned
      ? 'bg-chip-unassigned-disc text-muted dark:text-text'
      : 'bg-primary-soft text-primary';
  return (
    <button
      type="button"
      data-user-id={player.user_id}
      aria-pressed={pressed}
      aria-label={ariaLabel}
      onClick={onPress}
      className={`tap-extend flex h-10 items-center gap-1.5 rounded-full pr-3 pl-1.5 text-[13px] font-semibold ${shape}`}
    >
      <span
        aria-hidden
        className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] ${disc}`}
      >
        {player.initials}
      </span>
      {label}
    </button>
  );
}

/**
 * «Foreslå inndeling» in the page's top (the header's `action`): as before, it
 * splits everyone in signup order. Grey and inert without a connection.
 */
export function SuggestFlightsForm({ gameId }: { gameId: string }) {
  const t = useTranslations('admin.game.flights');
  const online = useOnline();
  return (
    <form
      action={suggestFlightAssignment.bind(null, gameId)}
      onSubmit={() => window.dispatchEvent(new Event(FOCUS_REQUEST))}
      className="shrink-0"
    >
      <SuggestButton disabled={!online} label={t('suggestButton')} busyLabel={t('suggestingBusy')} />
    </form>
  );
}

function SuggestButton({
  disabled,
  label,
  busyLabel,
}: {
  disabled: boolean;
  label: string;
  busyLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="h-11 rounded-full border border-primary bg-surface px-3.5 text-[13px] leading-[normal] font-semibold text-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:border-border disabled:text-muted disabled:hover:bg-surface"
    >
      {pending ? busyLabel : label}
    </button>
  );
}
