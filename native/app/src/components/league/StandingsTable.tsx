// #2638 Del 2: sesongtabellen på ligasiden (tegning 3).
//
// Tabellen regnes på serveren (`computeLeagueStandings` via
// `GET /api/liga/[id]`); appen regner den aldri selv. Tallene skrives med den
// delte regelen i `lib/league/standingsFormat.ts`, som nettets tabell også
// bruker: poeng i stableford, slag mot par i slagspill.
//
// Tegningens rad: plass, spiller, sesongverdien og én kolonne per runde som
// har åpnet («–» for ikke spilt). Lederen har gull plass og gull tall, og din
// egen rad er grønn. Fra fire runder er det ikke plass i bredden: da ruller
// rundekolonnene til siden, som tabellen på nettsiden.
//
// #1378: den åpne runden er tonet og har en prikk. De som ikke er rangert,
// står under egne overskrifter med tom plass-celle, uten demping og uten
// forklaringstekst.
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AppLeagueView } from '../../../../../lib/league/appLeagueView';
import {
  formatRoundCell,
  formatSeasonValue,
  roundCellValue,
  splitStandings,
  tableRounds,
  type FormatDecimal,
} from '../../../../../lib/league/standingsFormat';
import {
  LEAGUE_TEXT,
  isPointsBased,
  participantLabel,
  tableCaption,
  valueHeader,
} from '../../lib/leagueCopy';
import { FONTS, fraunces, interLine, useTheme } from '../../theme';

/** Appens desimaltegn: komma. */
const comma: FormatDecimal = (value, decimals) => value.toFixed(decimals).replace('.', ',');

/** Tegningens kolonner: plass 30, sesongverdi 54, runde 36, 4 mellom. */
const RANK_W = 30;
const SUM_W = 54;
const ROUND_W = 36;
const GAP = 4;
/** Så mange runder får plass i bredden ved siden av navnet. */
const FIT_ROUNDS = 3;
/** Navnekolonnen når rundene ruller. */
const NAME_W_SCROLL = 110;

