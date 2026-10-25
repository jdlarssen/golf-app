'use client';

import { useId, useState, type ReactNode } from 'react';
import { PillRadio } from '@/components/ui/PillRadio';
import { SmartLink } from '@/components/ui/SmartLink';
import { FormatLineupFigure } from '@/components/FormatLineupFigure';
import {
  GOALS,
  LEVELS,
  PLAYER_COUNT_BUCKETS,
  type CountBucket,
  type FormatAnswers,
  type Goal,
  type Level,
} from '@/lib/formats/recommendFormat';
import { answerKey, type FormatHelperView } from '@/lib/formats/formatHelperViews';

export type FormatHelperLabels = {
  countLegend: string;
  levelLegend: string;
  levelEven: string;
  levelUneven: string;
  goalLegend: string;
  goalCompete: string;
  goalTeam: string;
  goalStakes: string;
  resultKicker: string;
  create: string;
  rules: string;
  /** «Eller se alle 23 spillformer →», with the real count. */
  seeAll: string;
  versus: string;
};

const BUCKET_LABELS: Record<CountBucket, string> = {
  '2': '2',
  '3': '3',
  '4': '4',
  '5-12': '5–12',
  '13+': '13+',
};

/**
 * The format helper at the top of /spillformater (#2328, artboard «Forslag:
 * hvilket format passer dere?»): three questions, one suggestion, and a link
 * into step 2 of the Kompis wizard with the format chosen.
 *
 * Every answer's suggestion is built on the server (`buildFormatHelperViews`)
 * and passed in, so the server HTML already shows the default suggestion and
 * the browser needs no message catalog. The questions are native radios
 * (`PillRadio`) in a fieldset each: one tab stop per group, arrow keys move
 * the choice. The suggestion's name sits in a polite live region.
 */
export function FormatHelper({
  views,
  labels,
  initialAnswers,
  allFormatsHref,
}: {
  views: Record<string, FormatHelperView>;
  labels: FormatHelperLabels;
  initialAnswers: FormatAnswers;
  allFormatsHref: string;
}) {
  const [bucket, setBucket] = useState<CountBucket>(initialAnswers.bucket);
  const [level, setLevel] = useState<Level>(initialAnswers.level);
  const [goal, setGoal] = useState<Goal>(initialAnswers.goal);
  const id = useId();
  const view = views[answerKey({ bucket, level, goal })];

  const levelLabels: Record<Level, string> = { even: labels.levelEven, uneven: labels.levelUneven };
  const goalLabels: Record<Goal, string> = {
    compete: labels.goalCompete,
    team: labels.goalTeam,
    stakes: labels.goalStakes,
  };

  return (
    <div data-testid="format-helper">
      <div className="mt-[18px] flex flex-col gap-3.5">
        <Question legend={labels.countLegend}>
          {PLAYER_COUNT_BUCKETS.map((b) => (
            <PillRadio
              key={b}
              name={`${id}-count`}
              value={b}
              checked={bucket === b}
              onChange={() => setBucket(b)}
              sizeClassName="min-w-[52px] px-3"
            >
              {BUCKET_LABELS[b]}
            </PillRadio>
          ))}
        </Question>
        <Question legend={labels.levelLegend}>
          {LEVELS.map((l) => (
            <PillRadio
              key={l}
              name={`${id}-level`}
              value={l}
              checked={level === l}
              onChange={() => setLevel(l)}
            >
              {levelLabels[l]}
            </PillRadio>
          ))}
        </Question>
        <Question legend={labels.goalLegend}>
          {GOALS.map((g) => (
            <PillRadio
              key={g}
              name={`${id}-goal`}
              value={g}
              checked={goal === g}
              onChange={() => setGoal(g)}
            >
              {goalLabels[g]}
            </PillRadio>
          ))}
        </Question>
      </div>

      <div
        data-testid="format-helper-result"
        className="-mx-1 mt-5 flex flex-col gap-2.5 rounded-[18px] border-2 border-primary bg-surface p-4"
      >
        <p className="font-sans text-[10px] font-semibold uppercase leading-[normal] tracking-[0.2em] text-primary">
          {labels.resultKicker}
        </p>
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0" aria-live="polite">
            <p className="font-serif text-[26px] font-semibold leading-[normal] text-text">
              {view.name}
            </p>
            <p className="font-sans text-[13px] leading-[normal] text-muted">{view.meta}</p>
          </div>
          <FormatLineupFigure lineup={view.lineup} variant="card" versusLabel={labels.versus} />
        </div>
        {view.note && (
          <p data-testid="format-helper-note" className="font-sans text-[13px] leading-[1.45] text-muted">
            {view.note}
          </p>
        )}
        <p className="font-sans text-sm leading-[1.45] text-text">{view.why}</p>
        <div className="flex gap-2">
          <SmartLink
            href={view.createHref}
            data-testid="format-helper-create"
            className="flex h-12 grow items-center justify-center rounded-full bg-primary px-3.5 text-center font-sans text-sm font-semibold leading-[normal] text-white no-underline dark:text-bg"
          >
            {labels.create}
          </SmartLink>
          <SmartLink
            href={view.rulesHref}
            aria-label={view.rulesAriaLabel}
            data-testid="format-helper-rules"
            // 50 px: the artboard's link is 48 px content-box plus its border.
            className="flex h-[50px] shrink-0 items-center rounded-full border border-border px-3.5 font-sans text-sm font-semibold leading-[normal] text-primary no-underline"
          >
            {labels.rules}
          </SmartLink>
        </div>
      </div>

      <a
        href={allFormatsHref}
        className="-mx-1 mt-3 flex min-h-11 items-center justify-center font-sans text-sm font-semibold text-primary underline"
      >
        {labels.seeAll}
      </a>
    </div>
  );
}

function Question({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="p-0 pb-2 font-sans text-sm font-semibold leading-[normal] text-text">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}
