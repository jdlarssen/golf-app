'use client';

import { useId, useMemo, useState, type FocusEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import { SmartLink } from '@/components/ui/SmartLink';
import { FormSection } from '@/components/ui/FormSection';
import { courseCreateHref } from '@/lib/courses/similarCoursesPanel';
import {
  formatShortOsloDateWithYearLocale,
  formatShortOsloDayMonthLocale,
} from '@/lib/i18n/format';
import {
  recentCourseCardLine,
  recentCourseCards,
  type RecentCourse,
  type RecentCourseCard,
} from '@/lib/wizard/recentCourseCards';
import type { AppLocale } from '@/i18n/routing';
import type { CourseOption } from '../GameForm';

/** Case-free, so «byn» finds «Byneset North». */
function normalise(text: string): string {
  return text.trim().toLocaleLowerCase('nb');
}

/**
 * The course half of «Hvor og når?» (#2448, `Nyttspill-forslag-bane`): the
 * two courses you used last as cards, a search over every course, and «Finner
 * du ikke banen? Opprett ny bane». A course you choose some other way (a link,
 * a rematch, a draft, the search, or the game being edited) stands first as
 * «Valgt» when it is not one of the two. The cards post nothing: `course_id`
 * travels in BasicsSection's hidden field.
 */
export function RecentCoursePicker({
  courses,
  recentCourses,
  courseId,
  onSelect,
  today,
}: {
  courses: CourseOption[];
  recentCourses: RecentCourse[];
  courseId: string;
  onSelect: (courseId: string) => void;
  /** Oslo's day from the server, «YYYY-MM-DD»: the season «i høst» is read from it. */
  today: string;
}) {
  const t = useTranslations('wizard.sections.basics');
  const locale = useLocale() as AppLocale;
  // #2485: «Opprett ny bane» comes back to this very form.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listId = useId();

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const byId = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const cards = useMemo(
    () => recentCourseCards(recentCourses, byId.keys(), courseId),
    [recentCourses, byId, courseId],
  );
  const hasHistory = cards.some((c) => c.kind === 'recent');
  const matches = useMemo(() => {
    const q = normalise(query);
    return q ? courses.filter((c) => normalise(c.name).includes(q)) : courses;
  }, [courses, query]);

  function choose(id: string) {
    onSelect(id);
    setQuery('');
    setOpen(false);
  }

  function cardLine(card: RecentCourseCard): string {
    const line = recentCourseCardLine(card, today);
    const parts: string[] = [];
    if (byId.get(card.courseId)?.nineHoles) parts.push(t('nineHoles'));
    if (line?.kind === 'chosen') parts.push(t('chosen'));
    if (line?.kind === 'season') {
      parts.push(t('roundsThisSeason', { count: line.count, season: line.season }));
    }
    if (line?.kind === 'last') {
      // Noon UTC is the same calendar day in Oslo all year.
      const noon = `${line.day}T12:00:00Z`;
      parts.push(
        t('lastPlayed', {
          date: line.withYear
            ? formatShortOsloDateWithYearLocale(noon, locale)
            : formatShortOsloDayMonthLocale(noon, locale),
        }),
      );
    }
    return parts.join(' · ');
  }

  // Closes the list when focus leaves the search and the list together.
  function onBlur(e: FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
  }

  return (
    <FormSection legend={hasHistory ? t('recentKicker') : t('courseLabel')} variant="bare">
      {cards.length > 0 && (
        <div className="grid grid-cols-2 gap-2" data-testid="recent-course-cards">
          {cards.map((card) => {
            const course = byId.get(card.courseId);
            if (!course) return null;
            const pressed = card.courseId === courseId;
            const line = cardLine(card);
            return (
              <button
                key={card.courseId}
                type="button"
                aria-pressed={pressed}
                data-testid="recent-course-card"
                data-course-id={card.courseId}
                onClick={() => onSelect(card.courseId)}
                // As on the tee buttons: the 2 px border takes its pixel from
                // the padding, so a long name does not rewrap when chosen.
                className={`flex min-h-[72px] min-w-0 flex-col justify-center rounded-2xl text-left text-text transition-colors duration-150 ${
                  pressed ? 'border-2 border-primary bg-primary-soft px-[11px] py-[9px]' : 'border border-border bg-surface px-3 py-2.5 hover:bg-primary-soft'
                }`}
              >
                <span className="max-w-full break-words font-serif text-base font-semibold leading-[normal]">
                  {course.name}
                </span>
                {line && <span className="font-sans text-xs leading-[normal] text-muted">{line}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div onBlur={onBlur} className={cards.length > 0 ? 'mt-2.5' : undefined}>
        {/* The input is the whole field, the icon lies on top: the app's
            focus ring (app/globals.css) then goes round the field once. */}
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
            <SearchIcon />
          </span>
          <input
            type="search"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label={t('searchPlaceholder')}
            placeholder={t('searchPlaceholder')}
            value={query}
            autoComplete="off"
            data-testid="course-search"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
            }}
            // 16 px, so iOS does not zoom into the field.
            className="h-12 w-full min-w-0 rounded-xl border border-field-border bg-surface pr-3 pl-[38px] font-sans text-base text-text placeholder:text-muted"
          />
        </div>
        {open && (
          // The list keeps the focus in the field while a row is pressed, so
          // the field's blur does not close the list before the click lands.
          <div
            id={listId}
            role="listbox"
            aria-label={t('searchPlaceholder')}
            data-testid="course-search-list"
            onMouseDown={(e) => e.preventDefault()}
            data-focus-inset
            className="mt-1.5 max-h-72 divide-y divide-row-divider-warm overflow-y-auto rounded-xl border border-border bg-surface"
          >
            {matches.length > 0 ? (
              matches.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={c.id === courseId}
                  data-testid="course-search-option"
                  data-course-id={c.id}
                  onClick={() => choose(c.id)}
                  className="flex min-h-11 w-full items-center px-3.5 text-left font-sans text-[15px] text-text hover:bg-primary-soft"
                >
                  {c.nineHoles ? t('courseOptionNine', { name: c.name }) : c.name}
                </button>
              ))
            ) : (
              <p className="flex min-h-11 items-center px-3.5 font-sans text-sm text-muted" data-testid="course-search-empty">
                {t('noMatch')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 44 px high so the link is a full tap target. */}
      <p className="flex min-h-11 items-center gap-1 font-sans text-[13px] leading-[normal] text-muted">
        {t('courseNotFoundHint')}
        <SmartLink
          href={courseCreateHref(pathname, searchParams.toString())}
          className="inline-flex min-h-11 items-center font-semibold text-primary underline"
        >
          {t('courseCreateLink')}
        </SmartLink>
      </p>
    </FormSection>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
