// #2283 (tegning V3, `Sidekonk-kaaring`): «Meldt inn fra kampene» i cupens sidepoeng.
// Bare til å lese: ingenting er valgt eller fylt inn på forhånd, og arrangøren
// velger og teller selv, som før. Samme boks som avslutt-arket har for
// flightene (`ReportedBox` i `WinnerSheet`), med kampen som avsender, og på
// `bg` fordi den står inne i et hvitt kort. Teksten og reglene bor i
// `cupManageCopy.ts` (`reportedSlotBox`, `reportedGirBox`), låst mot nettets
// `CupReportedBoxes` i `cupSideReportsCopy.parity.test.ts`.
import { StyleSheet, Text, View } from 'react-native';
import type { CupGirReport, CupSlotReports } from '../../../../../lib/cup/cupSideReports';
import { SIDE_REPORTED_TEXT, reportedGirBox, reportedSlotBox } from '../../lib/cupManageCopy';
import { FONTS, interLine, useTheme } from '../../theme';

/** Under valgene for nærmest pinnen og lengste drive: en linje per kamp, så kampene som ikke har meldt inn. */
export function SlotReportsBox({
  testKey,
  kind,
  reports,
}: {
  testKey: string;
  kind: 'ctp' | 'ld';
  reports: CupSlotReports | 'failed';
}) {
  const { colors } = useTheme();
  const box = reportedSlotBox(kind, reports);
  // Skillelinja står over hver rad unntatt den første.
  const divider = { borderTopWidth: 1, borderTopColor: colors.divider };
  return (
    <View style={[styles.slotBox, { backgroundColor: colors.bg }]} testID={`side-reports-${testKey}`}>
      <Text style={[styles.heading, { color: colors.muted }]} accessibilityRole="header">
        {SIDE_REPORTED_TEXT.heading}
      </Text>
      {box.empty !== null ? (
        <Text style={[styles.empty, { color: colors.muted }]} testID={`side-reports-empty-${testKey}`}>
          {box.empty}
        </Text>
      ) : (
        <>
          {box.lines.map((line, index) => (
            <View
              key={`line-${line.key}`}
              style={[styles.line, index > 0 ? divider : null]}
              testID={`side-reports-line-${testKey}-${line.key}`}
            >
              <Text style={[styles.sender, { color: colors.muted }]}>{line.sender}</Text>
              <Text
                style={[
                  styles.name,
                  line.answered
                    ? { color: colors.text, fontFamily: FONTS.sansSemiBold }
                    : { color: colors.muted, fontFamily: FONTS.sans },
                ]}
              >
                {line.name}
              </Text>
              {line.distance !== null ? (
                <Text style={[styles.distance, { color: colors.text }]}>{line.distance}</Text>
              ) : null}
            </View>
          ))}
          {box.missing.map((missing) => (
            <Text
              key={`missing-${missing.key}`}
              style={[styles.missing, divider, { color: colors.muted }]}
              testID={`side-reports-missing-${testKey}-${missing.key}`}
            >
              {missing.text}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}

/**
 * Under begge GIR-tellerne: en linje per lag med summen over alle kampene og hvem
 * som traff, så kampene som ikke har meldt inn. Over «maks per lag» står tallet
 * likevel, med taket ved siden av, i advarselsfargen: tellerne er arrangørens egne.
 */
export function GirReportsBox({
  testKey,
  reports,
  team1Name,
  team2Name,
}: {
  testKey: string;
  reports: CupGirReport | 'failed';
  team1Name: string;
  team2Name: string;
}) {
  const { colors } = useTheme();
  const box = reportedGirBox(reports, team1Name, team2Name);
  return (
    <View style={[styles.girBox, { backgroundColor: colors.bg }]} testID={`side-reports-${testKey}`}>
      <Text style={[styles.heading, { color: colors.muted }]} accessibilityRole="header">
        {SIDE_REPORTED_TEXT.heading}
      </Text>
      {box.empty !== null ? (
        <Text style={[styles.girLine, { color: colors.muted }]} testID={`side-reports-empty-${testKey}`}>
          {box.empty}
        </Text>
      ) : (
        <>
          {box.teams.map((team) => (
            <Text
              key={team.key}
              style={[styles.girLine, { color: team.over ? colors.warningText : colors.muted }]}
              testID={`side-reports-${team.key}-${testKey}`}
            >
              <Text style={{ color: colors.text, fontFamily: FONTS.sansSemiBold }}>{team.label}</Text>
              {team.rest}
            </Text>
          ))}
          {box.missing.map((missing) => (
            <Text
              key={`missing-${missing.key}`}
              style={[styles.girLine, { color: colors.muted }]}
              testID={`side-reports-missing-${testKey}-${missing.key}`}
            >
              {missing.text}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Tegningen: `padding: 10px 12px 4px` og radius 12 med linjer, `10px 12px` med tekstlinjer.
  slotBox: { paddingTop: 10, paddingHorizontal: 12, paddingBottom: 4, borderRadius: 12 },
  girBox: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, gap: 4 },
  heading: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 8 },
  sender: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, width: 84, flexShrink: 0 },
  name: { ...interLine(15, 20, { multiline: true }), flex: 1, minWidth: 0 },
  distance: { ...interLine(15, 20), fontFamily: FONTS.sans, fontVariant: ['tabular-nums'], flexShrink: 0 },
  missing: { ...interLine(14, 20, { multiline: true }), fontFamily: FONTS.sans, paddingVertical: 8 },
  empty: { ...interLine(14, 20, { multiline: true }), fontFamily: FONTS.sans, paddingTop: 8 },
  girLine: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
});
