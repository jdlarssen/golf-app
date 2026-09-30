// #2255 PR 3c: «Hull for hull» for Nines / Split Sixes, som på nettsiden.
//
// Ren presentasjon av `NinesHoleCards` (`lib/leaderboard/ninesHoles.ts`), den
// samme modellen webbens `NinesHolesView` tegner: ett kort per hull med potten
// (eller «Venter på score»), og så hver spiller med plassen på hullet, poengene,
// brutto ved siden av netto og scoren. Lederen på hullet (plass 1, også delt)
// står i gull som på webben: kant og tone på raden (`border-accent/40
// bg-accent/[0.06]`), gull plass-sirkel, halvfett navn og gull score.
import { StyleSheet, Text, View } from 'react-native';
import type { NinesHoleCard, NinesHoleCards } from '../../../../../lib/leaderboard/ninesHoles';
import type { BundlePlayer } from '../../data/gameBundle';
import {
  HOLES_TEXT,
  NINES_HOLES_TEXT,
  ninesBruttoLabel,
  ninesPoints,
  ninesPotLabel,
} from '../../lib/holesCopy';
import { FONTS, useTheme } from '../../theme';
import {
  GoldChip,
  HoleHeader,
  HolesFooter,
  HolesTitle,
  goldEdge,
  goldWash,
  holesStyles,
  nameOf,
} from './holesShared';

export function NinesHoleCardsView({
  cards,
  subtitle,
  players,
  finished,
}: {
  cards: NinesHoleCards;
  subtitle: string;
  players: readonly BundlePlayer[];
  /** Runden er ferdig: bunnteksten sier «Vel spilt!». */
  finished: boolean;
}) {
  return (
    <View style={holesStyles.page} testID="hole-by-hole">
      <HolesTitle subtitle={subtitle} />
      {cards.holes.map((hole) => (
        <NinesHoleCardView key={hole.holeNumber} hole={hole} players={players} />
      ))}
      <HolesFooter finished={finished} />
    </View>
  );
}

function NinesHoleCardView({ hole, players }: { hole: NinesHoleCard; players: readonly BundlePlayer[] }) {
  const { colors, ui } = useTheme();
  return (
    <View style={ui.card} testID={`hole-by-hole-card-${hole.holeNumber}`}>
      <HoleHeader
        holeNumber={hole.holeNumber}
        par={hole.par}
        strokeIndex={hole.strokeIndex}
        right={
          hole.pot == null ? (
            <Text style={[holesStyles.small, { color: colors.muted }]}>{NINES_HOLES_TEXT.ventePaaScore}</Text>
          ) : (
            <GoldChip text={ninesPotLabel(hole.pot)} testID={`hole-by-hole-pot-${hole.holeNumber}`} />
          )
        }
      />

      {hole.rows.map((row) => (
        <View
          key={row.userId}
          style={[
            holesStyles.row,
            row.isLeader
              ? { borderColor: goldEdge(colors.accent), backgroundColor: goldWash(colors.accent) }
              : { borderColor: 'transparent' },
          ]}
          testID={`hole-by-hole-row-${hole.holeNumber}-${row.userId}`}
        >
          <View style={holesStyles.rowName}>
            {/* Plassen er dekor, som webbens `aria-hidden`: skjermleseren leser raden uten den. */}
            <View
              style={[
                styles.place,
                row.placement == null
                  ? { borderColor: colors.border, borderStyle: 'dashed' }
                  : row.isLeader
                    ? { borderColor: colors.accent, backgroundColor: goldWash(colors.accent, '1F') }
                    : { borderColor: colors.border },
              ]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              testID={`hole-by-hole-place-${hole.holeNumber}-${row.userId}`}
            >
              <Text
                style={[
                  styles.placeText,
                  ui.num,
                  row.placement == null
                    ? { color: colors.muted, opacity: 0.5 }
                    : { color: row.isLeader ? colors.accentText : colors.muted },
                ]}
              >
                {row.placement ?? '–'}
              </Text>
            </View>
            <Text style={[ui.body, holesStyles.shrink, row.isLeader && styles.leaderName]} numberOfLines={1}>
              {nameOf(players, row.userId, HOLES_TEXT.unknownPlayerFull)}
            </Text>
          </View>
          <View style={holesStyles.rowRight}>
            {row.pointsShown != null ? (
              <Text style={[holesStyles.points, ui.num, { color: colors.accentText }]}>
                {`+${ninesPoints(row.pointsShown)}`}
              </Text>
            ) : null}
            {row.grossShown != null ? (
              <Text style={[holesStyles.gross, ui.num, { color: colors.muted }]}>{ninesBruttoLabel(row.grossShown)}</Text>
            ) : null}
            <Text style={[holesStyles.value, ui.num, { color: row.isLeader ? colors.accentText : colors.text }]}>
              {row.effectiveScore ?? '–'}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Webbens `h-6 w-6 rounded-full`, med plassen i `text-[11px] font-semibold`. */
  place: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  placeText: { fontSize: 11, fontFamily: FONTS.sansSemiBold },
  leaderName: { fontFamily: FONTS.sansSemiBold },
});
