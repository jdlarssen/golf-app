'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from '@/i18n/navigation';
import { localDb } from '@/lib/sync/db';
import { isBlockingItem } from '@/lib/sync/queueScope';
import { drainQueue } from '@/lib/sync/syncWorker';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SearchField } from '@/components/ui/SearchField';
import { PICKER_VISIBLE_ROWS, pickerRows } from '@/lib/league/pickerRows';
import { TEE_SHOT_SHORT_BOX_ID } from '@/components/games/TeeShotShortBox';

type Props = {
  submitAction: (formData: FormData) => void | Promise<void>;
  missingHoles: number;
  /**
   * Every game this delivery can freeze: this round, plus a split-cup front9
   * sibling round when the player is delivering a back9 host (#1466). Queued
   * strokes for any of them block the submit; strokes queued for unrelated
   * rounds do not (#1370).
   */
  blockingGameIds: string[];
  /**
   * #2200: the flightmates' cards this delivery also covers. Sent as hidden
   * `alsoFor` fields; the server delivers only those its own rule allows.
   */
  alsoFor?: readonly string[];
  /** #2200: button text when it covers more than my own card. */
  label?: string;
  /**
   * #2580: someone on a team in this delivery lacks tee shots. The button
   * stays in the focus order (`aria-disabled`, not `disabled`), is described
   * by the box over it, and a tap moves focus to that box instead of
   * delivering. The server refuses the delivery anyway (`tee_shots_short`).
   */
  teeShotBlocked?: boolean;
  /**
   * #2661: a simulator league asks who in the league approves the card. The
   * candidates come from `loadMarkerChoice` (the league's members except the
   * cards' owners and the deliverer); «Lever» stays locked until one is
   * picked, and the server checks the pick again (`markerRefusal`). Omitted
   * outside a simulator league.
   */
  markerOptions?: readonly { userId: string; name: string | null }[];
  /**
   * #2661: the «Rediger» link, laid out beside the button under the marker
   * picker (the picker needs the full width, inside the form).
   */
  leading?: ReactNode;
};

/**
 * Wraps the final «Lever» button in a confirm() guard — but only when the
 * player has unplayed holes (they get locked in as not played, so that
 * deserves a stop). A complete card submits straight through: the review
 * screen the player is standing on is the confirmation (#1793).
 *
 * #668: also drains the offline sync queue on mount and blocks the submit
 * while strokes are still queued. The review preview is server-rendered from
 * Postgres, so a stroke still sitting in Dexie shows up as a missing hole —
 * and if the player submits, RLS freezes their card and the queued write is
 * rejected and lost. Draining first pushes those strokes to the server while
 * the card is still un-frozen; once the queue empties we refresh so the
 * preview (and missing-hole count) reflects the now-synced holes. Quarantined
 * (abandonedAt) items are ignored here — they never drain, so blocking on them
 * would trap the player forever.
 *
 * #1370: the block counts only strokes queued for a game THIS delivery can
 * freeze (see `blockingGameIds`). A leftover stroke from an unrelated round no
 * longer locks «Lever» — it was never at risk from this submit.
 *
 * #2219: the button also stays locked until Dexie has answered.
 * `useLiveQuery` returns `undefined` until then, and in the server HTML, so a
 * tap before hydration or in the first milliseconds cannot deliver ahead of a
 * queued stroke.
 */
