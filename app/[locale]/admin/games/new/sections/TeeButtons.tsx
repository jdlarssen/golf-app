'use client';

import { useTranslations } from 'next-intl';
import { FormSection } from '@/components/ui/FormSection';
import { TEE_DOT_CLASS, teeDotColor, type TeeColor } from '@/lib/courses/teeColors';
import type { CourseOption } from '../GameForm';
import { formatRatingBadge } from './teeRatingBadge';

/**
 * The tee dot (#2448). Unlike the dots on the course page and the course form,
 * a tee whose colour is unknown still gets one: the neutral `--tee-none`. The
 * 1 px inner edge lets a white dot show on a white button.
 */
function TeeDot({ color }: { color: TeeColor | null }) {
  return (
    <span
      aria-hidden="true"
      data-tee-dot={color ?? 'none'}
      className={`mr-1.5 inline-block size-3 shrink-0 rounded-full align-[-1px] shadow-[0_0_0_1px_rgb(0_0_0/0.25)] ${color ? TEE_DOT_CLASS[color] : 'bg-tee-none'}`}
    />
  );
}

/**
 * «TEE» on «Hvor og når?» (#2448, `Nyttspill-forslag-bane`): one button per
 * tee in a three-column grid, with the dot, the name and who the tee is rated
 * for. Without a course there is nothing to choose, and the kicker says so.
 * The buttons post nothing: `tee_box_id` travels in BasicsSection's hidden
 * field.
 */
export function TeeButtons({
  tees,
  hasCourse,
  teeBoxId,
  onSelect,
}: {
  tees: CourseOption['tee_boxes'];
  hasCourse: boolean;
  teeBoxId: string;
  onSelect: (teeId: string) => void;
}) {
  const t = useTranslations('wizard.sections.basics');
  return (
    <FormSection legend={t('teeLabel')} variant="bare">
      {hasCourse ? (
        <div className="grid grid-cols-3 gap-2" data-testid="tee-buttons">
          {tees.map((tee) => {
            const pressed = tee.id === teeBoxId;
            return (
              <button
                key={tee.id}
                type="button"
                aria-pressed={pressed}
                data-testid="tee-button"
                data-tee-id={tee.id}
                onClick={() => onSelect(tee.id)}
                className={`flex min-h-16 min-w-0 flex-col items-start justify-center rounded-[14px] p-2.5 text-left text-text transition-colors duration-150 ${
                  pressed ? 'border-2 border-primary bg-primary-soft' : 'border border-border bg-surface hover:bg-primary-soft'
                }`}
              >
                <span className="max-w-full break-words font-serif text-[15px] font-semibold leading-[normal]">
                  <TeeDot color={teeDotColor({ color: tee.color ?? null, name: tee.name })} />
                  {tee.name}
                </span>
                <span className="mt-0.5 font-sans text-xs leading-[normal] text-muted">
                  {formatRatingBadge(tee, t)}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="px-1 font-sans text-sm leading-[1.4] text-muted">{t('teePlaceholderNoCourse')}</p>
      )}
    </FormSection>
  );
}
