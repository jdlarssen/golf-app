// #2638 Del 2: rundeinnstillingene i en simulatorliga, i appen.
//
// Samme kort som nettsiden (`components/league/SimSettingsCard.tsx`), etter
// orkestratorens avgjørelse 25.10: eierens svar 21:55 (Trackmans egne valg) og
// 25.10 («game settings skal være kollapset») går foran fritekstkortet på
// app-tegningene 2 og 5. Kortet er foldet til én linje, «Rundeinnstillinger ·
// Trackman», med «Endret denne runden» når runden har overstyringer: lukket på
// ligasiden og åpent på «Start runden», der spilleren stiller inn simulatoren.
// Åpent viser det Trackmans to faner, «Game» og «Course», og teen fra
// banevalget under. Radstilen er app-tegningens (`.sim-row`): etiketten til
// venstre, verdien til høyre, skillelinjer, og merket under etiketten.
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
  round: Pick<AppLeagueRound, 'simSettings' | 'overriddenKeys' | 'teeName'>;
  defaultOpen: boolean;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const groups = simSettingGroups(round.simSettings, round.overriddenKeys, 'no');
  if (groups.length === 0 && !round.teeName) return null;
  const changed = groups.some((group) => group.rows.some((row) => row.overridden));

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
        {changed ? <Tag testID="sim-settings-changed" /> : null}
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
                  style={[
                    styles.row,
                    row.overridden ? styles.changedRow : null,
                    index > 0 ? { borderTopWidth: 1, borderTopColor: colors.divider } : null,
                  ]}
                  testID={`sim-setting-${row.key}`}
                >
                  <View style={styles.label}>
                    <Text style={[styles.key, { color: colors.muted }]}>{row.label}</Text>
                    {row.overridden ? <Tag testID="sim-setting-overridden" /> : null}
                  </View>
                  <Text
                    style={[
                      styles.value,
                      { color: colors.text, fontFamily: row.overridden ? FONTS.sansSemiBold : FONTS.sansMedium },
                    ]}
                  >
                    {row.value}
                  </Text>
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

/** «Endret denne runden», tegningenes `.tag`: gull kant på krem. */
function Tag({ testID }: { testID: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tag, { borderColor: colors.accent, backgroundColor: colors.leaderFill }]} testID={testID}>
      <Text style={[styles.tagText, { color: colors.accentText }]}>{SIM_SETTINGS_TEXT.overridden}</Text>
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
  // Teksten gir etter (to linjer) før merket og pila: pila skal alltid stå
  // inne i kortet, også med «Endret denne runden» på en smal skjerm.
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
  // `.sim-row`: minst 36 høy, 7 og 16 inn; en endret rad er 52 høy.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    minHeight: 36,
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  changedRow: { minHeight: 52 },
  label: { alignItems: 'flex-start', gap: 4, flexShrink: 1 },
  key: { ...interLine(13, 18), fontFamily: FONTS.sans },
  value: { ...interLine(15, 20), textAlign: 'right', flexShrink: 1 },
  // `.tag`: 20 høy, 8 inn, 1 pt gull kant, 11 pt halvfet.
  tag: {
    flexShrink: 0,
    height: 20,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
  },
  tagText: { ...interLine(11, 13), fontFamily: FONTS.sansSemiBold },
});
