// #2255 PR 3c: «Hull for hull» for Acey Deucey, som på nettsiden.
//
// Ren presentasjon av `AceyDeuceyHoleCards` (`lib/leaderboard/aceyDeuceyHoles.ts`),
// den samme modellen webbens `AceyDeuceyHolesView` tegner: ett kort per hull
// (eller «Venter» i hodet), og så alle fire spillerne rangert på score med
// poengene, brutto ved siden av netto og scoren. Tonene som på webben:
// - ace: gull kant og tone på raden (`border-accent/40 bg-accent/[0.06]`),
//   stjerne i `accent`, halvfett navn, poeng og score i `accentText`;
// - deuce: kald ramme på dempet flate (`border-border bg-surface-2` →
//   `border`/`surface2`), poeng og score i `muted` (webbens `text-muted`, ikke
//   en varselfarge);
// - nøytral: ingen kant, poengene i `muted` på 40 % (`text-muted/40`) og scoren
//   i `text`.
// Stjerna er dekor, skjult for skjermleseren som webbens `aria-hidden`.
import { Text, View } from 'react-native';
import type {
  AceyDeuceyHoleCard,
  AceyDeuceyHoleCardRow,
  AceyDeuceyHoleCards,
} from '../../../../../lib/leaderboard/aceyDeuceyHoles';
import type { BundlePlayer } from '../../data/gameBundle';
import { HOLES_TEXT, aceyDeuceyBruttoLabel } from '../../lib/holesCopy';
import { useTheme } from '../../theme';
import {
  HoleHeader,
  HolesFooter,
  HolesTitle,
  goldEdge,
  goldWash,
  holesStyles,
  nameOf,
} from './holesShared';

export function AceyDeuceyHoleCardsView({
  cards,
  subtitle,
  players,
  finished,
}: {
  cards: AceyDeuceyHoleCards;
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

function HoleCardView({ hole, players }: { hole: AceyDeuceyHoleCard; players: readonly BundlePlayer[] }) {
  const { colors, ui } = useTheme();
  return (
    <View style={ui.card} testID={`hole-by-hole-card-${hole.holeNumber}`}>
      <HoleHeader
        holeNumber={hole.holeNumber}
        par={hole.par}
        strokeIndex={hole.strokeIndex}
        right={
          hole.scored ? null : (
            <Text style={[holesStyles.small, { color: colors.muted }]} testID={`hole-by-hole-waiting-${hole.holeNumber}`}>
              {HOLES_TEXT.waiting}
            </Text>
          )
        }
      />
      {hole.rows.map((row) => (
        <RowView key={row.userId} holeNumber={hole.holeNumber} row={row} players={players} />
      ))}
    </View>
  );
}

function RowView({
  holeNumber,
  row,
  players,
}: {
  holeNumber: number;
  row: AceyDeuceyHoleCardRow;
  players: readonly BundlePlayer[];
}) {
  const { colors, ui } = useTheme();
  const isAce = row.tone === 'ace';
  const isDeuce = row.tone === 'deuce';
  return (
    <View
      style={[
        holesStyles.row,
        isAce
          ? { borderColor: goldEdge(colors.accent), backgroundColor: goldWash(colors.accent) }
          : isDeuce
            ? { borderColor: colors.border, backgroundColor: colors.surface2 }
            : { borderColor: 'transparent' },
      ]}
      testID={`hole-by-hole-row-${holeNumber}-${row.userId}`}
    >
      <View style={holesStyles.rowName}>
        {isAce ? (
          <Text
            style={[holesStyles.star, { color: colors.accent }]}
            accessibilityElementsHidden
            importantForAccessibility="no"
            testID={`hole-by-hole-star-${holeNumber}-${row.userId}`}
          >
            ★
          </Text>
        ) : null}
        <Text style={[ui.body, holesStyles.shrink, isAce && holesStyles.medium]} numberOfLines={1}>
          {nameOf(players, row.userId, HOLES_TEXT.unknownPlayerFull)}
        </Text>
      </View>
      <View style={holesStyles.rowRight}>
        {row.pointsText != null ? (
          <Text
            style={[
              holesStyles.points,
              ui.num,
              isAce
                ? { color: colors.accentText }
                : isDeuce
                  ? { color: colors.muted }
                  : { color: colors.muted, opacity: 0.4 },
            ]}
          >
            {row.pointsText}
          </Text>
        ) : null}
        {row.grossShown != null ? (
          <Text style={[holesStyles.gross, ui.num, { color: colors.muted }]}>{aceyDeuceyBruttoLabel(row.grossShown)}</Text>
        ) : null}
        <Text
          style={[
            holesStyles.value,
            ui.num,
            { color: isAce ? colors.accentText : isDeuce ? colors.muted : colors.text },
          ]}
        >
          {row.effectiveScore ?? '–'}
        </Text>
      </View>
    </View>
  );
}
