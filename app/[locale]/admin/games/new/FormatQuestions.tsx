'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { GOALS, LEVELS, type Goal, type Level } from '@/lib/formats/recommendFormat';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import { Kicker } from '@/components/ui/Kicker';
import { choiceCardClass } from '@/components/ui/ChoiceCard';

type Props = {
  level: Level | undefined;
  goal: Goal | undefined;
  onLevelChange: (level: Level) => void;
  onGoalChange: (goal: Goal) => void;
};

/**
 * «Usikker? To spørsmål» (#2462): the two questions from /spillformater
 * (#2328) over the format list. The count is already known from «Dere er …
 * spillere», so only «Hvor jevne er dere?» and «Hva vil dere ha ut av dagen?»
 * are asked. Texts come from `formatGuide.helper.*`, so both places say the
 * same. Each question is its own radiogroup, outside the format list's, with
 * the arrow keys inside the group. The answers are display state in
 * `FormatGrid`; nothing is posted with the form.
 */
export function FormatQuestions({ level, goal, onLevelChange, onGoalChange }: Props) {
  const t = useTranslations('wizard.formatGrid.questions');
  const tHelper = useTranslations('formatGuide.helper');

  const levelLabels: Record<Level, string> = {
    even: tHelper('levelEven'),
    uneven: tHelper('levelUneven'),
  };
  const goalLabels: Record<Goal, string> = {
    compete: tHelper('goalCompete'),
    team: tHelper('goalTeam'),
    stakes: tHelper('goalStakes'),
  };

  return (
    <div data-testid="format-questions">
      <Kicker className="pb-2 pt-[18px] leading-[normal]">{t('kicker')}</Kicker>
      <div className="-mx-1 flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-3.5">
        <Question
          legend={tHelper('levelLegend')}
          columns={2}
          options={LEVELS}
          labels={levelLabels}
          value={level}
          onChange={onLevelChange}
        />
        <Question
          legend={tHelper('goalLegend')}
          columns={3}
          options={GOALS}
          labels={goalLabels}
          value={goal}
          onChange={onGoalChange}
        />
      </div>
    </div>
  );
}

function Question<T extends string>({
  legend,
  columns,
  options,
  labels,
  value,
  onChange,
}: {
  legend: string;
  columns: 2 | 3;
  options: readonly T[];
  labels: Record<T, string>;
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  const legendId = useId();
  const roving = useRovingFocus(options, value, onChange);
  return (
    <div>
      <p id={legendId} className="pb-2 font-sans text-sm font-semibold leading-[normal] text-text">
        {legend}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={legendId}
        className={`grid gap-2 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}
      >
        {options.map((option, index) => (
          <button
            key={option}
            {...roving(index)}
            type="button"
            role="radio"
            aria-checked={value === option}
            onClick={() => onChange(option)}
            className={choiceCardClass(value === option, { height: 48, layout: 'centered' })}
          >
            {/* Inter 15/600 as the artboard draws it, not the card title's Fraunces. */}
            <span className="font-sans text-[15px] font-semibold leading-[normal]">
              {labels[option]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
