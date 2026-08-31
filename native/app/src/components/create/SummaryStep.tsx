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
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Note } from './primitives';

export interface SummaryLine {
  key: string;
  label: string;
  value: string;
}

export interface SummaryWarning {
  key: string;
  text: string;
}

export function SummaryStep({
  lines,
  warnings,
  error,
  busy,
  canPublish,
  onPublish,
}: {
  lines: readonly SummaryLine[];
  warnings: readonly SummaryWarning[];
  error: string | null;
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

      {warnings.map((warning) => (
        <Note key={warning.key} testID={`create-warning-${warning.key}`}>
          {warning.text}
        </Note>
      ))}

      <Pressable
        testID="create-publish"
        accessibilityRole="button"
        style={[ui.button, (busy || !canPublish) && styles.dimmed]}
        disabled={busy || !canPublish}
        onPress={onPublish}
      >
        <Text style={ui.buttonText}>{busy ? 'Oppretter …' : 'Publiser spillet'}</Text>
      </Pressable>

      {error ? (
        <Text style={ui.error} testID="create-error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ dimmed: { opacity: 0.5 } });
