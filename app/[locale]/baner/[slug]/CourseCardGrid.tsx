import { coursePar, genderParRows, splitNines } from '@/lib/courses/courseCard';
import type { PublicCourseHole } from '@/lib/courses/publicCourses';

export type CourseCardGridLabels = {
  hole: string;
  par: string;
  parLadies: string;
  parJuniors: string;
  index: string;
  out: string;
  in: string;
  captionOut: string;
  captionIn: string;
};

const ROW_LABEL = 'pl-1 text-left text-[10px] tracking-[0.1em] uppercase';

/**
 * The course card's two scorecards (#2277): holes 1–9 (UT) and 10–18 (INN),
 * each with Par and Index rows and the par sum in the last column — as on the
 * card in the golfer's bag. A gender whose par differs on any hole gets its
 * own par row. A course without holes 10–18 shows the out card alone.
 *
 * Server component, labels as props (the Type C test needs no i18n mock).
 * The `<colgroup>` carries the column widths: an `sr-only` caption is
 * absolutely positioned, and Chromium and WebKit then ignore the first row's
 * widths in a fixed-layout table and split the columns evenly.
 */
export function CourseCardGrid({
  holes,
  labels,
}: {
  holes: PublicCourseHole[];
  labels: CourseCardGridLabels;
}) {
  const { out, in: back } = splitNines(holes);
  const extraRows = genderParRows(holes);
  const halves = [
    { holes: out, sumLabel: labels.out, caption: labels.captionOut },
    { holes: back, sumLabel: labels.in, caption: labels.captionIn },
  ].filter((half) => half.holes.length > 0);

  return (
    <div className="flex flex-col gap-2.5 overflow-x-auto">
      {halves.map((half) => (
        <table
          key={half.caption}
          className="w-full table-fixed border-collapse text-[12px] tabular-nums"
        >
          <caption className="sr-only">{half.caption}</caption>
          <colgroup>
            <col className="w-[50px]" />
            {half.holes.map((h) => (
              <col key={h.hole_number} />
            ))}
            <col className="w-[34px]" />
          </colgroup>
          <thead>
            <tr className="text-[10px] tracking-[0.1em] text-muted">
              <th scope="row" className={`${ROW_LABEL} font-normal`}>
                {labels.hole}
              </th>
              {half.holes.map((h) => (
                <th key={h.hole_number} scope="col" className="text-center font-normal">
                  {h.hole_number}
                </th>
              ))}
              {/* Muted on the night --surface-2 is 4.2:1; the label takes the
                  text colour there to clear 4.5:1. */}
              <th
                scope="col"
                className="bg-surface-2 text-center font-normal uppercase dark:text-text"
              >
                {half.sumLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            <ParRow label={labels.par} holes={half.holes} par={(h) => h.par_mens} />
            {extraRows.map((gender) => (
              <ParRow
                key={gender}
                label={gender === 'ladies' ? labels.parLadies : labels.parJuniors}
                holes={half.holes}
                par={(h) =>
                  (gender === 'ladies' ? h.par_ladies : h.par_juniors) ?? h.par_mens
                }
              />
            ))}
            <tr className="h-[26px] border-t border-row-divider-warm text-muted">
              <th scope="row" className={`${ROW_LABEL} font-semibold`}>
                {labels.index}
              </th>
              {half.holes.map((h) => (
                <td key={h.hole_number} className="text-center">
                  {h.stroke_index === 1 ? (
                    <span className="inline-flex size-5 items-center justify-center rounded-full bg-surface-strong font-semibold text-white dark:bg-primary dark:text-bg">
                      1
                    </span>
                  ) : (
                    h.stroke_index
                  )}
                </td>
              ))}
              <td className="bg-surface-2" />
            </tr>
          </tbody>
        </table>
      ))}
    </div>
  );
}

function ParRow({
  label,
  holes,
  par,
}: {
  label: string;
  holes: PublicCourseHole[];
  par: (hole: PublicCourseHole) => number | null;
}) {
  return (
    <tr className="h-[30px] border-t border-row-divider-warm font-serif text-[16px] text-text">
      <th scope="row" className={`${ROW_LABEL} font-sans font-normal text-muted`}>
        {label}
      </th>
      {holes.map((h) => (
        <td key={h.hole_number} className="text-center">
          {par(h)}
        </td>
      ))}
      <td className="bg-surface-2 text-center">
        {coursePar(holes.map((h) => ({ par_mens: par(h) })))}
      </td>
    </tr>
  );
}
