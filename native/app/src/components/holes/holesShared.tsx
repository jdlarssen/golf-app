// #2255: bitene alle «Hull for hull»-visningene i appen deler — navnet slik
// webben skriver det, overskriften med formatlinja, hodet på hvert hull-kort,
// raden og gulltonen for den som utmerker seg. Ett hjem, så formatene ser like
// ut og en rettelse når alle (samme grep som webbens `LeaderboardChrome`).
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatRevealName } from '../../../../../lib/names/formatRevealName';
import type { BundlePlayer } from '../../data/gameBundle';
import { HOLES_TEXT, holeNumberLabel, parSiChip } from '../../lib/holesCopy';
import { FONTS, useTheme } from '../../theme';

/** Navnet slik webben skriver det: «Ola "Kompis" N.», med webbens reserve. */
export function nameOf(players: readonly BundlePlayer[], userId: string, fallback: string): string {
  const player = players.find((p) => p.userId === userId);
  if (!player) return fallback;
  return formatRevealName(player.name ?? HOLES_TEXT.unknownPlayer, player.nickname);
}

/**
 * Gulltonen som på webben: kant på 40 % og en svak champagnetone på 6 %
 * (`border-accent/40 bg-accent/[0.06]`). `accent` er en sekssifret hex i
 * temaet, så alfaen legges på som to sifre til. `alpha` gir andre styrker.
 */
export const goldEdge = (accent: string, alpha = '66') => `${accent}${alpha}`;
export const goldWash = (accent: string, alpha = '0F') => `${accent}${alpha}`;

/** «Hull for hull» og formatlinja under. */
export function HolesTitle({ subtitle }: { subtitle: string }) {
  const { colors, ui } = useTheme();
  return (
    <View style={holesStyles.titleBlock}>
      <Text accessibilityRole="header" style={[holesStyles.title, { color: colors.text }]}>
        {HOLES_TEXT.heading}
      </Text>
      <Text style={[ui.muted, holesStyles.center]}>{subtitle}</Text>
    </View>
  );
}

/**
 * Bunnteksten, som webbens `LeaderboardFooter`: «Vel spilt!» når runden er
 * ferdig, ellers «Lykke til.».
 */
export function HolesFooter({ finished }: { finished: boolean }) {
  const { colors } = useTheme();
  return (
    <Text style={[holesStyles.footer, { color: colors.muted }]} testID="hole-by-hole-footer">
      {finished ? HOLES_TEXT.wellPlayed : HOLES_TEXT.goodLuck}
    </Text>
  );
}

/** Hodet på et hull-kort: «Hull 4», «Par 4 · SI 7», og det som står til høyre. */
export function HoleHeader({
  holeNumber,
  par,
  strokeIndex,
  right,
}: {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  right?: ReactNode;
}) {
  const { colors, ui } = useTheme();
  return (
    <View style={holesStyles.holeHeader}>
      <View style={holesStyles.holeTitle}>
        <Text style={[holesStyles.holeNumber, ui.num, { color: colors.text }]}>
          {holeNumberLabel(holeNumber)}
        </Text>
        <Text style={[holesStyles.small, ui.num, { color: colors.muted }]}>
          {parSiChip(par, strokeIndex)}
        </Text>
      </View>
      {right ?? null}
    </View>
  );
}

export const holesStyles = StyleSheet.create({
  page: { gap: 14 },
  titleBlock: { alignItems: 'center', gap: 2, paddingVertical: 4 },
  title: { fontSize: 28, fontFamily: FONTS.serifDisplay },
  center: { textAlign: 'center' },
  small: { fontSize: 12, fontFamily: FONTS.sans },
  medium: { fontFamily: FONTS.sansMedium },
  shrink: { flexShrink: 1 },
  holeHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  holeTitle: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  holeNumber: { fontSize: 16, fontFamily: FONTS.serifScore },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rowName: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  /** Stjerna er dekor (skjult for skjermleseren), så den har webbens `accent`, 11 pt. */
  star: { fontSize: 11 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  value: { fontSize: 18, fontFamily: FONTS.serifScore, minWidth: 24, textAlign: 'right' },
  footer: { fontSize: 12, fontFamily: FONTS.serifDisplay, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
});
