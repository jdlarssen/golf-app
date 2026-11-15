'use client';

import { useId, type ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import { formatDistance } from '@/lib/i18n/format';
import type { SideContestCategory } from '@/lib/games/sideContest';
import type { SideSlotView } from '@/lib/games/finishSideSlots';

export type PlayerOption = {
  user_id: string;
  display_name: string;
};

type Props = {
  gameId: string;
  ldCount: number;
  ctpCount: number;
  players: PlayerOption[];
  /**
   * #2283: per slot (index = position - 1), the hole and what the flights have
   * reported for it. Missing or `hole: null` = the slot looks as it always did.
   */
  ldSlots?: SideSlotView[];
  ctpSlots?: SideSlotView[];
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
  /** Where «Avbryt» links back to. Defaults to the admin game-detail page;
   *  the creator finish flow (#427) passes the player game-home instead. */
  cancelHref?: string;
};

export function SideWinnersForm({
  gameId,
  ldCount,
  ctpCount,
  players,
  ldSlots,
  ctpSlots,
  action,
  error,
  cancelHref,
}: Props) {
  const t = useTranslations('admin.game.sideWinners');

  // typeof-guard: searchParams kan levere string[] ved duplisert ?error-param —
  // da (og for alle ikke-missing_-koder, i praksis db_winners) er retry-rådet
  // det trygge valget (#1567). #2284: winner_withdrawn har sin egen tekst —
  // databasen nektet en vinner som trakk seg mens siden sto åpen.
  const kind: 'validation' | 'winner-withdrawn' | 'db' =
    typeof error === 'string' && error.startsWith('missing_')
      ? 'validation'
      : error === 'winner_withdrawn'
        ? 'winner-withdrawn'
        : 'db';
  const message =
    kind === 'validation'
      ? t('validationError')
      : kind === 'winner-withdrawn'
        ? t('winnerWithdrawnError')
        : t('dbError');

  return (
    <form action={action} className="space-y-6">
      {error && (
        <Banner tone="error" testId={`side-winners-error-${kind}`}>
          {message}
        </Banner>
      )}

      {ldCount > 0 && (
        <fieldset className="space-y-3">
          <legend className="font-sans text-xs font-semibold text-muted">
            {t('longestDriveLabel')}
          </legend>
          {Array.from({ length: ldCount }, (_, i) => i + 1).map((pos) => (
            <SlotField
              key={`ld-${pos}`}
              name={`ld_winner_${pos}`}
              pos={pos}
              category="longest_drive"
              view={ldSlots?.[pos - 1]}
              players={players}
            />
          ))}
        </fieldset>
      )}

      {ctpCount > 0 && (
        <fieldset className="space-y-3">
          <legend className="font-sans text-xs font-semibold text-muted">
            {t('closestToPinLabel')}
          </legend>
          {Array.from({ length: ctpCount }, (_, i) => i + 1).map((pos) => (
            <SlotField
              key={`ctp-${pos}`}
              name={`ctp_winner_${pos}`}
              pos={pos}
              category="closest_to_pin"
              view={ctpSlots?.[pos - 1]}
              players={players}
            />
          ))}
        </fieldset>
      )}

      <div className="flex gap-3">
        <SubmitButton variant="primary" pendingLabel={t('submittingBusy')}>
          {t('submitButton')}
        </SubmitButton>
        <Link
          href={cancelHref ?? `/admin/games/${gameId}`}
          className="tap-extend self-center text-sm text-muted underline [--tap-extend:-12px_-6px]"
        >
          {t('cancel')}
        </Link>
      </div>
    </form>
  );
}

/** One select, its label and, when the slot has a hole, what the flights reported for it (#2283, V2). */
function SlotField({
  name,
  pos,
  category,
  view,
  players,
}: {
  name: string;
  /** The slot's position, `#1`/`#2` in the label. */
  pos: number;
  category: SideContestCategory;
  view: SideSlotView | undefined;
  players: PlayerOption[];
}) {
  const t = useTranslations('admin.game.sideWinners');
  const boxId = useId();
  const hole = view?.hole ?? null;
  // A slot without a hole keeps today's label and gets no box.
  const label =
    category === 'longest_drive'
      ? hole === null
        ? t('longestDriveSlot', { pos })
        : t('longestDriveSlotHole', { pos, hole })
      : hole === null
        ? t('closestToPinSlot', { pos })
        : t('closestToPinSlotHole', { pos, hole });
  const showBox = view != null && hole !== null && view.reports !== null;
  return (
    <div>
      <label className="block">
        <span className="font-serif text-base text-text">{label}</span>
        <select
          name={name}
          required
          defaultValue=""
          aria-describedby={showBox ? boxId : undefined}
          className="mt-1 block min-h-[44px] w-full rounded-xl border border-border bg-surface px-3 py-2"
        >
          <option value="" disabled>
            {t('selectWinner')}
          </option>
          {players.map((p) => (
            <option key={p.user_id} value={p.user_id}>
              {p.display_name}
            </option>
          ))}
          <option value="none">{t('noQualified')}</option>
        </select>
      </label>
      {showBox && (
        <ReportedBox
          id={boxId}
          testKey={`${category === 'longest_drive' ? 'ld' : 'ctp'}-${pos}`}
          category={category}
          hole={hole}
          reports={view.reports!}
        />
      )}
    </div>
  );
}

/**
 * «Meldt inn fra flightene» (drawing V2, the same box as the app's winner
 * sheet): one line per flight's answer, the shortest distance first, then the
 * flights that have not reported. Read-only; nothing here picks the winner.
 */
function ReportedBox({
  id,
  testKey,
  category,
  hole,
  reports,
}: {
  id: string;
  testKey: string;
  category: SideContestCategory;
  hole: number;
  reports: NonNullable<SideSlotView['reports']>;
}) {
  const t = useTranslations('admin.game.sideWinners');
  const locale = useLocale() as AppLocale;
  const flightName = (flightNumber: number) =>
    flightNumber === 0 ? t('reportedFlightSingle') : t('reportedFlight', { number: flightNumber });

  const rows: { key: string; node: ReactNode; className: string }[] = [];
  if (reports !== 'failed') {
    for (const line of reports.lines) {
      rows.push({
        key: `line-${line.flightNumber}`,
        className: 'flex items-baseline gap-2.5 py-2',
        node: (
          <>
            <span className="w-16 shrink-0 text-[13px] leading-[18px] text-muted">{flightName(line.flightNumber)}</span>
            <span className="min-w-0 flex-1 text-[15px] font-semibold leading-5 text-text">
              {line.name ??
                t(category === 'closest_to_pin' ? 'reportedNoOneClosestToPin' : 'reportedNoOneLongestDrive')}
            </span>
            {line.distanceM !== null && (
              <span className="shrink-0 text-[15px] leading-5 tabular-nums text-text">
                {t('reportedDistance', { distance: formatDistance(line.distanceM, locale) })}
              </span>
            )}
          </>
        ),
      });
    }
    if (reports.lines.length > 0) {
      for (const flight of reports.missingFlights) {
        rows.push({
          key: `missing-${flight}`,
          className: 'py-2 text-sm leading-5 text-muted',
          node: t('reportedMissing', { flight: flightName(flight) }),
        });
      }
    }
  }
  const empty =
    reports === 'failed'
      ? t('reportedReadFailed')
      : rows.length === 0
        ? t('reportedNone', { hole })
        : null;

  return (
    <div
      id={id}
      role="group"
      aria-label={t('reportedHeading')}
      data-testid={`side-reports-${testKey}`}
      className="mt-2 rounded-xl bg-surface px-3 pb-1 pt-2.5"
    >
      <div className="text-xs font-semibold leading-[15px] text-muted">{t('reportedHeading')}</div>
      {empty !== null ? (
        <p className="pt-2 text-sm leading-5 text-muted">{empty}</p>
      ) : (
        <ul>
          {rows.map((row, index) => (
            <li
              key={row.key}
              className={index > 0 ? `border-t border-row-divider-warm ${row.className}` : row.className}
            >
              {row.node}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
