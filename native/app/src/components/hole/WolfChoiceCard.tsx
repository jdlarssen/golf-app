// Native (#1832): wolf-badgen og wolfens valg, på hullet.
//
// Kortet har to jobber, og bare den ene er en knapp. ALLE i flighten ser
// badgen — hvem som er Wolf, og hva som ble valgt. Bare den som faktisk ER
// Wolf på hullet får valg-knappene; de andre får ingen skrivekontroller i det
// hele tatt. RLS (`wolf_choices_insert/update` krever
// `wolf_user_id = auth.uid()`) ville avvist dem uansett, og en knapp som
// garantert feiler er verre enn ingen knapp.
//
// Innholdet er webbens `WolfChoiceModal`, ikke pikslene: samme tre valg, samme
// undertekster, samme tall (lone = n, blind = n + 2). Formen er en inline-
// seksjon og ikke en modal — hull-skjermen er én rullende kolonne, og appen har
// ikke noe modal-mønster å låne fra ennå.
//
// Valget går rett på nettet: det havner ALDRI i sync-køen. Feiler skrivingen,
// blir knappene stående slik at spilleren kan prøve igjen når nettet er
// tilbake — vi later ikke som om noe ble lagret.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { WolfChoice } from '../../../../../lib/scoring/modes/types';
import { setWolfChoice } from '../../data/choices';
import { describeChoiceFailure } from '../../lib/actionFeedback';
import type { WolfHoleState } from '../../lib/wolfHole';
import { COLORS, TAP, ui } from '../../theme';

export function WolfChoiceCard({
  gameId,
  holeNumber,
  state,
  onSaved,
}: {
  gameId: string;
  holeNumber: number;
  state: WolfHoleState;
  /** Kalles etter et lagret valg — henter valgene på nytt. */
  onSaved: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // #465: n = alle i rotasjonen. Lone-gevinsten er n, blind n + 2 — samme
  // regnestykke som webbens modal viser i underteksten.
  const n = state.partnerOptions.length + 1;

  // Ingenting å si? Da sier vi ingenting. Et tomt kort med ramme rundt ser ut
  // som noe som ikke lastet ferdig, og det er en dårligere beskjed enn null.
  if (!state.badgeText && !state.notice && !state.showChoiceUi) return null;

  async function submit(choice: WolfChoice, partnerUserId: string | null) {
    if (saving || state.wolfUserId === null) return;
    setSaving(true);
    setError(null);
    try {
      const result = await setWolfChoice({
        gameId,
        holeNumber,
        wolfUserId: state.wolfUserId,
        choice,
        partnerUserId,
      });
      if (result.ok) {
        await onSaved();
      } else {
        setError(describeChoiceFailure(result.error));
      }
    } catch {
      setError('Fikk ikke lagret valget. Sjekk nettet og prøv igjen.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={ui.card} testID="wolf-card">
      {state.badgeText ? (
        <Text style={ui.body} testID="wolf-badge">
          {`🐺 ${state.badgeText}`}
        </Text>
      ) : null}

      {state.notice ? (
        <Text style={ui.muted} testID="wolf-notice">
          {state.notice}
        </Text>
      ) : null}

      {state.showChoiceUi ? (
        <View style={styles.choices} testID="wolf-choices">
          <Text style={ui.sectionTitle}>Velg før utslag</Text>

          {state.partnerOptions.map((option) => (
            <ChoiceButton
              key={option.userId}
              testID={`wolf-partner-${option.userId}`}
              title={`Partner: ${option.name}`}
              subtitle="Vinner-siden får 2 hver"
              disabled={saving}
              onPress={() => void submit('partner', option.userId)}
            />
          ))}

          <ChoiceButton
            testID="wolf-lone"
            title="Lone Wolf"
            subtitle={`Alene mot resten. Vinner du, får du ${n}.`}
            accent
            disabled={saving}
            onPress={() => void submit('lone', null)}
          />
          <ChoiceButton
            testID="wolf-blind"
            title="Blind Wolf"
            subtitle={`Meldt før utslag. Vinner du, får du ${n + 2}.`}
            accent
            disabled={saving}
            onPress={() => void submit('blind', null)}
          />
        </View>
      ) : null}

      {error ? (
        <Text style={ui.error} testID="wolf-error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function ChoiceButton({
  testID,
  title,
  subtitle,
  accent = false,
  disabled,
  onPress,
}: {
  testID: string;
  title: string;
  subtitle: string;
  accent?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.choice, accent && styles.choiceAccent, disabled && styles.choiceDisabled]}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
    >
      <Text style={ui.body}>{title}</Text>
      <Text style={ui.muted}>{subtitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  choices: { gap: 8 },
  choice: {
    minHeight: TAP + 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.linen,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
    gap: 2,
  },
  choiceAccent: { borderColor: COLORS.gold },
  choiceDisabled: { opacity: 0.4 },
});
