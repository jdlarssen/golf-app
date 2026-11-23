// native/app/src/components/create/SummaryStep.tsx
// Native N6a (#1854): siste steg — les gjennom, publiser.
//
// Rent presentasjons-lag: skjermen har alle valgene og setter dem sammen til
// linjer, så denne fila aldri kan komme til å vise noe annet enn det som
// faktisk sendes.
//
// Merknadene er MERKNADER, ikke sperrer. Et lag uten tildeling betyr at
// spilleren droppes fra runden (samme regel som på web), og det skal stå her —
// men det stopper ikke publiseringen. Porten for et halvferdig lag er STARTEN
// av runden, ikke opprettelsen.
//
// Knappen låses mens skrivingen pågår og åpnes igjen ved feil: et dobbelttrykk
// ville laget to runder, og en knapp som blir stående grå etter en feilet
// skriving ser ut som om noe ble lagret.
import { StyleSheet, Text, View } from 'react-native';
import { Tap } from '../Tap';
import {
  CREATE_ON_WEB_LABEL,
  CREATE_ON_WEB_PATH,
  EDIT_PROFILE_LABEL,
} from '../../lib/createGameCopy';
import { REPEAT_WEEKLY_KICKER, REPEAT_WEEKLY_TITLE } from '../../lib/repeatWeeklyCopy';
import { useTheme } from '../../theme';
import { WebLinkButton } from '../WebLinkButton';
import { Note, ToggleRow } from './primitives';

export interface SummaryLine {
  key: string;
  label: string;
  value: string;
}

export interface SummaryWarning {
  key: string;
  text: string;
  /**
   * `'profile'`: din egen profil mangler navn eller handicap (#1979, #2441).
   * «Rediger profil» står rett under merknaden. Profilen stopper ikke
   * publiseringen, bare starten, så knappen hører til merknaden og ikke feilen.
   */
  action?: 'profile';
}

/**
 * #2460 «Gjenta hver uke». Skjermen gir den bare der runden kan gjentas
 * (`canRepeatWeekly`), ellers står bryteren ikke her.
 */
export interface RepeatWeeklyControl {
  value: boolean;
  onChange: (value: boolean) => void;
  /** Linja under bryteren når den er på (`repeatWeeklyNextText`). */
  nextText: string;
}

export function SummaryStep({
  lines,
  warnings,
  repeatWeekly = null,
  error,
  errorAction = null,
  onEditProfile,
  busy,
  canPublish,
  onPublish,
}: {
  lines: readonly SummaryLine[];
  warnings: readonly SummaryWarning[];
  repeatWeekly?: RepeatWeeklyControl | null;
  error: string | null;
  /**
   * Hvor veien videre går, hvis den finnes.
   *
   *  - `'web'`     — formatet finnes, men appen har ikke flaten (#1891).
   *  - `null`      — feilen løses her, eller ikke i det hele tatt.
   *
   * Skjermen avgjør hvilken (`createFailureBelongsOnWeb`); her rendres bare
   * knappen, så to steder ikke kan bli uenige om hvilke koder det gjelder.
   */
  errorAction?: 'web' | null;
  /** Kalles av merknadens `'profile'`-knapp. Skjermen eier navigasjonen. */
  onEditProfile?: () => void;
  busy: boolean;
  /** Falsk når et påkrevd valg mangler — knappen står, men gjør ingenting. */
  canPublish: boolean;
  onPublish: () => void;
}) {
  const { ui } = useTheme();

  return (
    <View testID="create-step-summary">
      <Text style={ui.title}>Klar til å fyre opp?</Text>

      <View style={ui.card}>
        {lines.map((line) => (
          <View key={line.key}>
            <Text style={ui.label}>{line.label}</Text>
            <Text style={ui.body} testID={`create-summary-${line.key}`}>
              {line.value}
            </Text>
          </View>
        ))}
      </View>

      {repeatWeekly ? (
        <>
          <Text style={ui.sectionTitle}>{REPEAT_WEEKLY_KICKER}</Text>
          <ToggleRow
            testID="create-repeat-weekly"
            label={REPEAT_WEEKLY_TITLE}
            hint={repeatWeekly.value ? repeatWeekly.nextText : undefined}
            value={repeatWeekly.value}
            onChange={repeatWeekly.onChange}
          />
        </>
      ) : null}

      {warnings.map((warning) => (
        <View key={warning.key}>
          <Note testID={`create-warning-${warning.key}`}>{warning.text}</Note>
          {warning.action === 'profile' && onEditProfile ? (
            <Tap
              testID="create-warning-profile"
              accessibilityRole="button"
              style={ui.buttonSecondary}
              onPress={onEditProfile}
            >
              <Text style={ui.buttonSecondaryText}>{EDIT_PROFILE_LABEL}</Text>
            </Tap>
          ) : null}
        </View>
      ))}

      <Tap
        testID="create-publish"
        accessibilityRole="button"
        style={[ui.button, (busy || !canPublish) && styles.dimmed]}
        disabled={busy || !canPublish}
        onPress={onPublish}
      >
        <Text style={ui.buttonText}>{busy ? 'Oppretter …' : 'Publiser spillet'}</Text>
      </Tap>

      {error ? (
        <Text style={ui.error} testID="create-error">
          {error}
        </Text>
      ) : null}

      {error && errorAction === 'web' ? (
        <WebLinkButton
          label={CREATE_ON_WEB_LABEL}
          path={CREATE_ON_WEB_PATH}
          testID="create-error-link"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ dimmed: { opacity: 0.5 } });
