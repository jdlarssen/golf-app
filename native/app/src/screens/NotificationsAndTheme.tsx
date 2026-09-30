// #2256: «Varsler» (menyraden heter «Varsler og tema»). Øverst varslene på
// denne telefonen (PR 4, etter Varsler-tegningen), nederst temaet: «Lys»,
// «Mørk» eller «Følg telefonen» (eierens svar: temaet står nederst).
//
// **Varslene** er ett skogkort med en bryter, som i designet. «På» ber iOS om
// lov, registrerer telefonens token og husker det (`data/pushDevice.ts`).
// «Av» sletter raden. Har iOS sagt nei, kan bare Innstillinger snu det, så
// under kortet står en linje og «Åpne Innstillinger», og tilstanden leses på
// nytt når appen kommer tilbake i forgrunnen. «Hva som varsles» og «Stille
// tid» fra tegningen hører til #2315; til da står én linje om hva som
// varsles der seksjonen kommer. Uten den native delen, og på Android, vises
// ikke varsel-delen i det hele tatt.
//
// **Profil v2: som designlerretet.** Tittelen er «Varsler» (28 pt), 16 pt til
// kanten, etiketten i kicker-stil med 16 pt over og 8 under, og radene 14 pt
// inn.
//
// Et trykk på et tema slår drakten på med én gang for hele appen
// (`lib/themePreference.ts`), og valget lagres på telefonen til neste
// oppstart. Det valgte er merket med «✓» og sagt som «valgt» til
// skjermleseren. Til det lagrede valget er lest, er ingen rad merket, så et
// feil merke aldri blinker forbi.
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PageTitle } from '../components/PageTitle';
import { SettingList, SettingRow } from '../components/SettingRow';
import {
  readPushState,
  turnOffPush,
  turnOnPush,
  type PushState,
} from '../data/pushDevice';
import { PROFILE_TEXT } from '../lib/profileCopy';
import {
  THEME_PREFERENCES,
  loadThemePreference,
  saveThemePreference,
  type ThemePreference,
} from '../lib/themePreference';
import type { ScreenProps } from '../navigation';
import { FONTS, PALETTES, useTheme } from '../theme';

const LABEL: Record<ThemePreference, string> = {
  light: PROFILE_TEXT.themeLight,
  dark: PROFILE_TEXT.themeDark,
  system: PROFILE_TEXT.themeSystem,
};

// Skjermen tar ingen props fra navigasjonen ennå; typen står for å låse ruta.
export function NotificationsAndTheme(_props: ScreenProps<'NotificationsAndTheme'>) {
  const { ui, colors } = useTheme();
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

  // `null` til tilstanden er lest; da står varsel-delen ikke ennå.
  const [push, setPush] = useState<PushState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const read = () =>
      void readPushState().then((state) => {
        if (!cancelled) setPush(state);
      });
    read();
    // Tilbake fra Innstillinger: kanskje har spilleren slått varsler på der.
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') read();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const showPush = push !== null && push !== 'unsupported';

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { backgroundColor: colors.bg }]}
      testID="notifications-theme-screen"
    >
      <PageTitle
        size="settings"
        title={PROFILE_TEXT.notificationsHeading}
        subtitle={showPush ? PROFILE_TEXT.pushSubtitle : undefined}
      />
      {showPush ? <PushSection state={push} onChange={setPush} /> : null}
      <Text style={[ui.kicker, styles.label]}>{PROFILE_TEXT.themeHeading}</Text>
      <SettingList testID="theme-choices" style={styles.list}>
        {THEME_PREFERENCES.map((preference) => (
          <SettingRow
            key={preference}
            dense
            label={LABEL[preference]}
            selected={selected === preference}
            onPress={() => onChoose(preference)}
            testID={`theme-${preference}`}
          />
        ))}
      </SettingList>
      {saveNote ? (
        <Text style={[ui.error, styles.note]} testID="theme-save-error">
          {saveNote}
        </Text>
      ) : null}
    </ScrollView>
  );
}

