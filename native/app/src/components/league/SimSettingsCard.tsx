// #2638 Del 2: rundeinnstillingene i en simulatorliga, i appen.
//
// Samme kort som nettsiden (`components/league/SimSettingsCard.tsx`), etter
// orkestratorens avgjørelse 25.10: eierens svar 21:55 (Trackmans egne valg) og
// 25.10 («game settings skal være kollapset») går foran fritekstkortet på
// app-tegningene 2 og 5. Kortet er foldet til én linje, «Rundeinnstillinger ·
// Trackman», på ligasiden. Åpent viser det Trackmans to faner, «Game» og
// «Course», og teen fra banevalget under. Radstilen er app-tegningens
// (`.sim-row`): etiketten til venstre, verdien til høyre, skillelinjer.
//
// Ingen «Endret denne runden» (#2675): spilleren har ingen «standard» å
// sammenligne med, så kortet viser det som gjelder og ikke hva som avviker.
// Merket bor hos arrangøren, som styrer standarden, og appen har ingen
// arrangørskjerm.
//
// Verdiene er rundas effektive innstillinger slik ruta sender dem
// (`roundSimSettings` på serveren): kortet slår aldri sammen standard og
// overstyring selv, og skriver ingen innstillingstekst selv
// (`simSettingGroups`, `lib/league/simSettings.ts`).
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppLeagueRound } from '../../../../../lib/league/appLeagueView';
import { simSettingGroups } from '../../../../../lib/league/simSettings';
import { SIM_SETTINGS_TEXT } from '../../lib/leagueCopy';
import { FONTS, TAP, interLine, useTheme } from '../../theme';
import { ChevronIcon } from '../icons/Icons';

export function SimSettingsCard({
  round,
  defaultOpen,
}: {
  round: Pick<AppLeagueRound, 'simSettings' | 'teeName'>;
  defaultOpen: boolean;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const groups = simSettingGroups(round.simSettings, [], 'no');
  if (groups.length === 0 && !round.teeName) return null;

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="sim-settings-card"
    >
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.summary}
        testID="sim-settings-summary"
      >
        <Text style={[styles.summaryText, { color: colors.text }]}>{SIM_SETTINGS_TEXT.summary}</Text>
        <View style={styles.chevron}>
          <ChevronIcon color={colors.muted} size={14} up={open} strokeWidth={2} />
        </View>
      </Pressable>
      {open ? (
        <View testID="sim-settings-values">
          {groups.map((group) => (
            <View key={group.key}>
              <Text
                style={[styles.group, { color: colors.muted, borderTopColor: colors.divider }]}
                accessibilityRole="header"
              >
                {group.label}
              </Text>
              {group.rows.map((row, index) => (
                <View
                  key={row.key}
                  style={[styles.row, index > 0 ? { borderTopWidth: 1, borderTopColor: colors.divider } : null]}
                  testID={`sim-setting-${row.key}`}
                >
                  <Text style={[styles.key, { color: colors.muted }]}>{row.label}</Text>
                  <Text style={[styles.value, { color: colors.text, fontFamily: FONTS.sansMedium }]}>{row.value}</Text>
                </View>
              ))}
            </View>
          ))}
          {round.teeName ? (
            <View
              style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.divider }]}
              testID="sim-setting-tee"
            >
              <Text style={[styles.key, { color: colors.muted }]}>{SIM_SETTINGS_TEXT.tee}</Text>
              <Text style={[styles.value, { color: colors.text, fontFamily: FONTS.sansMedium }]}>
                {round.teeName}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // `.card.sim`: 16 fra kanten, 16 i hjørnene.
  card: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: TAP,
    paddingHorizontal: 16,
  },
  // Teksten gir etter (to linjer) før pila: pila skal alltid stå inne i
  // kortet, også på en smal skjerm.
  summaryText: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sansMedium, flexShrink: 1 },
  chevron: { marginLeft: 'auto', flexShrink: 0 },
  // Fanenavnet over gruppa: små sperrede versaler, som tegningenes `.who-k`.
  group: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    paddingTop: 12,
    paddingBottom: 4,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  // `.sim-row`: minst 36 høy, 7 og 16 inn.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    minHeight: 36,
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  key: { ...interLine(13, 18), fontFamily: FONTS.sans },
  value: { ...interLine(15, 20), textAlign: 'right', flexShrink: 1 },
});
