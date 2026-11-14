// #2256: «Varsler» (menyraden heter «Varsler og tema»). Øverst varslene på
// denne telefonen, så hva som varsles og stille tid (#2315), nederst temaet:
// «Lys», «Mørk» eller «Følg telefonen» (eierens svar: temaet står nederst).
//
// **Tegningen er Varsler-D2** (#2315, godkjent 14.11, lerretet rad 98): hver
// gruppe er én rad på 64 pt med ikonrute, navn og bryter, og all tekst står på
// én linje på både 320 og 390, så skjermen ser lik ut på smal og bred telefon.
//
// **Telefonkortet** er skogkortet med en bryter. «På» ber telefonen om lov,
// registrerer tokenet og husker det (`data/pushDevice.ts`). «Av» sletter raden.
// Har telefonen sagt nei for godt, kan bare Innstillinger snu det, så under
// kortet står to linjer og «Åpne Innstillinger», og tilstanden leses på nytt
// når appen kommer tilbake i forgrunnen. Uten den native delen står ikke kortet.
//
// **Hva som varsles og stille tid** er valg på kontoen, ikke på telefonen
// (`data/pushPreferences.ts`, tabellen `notification_preferences`), så de står
// uansett hva telefonen har svart, og gjelder alle enhetene. Serveren slutter å
// sende pling for det som er slått av (`lib/notifications/pushPreferences.ts`).
// «Rundene dine» kan ikke slås av og har merkelappen «Alltid på». Bryterne
// vises først når valgene er lest, så de aldri viser et gjettet valg; til da
// står grå flater der de kommer. Feiler lesingen, står radene uten brytere med
// to linjer og «Prøv igjen». Hvert trykk lagrer hele tilstanden, med en gang og
// med tilbakerulling: gikk det ikke, hopper bryteren tilbake og raden sier fra.
// Mens én lagring går, venter de andre bryterne, så to lagringer aldri kappes.
//
// **Profil v2: som designlerretet.** Tittelen er «Varsler» (28 pt), 16 pt til
// kanten, etikettene i kicker-stil med 16 pt over og 8 under, og radene 14 pt
// inn.
//
// Et trykk på et tema slår drakten på med én gang for hele appen
// (`lib/themePreference.ts`), og valget lagres på telefonen til neste
// oppstart. Det valgte er merket med «✓» og sagt som «valgt» til
// skjermleseren. Til det lagrede valget er lest, er ingen rad merket, så et
// feil merke aldri blinker forbi.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PUSH_GROUPS,
  type MutablePushGroupId,
  type PushGroupId,
} from '../../../../lib/notifications/pushGroups';
import { isQuietHourOfDay } from '../../../../lib/notifications/pushPreferences';
import { DesignSwitch, listSwitchOffColor } from '../components/DesignSwitch';
import {
  BjelleIcon,
  FlaggIcon,
  KompisIcon,
  LaasIcon,
  MaaneIcon,
  PersonPlussIcon,
  ScorekortIcon,
  type IconProps,
} from '../components/icons/Icons';
import { PageTitle } from '../components/PageTitle';
import { SettingList, SettingRow } from '../components/SettingRow';
import {
  readPushState,
  turnOffPush,
  turnOnPush,
  type PushState,
} from '../data/pushDevice';
import {
  fetchOwnPushPreferences,
  savePushPreferences,
  type OwnPushPreferences,
} from '../data/pushPreferences';
import { markPushPromptAnswered } from '../data/pushPrompt';
import { PROFILE_TEXT, PUSH_GROUP_LABEL, pushOnLabel } from '../lib/profileCopy';
import {
  THEME_PREFERENCES,
  loadThemePreference,
  saveThemePreference,
  type ThemePreference,
} from '../lib/themePreference';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { FONTS, fraunces, useTheme } from '../theme';

const LABEL: Record<ThemePreference, string> = {
  light: PROFILE_TEXT.themeLight,
  dark: PROFILE_TEXT.themeDark,
  system: PROFILE_TEXT.themeSystem,
};

