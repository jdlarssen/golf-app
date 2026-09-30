// #2254: hvem du spiller med, som initialer i små skiver. Deles med
// startbilletten på spillets side (#2255).
//
// Hvem som står i raden, er regelen i `lib/flightRoster.ts`: med flight satt
// de andre i flighten din, uten flight de andre i spillet, aldri de trukne.
// Skivene er dekor for skjermleseren, og raden har én etikett med navnene.
//
// To størrelser, samme drakt (#2255, #2385): deg først i `primary`, så de
// andre i blek grønn, separate skiver. `ticket` er startbillettens store
// skiver med inntil tre andre (navnene står i billettens egen kolonne). `home`
// er Hjems små skiver på 26 pt med inntil to andre og «+N til» for resten, som
// i designet for Hjem. Designet er tegnet i lys, der den
// blekgrønne skiva står svakt mot kortet (1,17:1). I klubbhus-natt forsvinner
// `primarySoft` helt (1,03:1). Der får de andre dyp skoggrønn `surfaceStrong`,
// som står like svakt som designets skive i lys (1,23:1), med initialer på
// 4,6:1. Du skal skille deg tydelig ut og blir salvie-`primary` (5,7:1, som
// hovedknappen). Navnene står i billettens egen kolonne, og skivene har ingen
// etikett selv (raden rundt har den).
import { StyleSheet, Text, View } from 'react-native';
import { nameInitials } from '../../../../../lib/names/initials';
import type { BundlePlayer } from '../../data/gameBundle';
import { displayName } from '../../lib/display';
import {
  MAX_HOME_COMPANIONS,
  MAX_TICKET_COMPANIONS,
  companionsOf,
} from '../../lib/flightRoster';
import { companionsLabel, moreAvatars } from '../../lib/homeCopy';
import { FONTS, useTheme } from '../../theme';

export function FlightAvatars({
  players,
  userId,
  flightNumber,
  variant = 'home',
  testID = 'flight-avatars',
}: {
  players: readonly BundlePlayer[];
  userId: string;
  flightNumber: number | null;
  variant?: 'home' | 'ticket';
  testID?: string;
}) {
  const { colors, scheme } = useTheme();
  const companions = companionsOf(players, userId, flightNumber);
  if (companions.length === 0) return null;

  const me = players.find((p) => p.userId === userId);
  const otherFill = scheme === 'dark' ? colors.surfaceStrong : colors.primarySoft;
  const max = variant === 'ticket' ? MAX_TICKET_COMPANIONS : MAX_HOME_COMPANIONS;
  const shown = companions.slice(0, max);
  const discs = [
    ...(me ? [{ player: me, self: true }] : []),
    ...shown.map((player) => ({ player, self: false })),
  ];
  const size = variant === 'ticket' ? styles.ticketDisc : styles.homeDisc;
  const initials = variant === 'ticket' ? styles.ticketInitials : styles.homeInitials;
  const row = (
    <View
      style={variant === 'ticket' ? styles.ticketDiscs : styles.homeDiscs}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={variant === 'ticket' ? testID : undefined}
    >
      {discs.map(({ player, self }) => (
        <View
          key={player.userId}
          style={[styles.disc, size, { backgroundColor: self ? colors.primary : otherFill }]}
          testID={self ? `${testID}-self` : `${testID}-disc`}
        >
          <Text style={[initials, { color: self ? colors.onPrimary : colors.primary }]}>
            {nameInitials(player.name ?? player.nickname)}
          </Text>
        </View>
      ))}
    </View>
  );
  if (variant === 'ticket') return row;

  const more = companions.length - shown.length;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={companionsLabel(
        companions.map(displayName),
        flightNumber != null,
        max,
      )}
      testID={testID}
    >
      {row}
      {more > 0 ? (
        <Text style={[styles.more, { color: colors.muted }]} testID={`${testID}-more`}>
          {moreAvatars(more)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  disc: { alignItems: 'center', justifyContent: 'center' },
  more: { fontSize: 11, fontFamily: FONTS.sans },
  homeDiscs: { flexDirection: 'row', gap: 4 },
  homeDisc: { width: 26, height: 26, borderRadius: 13 },
  homeInitials: { fontSize: 10, fontFamily: FONTS.sansSemiBold },
  ticketDiscs: { flexDirection: 'row', gap: 8 },
  ticketDisc: { width: 34, height: 34, borderRadius: 17 },
  ticketInitials: { fontSize: 12, fontFamily: FONTS.sansSemiBold },
});
