// #2262: det klassiske scorekortet — ett kort per ni hull, UT (1–9) og INN
// (10–18), med radene HULL, PAR, SLAG og så POENG eller NETTO.
//
// Tallene kommer ferdig regnet fra den delte `buildScorecardGrid`; her tegnes
// de bare. To valg bærer layouten:
//
// 1. **Kolonner, ikke rader.** Hvert hull er én kolonne med cellene stablet
//    under hverandre, og radene står på linje fordi hver rad har fast høyde.
//    Da kan hver kolonne være ett VoiceOver-element — «Hull 3, par 4, 5 slag,
//    2 poeng» — i stedet for at skjermleseren leser 40 løsrevne tall.
// 2. **Ti like kolonner som fyller bredden.** På 375 pt og bredere får hver
//    kolonne plass til en 26 pt-form med luft rundt. Er skjermen smalere, ruller kortet
//    sidelengs, aldri skjermen.
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ScorecardCell, ScorecardGrid as Grid, ScorecardHalf } from '../../../../../lib/scorecard/scorecardGrid';
import { FONTS, useTheme } from '../../theme';
import { ScoreShape } from './ScoreShape';

export type ScorecardRowKind = 'strokes' | 'net' | 'points' | 'enteredBy';

export interface EnteredByName {
  initials: string;
  fullName: string;
}

// 26 og ikke 28: to firkanter i nabokolonner skal ha luft mellom seg på 390 pt.
const SHAPE = 26;
const MIN_COLUMN = 28;
const LABEL_WIDTH = 40;
const ROW_HEIGHT = 26;
const SHAPE_ROW_HEIGHT = 34;

const ROW_LABELS: Record<'hole' | 'par' | ScorecardRowKind, string> = {
  hole: 'Hull',
  par: 'Par',
  strokes: 'Slag',
  net: 'Netto',
  points: 'Poeng',
  enteredBy: 'Ført av',
};

const HALF_TITLES: Record<ScorecardHalf['key'], { title: string; a11y: string }> = {
  out: { title: 'Ut', a11y: 'Ut, hull 1 til 9' },
  in: { title: 'Inn', a11y: 'Inn, hull 10 til 18' },
};

function rowHeight(kind: 'hole' | 'par' | ScorecardRowKind): number {
  return kind === 'strokes' ? SHAPE_ROW_HEIGHT : ROW_HEIGHT;
}

function holeLabel(
  cell: ScorecardCell,
  rows: readonly ScorecardRowKind[],
  enteredBy: ReadonlyMap<number, EnteredByName> | undefined,
): string {
  const parts = [`Hull ${cell.holeNumber}`, `par ${cell.par}`];
  if (cell.strokes == null) {
    parts.push('ikke spilt');
  } else {
    parts.push(`${cell.strokes} slag`);
    if (rows.includes('net') && cell.net != null) parts.push(`netto ${cell.net}`);
    if (rows.includes('points') && cell.points != null) parts.push(`${cell.points} poeng`);
  }
  const who = rows.includes('enteredBy') ? enteredBy?.get(cell.holeNumber) : undefined;
  if (who) parts.push(`ført av ${who.fullName}`);
  return parts.join(', ');
}

function sumLabel(half: ScorecardHalf, rows: readonly ScorecardRowKind[]): string {
  const parts = [`Sum ${HALF_TITLES[half.key].title.toLowerCase()}`, `par ${half.sum.par}`];
  const played = half.cells.some((cell) => cell.strokes != null);
  if (!played) {
    parts.push('ingen slag');
  } else {
    parts.push(`${half.sum.strokes} slag`);
    if (rows.includes('net') && half.sum.net != null) parts.push(`netto ${half.sum.net}`);
    if (rows.includes('points') && half.sum.points != null) parts.push(`${half.sum.points} poeng`);
  }
  return parts.join(', ');
}

function Cell({
  kind,
  first,
  children,
}: {
  kind: 'hole' | 'par' | ScorecardRowKind;
  first: boolean;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.cell,
        { height: rowHeight(kind) },
        first ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
      ]}
    >
      {children}
    </View>
  );
}