/** Skogkortet med bryteren, linja om hva som varsles, og fotnoten. */
function PushSection({
  state,
  onChange,
}: {
  state: Exclude<PushState, 'unsupported'>;
  onChange: (state: PushState) => void;
}) {
  const { ui, colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const on = state === 'on';
  const cream = { color: colors.onStrongWarm };

  const onToggle = useCallback(
    async (next: boolean) => {
      setBusy(true);
      setNote(null);
      const result = next ? await turnOnPush() : await turnOffPush();
      setBusy(false);
      if (result.ok) {
        onChange(next ? 'on' : 'off');
      } else if (result.reason === 'denied') {
        onChange('denied');
      } else {
        setNote(next ? PROFILE_TEXT.pushOnFailed : PROFILE_TEXT.pushOffFailed);
      }
    },
    [onChange],
  );

  return (
    <View testID="push-section">
      <View style={[styles.card, { backgroundColor: colors.surfaceStrong }]}>
        <View style={styles.texts}>
          <Text style={[styles.cardTitle, cream]}>{PROFILE_TEXT.pushTitle}</Text>
          <Text style={[styles.cardStatus, cream]} testID="push-status">
            {on ? PROFILE_TEXT.pushOn : PROFILE_TEXT.pushOff}
          </Text>
        </View>
        <DesignSwitch
          value={on}
          disabled={busy || state === 'denied'}
          onValueChange={(next) => void onToggle(next)}
          label={PROFILE_TEXT.pushTitle}
          // Kortet er skog i begge drakter. «På» er designets salvie (`live`);
          // av-sporet er kremen på 45 %, som gir 3:1 mot skogen i begge
          // draktene (WCAG 1.4.11), og knotten 3,6:1 mot sporet.
          onColor={colors.live}
          offColor={`${colors.onStrongWarm}73`}
          testID="push-switch"
        />
      </View>
      {state === 'denied' ? (
        <View style={styles.denied} testID="push-denied">
          <Text style={[styles.small, { color: colors.muted }]}>{PROFILE_TEXT.pushDenied}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void Linking.openSettings()}
            style={ui.buttonSecondary}
            testID="push-open-settings"
          >
            <Text style={ui.buttonSecondaryText}>{PROFILE_TEXT.pushOpenSettings}</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={[styles.small, styles.line, { color: colors.muted }]}>
          {PROFILE_TEXT.pushWhat}
        </Text>
      )}
      {note ? (
        <Text style={[ui.error, styles.note]} testID="push-error">
          {note}
        </Text>
      ) : null}
      <Text style={[styles.small, styles.line, { color: colors.muted }]}>{PROFILE_TEXT.pushFooter}</Text>
    </View>
  );
}

/**
 * Bryteren fra tegningen: 52 × 32 spor og en rund knott på 26 pt, 3 pt fra
 * kanten. iOS sin egen `Switch` har en annen form (iOS 26 har en avlang
 * knott), så den tegnes her. Trykkflaten er 44 pt høy, og skjermleseren
 * hører en bryter med «på» eller «av».
 */
function DesignSwitch({
  value,
  disabled,
  onValueChange,
  label,
  onColor,
  offColor,
  testID,
}: {
  value: boolean;
  disabled: boolean;
  onValueChange: (next: boolean) => void;
  label: string;
  onColor: string;
  offColor: string;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      hitSlop={SWITCH_HIT_SLOP}
      style={[
        styles.switchTrack,
        { backgroundColor: value ? onColor : offColor },
        value ? styles.switchOn : null,
        disabled ? styles.switchDisabled : null,
      ]}
      testID={testID}
    >
      <View style={styles.switchKnob} />
    </Pressable>
  );
}

const SWITCH_HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 };

const styles = StyleSheet.create({
  // Designet: 16 pt til kanten, og tittelen 4 pt under topp-raden. Tallet er
  // målt i simulatoren under den felles topp-raden; linjehøyden på 34 gir
  // selv litt luft over versalene.
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 3.5, paddingBottom: 32 },
  // Etiketten 20 pt fra kanten, 16 pt over og 8 under.
  label: { paddingHorizontal: 4, paddingTop: 16, paddingBottom: 8 },
  list: { marginTop: 0 },
  // Siden har ingen `gap`; linja trenger luft under lista.
  note: { marginTop: 8 },
  // Designet: skogkortet 14 pt under undertittelen, 16 pt runde hjørner,
  // 12/14 pt luft inni. Undertittelens linje er 1,7 pt høyere enn
  // nettleserens, så avstanden er 12,3 (målt i simulatoren).
  card: {
    marginTop: 12.3,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  texts: { flex: 1 },
  cardTitle: { fontSize: 15, lineHeight: 18, fontFamily: FONTS.sansSemiBold },
  // 1 pt ned fra tittelen, som i designet (målt).
  cardStatus: { fontSize: 12, lineHeight: 14.5, marginTop: 1, fontFamily: FONTS.sans, opacity: 0.85 },
  // Linjene under kortet står som designets fotnote: 12 pt, 20 pt fra kanten.
  small: { fontSize: 12, lineHeight: 14.5, fontFamily: FONTS.sans },
  line: { paddingHorizontal: 4, marginTop: 12 },
  denied: { gap: 8, marginTop: 12, paddingHorizontal: 4 },
  switchTrack: {
    width: 52,
    height: 32,
    borderRadius: 16,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  switchOn: { alignItems: 'flex-end' },
  switchDisabled: { opacity: 0.5 },
  // Knotten er hvit i begge drakter, som i tegningen og som iOS sin egen:
  // lys drakts flate.
  switchKnob: { width: 26, height: 26, borderRadius: 13, backgroundColor: PALETTES.light.surface },
});
