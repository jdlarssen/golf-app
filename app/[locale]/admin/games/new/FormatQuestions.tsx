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
    <div className="flex flex-col gap-2.5">
      <p id={legendId} className="font-sans text-sm font-semibold leading-[normal] text-text">
        {legend}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={legendId}
        // Three answers fit one row from 360 px; narrower, they wrap to two rows
        // (two, then one across) so «Konkurranse» keeps its tile and 48 px height.
        className={`grid gap-2 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-2 min-[360px]:grid-cols-3'}`}
      >
        {options.map((option, index) => (
          <button
            key={option}
            {...roving(index)}
            type="button"
            role="radio"
            aria-checked={value === option}
            onClick={() => onChange(option)}
            // Three to a row at 390 px leaves ~92 px of text: «Litt på spill» wraps
            // once the chosen tile's 2 px frame takes its share, and the row grows.
            // So from 360 px the three-wide tiles lose side padding and never wrap,
            // at 14 px until 380 px (15 px would leave ~1 px of air at 375);
            // narrower than 360 px, the third tile takes a row of its own.
            className={`${choiceCardClass(value === option, { height: 48, layout: 'centered' })} ${
              columns === 3
                ? `whitespace-nowrap min-[360px]:px-1! ${index === 2 ? 'max-[359px]:col-span-2' : ''}`
                : ''
            }`}
          >
            {/* Inter 15/600 as the artboard draws it, not the card title's Fraunces. */}
            <span
              className={`font-sans font-semibold leading-[normal] ${
                columns === 3 ? 'text-sm min-[380px]:text-[15px]' : 'text-[15px]'
              }`}
            >
              {labels[option]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
