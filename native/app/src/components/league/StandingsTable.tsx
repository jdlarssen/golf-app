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
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AppLeagueView } from '../../../../../lib/league/appLeagueView';
import {
  formatRoundCell,
  formatSeasonValue,
  roundCellValue,
  type FormatDecimal,
} from '../../../../../lib/league/standingsFormat';
import {
  LEAGUE_TEXT,
  isPointsBased,
  participantLabel,
  roundWindow,
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
  const rounds = [...view.rounds]
    .sort((a, b) => a.sequence - b.sequence)
    .filter((r) => roundWindow(r, now) !== 'upcoming');
  const pointsBased = isPointsBased(league.format);
  const byId = new Map(participants.map((p) => [p.userId, p]));
  const ordered = [...standings.filter((r) => r.ranked), ...standings.filter((r) => !r.ranked)];
  const scroll = rounds.length > FIT_ROUNDS;

  const card = { backgroundColor: colors.surface, borderColor: colors.border };
  if (ordered.length === 0) {
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
    <View style={[styles.row, styles.headRow]}>
      <Text style={[styles.head, styles.rank, { color: colors.muted }]}>{LEAGUE_TEXT.colRank}</Text>
      <Text style={[styles.head, nameStyle, { color: colors.muted }]}>{LEAGUE_TEXT.colPlayer}</Text>
      <Text style={[styles.head, styles.sumCol, styles.right, { color: colors.muted }]}>
        {valueHeader(league.standingsModel, league.bestN)}
      </Text>
      {rounds.map((r) => (
        <Text key={r.id} style={[styles.head, styles.roundCol, styles.right, { color: colors.muted }]}>
          R{r.sequence}
        </Text>
      ))}
    </View>
  );

  const rows = ordered.map((row, index) => {
    const you = row.userId === me.userId;
    const lead = row.rank === 1;
    const last = index === ordered.length - 1;
    // Raden over din egen har ingen strek: den grønne rammen er streken.
    const nextIsYou = ordered[index + 1]?.userId === me.userId;
    return (
      <View
        key={row.userId}
        style={[
          styles.row,
          styles.bodyRow,
          you
            ? [styles.youRow, { backgroundColor: colors.youFill, borderColor: colors.youBorder }]
            : !last && !nextIsYou
              ? { borderBottomWidth: 1, borderBottomColor: colors.divider }
              : null,
        ]}
        testID={you ? 'league-standings-you' : `league-standings-row-${row.userId}`}
      >
        <View style={styles.rank}>
          {lead ? (
            <View style={[styles.gold, { backgroundColor: colors.accent }]}>
              <Text style={[styles.goldText, { color: colors.onAccent }]}>1</Text>
            </View>
          ) : (
            <Text style={[styles.rankText, { color: colors.text }]}>
              {row.ranked && row.rank !== null ? row.rank : '–'}
            </Text>
          )}
        </View>
        <Text style={[styles.name, nameStyle, { color: colors.text }]} numberOfLines={1}>
          {participantLabel(byId.get(row.userId), participants)}
        </Text>
        <Text
          style={[styles.sum, styles.sumCol, { color: lead ? colors.accentText : colors.text }]}
          testID={`league-standings-value-${row.userId}`}
        >
          {formatSeasonValue(row.value, league.standingsModel, pointsBased, comma)}
        </Text>
        {rounds.map((r) => {
          const raw = roundCellValue(
            row.perRound.find((c) => c.roundId === r.id),
            league.standingsModel,
          );
          return (
            <Text
              key={r.id}
              style={[styles.cell, styles.roundCol, { color: raw === null ? colors.scoreUnsetFg : colors.text }]}
            >
              {raw === null ? '–' : formatRoundCell(raw, league.standingsModel, pointsBased, comma)}
            </Text>
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
  rank: { width: RANK_W, alignItems: 'center' },
  rankText: { ...fraunces(600, 18, 22), textAlign: 'center' },
  gold: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  goldText: { ...fraunces(600, 14, 22) },
  nameFlex: { flex: 1, minWidth: 0 },
  name: { ...interLine(15, 20), fontFamily: FONTS.sansSemiBold },
  sumCol: { width: SUM_W },
  sum: { ...fraunces(600, 18, 22), textAlign: 'right', fontVariant: ['tabular-nums'] },
  roundCol: { width: ROUND_W },
  cell: { ...interLine(13, 18), fontFamily: FONTS.sans, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