export function SubmitForm({
  submitAction,
  missingHoles,
  blockingGameIds,
  alsoFor = [],
  label,
  teeShotBlocked = false,
  markerOptions,
  leading,
}: Props) {
  const t = useTranslations('game.submit');
  const router = useRouter();
  const [marker, setMarker] = useState<string | null>(null);
  const needsMarker = markerOptions !== undefined && marker === null;

  // Dexie query deps must be value-stable; the prop is a fresh array on every
  // render, so key the query on its contents instead.
  const blockingKey = blockingGameIds.join(',');
  const pendingStrokes = useLiveQuery(
    () =>
      localDb.syncQueue
        .filter((i) => isBlockingItem(i, blockingGameIds))
        .count(),
    [blockingKey],
  );
  // #2580: a tee shot still in its queue blocks the delivery like a stroke —
  // the server counts only what reached it.
  const pendingTeeShots = useLiveQuery(
    () =>
      localDb.teeShotQueue
        .filter((i) => isBlockingItem(i, blockingGameIds))
        .count(),
    [blockingKey],
  );
  const pendingCount =
    pendingStrokes === undefined || pendingTeeShots === undefined
      ? undefined
      : pendingStrokes + pendingTeeShots;
  const syncing = pendingCount !== undefined && pendingCount > 0;
  const blocked = pendingCount === undefined || syncing;

  // Kick a drain as soon as the review screen mounts so any strokes entered
  // offline reach the server before the card can be frozen by submit. Still
  // drains the WHOLE queue — drain semantics stay global (#1370).
  useEffect(() => {
    void drainQueue();
  }, []);

  // When the queue empties after having been non-empty, the server-rendered
  // preview is stale (computed before those strokes synced). Refresh so the
  // missing-hole count and scorecard reflect the now-synced state.
  const wasPending = useRef(false);
  useEffect(() => {
    if (syncing) {
      wasPending.current = true;
    } else if (wasPending.current) {
      wasPending.current = false;
      router.refresh();
    }
  }, [syncing, router]);

  return (
    <form
      action={submitAction}
      onSubmit={(event) => {
        // Never submit while strokes are still syncing — they'd be frozen out
        // — or before the queue has been read at all (#2219).
        if (blocked || needsMarker) {
          event.preventDefault();
          return;
        }
        // #1793: a complete card submits without a confirm — the review screen
        // the player is standing on IS the confirmation. Only ask when holes
        // are missing, since those get locked in as not played.
        if (missingHoles === 0) return;
        const msg = `${t('confirmBase')}\n\n${t('confirmMissing', {
          count: missingHoles,
        })}`;
        if (!window.confirm(msg)) {
          event.preventDefault();
        }
      }}
    >
      {/* Always mounted (#1011): only mounted inputs reach FormData. */}
      {alsoFor.map((userId) => (
        <input key={userId} type="hidden" name="alsoFor" value={userId} />
      ))}
      {markerOptions !== undefined && (
        <MarkerPicker options={markerOptions} value={marker} onChange={setMarker} />
      )}
      <div className={leading ? 'grid grid-cols-2 gap-6' : undefined}>
      {leading}
      {teeShotBlocked ? (
        <button
          type="button"
          data-testid="submit-scorecard"
          aria-disabled="true"
          aria-describedby={TEE_SHOT_SHORT_BOX_ID}
          onClick={() => document.getElementById(TEE_SHOT_SHORT_BOX_ID)?.focus()}
          className="inline-flex min-h-[44px] w-full cursor-not-allowed items-center justify-center rounded-full bg-meter-track px-[18px] py-2.5 font-medium tracking-tight text-muted"
        >
          {label ?? t('submitButton')}
        </button>
      ) : (
        <SubmitButton
          data-testid="submit-scorecard"
          className="w-full"
          pendingLabel={t('submitPending')}
          disabled={blocked || needsMarker}
        >
          {syncing ? t('syncingPending') : (label ?? t('submitButton'))}
        </SubmitButton>
      )}
      </div>
    </form>
  );
}

/**
 * #2661: one marker from the league, as radio rows in the round start's
 * picker style (`RoundStartClient`). The chosen marker is the form's `marker`
 * field, in a hidden input that stays mounted with the form (#1011): the radios
 * come and go with the search and «Vis alle». They share a name of their own
 * (`marker-choice`, which the server does not read) so they stay one group for
 * arrow keys and screen readers.
 * #2666: the list is the whole league, so it shows six rows, a search over
 * everyone and «Vis alle» (`pickerRows`, shared with the round start).
 */
function MarkerPicker({
  options,
  value,
  onChange,
}: {
  options: readonly { userId: string; name: string | null }[];
  value: string | null;
  onChange: (userId: string) => void;
}) {
  const t = useTranslations('game.submit.marker');
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const picker = pickerRows(options, {
    query,
    showAll,
    nameOf: (o) => o.name ?? t('unknownPlayer'),
    keepIds: new Set(value ? [value] : []),
  });
  return (
    <fieldset className="mb-5 space-y-2" data-testid="marker-picker">
      <legend className="mb-1 block font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        {t('legend')}
      </legend>
      <p className="mb-3 text-sm text-muted">{options.length > 0 ? t('hint') : t('none')}</p>
      <input type="hidden" name="marker" value={value ?? ''} />
      {options.length > PICKER_VISIBLE_ROWS && (
        <SearchField
          id="marker-search"
          label={t('searchLabel')}
          placeholder={t('searchPlaceholder')}
          value={query}
          onChange={setQuery}
        />
      )}
      <ul className="space-y-2">
        {picker.rows.map((o) => {
          const checked = value === o.userId;
          return (
            <li key={o.userId}>
              <label
                data-testid={`marker-option-${o.userId}`}
                className={[
                  'flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border px-4 py-3',
                  checked
                    ? 'border-primary bg-primary-soft'
                    : 'border-border bg-surface hover:bg-primary-soft/50',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="marker-choice"
                  value={o.userId}
                  className="sr-only"
                  checked={checked}
                  onChange={() => onChange(o.userId)}
                />
                <span
                  aria-hidden
                  className={[
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                    checked ? 'border-primary' : 'border-border bg-bg',
                  ].join(' ')}
                >
                  {checked && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                </span>
                <span className="font-sans text-sm text-text">{o.name ?? t('unknownPlayer')}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {picker.searching && picker.total === 0 && (
        <p className="font-sans text-sm text-muted" data-testid="marker-no-match">
          {t('noMatch')}
        </p>
      )}
      {picker.canExpand && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          data-testid="marker-show-all"
          className="inline-flex min-h-[44px] items-center font-sans text-sm font-medium text-primary"
        >
          {showAll ? t('showFewer') : t('showAll', { count: picker.total })}
        </button>
      )}
    </fieldset>
  );
}
