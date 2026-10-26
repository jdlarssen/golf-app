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
// undertekster, samme tall (gevinsten ganger innsatsen, #2313). Tekstene er
// ferdig regnet i `wolfHoleState`, og i en blind runde som pågår står det ingen
// tall i dem (#2314). Formen er en inline-
// seksjon og ikke en modal — hull-skjermen er én rullende kolonne, og appen har
// ikke noe modal-mønster å låne fra ennå.
//
// #2314: over valgene står gangen i hullet (fire steg), siden «Velg før
// utslag» bare gjaldt Blind Wolf. De andre i flighten får gangen i én linje
// til valget er lagret. På et catch-up-hull står merket «CATCH-UP», og linja
// med avstanden — men i en blind runde som pågår står merket alene. Appen
// fører ikke rekkefølgen på tee: ja og nei sies muntlig.
//
// Valget går rett på nettet: det havner ALDRI i sync-køen. Feiler skrivingen,
// blir knappene stående slik at spilleren kan prøve igjen når nettet er
// tilbake — vi later ikke som om noe ble lagret.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { WolfChoice } from '../../../../../lib/scoring/modes/types';
import { setWolfChoice } from '../../data/choices';
import { describeChoiceFailure } from '../../lib/actionFeedback';
import {
  WOLF_FLOW_HINT,
  WOLF_FLOW_STEPS,
  type WolfHoleState,
} from '../../lib/wolfHole';
import { FONTS, TAP, useTheme } from '../../theme';

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
  const { colors, hole, ui } = useTheme();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      {state.catchUp ? (
        <Text
          style={[
            styles.tag,
            { color: colors.primary, borderColor: colors.primary, borderWidth: hole.borderW },
          ]}
          testID="wolf-catch-up"
        >
          CATCH-UP
        </Text>
      ) : null}

      {state.badgeText ? (
        <Text style={ui.body} testID="wolf-badge">
          {`🐺 ${state.badgeText}`}
        </Text>
      ) : null}

      {state.catchUpLine ? (
        <Text style={[ui.muted, styles.small]} testID="wolf-catch-up-line">
          {state.catchUpLine}
        </Text>
      ) : null}

      {state.flowLine ? (
        <Text style={[ui.muted, styles.small]} testID="wolf-flow-line">
          {state.flowLine}
        </Text>
      ) : null}

      {state.notice ? (
        <Text style={ui.muted} testID="wolf-notice">
          {state.notice}
        </Text>
      ) : null}

      {state.showChoiceUi ? (
        <View style={styles.choices} testID="wolf-choices">
          <Text style={ui.kicker} accessibilityRole="header">
            Slik går hullet
          </Text>
          <View
            accessibilityRole="list"
            style={[
              styles.steps,
              {
                backgroundColor: colors.primarySoft,
                // Sollys (#2252): flaten er hvit der, så kanten bærer boksen.
                borderWidth: hole.borderW > 1 ? hole.borderW : 0,
                borderColor: colors.border,
              },
            ]}
            testID="wolf-flow-steps"
          >
            {WOLF_FLOW_STEPS.map((step, index) => (
              <View key={step} style={styles.step} accessible accessibilityLabel={`${index + 1}. ${step}`}>
                <Text style={[styles.stepNumber, { color: colors.primary }]}>{`${index + 1}.`}</Text>
                <Text style={[ui.body, styles.stepText]}>{step}</Text>
              </View>
            ))}
          </View>
          <Text style={[ui.muted, styles.small]}>{WOLF_FLOW_HINT}</Text>
          {state.choiceTexts.stakeLine ? (
            <Text style={ui.muted} testID="wolf-stake-line">
              {state.choiceTexts.stakeLine}
            </Text>
          ) : null}

          {state.partnerOptions.map((option) => (
            <ChoiceButton
              key={option.userId}
              testID={`wolf-partner-${option.userId}`}
              title={`Partner: ${option.name}`}
              aside={option.standing}
              accessibilityLabel={option.accessibilityLabel}
              subtitle={state.choiceTexts.partnerSubtitle}
              disabled={saving}
              onPress={() => void submit('partner', option.userId)}
            />
          ))}

          <ChoiceButton
            testID="wolf-lone"
            title="Lone Wolf"
            subtitle={state.choiceTexts.loneSubtitle}
            accent
            disabled={saving}
            onPress={() => void submit('lone', null)}
          />
          <ChoiceButton
            testID="wolf-blind"
            title="Blind Wolf"
            subtitle={state.choiceTexts.blindSubtitle}
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
  aside = null,
  accessibilityLabel,
  subtitle,
  accent = false,
  disabled,
  onPress,
}: {
  testID: string;
  title: string;
  /** Stillingen til høyre på knappen («1. · 14 p»), eller `null`. */
  aside?: string | null;
  accessibilityLabel?: string;
  subtitle?: string | null;
  accent?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors, hole, ui } = useTheme();
  return (
    <Pressable
      style={[
        styles.choice,
        {
          backgroundColor: colors.bg,
          borderColor: accent ? colors.accent : colors.border,
          // Temaets kant: 3 i sollys (#2252), ellers 1.
          borderWidth: hole.borderW,
        },
        disabled && styles.choiceDisabled,
      ]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <View style={styles.choiceTitleRow}>
        <Text style={[ui.body, styles.choiceTitle]}>{title}</Text>
        {aside ? <Text style={[ui.muted, styles.tabular]}>{aside}</Text> : null}
      </View>
      {subtitle ? <Text style={ui.muted}>{subtitle}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  choices: { gap: 8 },
  tag: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.3,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  small: { fontSize: 13 },
  steps: { borderRadius: 12, padding: 12, gap: 6 },
  step: { flexDirection: 'row', gap: 8 },
  stepNumber: { fontSize: 14, fontFamily: FONTS.sansSemiBold, minWidth: 16 },
  stepText: { flex: 1, fontSize: 14, lineHeight: 20 },
  choiceTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  choiceTitle: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  choice: {
    minHeight: TAP + 12,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
    gap: 2,
  },
  choiceDisabled: { opacity: 0.4 },
});