/** Ikonet i ruta foran hver gruppe, som i tegningen. */
const GROUP_ICON: Record<PushGroupId, (props: IconProps) => ReactNode> = {
  rounds: FlaggIcon,
  scorecards: ScorekortIcon,
  friends: KompisIcon,
  signups: PersonPlussIcon,
};

/** Stripa over døgnet går fra kl. 12 til kl. 12, så natta står samlet i midten. */
const STRIP_HOURS = Array.from({ length: 24 }, (_, index) => (12 + index) % 24);
const STRIP_TICKS = ['12', '18', '00', '06', '12'] as const;

// Skjermen tar ingen props fra navigasjonen ennå; typen står for å låse ruta.
export function NotificationsAndTheme(_props: ScreenProps<'NotificationsAndTheme'>) {
  const { ui, colors } = useTheme();
  const insets = useSafeAreaInsets();
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

  // `null` til tilstanden er lest; da står telefonkortet ikke ennå.
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
      // #1954 D3: luften under innholdet står over systemlinja (navigasjonslinja på Android, hjemindikatoren på iPhone).
      contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom, backgroundColor: colors.bg }]}
      testID="notifications-theme-screen"
    >
      <PageTitle size="settings" title={PROFILE_TEXT.notificationsHeading} subtitle={PROFILE_TEXT.pushSubtitle} />
      {showPush ? <PushSection state={push} onChange={setPush} /> : null}
      <PushChoices />
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

