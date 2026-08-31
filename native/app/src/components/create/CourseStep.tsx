// native/app/src/components/create/CourseStep.tsx
// Native N6a (#1854): steg 3 — hvor og når.
//
// Bane-lista kollapser til den valgte banen så snart arrangøren har valgt.
// Med et titalls baner er en åpen liste bare skrolling mellom tee-valget og
// klokkeslettet, og de to hører sammen med banen.
//
// **Tee-off er forhåndsfylt** (neste hele time) og kan ikke bli tom. Et
// påkrevd felt som starter tomt er den vanligste grunnen til at noen står
// fast i en veiviser, og `scheduled_tee_off_at` er påkrevd hele veien inn i
// databasen. `minimumDate` sperrer for fortiden i selve pickeren — men det er
// pynt, ikke porten: den delte `isTeeOffInPast` (med 5 minutters slingrings-
// monn) avgjør ved publisering.
import { useState } from 'react';
import { ActivityIndicator, Platform, Text, TextInput, View } from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import type { CourseOption } from '../../data/createGame';
import { formatTeeOff } from '../../lib/display';
import { useTheme } from '../../theme';
import { Field, SelectRow } from './primitives';

/** «Herre · Dame» — hvilke tee-kjønn denne teen har rating for. */
function describeTee(tee: CourseOption['tees'][number]): string {
  const parts = [
    tee.hasMens ? 'herre' : null,
    tee.hasLadies ? 'dame' : null,
    tee.hasJuniors ? 'junior' : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : 'mangler rating';
}

export function CourseStep({
  courses,
  failed,
  courseId,
  teeBoxId,
  teeOff,
  onCourse,
  onTee,
  onTeeOff,
  onRetry,
}: {
  /** `null` mens hentingen pågår. */
  courses: CourseOption[] | null;
  failed: boolean;
  courseId: string | null;
  teeBoxId: string | null;
  teeOff: Date;
  onCourse: (courseId: string) => void;
  onTee: (teeBoxId: string) => void;
  onTeeOff: (date: Date) => void;
  onRetry: () => void;
}) {
  const { colors, ui } = useTheme();
  const [search, setSearch] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const selectedCourse = (courses ?? []).find((c) => c.id === courseId) ?? null;
  const showList = selectedCourse === null || browsing;
  const needle = search.trim().toLowerCase();
  const visible = (courses ?? []).filter(
    (course) => needle === '' || course.name.toLowerCase().includes(needle),
  );

  function handlePickedDate(event: DateTimePickerEvent, date?: Date): void {
    // Android lukker pickeren selv etter et valg; iOS lar den stå til
    // arrangøren lukker den. `dismissed` betyr «avbrutt» og skal ikke skrive.
    if (Platform.OS !== 'ios') setPickerOpen(false);
    if (event.type === 'dismissed' || !date) return;
    onTeeOff(date);
  }

  return (
    <View testID="create-step-course">
      <Text style={ui.title}>Bane og tid</Text>

      {failed ? (
        <View style={ui.banner}>
          <Text style={ui.error} testID="create-course-error">
            Fikk ikke hentet banene. Sjekk nettet og prøv igjen.
          </Text>
          <Text style={ui.linkText} onPress={onRetry} testID="create-course-retry">
            Prøv igjen
          </Text>
        </View>
      ) : null}

      {courses === null && !failed ? (
        <View style={ui.banner}>
          <ActivityIndicator color={colors.primary} testID="create-course-loading" />
          <Text style={ui.muted}>Henter banene …</Text>
        </View>
      ) : null}

      {showList ? (
        <Field label="Bane">
          <TextInput
            testID="create-course-search"
            style={ui.input}
            value={search}
            onChangeText={setSearch}
            placeholder="Søk etter bane"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {courses !== null && visible.length === 0 ? (
            <Text style={ui.muted} testID="create-course-none">
              Fant ingen baner med det navnet.
            </Text>
          ) : null}
          {visible.map((course) => (
            <SelectRow
              key={course.id}
              testID={`create-course-${course.id}`}
              title={course.name}
              subtitle={`${course.tees.length} teer`}
              selected={course.id === courseId}
              onPress={() => {
                onCourse(course.id);
                setBrowsing(false);
                setSearch('');
              }}
            />
          ))}
        </Field>
      ) : (
        <Field label="Bane">
          <SelectRow
            testID={`create-course-${selectedCourse.id}`}
            title={selectedCourse.name}
            subtitle="Valgt"
            selected
            onPress={() => setBrowsing(true)}
          />
          <Text
            style={ui.linkText}
            onPress={() => setBrowsing(true)}
            testID="create-course-change"
          >
            Velg en annen bane
          </Text>
        </Field>
      )}

      {selectedCourse && !browsing ? (
        <Field label="Tee">
          {selectedCourse.tees.length === 0 ? (
            <Text style={ui.muted} testID="create-tee-none">
              Denne banen har ingen aktive teer. Velg en annen bane, eller legg
              inn teene på nettsiden.
            </Text>
          ) : null}
          {selectedCourse.tees.map((tee) => (
            <SelectRow
              key={tee.id}
              testID={`create-tee-${tee.id}`}
              title={tee.name}
              subtitle={describeTee(tee)}
              selected={tee.id === teeBoxId}
              onPress={() => onTee(tee.id)}
            />
          ))}
        </Field>
      ) : null}

      <Field label="Tee-off">
        <SelectRow
          testID="create-teeoff-open"
          title={formatTeeOff(teeOff.toISOString()) ?? 'Velg tidspunkt'}
          subtitle={pickerOpen ? 'Lukk når du er ferdig' : 'Trykk for å endre'}
          selected={pickerOpen}
          onPress={() => setPickerOpen((open) => !open)}
        />
        {pickerOpen ? (
          <DateTimePicker
            testID="create-teeoff-picker"
            value={teeOff}
            mode="datetime"
            display="inline"
            minimumDate={new Date()}
            onChange={handlePickedDate}
          />
        ) : null}
      </Field>
    </View>
  );
}
