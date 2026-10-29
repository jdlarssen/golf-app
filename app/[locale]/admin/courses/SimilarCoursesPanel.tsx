'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { findSimilarCourses, type SimilarCourse } from '@/lib/courses/similarCourses';
import {
  addAnywayName,
  clipQuery,
  isDismissed,
  isSearchable,
  similarCourseHref,
  type SimilarCourseTarget,
} from '@/lib/courses/similarCoursesPanel';

/** The pause after the last keystroke before the panel asks the server. */
export const SEARCH_DEBOUNCE_MS = 300;

type Props = {
  /** The name typed so far. */
  query: string;
  /** Where «Bruk denne» goes (see `similarCourseHref`). */
  target: SimilarCourseTarget;
  /** «Nei, legg til … som ny bane»: the form moves focus on to the course card. */
  onAddAnyway?: () => void;
};

/**
 * «Finnes banen alt?» (#2485): while you type a new course's name, up to five
 * courses that look like it, each with «Bruk denne». The list never stops you:
 * «Nei, legg til … som ny bane» hides it, and the form saves as before. With
 * no match, or when the search fails, nothing shows.
 */
export function SimilarCoursesPanel({ query, target, onAddAnyway }: Props) {
  const t = useTranslations('courseForm.similar');
  const [courses, setCourses] = useState<SimilarCourse[]>([]);
  const [dismissed, setDismissed] = useState<string | null>(null);
  // Each search gets a number; an answer that comes back after a newer search
  // started is dropped, so a slow reply never overwrites a fresher one.
  const searchSeq = useRef(0);

  const searchable = isSearchable(query);
  // Under three characters the old answer goes, so a new name never flashes
  // the last name's courses while its own search is on its way.
  if (!searchable && courses.length > 0) setCourses([]);
  useEffect(() => {
    const seq = ++searchSeq.current;
    if (!searchable) return;
    const timer = setTimeout(() => {
      void findSimilarCourses(clipQuery(query)).then((found) => {
        if (seq === searchSeq.current) setCourses(found);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, searchable]);

  if (!searchable || courses.length === 0 || isDismissed(query, dismissed)) return null;

  const addAnyway = addAnywayName(query);

  return (
    <section
      aria-labelledby="similar-courses-heading"
      data-testid="similar-courses"
      className="mt-[18px]"
    >
      <h2
        id="similar-courses-heading"
        className="pb-2 font-sans text-[10px] font-semibold uppercase leading-[normal] tracking-[0.2em] text-warning-text"
      >
        {t('heading')}
      </h2>
      <ul className="-mx-1 overflow-hidden rounded-2xl border border-border bg-surface">
        {courses.map((course) => (
          <li
            key={course.id}
            data-testid="similar-course-row"
            className="flex min-h-16 items-center gap-3 border-b border-row-divider-warm px-3.5 py-2.5 last:border-b-0"
          >
            <span className="min-w-0 flex-grow">
              <span className="block text-[15px] font-semibold leading-[normal]">{course.name}</span>
              <span className="mt-0.5 block text-xs leading-[normal] text-muted">
                {t('meta', {
                  holeCount: course.holeCount,
                  par: course.par,
                  teeCount: course.teeCount,
                  roundCount: course.roundCount,
                })}
              </span>
            </span>
            <SmartLink
              href={similarCourseHref(target, course.id)}
              data-testid="similar-course-use"
              aria-label={t('useThisAria', { name: course.name })}
              className="inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-full border border-primary bg-surface px-3.5 text-[13px] font-semibold text-primary"
            >
              {t('useThis')}
            </SmartLink>
          </li>
        ))}
      </ul>
      <div className="pt-3">
        <button
          type="button"
          data-testid="similar-courses-add-anyway"
          onClick={() => {
            setDismissed(clipQuery(query));
            onAddAnyway?.();
          }}
          className="inline-flex min-h-11 items-center text-left text-sm font-semibold leading-[normal] text-primary underline"
        >
          {addAnyway.clipped
            ? t('addAnywayShort', { name: addAnyway.name })
            : t('addAnyway', { name: addAnyway.name })}
        </button>
      </div>
    </section>
  );
}
