import { Card } from '@/components/ui/Card';
import type { CourseStat } from '@/lib/stats/courseStats';

type Props = {
  courses: CourseStat[];
  heading: string;
  subtitle: string;
  colRounds: string;
  colAvg: string;
  colBest: string;
  emptyLabel: string;
};

/**
 * «Baner»-panelet (#940) — én rad per bane spilleren har minst én komplett
 * 18-hulls-runde på, sortert flest runder først. Viser antall + brutto snitt +
 * brutto beste. Rent presentasjonelt; tallene er regnet i `computeCourseStats`.
 *
 * Stat-clusteret speiler `GameHistoryCard` (micro-label + `tabular-nums`-tall),
 * så historikk-flatene ser like ut på tvers av faner.
 */
export function CoursePerformancePanel({
  courses,
  heading,
  subtitle,
  colRounds,
  colAvg,
  colBest,
  emptyLabel,
}: Props) {
  return (
    <section className="space-y-3">
      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <h2 className="font-serif text-base font-medium text-text leading-snug">
            {heading}
          </h2>
          <p className="font-sans text-sm text-muted mt-0.5">{subtitle}</p>
        </div>
        {courses.length === 0 ? (
          <p className="border-t border-border px-5 py-4 font-sans text-sm text-muted leading-relaxed">
            {emptyLabel}
          </p>
        ) : (
          <ul className="border-t border-border divide-y divide-border">
            {courses.map((course) => (
              <li
                key={course.courseId}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-3"
              >
                <h3 className="min-w-0 flex-1 truncate font-serif text-base font-medium text-text leading-snug">
                  {course.courseName}
                </h3>
                <div className="flex shrink-0 items-center gap-4">
                  <CourseStatCell label={colRounds} value={course.rounds} />
                  <CourseStatCell label={colAvg} value={course.average} />
                  <CourseStatCell label={colBest} value={course.best} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

function CourseStatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-right">
      <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-muted leading-none mb-1">
        {label}
      </p>
      <p className="font-sans tabular-nums text-base font-semibold text-text leading-none">
        {value}
      </p>
    </div>
  );
}
