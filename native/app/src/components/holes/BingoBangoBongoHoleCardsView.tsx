// #2255 PR 3c: «Hull for hull» for Bingo Bango Bongo, som på nettsiden.
//
// Ren presentasjon av `BingoBangoBongoHoleCards`
// (`lib/leaderboard/bingoBangoBongoHoles.ts`), den samme modellen webbens
// `BingoBangoBongoHolesView` tegner: ett kort per hull med bare «Hull 4» i
// hodet (ingen par eller indeks, poengene kommer ikke fra slagene), og så de
// tre prestasjonene i fast rekkefølge med navnet, hintet og hvem som tok dem,
// eller «ikke satt». Som på webben:
// - den som tok to eller tre av de tre: halvfett navn i `accentText` med en
//   stjerne foran (også `accentText`: webbens stjerne arver navnets farge),
//   skjult for skjermleseren som webbens `aria-hidden`;
// - én tok alle tre: «★ Feiet!» i gullbrikka i hodet (webbens
//   `border-accent/40 bg-accent/[0.08]`, teksten leses opp som på webben);
// - ingen av de tre er satt: «Venter» i hodet og «Ingen prestasjoner
//   registrert ennå.» i stedet for radene.
import { StyleSheet, Text, View } from 'react-native';
import type {
  BingoBangoBongoHoleCard,
  BingoBangoBongoHoleCardRow,
  BingoBangoBongoHoleCards,
} from '../../../../../lib/leaderboard/bingoBangoBongoHoles';
import type { BundlePlayer } from '../../data/gameBundle';
import { BINGO_BANGO_BONGO_HOLES_TEXT, HOLES_TEXT } from '../../lib/holesCopy';
import { FONTS, useTheme } from '../../theme';
import { GoldChip, HoleHeader, HolesFooter, HolesTitle, holesStyles, nameOf } from './holesShared';

export function BingoBangoBongoHoleCardsView({
  cards,
  subtitle,
  players,
  finished,
}: {
  cards: BingoBangoBongoHoleCards;
  subtitle: string;
  players: readonly BundlePlayer[];
  /** Runden er ferdig: bunnteksten sier «Vel spilt!». */
  finished: boolean;
}) {
  return (
    <View style={holesStyles.page} testID="hole-by-hole">
      <HolesTitle subtitle={subtitle} />
      {cards.holes.map((hole) => (
        <HoleCardView key={hole.holeNumber} hole={hole} players={players} />
      ))}
      <HolesFooter finished={finished} />
    </View>
  );
}

function HoleCardView({ hole, players }: { hole: BingoBangoBongoHoleCard; players: readonly BundlePlayer[] }) {
  const { colors, ui } = useTheme();
  return (
    <View style={ui.card} testID={`hole-by-hole-card-${hole.holeNumber}`}>
      <HoleHeader
        holeNumber={hole.holeNumber}
        right={
          hole.sweptAll ? (
            <GoldChip text={BINGO_BANGO_BONGO_HOLES_TEXT.feietChip} testID={`hole-by-hole-swept-${hole.holeNumber}`} />
          ) : hole.pending ? (
            <Text style={[holesStyles.caps, { color: colors.muted }]} testID={`hole-by-hole-waiting-${hole.holeNumber}`}>
              {HOLES_TEXT.waiting}
            </Text>
          ) : null
        }
      />
      {hole.pending ? (
        <Text style={[styles.note, { color: colors.muted }]} testID={`hole-by-hole-none-${hole.holeNumber}`}>
          {BINGO_BANGO_BONGO_HOLES_TEXT.ingenPrestasjoner}
        </Text>
      ) : (
        <View style={styles.rows}>
          {hole.rows.map((row) => (
            <AwardRow key={row.category} holeNumber={hole.holeNumber} row={row} players={players} />
          ))}
        </View>
      )}
    </View>
  );
}

function AwardRow({
  holeNumber,
  row,
  players,
}: {
  holeNumber: number;
  row: BingoBangoBongoHoleCardRow;
  players: readonly BundlePlayer[];
}) {
  const { colors } = useTheme();
  return (
    <View style={holesStyles.line} testID={`hole-by-hole-award-${holeNumber}-${row.category}`}>
      <View style={styles.award}>
        <Text style={[styles.label, { color: colors.text }]}>{BINGO_BANGO_BONGO_HOLES_TEXT[row.category]}</Text>
        <Text style={[styles.hint, { color: colors.muted }]} numberOfLines={1}>
          {BINGO_BANGO_BONGO_HOLES_TEXT[row.hintKey]}
        </Text>
      </View>
      {row.userId != null ? (
        <View style={styles.winner}>
          {row.isSweeper ? (
            <Text
              // Webbens stjerne her har ingen egen farge og arver navnets
              // `text-accent-text`; derfor `accentText`, ikke dekorgull.
              style={[holesStyles.star, { color: colors.accentText }]}
              accessibilityElementsHidden
              importantForAccessibility="no"
              testID={`hole-by-hole-star-${holeNumber}-${row.category}`}
            >
              ★
            </Text>
          ) : null}
          <Text
            style={[
              styles.name,
              row.isSweeper ? { fontFamily: FONTS.sansSemiBold, color: colors.accentText } : { color: colors.text },
            ]}
          >
            {nameOf(players, row.userId, HOLES_TEXT.unknownPlayerFull)}
          </Text>
        </View>
      ) : (
        <Text style={[styles.note, { color: colors.muted }]}>{BINGO_BANGO_BONGO_HOLES_TEXT.ikkeSatt}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Webbens `gap-1` mellom prestasjonene. */
  rows: { gap: 4 },
  /** Navnet og hintet på linje (webbens `items-baseline gap-1.5`), hintet kuttes først. */
  award: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1 },
  /** Webbens `font-serif text-[13.5px] font-medium`. */
  label: { fontSize: 14, fontFamily: FONTS.serifDisplay },
  /** Webbens `text-[10.5px] text-muted truncate`. */
  hint: { fontSize: 11, fontFamily: FONTS.sans, flexShrink: 1 },
  /**
   * Hvem som tok den (webbens `flex shrink-0 items-center gap-1`): navnet
   * kuttes aldri, hintet til venstre gir plass først.
   */
  winner: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  /** Webbens `text-[14px]`. */
  name: { fontSize: 14, fontFamily: FONTS.sans },
  /** Webbens `text-[12.5px] text-muted`: «ikke satt» og hullet som venter. */
  note: { fontSize: 13, fontFamily: FONTS.sans },
});
