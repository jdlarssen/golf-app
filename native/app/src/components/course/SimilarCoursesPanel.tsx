// native/app/src/components/course/SimilarCoursesPanel.tsx
// #2757: «Finnes banen alt?» mens du skriver navnet, som nettets panel (#2485).
// Lista stopper aldri noen: «Nei, legg til …» skjuler den, og uten treff eller ved
// feil står det ingenting. Hvilke navn som ligner, avgjør databasen (0222).
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { clipQuery, isDismissed, isSearchable } from '../../../../../lib/courses/similarCoursesPanel';
import { fetchSimilarCourses, type SimilarCourse } from '../../data/similarCourses';
import { COURSE_TEXT, addAnywayLabel, similarCourseMeta } from '../../lib/courseCopy';
import { FONTS, TAP, useTheme } from '../../theme';
import { SelectRow } from '../create/primitives';

/** Pausen etter siste tastetrykk før panelet spør. */
export const SEARCH_DEBOUNCE_MS = 300;

export function SimilarCoursesPanel({
  query,
  onUse,
}: {
  query: string;
  onUse: (courseId: string) => void;
}) {
  const { colors, ui } = useTheme();
  const [courses, setCourses] = useState<SimilarCourse[]>([]);
  const [dismissed, setDismissed] = useState<string | null>(null);
  // Hvert søk får et nummer, og et svar som kommer etter at et nyere søk startet,
  // kastes. Da overskriver aldri et tregt svar et ferskere.
  const searchSeq = useRef(0);

  const searchable = isSearchable(query);
  // Under tre tegn går det gamle svaret, så et nytt navn aldri blinker forrige
  // navns baner mens sitt eget søk er på vei.
  if (!searchable && courses.length > 0) setCourses([]);
  useEffect(() => {
    const seq = ++searchSeq.current;
    if (!searchable) return;
    const timer = setTimeout(() => {
      void fetchSimilarCourses(query).then((found) => {
        if (seq === searchSeq.current) setCourses(found);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, searchable]);

  if (!searchable || courses.length === 0 || isDismissed(query, dismissed)) return null;

  return (
    <View style={styles.panel} testID="similar-courses">
      <Text style={[styles.heading, { color: colors.warningText }]}>{COURSE_TEXT.similarHeading}</Text>
      {courses.map((course) => (
        <SelectRow
          key={course.id}
          testID={`similar-course-${course.id}`}
          title={course.name}
          subtitle={similarCourseMeta(course)}
          onPress={() => onUse(course.id)}
          right={<Text style={[styles.use, { color: colors.primary }]}>{COURSE_TEXT.useThis}</Text>}
        />
      ))}
      <Pressable
        testID="similar-courses-add-anyway"
        accessibilityRole="button"
        style={styles.addAnyway}
        onPress={() => setDismissed(clipQuery(query))}
      >
        <Text style={ui.linkText}>{addAnywayLabel(query)}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: 16 },
  heading: { fontSize: 12, fontFamily: FONTS.sansSemiBold },
  use: { fontSize: 13, fontFamily: FONTS.sansSemiBold },
  addAnyway: { minHeight: TAP, justifyContent: 'center', marginTop: 4 },
});
