// #2262: det klassiske scorekortet, med radene HULL, PAR, SLAG og så POENG
// eller NETTO for UT (1–9) og INN (10–18).
//
// Tallene kommer ferdig regnet fra den delte `buildScorecardGrid`; her tegnes
// de bare. **Kolonner, ikke rader:** hvert hull er én kolonne med cellene
// stablet under hverandre, og radene står på linje fordi hver rad har fast
// høyde. Da kan hver kolonne være ett VoiceOver-element («Hull 3, par 4, 5
// slag, 2 poeng») i stedet for at skjermleseren leser 40 løsrevne tall.
//
// #2385 la kortet på designlerretet (`Scorekort-forslag`), identisk:
// - **Ett kort** med begge halvdelene og summene nederst (`footer`, under en
//   tykk strek), og plass til stempelet over nedre høyre hjørne (`overlay`).
// - Kolonnene er designets: etiketter på 44 pt til venstre, ni hull som deler
//   resten, og en sumkolonne på 38 pt uten tonet bakgrunn.
// - HULL-raden er et bånd i `primary` med `onPrimary`-tall (skog og hvitt i
//   lys drakt; salvie og mørkt i mørk, der skogflaten forsvant mot kortet).
//   Sumkolonnen i båndet heter «UT» og «INN», i designets krem i lys drakt.
// - SLAG står i Fraunces med tonens farge i former på 22 pt; en dobbel form
//   vokser utover (29 pt), som designets ekstra ring. Poeng bedre enn netto
//   par er grønne. Skillelinjene står under PAR og under SLAG, i den varme
//   `divider`.
// - Er skjermen for smal, ruller kortet sidelengs, aldri skjermen.
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ScorecardCell, ScorecardGrid as Grid, ScorecardHalf } from '../../../../../lib/scorecard/scorecardGrid';
import { FONTS, fraunces, useTheme } from '../../theme';
import { ScoreShape, scoreShapeRings } from './ScoreShape';

export type ScorecardRowKind = 'strokes' | 'net' | 'points' | 'enteredBy';

export interface EnteredByName {
  initials: string;
  fullName: string;
}

/** Formene er 22 pt; hver ring til legger 7 pt utenpå (1,5 strek og 2 luft). */
const SHAPE = 22;
const RING_GROWTH = 7;
/** Designets kolonner: etiketter 44, sum 38, og hullene deler resten. */
const LABEL_WIDTH = 44;
const SUM_WIDTH = 38;
const MIN_COLUMN = 26;
/**
 * Radhøydene fra designet: båndet, PAR, SLAG (formene) og tallradene. Designet
 * har streken nederst i PAR og SLAG; her står den øverst i raden under, så den
 * ene punkten er med i høyden til SLAG og radene etter.
 */
const ROW_HEIGHTS: Record<'hole' | 'par' | ScorecardRowKind, number> = {
  hole: 28,
  par: 30,
  strokes: 36,
  net: 31,
  points: 31,
  enteredBy: 31,
};

type CellRole = 'label' | 'data' | 'sum';

/**
 * Luften over innholdet i en celle, som designets polstring: tabellen der er
 * et CSS-rutenett der innholdet står øverst i cellen, ikke midt i. Formene i
 * SLAG har 5 pt, tallene og etikettene 6–8.
 */
function padTop(kind: 'hole' | 'par' | ScorecardRowKind, role: CellRole): number {
  if (kind === 'hole') return 6;
  if (kind === 'strokes') return role === 'data' ? 5 : 8;
  return 7;
}

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

