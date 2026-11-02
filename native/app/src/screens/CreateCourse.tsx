// native/app/src/screens/CreateCourse.tsx
// #2757: «Ny bane». Arrangøren som ikke finner banen i veiviseren, legger den inn
// her: navn, hull med par og indeks, og minst én tee med slope og CR.
//
// **Egen skjerm, ikke et understeg.** Veiviseren står montert under med alt du har
// valgt. Lagret bane går tilbake dit med `backTo`, og skjemaet er borte fra
// tilbake-veien (`docs/user-flows.md` §Tilbake, regel 3). Pil, sveip og
// Android-tilbake lukker skjemaet uten spørsmål, som `EditProfile`.
//
// **Skjermen kjenner ingen regel.** Knappen spør `courseDraftProblem`, og den spør
// den samme parseren som nettets serveraksjon bruker (`courseDraft.ts`).
//
// **Lagring krever nett**, som publiseringen av en runde. Et påbegynt skjema
// overlever ikke at appen lukkes.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { HoleGrid } from '../components/course/HoleGrid';
import { SimilarCoursesPanel } from '../components/course/SimilarCoursesPanel';
import { TeeTable } from '../components/course/TeeTable';
import { Field } from '../components/create/primitives';
import { KEYBOARD_SCROLL_PROPS, useBottomInsetUnlessKeyboard } from '../components/KeyboardInset';
import { createCourse } from '../data/createCourse';
import { isDeviceOnline } from '../data/syncTriggers';
import { backTo } from '../lib/backTo';
import { COURSE_TEXT, describeCourseProblem, describeCourseSaveFailure } from '../lib/courseCopy';
import { courseDraftProblem, emptyCourseDraft, parseCourseDraft } from '../lib/courseDraft';
import type { ScreenProps } from '../navigation';
import { useTheme } from '../theme';

export function CreateCourse({ navigation, route }: ScreenProps<'CreateCourse'>) {
  const { colors, ui } = useTheme();
  const bottomInset = useBottomInsetUnlessKeyboard();
  const [draft, setDraft] = useState(() => emptyCourseDraft(route.params.name ?? ''));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const scroll = useRef<ScrollView>(null);

  const problem = useMemo(() => courseDraftProblem(draft), [draft]);
  const blocked = problem !== null || busy;

  async function save() {
    // Dobbelttrykk-låsen står først: kallet er ikke idempotent.
    if (blocked) return;
    if (!isDeviceOnline()) {
      setFailure(describeCourseSaveFailure('network'));
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const result = await createCourse(parseCourseDraft(draft));
      if (result.ok) {
        backTo(navigation, 'CreateGame', { createdCourseId: result.courseId });
        return;
      }
      setFailure(describeCourseSaveFailure(result.code));
    } catch {
      setFailure(describeCourseSaveFailure('db'));
    }
    // Bevisst utenfor `finally`: på suksess er skjermen borte.
    setBusy(false);
  }

  // Feilen står under knappen, og knappen kan stå helt nederst på skjermen. Uten
  // dette ser et trykk på «Lagre bane» ut som om ingenting skjedde.
  useEffect(() => {
    if (failure) scroll.current?.scrollToEnd();
  }, [failure]);

  return (
    <ScrollView
      ref={scroll}
      {...KEYBOARD_SCROLL_PROPS}
      // Et trykk på par eller «Lagre bane» skal virke med tastaturet oppe.
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[ui.scroll, { paddingBottom: 20 + bottomInset }]}
      testID="create-course-screen"
    >
      <Text style={ui.muted}>{COURSE_TEXT.subtitle}</Text>

      <Field label={COURSE_TEXT.nameLabel}>
        <TextInput
          testID="course-name"
          style={ui.input}
          value={draft.name}
          onChangeText={(name) => setDraft((prev) => ({ ...prev, name }))}
          placeholder={COURSE_TEXT.namePlaceholder}
          placeholderTextColor={colors.muted}
          autoCapitalize="words"
          autoCorrect={false}
        />
      </Field>

      <SimilarCoursesPanel
        query={draft.name}
        onUse={(courseId) => backTo(navigation, 'CreateGame', { createdCourseId: courseId })}
      />

      <HoleGrid draft={draft} onChange={setDraft} />

      <TeeTable
        tees={draft.tees}
        nine={draft.holeCount === 9}
        onTees={(tees) => setDraft((prev) => ({ ...prev, tees }))}
      />

      <Pressable
        testID="course-save"
        accessibilityRole="button"
        accessibilityState={{ disabled: blocked }}
        disabled={blocked}
        style={[ui.button, styles.save, blocked && styles.dimmed]}
        onPress={() => void save()}
      >
        <Text style={ui.buttonText}>{busy ? COURSE_TEXT.saving : COURSE_TEXT.save}</Text>
      </Pressable>

      {problem ? (
        <Text style={[ui.muted, styles.status]} testID="course-save-status">
          {describeCourseProblem(problem)}
        </Text>
      ) : null}
      {failure ? (
        <Text style={[ui.error, styles.status]} testID="course-save-error">
          {failure}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  save: { marginTop: 24 },
  dimmed: { opacity: 0.5 },
  status: { marginTop: 8, textAlign: 'center' },
});
