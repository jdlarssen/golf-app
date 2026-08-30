// Native N4 (#1828): tabell-primitivene leaderboard-visningene deler.
//
// Ingen ambisjon om et designsystem — akkurat nok til at ni formater ser ut
// som samme app. Tall står høyrestilt med `tabular-nums` slik at kolonnene
// linjerer seg, samme regel som på web.
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, ui } from '../../theme';

export interface LeaderColumn {
  key: string;
  label: string;
  /** Vekt i raden. Navne-/lagkolonnen får typisk 3, tallene 1. */
  flex?: number;
  /** Tall høyrestilles og får `tabular-nums`. */
  numeric?: boolean;
}

export interface LeaderRow {
  key: string;
  /** Én verdi per kolonne, i samme rekkefølge. */
  cells: (string | number)[];
  /** Framhever raden — brukt på lag/spiller på topp. */
  highlight?: boolean;
}

/**
 * Tabellen. Rekkefølgen på radene er kallerens ansvar: motoren har allerede
 * rangert dem, og en sortering til her ville vært en ny og konkurrerende regel.
 */
export function LeaderTable({
  columns,
  rows,
  testID,
}: {
  columns: readonly LeaderColumn[];
  rows: readonly LeaderRow[];
  testID: string;
}) {
  return (
    <View style={ui.card} testID={testID}>
      <View style={styles.row}>
        {columns.map((column) => (
          <Text
            key={column.key}
            style={[
              ui.muted,
              styles.headCell,
              { flex: column.flex ?? 1 },
              column.numeric ? styles.numericCell : null,
            ]}
          >
            {column.label}
          </Text>
        ))}
      </View>
      {rows.map((row) => (
        <View key={row.key} style={styles.row} testID={`${testID}-row-${row.key}`}>
          {columns.map((column, index) => (
            <Text
              key={column.key}
              // Én testID per celle: en rad med tre 2-tall kan ellers ikke
              // skilles fra en rad med tre andre 2-tall.
              testID={`${testID}-row-${row.key}-${column.key}`}
              style={[
                ui.body,
                { flex: column.flex ?? 1 },
                column.numeric ? [ui.num, styles.numericCell] : null,
                row.highlight ? styles.highlight : null,
              ]}
              numberOfLines={1}
            >
              {row.cells[index] ?? '—'}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Rolig tekst når det ikke er noe å vise ennå. Aldri en tom tabell. */
export function CalmNote({ text, testID }: { text: string; testID: string }) {
  return (
    <View style={ui.banner} testID={testID}>
      <Text style={ui.body}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  headCell: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
  numericCell: { textAlign: 'right' },
  highlight: { fontWeight: '700' },
});
