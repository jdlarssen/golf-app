// #2255: bitene alle «Hull for hull»-visningene i appen deler — navnet slik
// webben skriver det, overskriften med formatlinja, hodet på hvert hull-kort,
// gullbrikka i hodet, raden med poeng og brutto, etikettene i små versaler, og
// gulltonen for den som utmerker seg. Ett hjem, så formatene ser like ut og en
// rettelse når alle (samme grep som webbens `LeaderboardChrome`).
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatRevealName } from '../../../../../lib/names/formatRevealName';
import type { BundlePlayer } from '../../data/gameBundle';
import { HOLES_TEXT, holeNumberLabel, parSiChip } from '../../lib/holesCopy';
import { FONTS, useTheme } from '../../theme';

/**
 * Navnet slik webben skriver det: «Ola "Kompis" N.», med webbens reserve.
 * Uten navn (en slettet bruker står i bundelen med `name: null`) får spilleren
 * samme reserve som webben gir en spiller den ikke har i `playersById`.
 */
export function nameOf(players: readonly BundlePlayer[], userId: string, fallback: string): string {
  const player = players.find((p) => p.userId === userId);
  if (!player || player.name == null) return fallback;
  return formatRevealName(player.name, player.nickname);
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
 * ferdig, ellers «Lykke til.», i webbens anførselstegn (`PullQuote`).
 */
export function HolesFooter({ finished }: { finished: boolean }) {
  const { colors } = useTheme();
  return (
    <Text style={[holesStyles.footer, { color: colors.muted }]} testID="hole-by-hole-footer">
      {`«${finished ? HOLES_TEXT.wellPlayed : HOLES_TEXT.goodLuck}»`}
    </Text>
  );
}

/**
 * Hodet på et hull-kort: «Hull 4», «Par 4 · SI 7», og det som står til høyre.
 * Uten par og indeks bare «Hull 4», som webbens Bingo Bango Bongo: poengene
 * der kommer ikke fra slagene, og motoren gir hullet verken par eller indeks.
 */
export function HoleHeader({
  holeNumber,
  par,
  strokeIndex,
  right,
}: {
  holeNumber: number;
  right?: ReactNode;
} & ({ par: number; strokeIndex: number } | { par?: undefined; strokeIndex?: undefined })) {
  const { colors, ui } = useTheme();
  return (
    <View style={holesStyles.holeHeader}>
      <View style={holesStyles.holeTitle}>
        <Text style={[holesStyles.holeNumber, ui.num, { color: colors.text }]}>
          {holeNumberLabel(holeNumber)}
        </Text>
        {par !== undefined && strokeIndex !== undefined ? (
          <Text style={[holesStyles.small, ui.num, { color: colors.muted }]}>
            {parSiChip(par, strokeIndex)}
          </Text>
        ) : null}
      </View>
      {right ?? null}
    </View>
  );
}

/**
 * Gullbrikka til høyre i hull-hodet (Wolf: innsatsen, Nines: potten), som
 * webbens `rounded-full border-accent/40 bg-accent/[0.08]` med gull tekst.
 */
export function GoldChip({ text, testID }: { text: string; testID?: string }) {
  const { colors, ui } = useTheme();
  return (
    <View
      style={[holesStyles.chip, { borderColor: goldEdge(colors.accent), backgroundColor: goldWash(colors.accent, '14') }]}
      testID={testID}
    >
      <Text style={[holesStyles.chipText, ui.num, { color: colors.accentText }]}>{text}</Text>
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
  /**
   * En linje uten kant: navn til venstre, verdien til høyre (webbens `flex
   * items-center justify-between gap-3`). Round Robins spillere på en side,
   * Bingo Bango Bongos prestasjoner.
   */
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  /** Stjerna er dekor (skjult for skjermleseren), så den har webbens `accent`, 11 pt. */
  star: { fontSize: 11 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  value: { fontSize: 18, fontFamily: FONTS.serifScore, minWidth: 24, textAlign: 'right' },
  /** «+5» foran scoren, i gull tekst (webbens `text-[12px] font-semibold`). */
  points: { fontSize: 12, fontFamily: FONTS.sansSemiBold },
  /** «brutto 5» ved siden av netto, dempet (webbens `text-[10.5px]`). */
  gross: { fontSize: 11, fontFamily: FONTS.sans },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: 11, fontFamily: FONTS.sansSemiBold, letterSpacing: 1.3, textTransform: 'uppercase' },
  /**
   * Etikett i små versaler (webbens `text-[11px] font-semibold uppercase
   * tracking-[0.16em]` og `Kicker`): «Stillingen», Round Robins segment og
   * «Vant hullet».
   */
  kicker: { fontSize: 11, fontFamily: FONTS.sansSemiBold, letterSpacing: 1.6, textTransform: 'uppercase' },
  /**
   * Små versaler (webbens `text-[10.5px]`/`text-[11px] uppercase
   * tracking-[0.1em]`): enheten «p» i solo, «Delt» og «Venter» i Round Robin.
   */
  caps: { fontSize: 11, fontFamily: FONTS.sansMedium, letterSpacing: 1, textTransform: 'uppercase' },
  footer: { fontSize: 12, fontFamily: FONTS.serifDisplay, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
});
