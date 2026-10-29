// #2675 (del 2 av #2666): sjekklista før en simulatorrunde, i appen.
//
// Samme innhold som nettsidens `components/league/RoundSetupChecklist.tsx`
// (tegning 9a/9b): bane og tee øverst i en egen innfelt boks, så alle åtte
// innstillingene i Trackmans to grupper, Game og Course. Den viser alt runden
// bruker, ikke bare det som avviker fra ligaens standard: spilleren har ingen
// relasjon til «standard» (eieren 27.10), så ingenting merkes «endret». Den
// kan ikke foldes sammen (det kan `SimSettingsCard` på ligasiden). Mangler
// bane eller tee, faller raden bort, som på nettet.
//
// Verdiene er rundas effektive innstillinger slik ruta sender dem; kortet
// skriver ingen innstillingstekst selv (`simSettingGroups`).
import { StyleSheet, Text, View } from 'react-native';
import type { AppLeagueRound } from '../../../../../lib/league/appLeagueView';
import { simSettingGroups } from '../../../../../lib/league/simSettings';
import { CHECKLIST_TEXT } from '../../lib/leagueCopy';
import { FONTS, fraunces, interLine, useTheme } from '../../theme';

export function RoundSetupChecklist({
  round,
}: {
  round: Pick<AppLeagueRound, 'simSettings' | 'teeName' | 'courseName'>;
}) {
  const { colors } = useTheme();
  const groups = simSettingGroups(round.simSettings, [], 'no');
  const candidates: Array<{ key: string; label: string; value: string | null }> = [
    { key: 'course', label: CHECKLIST_TEXT.course, value: round.courseName },
    { key: 'tee', label: CHECKLIST_TEXT.tee, value: round.teeName },
  ];
  const where = candidates.filter((row): row is { key: string; label: string; value: string } => row.value !== null);

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="round-setup-checklist"
    >
      <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
        {CHECKLIST_TEXT.title}
      </Text>
      <Text style={[styles.lead, { color: colors.muted }]}>{CHECKLIST_TEXT.lead}</Text>
      {where.length > 0 ? (
        <View style={[styles.where, { backgroundColor: colors.surface2 }]} testID="round-setup-where">
          {where.map((row, index) => (
            <View
              key={row.key}
              style={[
                styles.whereRow,
                index === 0 ? null : { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
              ]}
              testID={`round-setup-${row.key}`}
            >
              <Text style={[styles.whereKey, { color: colors.muted }]}>{row.label}</Text>
              <Text style={[styles.whereValue, { color: colors.text }]}>{row.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.groups}>
        {groups.map((group, groupIndex) => (
          <View key={group.key} style={groupIndex === 0 ? null : styles.groupGap}>
            <Text style={[styles.group, { color: colors.muted }]} accessibilityRole="header">
              {group.label}
            </Text>
            {group.rows.map((row, rowIndex) => (
              <View
                key={row.key}
                style={[styles.row, rowIndex === 0 ? styles.firstRow : null]}
                testID={`round-setup-setting-${row.key}`}
              >
                <Text style={[styles.key, { color: colors.muted }]}>{row.label}</Text>
                <Text style={[styles.value, { color: colors.text }]}>{row.value}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // `.card`: 16 fra kanten, 24 inn, 16 i hjørnene.
  card: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, padding: 24 },
  // `.cl-title`: Fraunces 20/25, 500.
  title: { ...fraunces(500, 20, 25, { multiline: true }) },
  // `.cl-lead`: 13/19,5, 6 under tittelen.
  lead: { ...interLine(13, 19.5, { multiline: true }), fontFamily: FONTS.sans, marginTop: 6 },
  // `.cl-where`: 16 under ingressen, 14 og 16 inn, 12 i hjørnene.
  where: { marginTop: 16, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12 },
  whereRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  whereKey: {
    ...interLine(10, 15),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  // `.cl-where dd`: Fraunces 17/24 på tegningen. Appen har ikke et eget snitt
  // for 400 ved 17 (`fraunces-sizes.json`: 16 og 18), så den bruker 16/24 som
  // rundetittelen på ligasiden; et nytt snitt er ikke verdt 1 pt.
  whereValue: { ...fraunces(400, 16, 24, { multiline: true }), flexShrink: 1, textAlign: 'right' },
  groups: { marginTop: 20 },
  groupGap: { marginTop: 16 },
  // `.sub`: små sperrede versaler, 8 under.
  group: {
    ...interLine(10, 15),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  // `.dl`: 13/19,5, 8 mellom radene.
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 8 },
  firstRow: { marginTop: 0 },
  key: { ...interLine(13, 19.5, { multiline: true }), fontFamily: FONTS.sans, flexShrink: 1 },
  value: { ...interLine(13, 19.5, { multiline: true }), fontFamily: FONTS.sansMedium, flexShrink: 1, textAlign: 'right' },
});
