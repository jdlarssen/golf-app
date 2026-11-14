// #2755: «Hull for hull» for Nassau, etter tegningen B3 (`Nassau-hull-B3-lys`,
// `-natt` og `-320-lys`).
//
// Ren presentasjon av `NassauHoleCards` (`lib/leaderboard/nassauHoles.ts`):
// tegnforklaringen, ett kort per kamp med vinneren, myntene og gullstreken fra
// hullet vinneren ble alene i ledelsen, og hullkortet under. Et trykk på en
// mynt eller på pilene bytter hull; kortet åpner på `startHoleNumber`.
//
// Navnene: initialer i myntene, fornavnet i kamplinja og stillingen (brekker
// heller enn å kortes), fullt navn i hullkortet. Den som ser på er «Du» i
// mynten og «Deg» ellers.
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { NassauSectionKey } from '../../../../../lib/leaderboard/nassauBoard';
import type {
  NassauHoleCard,
  NassauHoleCards,
  NassauMatch,
  NassauStanding,
} from '../../../../../lib/leaderboard/nassauHoles';
import { nameInitials } from '../../../../../lib/names/initials';
import type { BundlePlayer } from '../../data/gameBundle';
import {
  HOLES_TEXT,
  NASSAU_HOLES_TEXT,
  holeNumberLabel,
  nassauAloneFromLabel,
  nassauCoinLabel,
  nassauLeadLabel,
  parSiChip,
} from '../../lib/holesCopy';
import { nameLookup, shortNameLookup } from '../../lib/leaderboardModel';
import { NASSAU_BOARD_TEXT, NASSAU_CARD_KICKER } from '../../lib/nassauBoardCopy';
import { FONTS, fraunces, interLine, TAP, useTheme, winCoin } from '../../theme';
import { ChevronIcon, TilbakeIcon } from '../icons/Icons';
import { HolesFooter } from './holesShared';

/** Navnene skjermen bruker, med den som ser på som «Du»/«Deg». */
type Names = {
  initials: (userId: string) => string;
  /** Fornavnet, eller «Deg». */
  short: (userId: string) => string;
  /** Fullt navn, eller «Deg». */
  full: (userId: string) => string;
  /** I skjermleserens setning om mynten: fornavnet, eller «Du». */
  spoken: (userId: string) => string;
  isViewer: (userId: string) => boolean;
};

/** Myntene på 320 pt (`Nassau-hull-B3-320-lys`): 25 i stedet for 28, med 3 mellom. */
const COMPACT_WIDTH = 360;

export function NassauHoleCardsView({
  cards,
  subtitle,
  players,
  viewerUserId,
  finished,
}: {
  cards: NassauHoleCards;
  subtitle: string;
  players: readonly BundlePlayer[];
  viewerUserId: string | null;
  /** Runden er ferdig: bunnteksten sier «Vel spilt». */
  finished: boolean;
}) {
  const [selected, setSelected] = useState(cards.startHoleNumber);
  const { width } = useWindowDimensions();
  const coin = width < COMPACT_WIDTH ? { size: 25, gap: 3 } : { size: 28, gap: 4 };
  const fullOf = nameLookup(players);
  const shortOf = shortNameLookup(players);
  const isViewer = (userId: string) => viewerUserId !== null && userId === viewerUserId;
  const names: Names = {
    initials: (id) => (isViewer(id) ? NASSAU_HOLES_TEXT.youInitials : nameInitials(fullOf(id))),
    short: (id) => (isViewer(id) ? NASSAU_BOARD_TEXT.you : shortOf(id)),
    full: (id) => (isViewer(id) ? NASSAU_BOARD_TEXT.you : fullOf(id)),
    spoken: (id) => (isViewer(id) ? NASSAU_HOLES_TEXT.youInitials : shortOf(id)),
    isViewer,
  };
  const hole = cards.holes.find((h) => h.holeNumber === selected) ?? cards.holes[0];
  const index = hole ? cards.holes.indexOf(hole) : -1;

  return (
    <View style={styles.page} testID="hole-by-hole">
      <View style={styles.inset}>
        <Title subtitle={subtitle} />
        <Legend />
      </View>
      {(['front9', 'back9'] as const).map((key) => (
        <View key={key} style={styles.cardGap}>
          <MatchCard match={cards.matches[key]} names={names}>
            <CoinRow
              holes={cards.holes.filter((h) => h.section === key)}
              aloneFrom={cards.matches[key].aloneFrom}
              selected={hole?.holeNumber ?? null}
              onSelect={setSelected}
              coin={coin}
              names={names}
            />
          </MatchCard>
        </View>
      ))}
      <View style={styles.cardGap}>
        <MatchCard match={cards.matches.total18} names={names}>
          <TotalStripe holes={cards.holes} aloneFrom={cards.matches.total18.aloneFrom} />
        </MatchCard>
      </View>
      {hole ? (
        <HoleCard
          hole={hole}
          prev={cards.holes[index - 1]?.holeNumber ?? null}
          next={cards.holes[index + 1]?.holeNumber ?? null}
          onSelect={setSelected}
          names={names}
        />
      ) : null}
      <View style={styles.footer}>
        <HolesFooter finished={finished} />
      </View>
    </View>
  );
}