/** Skogkortet med bjella og bryteren, og linjene når telefonen har sagt nei. */
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
      // #2758: den som bruker bryteren, har svart, så kortet på Hjem kommer ikke.
      void markPushPromptAnswered();
      const result = next ? await turnOnPush() : await turnOffPush();
      setBusy(false);
      if (result.ok) {
        onChange(next ? 'on' : 'off');
      } else if (result.reason === 'denied') {
        onChange('denied');
      } else if (result.reason !== 'declined') {
        // Et nei som kan spørres om igjen er ingen feil: bryteren står av.
        setNote(next ? PROFILE_TEXT.pushOnFailed : PROFILE_TEXT.pushOffFailed);
      }
    },
    [onChange],
  );

  return (
    <View testID="push-section">
      <View style={[styles.card, { backgroundColor: colors.surfaceStrong }]}>
        {/* Bjella står i en rute med kremen på 16 % (`29` i hex). */}
        <View style={[styles.tile, { backgroundColor: `${colors.onStrongWarm}29` }]}>
          <BjelleIcon color={colors.onStrongWarm} size={20} strokeWidth={1.75} />
        </View>
        <View style={styles.texts}>
          <Text numberOfLines={1} style={[styles.cardTitle, cream]}>
            {PROFILE_TEXT.pushTitle}
          </Text>
          <Text numberOfLines={1} style={[styles.cardStatus, cream]} testID="push-status">
            {on ? pushOnLabel(Platform.OS) : PROFILE_TEXT.pushOff}
          </Text>
        </View>
        <DesignSwitch
          value={on}
          disabled={busy || state === 'denied'}
          onValueChange={(next) => void onToggle(next)}
          label={PROFILE_TEXT.pushSwitchLabel}
          // Kortet er skog i begge drakter. «På» er designets salvie (`live`);
          // av-sporet er kremen på 45 %, som gir 3:1 mot skogen i begge
          // draktene (WCAG 1.4.11), og knotten 3,6:1 mot sporet.
          onColor={colors.live}
          offColor={`${colors.onStrongWarm}73`}
          testID="push-switch"
        />
      </View>
      {state === 'denied' ? (
        <View testID="push-denied">
          <View style={styles.lines}>
            <Text numberOfLines={1} style={[styles.small, { color: colors.muted }]}>
              {PROFILE_TEXT.pushDenied}
            </Text>
            <Text numberOfLines={1} style={[styles.small, { color: colors.muted }]}>
              {PROFILE_TEXT.pushDeniedWhere}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => void Linking.openSettings()}
            style={[ui.buttonSecondary, styles.lineButton]}
            testID="push-open-settings"
          >
            <Text style={ui.buttonSecondaryText}>{PROFILE_TEXT.pushOpenSettings}</Text>
          </Pressable>
        </View>
      ) : null}
      {note ? (
        <Text style={[ui.error, styles.note]} testID="push-error">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/** Raden som ikke ble lagret: en gruppe, eller stille tid. */
type FailedRow = MutablePushGroupId | 'quiet';

/** «Hva som varsles», «Stille tid» og fotnoten (#2315). */
function PushChoices() {
  const { userId } = useSession();
  const { ui, colors, scheme } = useTheme();
  // `null` til valgene er lest (eller lesingen feilet).
  const [prefs, setPrefs] = useState<OwnPushPreferences | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failedRow, setFailedRow] = useState<FailedRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOwnPushPreferences(userId)
      .then((next) => {
        if (!cancelled) setPrefs(next);
      })
      .catch((err: unknown) => {
        console.error('[NotificationsAndTheme] varselvalgene kunne ikke leses', err);
        if (!cancelled) setReadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  const onRetry = () => {
    setReadFailed(false);
    setAttempt((count) => count + 1);
  };

  const save = async (next: OwnPushPreferences, row: FailedRow) => {
    if (!prefs) return;
    const before = prefs;
    setBusy(true);
    setFailedRow(null);
    setPrefs(next);
    const result = await savePushPreferences(userId, next);
    setBusy(false);
    if (!result.ok) {
      setPrefs(before);
      setFailedRow(row);
      AccessibilityInfo.announceForAccessibility(PROFILE_TEXT.pushSaveFailed);
    }
  };

  const onGroup = (group: MutablePushGroupId, on: boolean) => {
    if (!prefs) return;
    const mutedGroups = on
      ? prefs.mutedGroups.filter((muted) => muted !== group)
      : [...prefs.mutedGroups, group];
    void save({ ...prefs, mutedGroups }, group);
  };

  const onQuiet = (quietHours: boolean) => {
    if (!prefs) return;
    void save({ ...prefs, quietHours }, 'quiet');
  };

  const offColor = listSwitchOffColor(colors, scheme);
  // Merkelappen og dagtimene på stripa: grønn tone i lys, flaten over kortet i natt.
  const soft = scheme === 'dark' ? colors.surface2 : colors.primarySoft;
  const listStyle = [styles.choiceList, { backgroundColor: colors.surface, borderColor: colors.border }];

  /** Bryteren, den grå flata før valgene er lest, eller ingenting når lesingen feilet. */
  const control = (value: boolean | null, label: string, onValueChange: (next: boolean) => void, testID: string) => {
    if (readFailed) return null;
    if (value === null) {
      return (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.skeleton, { backgroundColor: colors.skeleton }]}
          testID={`${testID}-skeleton`}
        />
      );
    }
    return (
      <DesignSwitch
        value={value}
        disabled={busy}
        onValueChange={onValueChange}
        label={label}
        onColor={colors.primary}
        offColor={offColor}
        testID={testID}
      />
    );
  };

  const quietOn = prefs?.quietHours === true;

  return (
    <View testID="push-choices">
      <Text style={[ui.kicker, styles.label]}>{PROFILE_TEXT.pushGroupsHeading}</Text>
      <View style={listStyle} testID="push-groups">
        {PUSH_GROUPS.map((group, index) => {
          const label = PUSH_GROUP_LABEL[group.id];
          const Icon = GROUP_ICON[group.id];
          const last = index === PUSH_GROUPS.length - 1;
          return (
            <View key={group.id} style={styles.choiceRow} testID={`push-group-${group.id}`}>
              <View
                style={styles.choiceMain}
                // Den låste raden leses som én ting: «Rundene dine, Alltid på».
                accessible={group.locked}
                accessibilityLabel={group.locked ? `${label}, ${PROFILE_TEXT.pushAlwaysOn}` : undefined}
              >
                <IconTile>
                  <Icon color={colors.surface} size={20} strokeWidth={1.75} />
                </IconTile>
                <Text numberOfLines={1} style={[styles.choiceName, { color: colors.text }]}>
                  {label}
                </Text>
                {group.locked ? (
                  <View style={[styles.pill, { backgroundColor: soft }]} testID="push-group-rounds-always">
                    <LaasIcon color={colors.primary} size={12} strokeWidth={2} />
                    <Text style={[styles.pillText, { color: colors.primary }]}>{PROFILE_TEXT.pushAlwaysOn}</Text>
                  </View>
                ) : (
                  control(
                    prefs ? !prefs.mutedGroups.includes(group.id as MutablePushGroupId) : null,
                    label,
                    (on) => onGroup(group.id as MutablePushGroupId, on),
                    `push-group-${group.id}-switch`,
                  )
                )}
              </View>
              {failedRow === group.id ? <SaveFailedLine testID={`push-group-${group.id}-error`} /> : null}
              {last ? null : <View style={[styles.divider, { backgroundColor: colors.divider }]} />}
            </View>
          );
        })}
      </View>
      {readFailed ? (
        <View testID="push-choices-read-failed">
          <View style={styles.lines}>
            <Text numberOfLines={1} style={[styles.small, { color: colors.muted }]}>
              {PROFILE_TEXT.pushReadFailed}
            </Text>
            <Text numberOfLines={1} style={[styles.small, { color: colors.muted }]}>
              {PROFILE_TEXT.pushReadHint}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={[ui.buttonSecondary, styles.lineButton]}
            testID="push-choices-retry"
          >
            <Text style={ui.buttonSecondaryText}>{PROFILE_TEXT.pushRetry}</Text>
          </Pressable>
        </View>
      ) : (
        <Text numberOfLines={1} style={[styles.small, styles.under, { color: colors.muted }]} testID="push-all-devices">
          {PROFILE_TEXT.pushAllDevices}
        </Text>
      )}

      <Text style={[ui.kicker, styles.label]}>{PROFILE_TEXT.quietHeading}</Text>
      <View style={listStyle} testID="quiet-hours">
        <View style={styles.choiceRow}>
          <View style={styles.choiceMain}>
            <IconTile>
              <MaaneIcon color={colors.surface} size={20} strokeWidth={1.75} />
            </IconTile>
            <Text numberOfLines={1} style={[styles.choiceName, { color: colors.text }]}>
              {PROFILE_TEXT.quietTitle}
            </Text>
            {control(prefs ? prefs.quietHours : null, PROFILE_TEXT.quietTitle, onQuiet, 'quiet-hours-switch')}
          </View>
          {failedRow === 'quiet' ? <SaveFailedLine testID="quiet-hours-error" /> : null}
        </View>
        <View style={styles.quietBody}>
          <Text style={[styles.quietTimes, { color: colors.text }]}>{PROFILE_TEXT.quietTimes}</Text>
          <Text numberOfLines={1} style={[styles.small, styles.quietLine, { color: colors.muted }]}>
            {PROFILE_TEXT.quietRounds}
          </Text>
          <Text numberOfLines={1} style={[styles.small, styles.quietLine, { color: colors.muted }]}>
            {PROFILE_TEXT.quietInbox}
          </Text>
          {/* Stripa er pynt: tidene står i teksten over, så skjermleseren hopper over den. */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.strip}
            testID="quiet-strip"
          >
            <View style={styles.stripCells}>
              {STRIP_HOURS.map((hour) => {
                const night = isQuietHourOfDay(hour);
                return (
                  <View
                    key={hour}
                    style={[
                      styles.stripCell,
                      { backgroundColor: night ? (quietOn ? colors.primary : offColor) : soft },
                    ]}
                    testID={night ? (quietOn ? 'quiet-strip-night-on' : 'quiet-strip-night-off') : 'quiet-strip-day'}
                  />
                );
              })}
            </View>
            <View style={styles.stripTicks}>
              {STRIP_TICKS.map((tick, index) => (
                <Text key={index} style={[styles.tick, { color: colors.muted }]}>
                  {tick}
                </Text>
              ))}
            </View>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Text numberOfLines={1} style={[styles.small, { color: colors.muted }]}>
          {PROFILE_TEXT.pushFooter}
        </Text>
        <Text numberOfLines={1} style={[styles.small, { color: colors.muted }]}>
          {PROFILE_TEXT.pushFooterScope}
        </Text>
      </View>
    </View>
  );
}

/** Ruta på 36 × 36 med ikonet, fylt med skogen. */
function IconTile({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.tile, { backgroundColor: colors.primary }]}>{children}</View>;
}

