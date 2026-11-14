// #2317: skinspotten i appen, samme tegning som nettets `SkinsPotHero`,
// `SkinsCoinGrid` og stillingen i `SkinsView`. Hvor potten står og hva hver
// mynt viser, regner den delte `lib/leaderboard/skinsPot.ts` ut; teksten bor i
// `leaderboardModel.ts`. Ingen animasjon.
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Ellipse, G, Rect } from 'react-native-svg';
import { nameInitials } from '../../../../../lib/names/initials';
import {
  ACCENT_ON_STRONG,
  CHAMP,
  CHAMP_DARK,
  MEDAL_INK,
} from '../../../../../lib/og/palette';
import {
  coinRows,
  coinState,
  type CoinState,
  type SkinsPotNow,
} from '../../../../../lib/leaderboard/skinsPot';
import type { SkinsHoleRow, SkinsPlayerLine } from '../../../../../lib/scoring/modes/types';
import {
  skinsCoinLabel,
  skinsCount,
  skinsHolesWon,
  skinsPotLines,
} from '../../lib/leaderboardModel';
import { BOARD_TEAM_TEXT } from '../../lib/boardCopy';
import { FONTS, fraunces, interLine, useTheme, winCoin, withAlpha } from '../../theme';

/**
 * Det skoggrønne kortet øverst mens runden pågår. Kickeren har ikke spillnavnet
 * som på nettet: skjermtittelen rett over sier det alt, og appen skriver ikke
 * navnet to ganger.
 */
export function SkinsPotHero({
  scoring,
  pot,
}: {
  scoring: 'gross' | 'net';
  pot: SkinsPotNow;
}) {
  const { colors } = useTheme();
  const { headline, lines } = skinsPotLines(pot);
  const kicker = `Skins · ${scoring === 'net' ? 'Netto' : 'Brutto'}`;
  const ink = colors.onStrongWarm;
  const soft = withAlpha(ink, 0.8);
  return (
    <View style={[styles.hero, { backgroundColor: colors.surfaceStrong }]} testID="skins-pot-hero">
      <View style={styles.heroKicker}>
        <Text style={[styles.kicker, styles.grow, { color: soft }]} numberOfLines={1}>
          {kicker}
        </Text>
        <Text style={[styles.kicker, { color: ink }]}>Live</Text>
      </View>
      <View style={styles.heroBody}>
        <CoinStack />
        <View style={styles.grow} accessible accessibilityRole="header">
          {pot.kind === 'pending' ? (
            <>
              <Text style={[styles.amount, { color: ink }]}>{headline}</Text>
              <View style={styles.gap4}>
                <Text style={[styles.onHole, { color: ink }]}>{lines[0]}</Text>
              </View>
              {lines.slice(1).map((line) => (
                <View key={line} style={styles.gap2}>
                  <Text style={[styles.note, { color: soft }]}>{line}</Text>
                </View>
              ))}
            </>
          ) : (
            <>
              <Text style={[styles.settled, { color: ink }]}>{headline}</Text>
              {lines.map((line) => (
                <View key={line} style={styles.gap4}>
                  <Text style={[styles.note, { color: soft }]}>{line}</Text>
                </View>
              ))}
            </>
          )}
        </View>
      </View>
    </View>
  );
}

/**
 * Tegningens stabel med tre mynter (74 × 64). Kantene er champagne med et
 * mørkere lag over, flatene gullet som leses på skoggrønt, og toppmynten får
 * et lint skjær.
 */
function CoinStack() {
  const { colors } = useTheme();
  const rims = (fill: string, opacity = 1) => (
    <G fill={fill} fillOpacity={opacity}>
      {[54, 40, 26].map((cy) => (
        <G key={cy}>
          <Ellipse cx={37} cy={cy} rx={26} ry={7} />
          <Rect x={11} y={cy - 7} width={52} height={7} />
        </G>
      ))}
    </G>
  );
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={74} height={64}>
        {rims(CHAMP)}
        {rims(CHAMP_DARK, 0.3)}
        {[47, 33, 19].map((cy) => (
          <Ellipse key={cy} cx={37} cy={cy} rx={26} ry={7} fill={ACCENT_ON_STRONG} />
        ))}
        <Ellipse cx={37} cy={19} rx={26} ry={7} fill={colors.onStrongWarm} fillOpacity={0.3} />
      </Svg>
    </View>
  );
}

