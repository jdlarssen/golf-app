// #2254: hvem du spiller med, som initialer i små skiver. Deles med
// startbilletten på spillets side (#2255).
//
// Hvem som står i raden, er regelen i `lib/flightRoster.ts`: med flight satt
// de andre i flighten din, uten flight de andre i spillet, aldri de trukne.
// Skivene er dekor for skjermleseren, og raden har én etikett med navnene.
//
// To drakter, samme regel (#2255): `home` er Hjems små overlappende skiver.
// `ticket` er startbillettens: deg først i `primary`, så inntil tre andre i
// blek grønn, fire separate skiver. `primary` og ikke `surfaceStrong`: i lys er
// de samme skoggrønne, men i klubbhus-natt er `surfaceStrong` nesten kortets
// egen farge (1,2:1), mens salvie-`primary` skiller seg ut (5,7:1), som
// hovedknappen. Navnene står i billettens egen kolonne, og skivene har ingen
// etikett selv (raden rundt har den).
import { StyleSheet, Text, View } from 'react-native';
import { nameInitials } from '../../../../../lib/names/initials';
import type { BundlePlayer } from '../../data/gameBundle';
import { displayName } from '../../lib/display';
import { MAX_AVATARS, MAX_TICKET_COMPANIONS, companionsOf } from '../../lib/flightRoster';
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
  const { colors } = useTheme();
  const companions = companionsOf(players, userId, flightNumber);
  if (companions.length === 0) return null;

  if (variant === 'ticket') {
    const me = players.find((p) => p.userId === userId);
    const discs = [
      ...(me ? [{ player: me, self: true }] : []),
      ...companions.slice(0, MAX_TICKET_COMPANIONS).map((player) => ({ player, self: false })),
    ];
    return (
      <View
        style={styles.ticketDiscs}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID={testID}
      >
        {discs.map(({ player, self }) => (
          <View
            key={player.userId}
            style={[
              styles.ticketDisc,
              { backgroundColor: self ? colors.primary : colors.primarySoft },
            ]}
            testID={self ? `${testID}-self` : `${testID}-disc`}
          >
            <Text style={[styles.ticketInitials, { color: self ? colors.onPrimary : colors.primary }]}>
              {nameInitials(player.name ?? player.nickname)}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  const shown = companions.slice(0, MAX_AVATARS);
  const more = companions.length - shown.length;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={companionsLabel(
        companions.map(displayName),
        flightNumber != null,
        MAX_AVATARS,
      )}
      testID={testID}
    >
      <View
        style={styles.discs}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {shown.map((player, i) => (
          <View
            key={player.userId}
            style={[
              styles.disc,
              // Kantfargen som fyll: `bg` forsvant nesten på det hvite kortet.
              { backgroundColor: colors.border, borderColor: colors.surface },
              i > 0 && styles.overlap,
            ]}
            testID={`${testID}-disc`}
          >
            <Text style={[styles.initials, { color: colors.text }]}>
              {nameInitials(player.name ?? player.nickname)}
            </Text>
          </View>
        ))}
      </View>
      {more > 0 ? (
        <Text style={[styles.more, { color: colors.muted }]} testID={`${testID}-more`}>
          {moreAvatars(more)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  discs: { flexDirection: 'row' },
  disc: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlap: { marginLeft: -8 },
  initials: { fontSize: 11, fontFamily: FONTS.sansSemiBold },
  more: { fontSize: 13, fontFamily: FONTS.sansMedium },
  ticketDiscs: { flexDirection: 'row', gap: 8 },
  ticketDisc: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  ticketInitials: { fontSize: 12, fontFamily: FONTS.sansSemiBold },
});