/** «Fikk ikke lagret. Prøv igjen.» under navnet, inne i raden. */
function SaveFailedLine({ testID }: { testID: string }) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityLiveRegion="polite"
      numberOfLines={1}
      style={[styles.small, styles.saveFailed, { color: colors.danger }]}
      testID={testID}
    >
      {PROFILE_TEXT.pushSaveFailed}
    </Text>
  );
}

const styles = StyleSheet.create({
  // Designet: 16 pt til kanten, og tittelen 4 pt under topp-raden. Tittelen
  // har nettleserens linjeboks (#2385), så tallet er designets.
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 },
  // Etiketten 20 pt fra kanten, 16 pt over og 8 under.
  label: { paddingHorizontal: 4, paddingTop: 16, paddingBottom: 8 },
  list: { marginTop: 0 },
  // Siden har ingen `gap`; linja trenger luft under lista.
  note: { marginTop: 8 },
  // Designet: skogkortet 14 pt under undertittelen, 16 pt runde hjørner,
  // 12/14 pt luft inni. Undertittelen har nettleserens linjehøyde (#2385).
  card: {
    marginTop: 14,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  texts: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, lineHeight: 18, fontFamily: FONTS.sansSemiBold },
  // 1 pt ned fra tittelen, som i designet (målt).
  cardStatus: { fontSize: 12, lineHeight: 14.5, marginTop: 1, fontFamily: FONTS.sans, opacity: 0.85 },
  // Ruta foran telefonkortet og hver rad: 36 × 36 med radius 10.
  tile: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  // Linjene under kortene står som designets fotnote: 12 pt, 20 pt fra kanten.
  small: { fontSize: 12, lineHeight: 14.5, fontFamily: FONTS.sans },
  // To linjer under et kort, 12 pt under det, og en knapp 16 pt under dem.
  lines: { paddingHorizontal: 4, marginTop: 12 },
  lineButton: { marginTop: 16 },
  // «Gjelder alle enhetene dine.» står 8 pt under lista.
  under: { paddingHorizontal: 4, marginTop: 8 },
  // Listekortet med gruppene og kortet med stille tid.
  choiceList: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  choiceRow: { paddingHorizontal: 14 },
  choiceMain: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  choiceName: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 18, fontFamily: FONTS.sansSemiBold },
  // Skillestreken starter ved teksten: 14 + 36 + 12 = 62 pt inn.
  divider: { position: 'absolute', left: 62, right: 0, bottom: 0, height: 1 },
  // Merkelappen «Alltid på» med låsen.
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  pillText: { fontSize: 12, lineHeight: 14.5, fontFamily: FONTS.sansSemiBold },
  // Den grå flata der bryteren kommer.
  skeleton: { width: 52, height: 32, borderRadius: 16 },
  // Feillinja står under navnet (36 + 12 = 48 pt inn), 10 pt opp i raden.
  saveFailed: { marginTop: -10, marginLeft: 48, paddingBottom: 12 },
  quietBody: { paddingHorizontal: 14, paddingBottom: 14 },
  quietTimes: { ...fraunces(600, 26, 30), fontVariant: ['tabular-nums'], marginTop: 10 },
  quietLine: { marginTop: 2 },
  strip: { marginTop: 12 },
  stripCells: { flexDirection: 'row', gap: 2 },
  stripCell: { flex: 1, height: 10, borderRadius: 3 },
  stripTicks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  tick: { fontSize: 11, lineHeight: 13.5, fontFamily: FONTS.sans, fontVariant: ['tabular-nums'] },
  footer: { paddingHorizontal: 4, marginTop: 12 },
});