/**
 * «Hull for hull» og «Nassau · Netto» med B3s mål (28/31 og 13 pt), ikke den
 * delte `HolesTitle` (28/34 og 14 pt) som de eldre hullskjermene har.
 */
function Title({ subtitle }: { subtitle: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.titleBlock}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        {HOLES_TEXT.heading}
      </Text>
      <View style={styles.subtitleGap}>
        <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

/** «Vant hullet», «Delt» og «Alene i ledelsen ut kampen». Myntene sier det samme til skjermleseren. */
function Legend() {
  const { colors, scheme } = useTheme();
  const won = winCoin(colors, scheme);
  return (
    <View
      style={styles.legend}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="nassau-legend"
    >
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: won.fill }]} />
        <Text style={[styles.legendText, { color: colors.muted }]}>{NASSAU_HOLES_TEXT.legendWon}</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, styles.dashed, { borderColor: colors.scoreUnsetFg }]} />
        <Text style={[styles.legendText, { color: colors.muted }]}>{NASSAU_HOLES_TEXT.legendTied}</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendBar, { backgroundColor: colors.accent }]} />
        <Text style={[styles.legendText, { color: colors.muted }]}>{NASSAU_HOLES_TEXT.legendAlone}</Text>
      </View>
    </View>
  );
}

/**
 * Kortet for én kamp: kamplinja (kampen, vinnerens mynt, fornavnet og summen),
 * så myntene eller stripa, og «Alene i ledelsen fra hull N» under gullstreken.
 * En delt kamp har den stiplede «=»-mynten og «Delt»; ingen vinner har bare
 * «Ingen vinner». Uten et hull vinneren var alene fra (delt, tilbaketelling)
 * står det ingen linje under.
 */
