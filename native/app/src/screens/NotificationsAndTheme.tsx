// #2256: «Varsler og tema». I denne omgangen bare temaet: «Lys», «Mørk» eller
// «Følg telefonen». Varsler på denne enheten kommer i #2256 PR 4.
//
// Et trykk slår drakten på med én gang for hele appen
// (`lib/themePreference.ts`), og valget lagres på telefonen til neste
// oppstart. Det valgte er merket med «✓» og sagt som «valgt» til
// skjermleseren. Til det lagrede valget er lest, er ingen rad merket, så et
// feil merke aldri blinker forbi.
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { PageTitle } from '../components/PageTitle';
import { SettingList, SettingRow } from '../components/SettingRow';
import { PROFILE_TEXT } from '../lib/profileCopy';
import {
  THEME_PREFERENCES,
  loadThemePreference,
  saveThemePreference,
  type ThemePreference,
} from '../lib/themePreference';
import type { ScreenProps } from '../navigation';
import { useTheme } from '../theme';

const LABEL: Record<ThemePreference, string> = {
  light: PROFILE_TEXT.themeLight,
  dark: PROFILE_TEXT.themeDark,
  system: PROFILE_TEXT.themeSystem,
};

// Skjermen tar ingen props fra navigasjonen ennå; typen står for å låse ruta.
export function NotificationsAndTheme(_props: ScreenProps<'NotificationsAndTheme'>) {
  const { ui } = useTheme();
  const [selected, setSelected] = useState<ThemePreference | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadThemePreference()
      .then((preference) => {
        if (!cancelled) setSelected(preference);
      })
      .catch((err: unknown) => {
        console.error('[NotificationsAndTheme] fikk ikke lest temavalget', err);
        // Appen følger telefonen når valget ikke kan leses (App.tsx).
        if (!cancelled) setSelected('system');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onChoose = useCallback((preference: ThemePreference) => {
    setSelected(preference);
    setSaveNote(null);
    void saveThemePreference(preference).then((saved) => {
      if (!saved) setSaveNote(PROFILE_TEXT.themeSaveFailedNote);
    });
  }, []);

  return (
    <ScrollView contentContainerStyle={ui.scroll} testID="notifications-theme-screen">
      <PageTitle title={PROFILE_TEXT.menuNotificationsTheme} />
      <Text style={ui.sectionTitle}>{PROFILE_TEXT.themeHeading}</Text>
      <SettingList testID="theme-choices">
        {THEME_PREFERENCES.map((preference) => (
          <SettingRow
            key={preference}
            label={LABEL[preference]}
            selected={selected === preference}
            onPress={() => onChoose(preference)}
            testID={`theme-${preference}`}
          />
        ))}
      </SettingList>
      {saveNote ? (
        <Text style={ui.error} testID="theme-save-error">
          {saveNote}
        </Text>
      ) : null}
    </ScrollView>
  );
}