/** «Hull for hull»: én mynt per hull, ni på rad. */
export function SkinsCoinGrid({
  holes,
  currentHoleNumber,
  nameOf,
}: {
  holes: SkinsHoleRow[];
  /** Hullet potten står på, eller null når ingen pott står på spill. */
  currentHoleNumber: number | null;
  nameOf: (userId: string) => string;
}) {
  const { colors } = useTheme();
  return (
    <View testID="skins-coins">
      <Text style={[styles.section, { color: colors.muted }]} accessibilityRole="header">
        Hull for hull
      </Text>
      <View style={[styles.card, styles.coinCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {coinRows(holes).map((row, r) => (
          <View key={row[0].holeNumber} style={[styles.coinRow, r > 0 && styles.coinRowGap]}>
            {row.map((hole) => (
              <Coin
                key={hole.holeNumber}
                hole={hole}
                state={coinState(hole, currentHoleNumber)}
                nameOf={nameOf}
              />
            ))}
          </View>
        ))}
        <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={[styles.legendText, { color: colors.muted }]}>Initialer: vant hullet</Text>
          <Text style={[styles.legendText, { color: colors.muted }]}>
            <Text style={styles.arrow}>→</Text> delt, ruller videre
          </Text>
          <Text style={[styles.legendText, { color: colors.muted }]}>Gullring: potten</Text>
        </View>
      </View>
    </View>
  );
}

function Coin({
  hole,
  state,
  nameOf,
}: {
  hole: SkinsHoleRow;
  state: CoinState;
  nameOf: (userId: string) => string;
}) {
  const { colors, scheme } = useTheme();
  const won = state === 'won' || state === 'potWon';
  const winner = won && hole.winnerUserId ? nameOf(hole.winnerUserId) : null;
  const count = won ? hole.skinsAwarded : hole.atStake;
  const numberColor =
    state === 'current' ? colors.text : state === 'future' ? colors.scoreUnsetFg : colors.muted;

  let coinStyle;
  let face = null;
  if (won) {
    // #2755: vinnermynten fra temaet, salvie om natten.
    const coin = winCoin(colors, scheme);
    coinStyle = [
      { backgroundColor: coin.fill },
      state === 'potWon' && {
        boxShadow: `0 0 0 2px ${colors.surface}, 0 0 0 3.5px ${colors.accent}`,
      },
    ];
    face = <Text style={[styles.initials, { color: coin.ink }]}>{nameInitials(winner)}</Text>;
  } else if (state === 'carried') {
    coinStyle = [styles.dashed, { borderColor: colors.scoreUnsetFg }];
    face = <Text style={[styles.arrow, { color: colors.muted }]}>→</Text>;
  } else if (state === 'current') {
    coinStyle = { backgroundColor: ACCENT_ON_STRONG };
    face = <Text style={[styles.atStake, { color: MEDAL_INK }]}>{hole.atStake}</Text>;
  } else {
    coinStyle = { backgroundColor: colors.trackBg };
  }

  return (
    <View
      style={styles.cell}
      accessible
      accessibilityLabel={skinsCoinLabel(state, hole.holeNumber, count, winner)}
      testID={`skins-coin-${hole.holeNumber}`}
    >
      <Text style={[styles.holeNumber, { color: numberColor }, state === 'current' && styles.semibold]}>
        {hole.holeNumber}
      </Text>
      <View style={[styles.coin, coinStyle]} testID={`skins-coin-${hole.holeNumber}-${state}`}>
        {face}
      </View>
    </View>
  );
}

/**
 * «Stillingen»: navn, hull vunnet og skins, uten plass, medaljer og reaksjoner.
 * Seerens egen rad heter «Deg», med lagtavlas tekst, som på tegningen og nettet.
 */
export function SkinsStanding({
  players,
  nameOf,
  viewerUserId = null,
}: {
  players: SkinsPlayerLine[];
  nameOf: (userId: string) => string;
  viewerUserId?: string | null;
}) {
  const { colors } = useTheme();
  return (
    <View>
      <Text style={[styles.section, { color: colors.muted }]} accessibilityRole="header">
        Stillingen
      </Text>
      <View
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        testID="skins-standing"
      >
        {players.map((player, i) => {
          const holes = skinsHolesWon(player.holesWon);
          const name =
            viewerUserId != null && player.userId === viewerUserId
              ? BOARD_TEAM_TEXT.you
              : nameOf(player.userId);
          const skins = skinsCount(player.totalSkins);
          return (
            <View
              key={player.userId}
              style={[
                styles.row,
                i < players.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
              ]}
              accessible
              accessibilityLabel={`${name}, ${holes.label}, ${skins}`}
              testID={`skins-standing-${player.userId}`}
            >
              <Text style={[styles.name, styles.grow, { color: colors.text }]} numberOfLines={1}>
                {name}
              </Text>
              <Text style={[styles.holes, { color: colors.muted }]}>{holes.shown}</Text>
              <Text style={[styles.skins, { color: colors.text }]}>{skins}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  hero: { borderRadius: 16, paddingTop: 18, paddingHorizontal: 20, paddingBottom: 20 },
  heroKicker: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kicker: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14 },
  amount: { ...fraunces(600, 34, 34), fontVariant: ['tabular-nums'] },
  onHole: { ...interLine(14, 17), fontFamily: FONTS.sans },
  note: { ...interLine(12, 15), fontFamily: FONTS.sans },
  settled: { ...fraunces(600, 22, 24) },
  gap4: { marginTop: 4 },
  gap2: { marginTop: 2 },
  section: {
    ...interLine(12, 15),
    fontFamily: FONTS.sansSemiBold,
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 4,
  },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  coinCard: { paddingVertical: 12, paddingHorizontal: 10 },
  coinRow: { flexDirection: 'row', gap: 4 },
  coinRowGap: { marginTop: 10 },
  cell: { flex: 1, alignItems: 'center' },
  holeNumber: { ...interLine(10, 12), fontFamily: FONTS.sans },
  semibold: { fontFamily: FONTS.sansSemiBold },
  coin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginTop: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashed: { borderWidth: 1.5, borderStyle: 'dashed' },
  initials: { ...interLine(9, 11), fontFamily: FONTS.sansSemiBold },
  // Inter har ikke pila; tegningen faller tilbake til systemskriften.
  arrow: { fontFamily: FONTS.system, fontSize: 12 },
  atStake: { ...fraunces(600, 13, 16) },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 14,
    rowGap: 4,
    marginTop: 12,
  },
  legendText: { ...interLine(11, 13), fontFamily: FONTS.sans },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14 },
  name: { ...interLine(15, 18), fontFamily: FONTS.sansSemiBold },
  holes: { ...interLine(12, 15), fontFamily: FONTS.sans },
  skins: { ...fraunces(600, 20, 24), minWidth: 64, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
