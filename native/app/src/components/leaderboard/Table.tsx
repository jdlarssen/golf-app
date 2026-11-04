// Native N4 (#1828): tabell-primitivene leaderboard-visningene deler.
//
// Ingen ambisjon om et designsystem — akkurat nok til at ni formater ser ut
// som samme app. Tall står høyrestilt med `tabular-nums` slik at kolonnene
// linjerer seg, samme regel som på web.
//
// #1833: layout ligger i det statiske arket under, fargene kommer fra
// `useTheme()` — appens ene mønster for tema-avhengige stiler.
import { StyleSheet, Text, View } from 'react-native';
import { BOARD_TEXT } from '../../lib/boardCopy';
import { formatMessage } from '../../lib/kavalkadeCopy';
import type { ReactionTarget } from '../../lib/useGameReactions';
import { FONTS, useTheme } from '../../theme';
import { useReactionsContext } from './ReactionsProvider';
import { ReactableRow, ReactionHint, ReactionPlate } from './RowReactions';

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
  /** #2754: raden er én spiller, og spilleren kan få reaksjoner. */
  reactionTarget?: ReactionTarget;
}

/**
 * Tabellen. Rekkefølgen på radene er kallerens ansvar: motoren har allerede
 * rangert dem, og en sortering til her ville vært en ny og konkurrerende regel.
 */
/**
 * Kortene på de enkle tavlene (Wolf, Skins, Nassau, matchplay) har 16-hjørner
 * som de tegnede tavlene, ikke `ui.card` sine 12 (#2709).
 */
export const plainBoardCard = { borderRadius: 16 } as const;

export function LeaderTable({
  columns,
  rows,
  testID,
}: {
  columns: readonly LeaderColumn[];
  rows: readonly LeaderRow[];
  testID: string;
}) {
  const { colors, ui } = useTheme();
  const selectedId = useReactionsContext()?.target?.userId;
  const cellsOf = (row: LeaderRow) =>
    columns.map((column, index) => (
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
    ));
  return (
    <View style={[ui.card, plainBoardCard]} testID={testID}>
      <View style={[styles.row, { borderBottomColor: colors.border }]}>
        {columns.map((column) => (
          <Text
            key={column.key}
            style={[
              // Tabellhodet er appens kicker, ikke en egen variant (#2709).
              ui.kicker,
              { flex: column.flex ?? 1 },
              column.numeric ? styles.numericCell : null,
            ]}
          >
            {column.label}
          </Text>
        ))}
      </View>
      {rows.map((row) =>
        row.reactionTarget ? (
          <ReactableRow
            key={row.key}
            target={row.reactionTarget}
            label={rowLabel(columns, row)}
            style={[
              styles.reactableRow,
              { borderBottomColor: colors.border },
              selectedId === row.reactionTarget.userId ? { backgroundColor: colors.primarySoft } : null,
            ]}
            testID={`${testID}-row-${row.key}`}
          >
            <View style={styles.cells}>{cellsOf(row)}</View>
            <ReactionPlate userId={row.reactionTarget.userId} />
          </ReactableRow>
        ) : (
          <View
            key={row.key}
            style={[styles.row, { borderBottomColor: colors.border }]}
            testID={`${testID}-row-${row.key}`}
          >
            {cellsOf(row)}
          </View>
        ),
      )}
      {rows.some((row) => row.reactionTarget) ? <ReactionHint /> : null}
    </View>
  );
}

/** Radens opplesning som knapp: «1. plass, Marte Lie, Poeng 12». */
function rowLabel(columns: readonly LeaderColumn[], row: LeaderRow): string {
  return columns
    .map((column, index) => {
      const cell = row.cells[index] ?? '—';
      if (column.key === 'rank') return formatMessage(BOARD_TEXT.srPlace, { rank: cell });
      return column.numeric ? `${column.label} ${cell}` : String(cell);
    })
    .join(', ');
}

/** Rolig tekst når det ikke er noe å vise ennå. Aldri en tom tabell. */
export function CalmNote({ text, testID }: { text: string; testID: string }) {
  const { ui } = useTheme();
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
  },
  // #2754: raden med reaksjoner. Skiltet står under cellene, til høyre.
  reactableRow: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-end',
    gap: 2,
  },
  cells: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  numericCell: { textAlign: 'right' },
  // Egen familie, ikke `fontWeight`: expo-font registrerer ett snitt per
  // familie, så en vekt oppå Inter Regular gjør ingenting.
  // Halvfet som resten av appen, ikke fet (#2709).
  highlight: { fontFamily: FONTS.sansSemiBold },
});
