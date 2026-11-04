// native/app/src/components/inbox/InboxAvatar.tsx
// #2759: skivene på 30 pt først i en rad, webbens `InboxAvatarDisc` (`Innboks-forslag`).
//
// Dekor: raden sier det samme med ord, så skjermleseren hopper over dem. Serveren
// sier hva skiva viser (`InboxAvatar` i `inboxSections.ts`), og en ikonnøkkel appen
// ikke kjenner fra en nyere server, blir konvolutten.
//
// Drakten er FlightAvatars sin: den første i `primary`, den andre i blek grønn, og i
// klubbhus-natt dyp skoggrønn, der den bleke ville forsvunnet.
import { StyleSheet, Text, View } from 'react-native';
import type { NotificationIconName } from '../../../../../lib/notifications/icons';
import type { InboxAvatar as InboxAvatarData } from '../../../../../lib/notifications/inboxSections';
import { FONTS, fraunces, interLine, useTheme } from '../../theme';
import {
  FlaggIcon,
  KalenderIcon,
  KlubbhusIcon,
  KonvoluttIcon,
  MedalDisc,
  PokalIcon,
  ProfilIcon,
  ReplayIcon,
  ScorekortIcon,
  type IconProps,
} from '../icons/Icons';

const ICONS: Record<NotificationIconName, (props: IconProps) => React.JSX.Element> = {
  konvolutt: KonvoluttIcon,
  scorekort: ScorekortIcon,
  pokal: PokalIcon,
  flagg: FlaggIcon,
  kalender: KalenderIcon,
  profil: ProfilIcon,
  klubbhus: KlubbhusIcon,
  replay: ReplayIcon,
};

const SIZE = 30;
const RING = 2;
const OVERLAP = 8;

function Medal({ testID, children }: { testID: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.disc} testID={testID}>
      <MedalDisc
        highlight={colors.placeDiscHighlight}
        edge={colors.placeDiscEdge}
        ring={colors.placeDiscRing}
        size={SIZE}
        gradientId="inbox-disc"
      />
      {children}
    </View>
  );
}

export function InboxAvatar({ avatar }: { avatar: InboxAvatarData }) {
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  if (avatar.kind === 'place') {
    return (
      <Medal testID="inbox-place-disc">
        <Text style={[styles.place, { color: colors.text }]}>{avatar.rank}</Text>
      </Medal>
    );
  }
  if (avatar.kind === 'icon') {
    const Icon = ICONS[avatar.icon] ?? KonvoluttIcon;
    return (
      <Medal testID="inbox-icon-disc">
        <Icon size={16} color={dark ? colors.text : colors.primary} />
      </Medal>
    );
  }

  const first = { backgroundColor: colors.primary, ink: dark ? colors.bg : colors.onStrong };
  const second = { backgroundColor: dark ? colors.surfaceStrong : colors.primarySoft, ink: colors.primary };
  const rest = { backgroundColor: colors.trackBg, ink: dark ? colors.text : colors.muted };
  const discs = [
    ...avatar.initials.map((text, i) => ({ text, ...(i === 0 ? first : second) })),
    ...(avatar.more > 0 ? [{ text: `+${avatar.more}`, ...rest }] : []),
  ];

  // Alene har skiva ingen ring. I en stabel har hver skive en ring i kortets farge
  // og ligger 8 pt over den forrige.
  if (discs.length === 1) {
    return (
      <View style={[styles.disc, { backgroundColor: discs[0]!.backgroundColor }]} testID="inbox-initials">
        <Text style={[styles.initials, { color: discs[0]!.ink }]}>{discs[0]!.text}</Text>
      </View>
    );
  }
  return (
    <View style={styles.stack} testID="inbox-initials-stack">
      {discs.map((disc, i) => (
        <View
          key={`${disc.text}-${i}`}
          style={[styles.ring, { backgroundColor: colors.surface }, i > 0 && styles.overlapped]}
        >
          <View style={[styles.disc, { backgroundColor: disc.backgroundColor }]}>
            <Text style={[styles.initials, { color: disc.ink }]}>{disc.text}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stack: { flexDirection: 'row', flexShrink: 0, marginVertical: -RING, marginHorizontal: -RING },
  ring: {
    width: SIZE + RING * 2,
    height: SIZE + RING * 2,
    borderRadius: (SIZE + RING * 2) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlapped: { marginLeft: -(OVERLAP + RING * 2) },
  initials: { ...interLine(10, 12), fontFamily: FONTS.sansSemiBold },
  place: { ...fraunces(600, 13) },
});