export function StandingsTable({ view, now }: { view: AppLeagueView; now: Date }) {
  const { colors } = useTheme();
  const { league, participants, standings, me } = view;
  const { shown: rounds, openRoundId } = tableRounds(view.rounds, now.getTime());
  const pointsBased = isPointsBased(league.format);
  const byId = new Map(participants.map((p) => [p.userId, p]));
  const { ranked, notRanked, notRankedYet } = splitStandings(standings);
  type Entry =
    | { kind: 'group'; key: string; label: string }
    | { kind: 'row'; row: (typeof standings)[number] };
  const entries: Entry[] = [
    ...ranked.map((row): Entry => ({ kind: 'row', row })),
    ...(notRanked.length > 0
      ? [{ kind: 'group', key: 'notRanked', label: LEAGUE_TEXT.groupNotRanked } as Entry]
      : []),
    ...notRanked.map((row): Entry => ({ kind: 'row', row })),
    ...(notRankedYet.length > 0
      ? [{ kind: 'group', key: 'notRankedYet', label: LEAGUE_TEXT.groupNotRankedYet } as Entry]
      : []),
    ...notRankedYet.map((row): Entry => ({ kind: 'row', row })),
  ];
  const scroll = rounds.length > FIT_ROUNDS;

  const card = { backgroundColor: colors.surface, borderColor: colors.border };
  if (standings.length === 0) {
    return (
      <View style={[styles.card, card]} testID="league-standings">
        <Text style={[styles.empty, { color: colors.muted }]} testID="league-standings-empty">
          {LEAGUE_TEXT.standingsEmpty}
        </Text>
      </View>
    );
  }

  const nameStyle = scroll ? { width: NAME_W_SCROLL } : styles.nameFlex;
  const head = (
    <View style={[styles.row, styles.headRow, styles.stretch]}>
      <Text style={[styles.head, styles.rank, styles.centered, { color: colors.muted }]}>{LEAGUE_TEXT.colRank}</Text>
      <Text style={[styles.head, styles.centered, nameStyle, { color: colors.muted }]}>{LEAGUE_TEXT.colPlayer}</Text>
      <Text style={[styles.head, styles.sumCol, styles.right, styles.centered, { color: colors.muted }]}>
        {valueHeader(league.standingsModel, league.bestN)}
      </Text>
      {rounds.map((r) => {
        const open = r.id === openRoundId;
        return (
          <View
            key={r.id}
            style={[styles.roundCol, styles.roundHead, open ? { backgroundColor: colors.primarySoft } : null]}
            testID={open ? 'league-standings-open-col' : undefined}
          >
            {open ? <View style={[styles.dot, { backgroundColor: colors.live }]} /> : null}
            <Text style={[styles.head, { color: colors.muted }]}>R{r.sequence}</Text>
          </View>
        );
      })}
    </View>
  );

  const rows = entries.map((entry, index) => {
    if (entry.kind === 'group') {
      return (
        <View key={`group-${entry.key}`} style={styles.group} testID={`league-standings-group-${entry.key}`}>
          <Text style={[styles.head, { color: colors.muted }]}>{entry.label}</Text>
        </View>
      );
    }
    const { row } = entry;
    const you = row.userId === me.userId;
    const lead = row.rank === 1;
    const next = entries[index + 1];
    // Ingen strek over en overskrift (den tegner sin egen avstand), under siste rad,
    // eller over din egen rad: den grønne rammen er streken.
    const lineBelow = next?.kind === 'row' && next.row.userId !== me.userId;
    return (
      <View
        key={row.userId}
        style={[
          styles.row,
          styles.bodyRow,
          styles.stretch,
          you
            ? [styles.youRow, { backgroundColor: colors.youFill, borderColor: colors.youBorder }]
            : lineBelow
              ? { borderBottomWidth: 1, borderBottomColor: colors.divider }
              : null,
        ]}
        testID={you ? 'league-standings-you' : `league-standings-row-${row.userId}`}
      >
        <View style={[styles.rank, styles.centered]}>
          {lead ? (
            <View style={[styles.gold, { backgroundColor: colors.accent }]}>
              <Text style={[styles.goldText, { color: colors.onAccent }]}>1</Text>
            </View>
          ) : (
            <Text style={[styles.rankText, { color: colors.text }]}>
              {row.ranked && row.rank !== null ? row.rank : ''}
            </Text>
          )}
        </View>
        <Text style={[styles.name, styles.centered, nameStyle, { color: colors.text }]} numberOfLines={1}>
          {participantLabel(byId.get(row.userId), participants)}
        </Text>
        <Text
          style={[
            styles.sum,
            styles.sumCol,
            styles.centered,
            { color: lead ? colors.accentText : row.ranked ? colors.text : colors.muted },
          ]}
          testID={`league-standings-value-${row.userId}`}
        >
          {formatSeasonValue(row.value, league.standingsModel, pointsBased, comma)}
        </Text>
        {rounds.map((r) => {
          const raw = roundCellValue(
            row.perRound.find((c) => c.roundId === r.id),
            league.standingsModel,
          );
          // Din egen rad har den grønne rammen som markør, så den har ingen tone.
          const tone = r.id === openRoundId && !you ? colors.primarySoft : 'transparent';
          return (
            <View
              key={r.id}
              style={[styles.roundCol, styles.roundCell, { backgroundColor: tone }]}
              testID={r.id === openRoundId ? `league-standings-open-cell-${row.userId}` : undefined}
            >
              <Text style={[styles.cell, { color: raw === null ? colors.scoreUnsetFg : colors.text }]}>
                {raw === null ? '–' : formatRoundCell(raw, league.standingsModel, pointsBased, comma)}
              </Text>
            </View>
          );
        })}
      </View>
    );
  });

  const table = (
    <View>
      {head}
      {rows}
    </View>
  );

  return (
    <View style={[styles.card, card]} testID="league-standings">
      <Text style={[styles.caption, { color: colors.muted }]} testID="league-standings-caption">
        {tableCaption(league)}
      </Text>
      {scroll ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="league-standings-scroll">
          {table}
        </ScrollView>
      ) : (
        table
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // `.card.tbl`: 16 fra kanten, 6 under radene.
  card: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, paddingBottom: 6, overflow: 'hidden' },
  caption: { ...interLine(12, 16), fontFamily: FONTS.sans, paddingTop: 12, paddingBottom: 4, paddingHorizontal: 16 },
  empty: { ...interLine(14, 20), fontFamily: FONTS.sans, textAlign: 'center', padding: 16 },
  // `.trow`: rutenettet 30 · 1fr · 54 · 36 per runde, 4 mellom, 10 inn.
  row: { flexDirection: 'row', alignItems: 'center', gap: GAP, paddingHorizontal: 10 },
  headRow: { minHeight: 30 },
  bodyRow: { minHeight: 48 },
  // `.trow.you`: 6 fra kortkanten, 4 inn, 12 i hjørnene, 1 pt grønn ramme.
  youRow: { marginHorizontal: 6, paddingHorizontal: 3, borderRadius: 12, borderWidth: 1 },
  head: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  right: { textAlign: 'right' },
  // `align-items: stretch` i tegningen: den tonede kolonnen fyller hele radhøyden.
  stretch: { alignItems: 'stretch' },
  centered: { alignSelf: 'center' },
  rank: { width: RANK_W, alignItems: 'center' },
  rankText: { ...fraunces(600, 18, 22), textAlign: 'center' },
  gold: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  goldText: { ...fraunces(600, 14, 22) },
  nameFlex: { flex: 1, minWidth: 0 },
  name: { ...interLine(15, 20), fontFamily: FONTS.sansSemiBold },
  sumCol: { width: SUM_W },
  sum: { ...fraunces(600, 18, 22), textAlign: 'right', fontVariant: ['tabular-nums'] },
  roundCol: { width: ROUND_W },
  // `.rhead`: 4 inn fra høyre, prikk 5 foran «R3», 8 i de to øvre hjørnene.
  roundHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
    paddingRight: 4,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  roundCell: { justifyContent: 'center', alignItems: 'flex-end', paddingRight: 4 },
  cell: { ...interLine(13, 18), fontFamily: FONTS.sans, textAlign: 'right', fontVariant: ['tabular-nums'] },
  // Gruppeoverskriften: 14 over, 6 under, 16 inn.
  group: { paddingTop: 14, paddingBottom: 6, paddingHorizontal: 16 },
});