function MatchCard({
  match,
  names,
  children,
}: {
  match: NassauMatch;
  names: Names;
  children: ReactNode;
}) {
  const { colors, scheme } = useTheme();
  const won = winCoin(colors, scheme);
  const winner = match.outcome === 'won' ? match.winnerUserIds[0] : null;
  const name =
    winner !== null
      ? names.short(winner)
      : match.outcome === 'tied'
        ? NASSAU_BOARD_TEXT.pushed
        : NASSAU_BOARD_TEXT.noWinner;
  const kicker = NASSAU_CARD_KICKER[match.key];
  const sum = match.outcome === 'none' ? null : (match.headline?.text ?? null);
  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={`nassau-match-${match.key}`}
    >
      <View
        style={styles.matchLine}
        accessible
        accessibilityLabel={[kicker, name, sum].filter(Boolean).join(', ')}
        testID={`nassau-match-${match.key}-line`}
      >
        <Text style={[styles.matchLabel, { color: colors.muted }]}>{kicker}</Text>
        {winner !== null ? (
          <View style={[styles.matchCoin, { backgroundColor: won.fill }]} testID={`nassau-match-${match.key}-coin`}>
            <Text style={[styles.initials, { color: won.ink }]}>{names.initials(winner)}</Text>
          </View>
        ) : match.outcome === 'tied' ? (
          <View
            style={[styles.matchCoin, styles.dashed, { borderColor: colors.scoreUnsetFg }]}
            testID={`nassau-match-${match.key}-coin`}
          >
            <Text style={[styles.equals, { color: colors.muted }]}>=</Text>
          </View>
        ) : null}
        <Text style={[styles.matchName, { color: colors.text }]} testID={`nassau-match-${match.key}-name`}>
          {name}
        </Text>
        {sum !== null ? (
          <Text style={[styles.matchSum, { color: colors.text }]} testID={`nassau-match-${match.key}-sum`}>
            {sum}
          </Text>
        ) : null}
      </View>
      {children}
      {match.aloneFrom !== null ? (
        <View style={styles.aloneLine}>
          <Text style={[styles.aloneText, { color: colors.accentText }]} testID={`nassau-match-${match.key}-alone`}>
            {nassauAloneFromLabel(match.aloneFrom)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Ni mynter med hullnummeret over, og gullstreken under fra `aloneFrom` ut kampen. */
function CoinRow({
  holes,
  aloneFrom,
  selected,
  onSelect,
  coin,
  names,
}: {
  holes: NassauHoleCard[];
  aloneFrom: number | null;
  selected: number | null;
  onSelect: (holeNumber: number) => void;
  coin: { size: number; gap: number };
  names: Names;
}) {
  const { colors, scheme } = useTheme();
  const won = winCoin(colors, scheme);
  const from = aloneFrom === null ? -1 : holes.findIndex((h) => h.holeNumber === aloneFrom);
  return (
    <View style={styles.coinBlock}>
      <View style={[styles.grid, { gap: coin.gap }]}>
        {holes.map((h) => {
          const isSelected = h.holeNumber === selected;
          const winner = h.outcome === 'won' ? h.winnerUserId : null;
          return (
            <Pressable
              key={h.holeNumber}
              accessibilityRole="button"
              accessibilityLabel={nassauCoinLabel(h.holeNumber, h.outcome, winner === null ? null : names.spoken(winner))}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(h.holeNumber)}
              style={styles.cell}
              testID={`nassau-coin-${h.holeNumber}`}
            >
              <Text
                style={[
                  styles.holeNumber,
                  { color: isSelected ? colors.text : colors.muted },
                  isSelected && styles.semibold,
                ]}
              >
                {h.holeNumber}
              </Text>
              <View
                style={[
                  { width: coin.size, height: coin.size, borderRadius: coin.size / 2 },
                  styles.coinFace,
                  winner !== null
                    ? { backgroundColor: won.fill }
                    : h.outcome === 'tied'
                      ? [styles.dashed, { borderColor: colors.scoreUnsetFg }]
                      : { backgroundColor: colors.trackBg },
                  isSelected && { boxShadow: `0 0 0 2px ${colors.surface}, 0 0 0 4px ${colors.primary}` },
                ]}
                testID={`nassau-coin-${h.holeNumber}-${h.outcome}${isSelected ? '-selected' : ''}`}
              >
                {winner !== null ? (
                  <Text style={[styles.initials, { color: won.ink }]}>{names.initials(winner)}</Text>
                ) : h.outcome === 'tied' ? (
                  <Text style={[styles.equals, { color: colors.muted }]}>=</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      {from >= 0 ? (
        // Gullstreken står i samme rutenett som myntene: hver celle fra `from`
        // er gull og strekker seg over mellomrommet til neste, så streken er
        // hel og starter rett under mynten.
        <View
          style={[styles.grid, styles.barRow, { gap: coin.gap }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID={`nassau-alone-bar-${holes[from].holeNumber}`}
        >
          {holes.map((h, i) => (
            <View key={h.holeNumber} style={styles.barCell}>
              {i >= from ? (
                <View
                  style={[
                    styles.barPiece,
                    { backgroundColor: colors.accent, right: i < holes.length - 1 ? -(coin.gap + 1) : 0 },
                    i === from && styles.barStart,
                    i === holes.length - 1 && styles.barEnd,
                  ]}
                />
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Totalen: 18 felt, gull fra hullet vinneren ble alene i ledelsen. */
function TotalStripe({ holes, aloneFrom }: { holes: NassauHoleCard[]; aloneFrom: number | null }) {
  const { colors } = useTheme();
  return (
    <View
      style={styles.stripe}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="nassau-total-stripe"
    >
      {holes.map((h) => {
        const gold = aloneFrom !== null && h.holeNumber >= aloneFrom;
        return (
          <View
            key={h.holeNumber}
            style={[styles.stripeCell, { backgroundColor: gold ? colors.accent : colors.trackBg }]}
            testID={`nassau-total-${h.holeNumber}-${gold ? 'gold' : 'track'}`}
          />
        );
      })}
    </View>
  );
}

/**
 * Hullkortet: pilene til forrige og neste hull, «Hull N» og «Par P · SI S»,
 * spillerne best først med netto (hullvinneren i en grønn sirkel), og
 * stillingen etter hullet i hullets kamp og i totalen.
 */
function HoleCard({
  hole,
  prev,
  next,
  onSelect,
  names,
}: {
  hole: NassauHoleCard;
  prev: number | null;
  next: number | null;
  onSelect: (holeNumber: number) => void;
  names: Names;
}) {
  const { colors, scheme } = useTheme();
  const won = winCoin(colors, scheme);
  const standings: { key: NassauSectionKey; standing: NassauStanding }[] = [];
  if (hole.sectionStanding) standings.push({ key: hole.section, standing: hole.sectionStanding });
  if (hole.totalStanding) standings.push({ key: 'total18', standing: hole.totalStanding });
  return (
    <View
      style={[styles.card, styles.holeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="nassau-hole-card"
    >
      <View style={styles.holeHead}>
        <HoleArrow direction="prev" target={prev} onSelect={onSelect} />
        <View style={styles.holeTitle} accessible accessibilityRole="header">
          <Text style={[styles.holeName, { color: colors.text }]} testID="nassau-hole-card-title">
            {holeNumberLabel(hole.holeNumber)}
          </Text>
          <Text style={[styles.parSi, { color: colors.muted }]}>{parSiChip(hole.par, hole.strokeIndex)}</Text>
        </View>
        <HoleArrow direction="next" target={next} onSelect={onSelect} />
      </View>
      {hole.rows.map((row) => {
        const isWinner = hole.outcome === 'won' && row.userId === hole.winnerUserId;
        return (
          <View
            key={row.userId}
            style={[styles.playerRow, { borderTopColor: colors.divider }]}
            accessible
            testID={`nassau-hole-row-${row.userId}`}
          >
            <Text
              style={[styles.playerName, { color: colors.text }, isWinner && styles.semibold]}
            >
              {names.full(row.userId)}
            </Text>
            <View style={styles.scoreCol}>
              {isWinner ? (
                <View style={[styles.scoreDisc, { backgroundColor: won.fill }]} testID={`nassau-hole-row-${row.userId}-won`}>
                  <Text style={[styles.scoreDiscText, { color: won.ink }]}>{row.effective}</Text>
                </View>
              ) : (
                <Text style={[styles.score, { color: colors.text }]}>{row.effective ?? '–'}</Text>
              )}
            </View>
          </View>
        );
      })}
      {standings.length > 0 ? (
        <View style={[styles.standing, { borderTopColor: colors.divider }]} testID="nassau-hole-standing">
          <View style={styles.standingColumn}>
            {standings.map(({ key }) => (
              <Text key={key} style={[styles.standingLabel, { color: colors.muted }]}>
                {NASSAU_CARD_KICKER[key]}
              </Text>
            ))}
          </View>
          <View style={[styles.standingColumn, styles.grow]}>
            {standings.map(({ key, standing }) => (
              <Text
                key={key}
                style={[styles.standingValue, { color: colors.text }]}
                testID={`nassau-hole-standing-${key}`}
              >
                {standingText(standing, names)}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function standingText(standing: NassauStanding, names: Names): string {
  if (standing.leaderUserIds.length !== 1) return NASSAU_BOARD_TEXT.tiedLead;
  const leader = standing.leaderUserIds[0];
  return nassauLeadLabel(names.isViewer(leader) ? null : names.short(leader), standing.lead);
}

/** Pila til forrige eller neste hull (44 pt). I endene er den av, uten runde rundt. */
function HoleArrow({
  direction,
  target,
  onSelect,
}: {
  direction: 'prev' | 'next';
  target: number | null;
  onSelect: (holeNumber: number) => void;
}) {
  const { colors } = useTheme();
  const disabled = target === null;
  const label =
    target !== null
      ? holeNumberLabel(target)
      : direction === 'prev'
        ? NASSAU_HOLES_TEXT.prevHole
        : NASSAU_HOLES_TEXT.nextHole;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => target !== null && onSelect(target)}
      style={[
        styles.arrow,
        { borderColor: colors.border, backgroundColor: colors.surface },
        disabled && styles.arrowOff,
      ]}
      testID={`nassau-hole-${direction}`}
    >
      {direction === 'prev' ? (
        <TilbakeIcon color={colors.primary} size={18} strokeWidth={2} />
      ) : (
        <ChevronIcon direction="right" color={colors.primary} size={18} strokeWidth={2} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  // Tegningens kort står 16 fra kanten, toppen og forklaringen 20: siden har 20.
  page: { marginHorizontal: -4 },
  inset: { paddingHorizontal: 4 },
  semibold: { fontFamily: FONTS.sansSemiBold },
  dashed: { borderWidth: 1.5, borderStyle: 'dashed' },
  titleBlock: { alignItems: 'center', paddingBottom: 14 },
  title: { ...fraunces(500, 28, 31, { multiline: true }), textAlign: 'center' },
  subtitleGap: { marginTop: 2 },
  subtitle: { ...interLine(13, 16), fontFamily: FONTS.sans, textAlign: 'center' },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 14,
    rowGap: 6,
    paddingBottom: 2,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendBar: { width: 16, height: 6, borderRadius: 3 },
  legendText: { ...interLine(11, 14), fontFamily: FONTS.sans },
  cardGap: { marginTop: 10 },
  card: { borderWidth: 1, borderRadius: 16, padding: 12 },
  matchLine: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28 },
  matchLabel: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold, width: 52 },
  matchCoin: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // Fornavnet brekker heller enn å kortes (320 pt).
  matchName: { ...interLine(15, 19), fontFamily: FONTS.sansSemiBold, flex: 1, minWidth: 0 },
  matchSum: { ...fraunces(600, 20), fontVariant: ['tabular-nums'] },
  initials: { ...interLine(9, 11), fontFamily: FONTS.sansSemiBold },
  equals: { ...interLine(11, 14), fontFamily: FONTS.sansSemiBold },
  coinBlock: { marginTop: 10 },
  grid: { flexDirection: 'row' },
  cell: { flex: 1, minHeight: 48, alignItems: 'center', gap: 3 },
  holeNumber: { ...interLine(10, 12), fontFamily: FONTS.sans, fontVariant: ['tabular-nums'] },
  coinFace: { alignItems: 'center', justifyContent: 'center' },
  barRow: { marginTop: 8 },
  barCell: { flex: 1, height: 6 },
  barPiece: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  barStart: { borderTopLeftRadius: 3, borderBottomLeftRadius: 3 },
  barEnd: { borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  aloneLine: { marginTop: 6, alignItems: 'flex-end' },
  aloneText: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold, textAlign: 'right' },
  // Tegningens 10 + 2 slås sammen til 10 i CSS (marginene kollapser).
  stripe: { flexDirection: 'row', gap: 2, marginTop: 10 },
  stripeCell: { flex: 1, height: 8, borderRadius: 2 },
  holeCard: { marginTop: 16, paddingTop: 10, paddingHorizontal: 14, paddingBottom: 12 },
  holeHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  holeTitle: { flex: 1, alignItems: 'center' },
  holeName: { ...fraunces(600, 17), fontVariant: ['tabular-nums'] },
  parSi: { ...interLine(12, 15), fontFamily: FONTS.sans, fontVariant: ['tabular-nums'] },
  arrow: {
    width: TAP,
    height: TAP,
    borderRadius: TAP / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowOff: { opacity: 0.4 },
  // 40 + kanten: CSS legger kanten utenpå `min-height`, Yoga regner den med.
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 41, borderTopWidth: 1 },
  playerName: { ...interLine(14, 17), fontFamily: FONTS.sans, flex: 1, minWidth: 0 },
  scoreCol: { width: 26, alignItems: 'center' },
  scoreDisc: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  scoreDiscText: { ...interLine(13, 16), fontFamily: FONTS.sansSemiBold, fontVariant: ['tabular-nums'] },
  score: { ...interLine(14, 17), fontFamily: FONTS.sans, fontVariant: ['tabular-nums'], textAlign: 'center' },
  standing: { flexDirection: 'row', columnGap: 12, borderTopWidth: 1, paddingTop: 10 },
  standingColumn: { gap: 4 },
  standingLabel: { ...interLine(12, 20), fontFamily: FONTS.sansSemiBold },
  standingValue: { ...interLine(14, 20), fontFamily: FONTS.sans },
  footer: { marginTop: 6 },
});