function Half({
  half,
  rows,
  enteredBy,
}: {
  half: ScorecardHalf;
  rows: readonly ScorecardRowKind[];
  enteredBy?: ReadonlyMap<number, EnteredByName>;
}) {
  const { colors, ui } = useTheme();
  const kinds: ('hole' | 'par' | ScorecardRowKind)[] = ['hole', 'par', ...rows];
  const played = half.cells.some((cell) => cell.strokes != null);
  const numStyle = [styles.num, ui.num, { color: colors.text }];
  const mutedNum = [styles.num, ui.num, { color: colors.muted }];
  const headStyle = [styles.head, { color: colors.muted }];

  const cellValue = (cell: ScorecardCell, kind: ScorecardRowKind) => {
    if (kind === 'strokes') {
      return cell.strokes != null ? (
        <ScoreShape strokes={cell.strokes} par={cell.par} size={SHAPE} />
      ) : (
        <Text style={mutedNum}>—</Text>
      );
    }
    if (kind === 'enteredBy') {
      return (
        <Text style={[styles.initials, { color: colors.muted }]}>
          {enteredBy?.get(cell.holeNumber)?.initials ?? ''}
        </Text>
      );
    }
    const value = kind === 'net' ? cell.net : cell.points;
    return <Text style={value != null ? numStyle : mutedNum}>{value ?? '—'}</Text>;
  };

  const sumValue = (kind: ScorecardRowKind) => {
    if (kind === 'enteredBy') return null;
    const value =
      kind === 'strokes' ? (played ? half.sum.strokes : null) : kind === 'net' ? half.sum.net : half.sum.points;
    return <Text style={[...(value != null ? numStyle : mutedNum), styles.sum]}>{value ?? '—'}</Text>;
  };

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={`scorecard-half-${half.key}`}
    >
      <Text
        style={[ui.sectionTitle, styles.title]}
        accessibilityRole="header"
        accessibilityLabel={HALF_TITLES[half.key].a11y}
      >
        {HALF_TITLES[half.key].title}
      </Text>
      <ScrollView horizontal contentContainerStyle={styles.columns} showsHorizontalScrollIndicator={false}>
        {/* Radetikettene er for øyet; kolonnene sier alt til skjermleseren. */}
        <View
          style={styles.labelColumn}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID={`scorecard-labels-${half.key}`}
        >
          {kinds.map((kind, index) => (
            <Cell key={kind} kind={kind} first={index === 0}>
              <Text style={headStyle} testID={`scorecard-row-label-${kind}`}>
                {ROW_LABELS[kind].toUpperCase()}
              </Text>
            </Cell>
          ))}
        </View>

        {half.cells.map((cell) => (
          <View
            key={cell.holeNumber}
            style={styles.column}
            accessible
            accessibilityLabel={holeLabel(cell, rows, enteredBy)}
            testID={`scorecard-col-${cell.holeNumber}`}
          >
            <Cell kind="hole" first>
              <Text style={[styles.num, ui.num, styles.holeNumber, { color: colors.text }]}>
                {cell.holeNumber}
              </Text>
            </Cell>
            <Cell kind="par" first={false}>
              <Text style={mutedNum}>{cell.par}</Text>
            </Cell>
            {rows.map((kind) => (
              <Cell key={kind} kind={kind} first={false}>
                {cellValue(cell, kind)}
              </Cell>
            ))}
          </View>
        ))}

        <View
          style={[styles.column, { backgroundColor: colors.bg }]}
          accessible
          accessibilityLabel={sumLabel(half, rows)}
          testID={`scorecard-sum-${half.key}`}
        >
          <Cell kind="hole" first>
            <Text style={headStyle}>SUM</Text>
          </Cell>
          <Cell kind="par" first={false}>
            <Text style={[...mutedNum, styles.sum]}>{half.sum.par}</Text>
          </Cell>
          {rows.map((kind) => (
            <Cell key={kind} kind={kind} first={false}>
              {sumValue(kind)}
            </Cell>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Kortene for én runde: ett per halvdel som har hull. `rows` er radene under
 * HULL og PAR, i den rekkefølgen de står.
 */
export function ScorecardGrid({
  grid,
  rows,
  enteredBy,
}: {
  grid: Grid;
  rows: readonly ScorecardRowKind[];
  enteredBy?: ReadonlyMap<number, EnteredByName>;
}) {
  return (
    <View style={styles.halves} testID="scorecard-grid">
      {grid.halves.map((half) => (
        <Half key={half.key} half={half} rows={rows} enteredBy={enteredBy} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  halves: { gap: 12, marginTop: 8 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingBottom: 6,
  },
  title: { marginTop: 8, marginLeft: 4, marginBottom: 2 },
  columns: { flexGrow: 1 },
  labelColumn: { width: LABEL_WIDTH },
  column: { flex: 1, minWidth: MIN_COLUMN },
  cell: { alignItems: 'center', justifyContent: 'center' },
  head: { fontSize: 10, fontFamily: FONTS.sansBold, letterSpacing: 0.4, textAlign: 'center' },
  num: { fontSize: 14, fontFamily: FONTS.sans, textAlign: 'center' },
  holeNumber: { fontFamily: FONTS.sansSemiBold },
  sum: { fontFamily: FONTS.sansBold },
  initials: { fontSize: 11, fontFamily: FONTS.sansMedium, textAlign: 'center' },
});
