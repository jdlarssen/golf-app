'use client';

import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { RemindButton } from '../status/RemindButton';

/** A skipped-hole row, with every string already put together by the page. */
export type NeedsYouGap = {
  key: string;
  /** First names, already joined with `formatListLocale`. */
  names: string;
  /** How many players the row is about (for the English verb). */
  people: number;
  /** Hole numbers, already joined with `formatListLocale`. */
  holes: string;
  holeCount: number;
  /**
   * The row's second line: where the player's group is («Flight 2 er på hull
   * 12», the same label «Flightene» shows), or how far the player has entered
   * when the group has no number.
   */
  where: { kind: 'group'; group: string; hole: number } | { kind: 'entered'; hole: number };
  /**
   * «Påminn» for this row (#2268, the owner's choice B): «du mangler slag på
   * hull H». Null when everyone in the row is a guest (they get no reminder);
   * `names`/`people` are the ones it reaches, for the confirm text.
   */
  remind: {
    action: () => void | Promise<void>;
    names: string;
    people: number;
  } | null;
};

type Props = {
  /** Scorecards waiting for a peer approval, with first names. */
  pendingApproval: { count: number; names: string } | null;
  /** Players who have finished without handing in (the reminder's targets). */
  finished: {
    count: number;
    names: string;
    remindAction: () => void | Promise<void>;
  } | null;
  gaps: readonly NeedsYouGap[];
};

/**
 * «Trenger deg» on the desk's «Live» tab (#2268): what waits on the organiser,
 * with the one action in the row. Every row is an `<li>` with at most one
 * control: «Se over» is a link to «Leverte scorekort», and «Påminn» is a
 * button, both on the finished-not-delivered row (today's delivery reminder)
 * and on a skipped-hole row (the hole reminder, the owner's choice B). A
 * skipped-hole row of guests only has no button: no one in it can be reminded.
 */
export function NeedsYouList({ pendingApproval, finished, gaps }: Props) {
  const t = useTranslations('admin.game.pult');
  const headingId = useId();
  const empty = pendingApproval == null && finished == null && gaps.length === 0;

  return (
    <section aria-labelledby={headingId} data-testid="pult-needs-you" className="leading-[normal]">
      <h2
        id={headingId}
        className="px-1 pt-4 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-warning-text"
      >
        {t('needsYouHeading')}
      </h2>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {empty ? (
          <p data-testid="pult-needs-you-empty" className="px-3.5 py-3 text-[15px] text-muted">
            {t('needsYouEmpty')}
          </p>
        ) : (
          <ul className="divide-y divide-row-divider-warm">
            {pendingApproval && (
              <Row
                testId="pult-row-pending"
                title={t('pendingApproval', { count: pendingApproval.count })}
                sub={pendingApproval.names}
                action={
                  <a
                    href="#leverte-scorekort"
                    className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-primary px-4 text-[13px] font-semibold text-white transition-colors hover:bg-primary-hover dark:text-bg"
                  >
                    {t('reviewButton')}
                  </a>
                }
              />
            )}
            {finished && (
              <Row
                testId="pult-row-finished"
                title={t('finishedNotSubmitted', { count: finished.count })}
                sub={finished.names}
                action={
                  <RemindButton
                    remindAction={finished.remindAction}
                    count={finished.count}
                    labelKey="remindRowButton"
                    confirmKey="remindConfirm"
                    testId="pult-remind-button"
                    variant="row"
                  />
                }
              />
            )}
            {gaps.map((gap) => (
              <Row
                key={gap.key}
                testId="pult-row-gap"
                title={t('gapRow', {
                  names: gap.names,
                  people: gap.people,
                  holes: gap.holes,
                  holeCount: gap.holeCount,
                })}
                sub={
                  gap.where.kind === 'group'
                    ? t('gapGroupAt', { group: gap.where.group, hole: gap.where.hole })
                    : t('gapEnteredTo', { hole: gap.where.hole })
                }
                action={
                  gap.remind && (
                    <RemindButton
                      remindAction={gap.remind.action}
                      count={gap.remind.people}
                      labelKey="remindRowButton"
                      confirmKey="remindHoleConfirm"
                      confirmValues={{
                        names: gap.remind.names,
                        holes: gap.holes,
                        holeCount: gap.holeCount,
                      }}
                      testId="pult-remind-hole-button"
                      variant="row"
                    />
                  )
                }
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Row({
  testId,
  title,
  sub,
  action,
}: {
  testId: string;
  title: string;
  sub: string;
  action?: ReactNode;
}) {
  return (
    <li data-testid={testId} className="flex items-center gap-3 px-3.5 py-3">
      <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-warning" />
      <span className="min-w-0 grow">
        <span className="block text-[15px] font-semibold text-text">{title}</span>
        <span className="block text-[12px] text-muted">{sub}</span>
      </span>
      {action}
    </li>
  );
}
