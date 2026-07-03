import type { PublicCourseHole } from '@/lib/courses/publicCourses';

export type HoleTableLabels = {
  colHole: string;
  colPar: string;
  colIndex: string;
  genderMens: string;
  genderLadies: string;
  genderJuniors: string;
};

/**
 * Hole-by-hole table for the public course page (#1023). Pure presentational
 * server component — all data and labels come as props (Type C test needs no
 * i18n/Supabase mocks).
 *
 * Norwegian courses rate men/ladies/juniors at the same par on nearly every
 * hole, so a three-way Par column would be noise for the common case: when
 * every hole has identical par across the gender sets we render ONE Par
 * column, and only fan out to per-gender columns when they actually differ.
 */
export function HoleTable({
  holes,
  labels,
}: {
  holes: PublicCourseHole[];
  labels: HoleTableLabels;
}) {
  const parsDiffer = holes.some(
    (h) =>
      (h.par_ladies !== null && h.par_ladies !== h.par_mens) ||
      (h.par_juniors !== null && h.par_juniors !== h.par_mens),
  );

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm tabular-nums" data-testid="hole-table">
        <thead>
          <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted">
            <th scope="col" className="px-2 py-1.5 font-semibold">
              {labels.colHole}
            </th>
            {parsDiffer ? (
              <>
                <th scope="col" className="px-2 py-1.5 text-right font-semibold">
                  {`${labels.colPar} ${labels.genderMens}`}
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-semibold">
                  {`${labels.colPar} ${labels.genderLadies}`}
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-semibold">
                  {`${labels.colPar} ${labels.genderJuniors}`}
                </th>
              </>
            ) : (
              <th scope="col" className="px-2 py-1.5 text-right font-semibold">
                {labels.colPar}
              </th>
            )}
            <th scope="col" className="px-2 py-1.5 text-right font-semibold">
              {labels.colIndex}
            </th>
          </tr>
        </thead>
        <tbody>
          {holes.map((hole) => (
            <tr key={hole.hole_number} className="border-t border-border/60">
              <td className="px-2 py-1.5 font-medium text-text">
                {hole.hole_number}
              </td>
              {parsDiffer ? (
                <>
                  <td className="px-2 py-1.5 text-right text-text">
                    {hole.par_mens ?? ''}
                  </td>
                  <td className="px-2 py-1.5 text-right text-text">
                    {hole.par_ladies ?? ''}
                  </td>
                  <td className="px-2 py-1.5 text-right text-text">
                    {hole.par_juniors ?? ''}
                  </td>
                </>
              ) : (
                <td className="px-2 py-1.5 text-right text-text">
                  {hole.par_mens ?? hole.par_ladies ?? hole.par_juniors ?? ''}
                </td>
              )}
              <td className="px-2 py-1.5 text-right text-muted">
                {hole.stroke_index}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