/** Formens ytre mål: 22 pt, og 7 pt til per ekstra ring, men aldri over 29. */
function shapeSize(strokes: number, par: number): number {
  const rings = scoreShapeRings(strokes, par);
  return rings <= 1 ? SHAPE : Math.min(SHAPE + RING_GROWTH, SHAPE + RING_GROWTH * (rings - 1));
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
  role,
  corner,
  children,
}: {
  kind: 'hole' | 'par' | ScorecardRowKind;
  role: CellRole;
  /** Det grønne båndet runder av hjørnet ytterst til venstre og høyre. */
  corner?: 'left' | 'right';
  children: ReactNode;
}) {
  const { colors } = useTheme();
  // Designets skillelinjer står under PAR og under SLAG: altså over radene
  // etter PAR, ikke mellom båndet og PAR.
  const ruled = kind !== 'hole' && kind !== 'par';
  return (
    <View
      style={[
        styles.cell,
        role === 'label' && styles.cellLeft,
        { height: ROW_HEIGHTS[kind], paddingTop: padTop(kind, role) },
        kind === 'hole' ? { backgroundColor: colors.primary } : null,
        corner === 'left' && styles.bandLeft,
        corner === 'right' && styles.bandRight,
        ruled ? { borderTopWidth: 1, borderTopColor: colors.divider } : null,
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
  const { colors, ui, scheme } = useTheme();
  const kinds: ('hole' | 'par' | ScorecardRowKind)[] = ['hole', 'par', ...rows];
  const played = half.cells.some((cell) => cell.strokes != null);
  const numStyle = [styles.num, ui.num, { color: colors.text }];
  const mutedNum = [styles.num, ui.num, { color: colors.muted }];
  const headStyle = [styles.head, { color: colors.muted }];
  const bandHead = [styles.head, { color: colors.onPrimary }];
  // «UT»/«INN» står i krem på skogen, som i designet; i mørk drakt er båndet
  // salvie, og der er kremen for svak, så det følger tallene.
  const halfHead = [
    styles.head,
    styles.halfHead,
    { color: scheme === 'dark' ? colors.onPrimary : colors.onStrongWarm },
  ];
  const bandNum = [styles.num, ui.num, styles.holeNumber, { color: colors.onPrimary }];
  const strokeNum = [styles.strokeNum, ui.num, { color: colors.text }];

  const cellValue = (cell: ScorecardCell, kind: ScorecardRowKind) => {
    if (kind === 'strokes') {
      if (cell.strokes == null) return <Text style={mutedNum}>—</Text>;
      // Uten form står tallet øverst i cellen i sin egen linje (Fraunces 15 på
      // nettleserens `normal`, 19), som i designet, ikke midt i formens 22.
      if (scoreShapeRings(cell.strokes, cell.par) === 0) {
        return <Text style={strokeNum}>{cell.strokes}</Text>;
      }
      const size = shapeSize(cell.strokes, cell.par);
      // Den ekstra ringen vokser utover til alle kanter, også oppover, som i
      // designet: den indre formen står der en enkel form ville stått.
      return (
        <View style={{ marginTop: -(size - SHAPE) / 2 }}>
          <ScoreShape strokes={cell.strokes} par={cell.par} size={size} toned tonedNumber />
        </View>
      );
    }
    if (kind === 'points' && cell.points != null && cell.net != null && cell.net < cell.par) {
      // Bedre enn netto par: poengene står grønne og halvfete, som i designet.
      return (
        <Text
          style={[styles.num, ui.num, styles.strong, { color: colors.scoreUnderFg }]}
          testID={`scorecard-points-good-${cell.holeNumber}`}
        >
          {cell.points}
        </Text>
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
    if (kind === 'strokes' && value != null) return <Text style={strokeNum}>{value}</Text>;
    return <Text style={[...(value != null ? numStyle : mutedNum), styles.sum]}>{value ?? '—'}</Text>;
  };

  return (
    <View testID={`scorecard-half-${half.key}`}>
      {/* Halvdelen har ingen synlig overskrift i designet («UT»/«INN» står i
          båndet); skjermleseren får den her. */}
      <View
        style={styles.a11yHeader}
        accessible
        accessibilityRole="header"
        accessibilityLabel={HALF_TITLES[half.key].a11y}
      />
      <ScrollView horizontal contentContainerStyle={styles.columns} showsHorizontalScrollIndicator={false}>
        {/* Radetikettene er for øyet; kolonnene sier alt til skjermleseren. */}
        <View
          style={styles.labelColumn}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID={`scorecard-labels-${half.key}`}
        >
          {kinds.map((kind, index) => (
            <Cell key={kind} kind={kind} role="label" corner={index === 0 ? 'left' : undefined}>
              {/* Etiketten ligger fritt: «POENG» er litt bredere enn kolonnen,
                  og i designet går den over kanten i stedet for å brytes. */}
              <View style={[styles.labelBox, { top: padTop(kind, 'label') }]}>
                <Text
                  style={kind === 'hole' ? bandHead : headStyle}
                  numberOfLines={1}
                  testID={`scorecard-row-label-${kind}`}
                >
                  {ROW_LABELS[kind].toUpperCase()}
                </Text>
              </View>
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
            <Cell kind="hole" role="data">
              <Text style={bandNum}>{cell.holeNumber}</Text>
            </Cell>
            <Cell kind="par" role="data">
              <Text style={mutedNum}>{cell.par}</Text>
            </Cell>
            {rows.map((kind) => (
              <Cell key={kind} kind={kind} role="data">
                {cellValue(cell, kind)}
              </Cell>
            ))}
          </View>
        ))}

        <View
          style={styles.sumColumn}
          accessible
          accessibilityLabel={sumLabel(half, rows)}
          testID={`scorecard-sum-${half.key}`}
        >
          <Cell kind="hole" role="sum" corner="right">
            <Text style={halfHead}>{HALF_TITLES[half.key].title.toUpperCase()}</Text>
          </Cell>
          <Cell kind="par" role="sum">
            <Text style={[...numStyle, styles.sum]}>{half.sum.par}</Text>
          </Cell>
          {rows.map((kind) => (
            <Cell key={kind} kind={kind} role="sum">
              {sumValue(kind)}
            </Cell>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Scorekortet for én runde: én flate med en tabell per halvdel som har hull.
 * `rows` er radene under HULL og PAR, i den rekkefølgen de står. `footer`
 * (summene) står nederst under en tykk strek, og `overlay` (stempelet) ligger
 * over nedre høyre hjørne.
 */
export function ScorecardGrid({
  grid,
  rows,
  enteredBy,
  footer,
  overlay,
}: {
  grid: Grid;
  rows: readonly ScorecardRowKind[];
  enteredBy?: ReadonlyMap<number, EnteredByName>;
  footer?: ReactNode;
  overlay?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="scorecard-grid"
    >
      {grid.halves.map((half) => (
        <Half key={half.key} half={half} rows={rows} enteredBy={enteredBy} />
      ))}
      {footer ? (
        <View style={[styles.footer, { borderTopColor: colors.primary }]} testID="scorecard-footer">
          {footer}
        </View>
      ) : null}
      {overlay ? (
        <View style={styles.overlay} pointerEvents="box-none">
          {overlay}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Designet: kortet står 12 pt fra kanten (skjermens padding er 20).
  card: {
    marginHorizontal: -8,
    marginTop: 4,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 12,
  },
  a11yHeader: { width: 1, height: 1, position: 'absolute' },
  columns: { flexGrow: 1 },
  labelColumn: { width: LABEL_WIDTH },
  column: { flex: 1, minWidth: MIN_COLUMN },
  sumColumn: { width: SUM_WIDTH },
  cell: { alignItems: 'center', justifyContent: 'flex-start' },
  cellLeft: { alignItems: 'flex-start' },
  bandLeft: { borderTopLeftRadius: 6 },
  bandRight: { borderTopRightRadius: 6 },
  head: { fontSize: 10, fontFamily: FONTS.sansSemiBold, letterSpacing: 1 },
  labelBox: { position: 'absolute', left: 6 },
  halfHead: { letterSpacing: 0.8 },
  num: { fontSize: 13, fontFamily: FONTS.sans, textAlign: 'center' },
  holeNumber: { fontFamily: FONTS.sansSemiBold },
  strokeNum: { ...fraunces(600, 15), textAlign: 'center' },
  strong: { fontFamily: FONTS.sansSemiBold },
  sum: { fontFamily: FONTS.sansSemiBold },
  footer: { borderTopWidth: 2, paddingTop: 10, paddingHorizontal: 6, paddingBottom: 2 },
  // Stempelet står 18 pt fra høyre og stikker 34 pt ned under kortet.
  overlay: { position: 'absolute', right: 18, bottom: -34 },
  initials: { fontSize: 11, fontFamily: FONTS.sansMedium, textAlign: 'center' },
});
