// native/app/src/components/inbox/InboxAvatar.tsx
// #2759: skivene på 30 pt foran en rad i innboksen, tegnet som webbens
// `components/notifications/InitialsStack.tsx` og `Innboks-forslag` på
// designlerretet. Dekor: radens tekst sier det samme, og en plass har sin egen
// tekst for skjermleseren.
//
// Fargene i natt følger `FlightAvatars`: lyst blekk forsvinner på den salvie
// skiva, og den blekgrønne skiva forsvinner mot kortet.
import { StyleSheet, Text, View } from 'react-native';
import type { InboxAvatar as Avatar } from '../../../../../lib/notifications/inboxSections';
import type { NotificationIconName } from '../../../../../lib/notifications/icons';
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
} from '../icons/Icons';

const SIZE = 30;

const ICONS: Record<NotificationIconName, typeof FlaggIcon> = {
  konvolutt: KonvoluttIcon,
  scorekort: ScorekortIcon,
  pokal: PokalIcon,
  flagg: FlaggIcon,
  kalender: KalenderIcon,
  profil: ProfilIcon,
  klubbhus: KlubbhusIcon,
  replay: ReplayIcon,
};

function PlaceBackground() {
  const { colors, scheme } = useTheme();
  return (
    <MedalDisc
      highlight={colors.placeDiscHighlight}
      edge={colors.placeDiscEdge}
      ring={colors.scoreUnsetFg}
      size={SIZE}
      gradientId={`inbox-place-${scheme}`}
    />
  );
}

export function InboxAvatarDisc({ avatar }: { avatar: Avatar }) {
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';

  if (avatar.kind === 'place') {
    return (
      <View style={styles.disc} testID="inbox-place-disc">
        <PlaceBackground />
        <Text style={[styles.rank, { color: colors.text }]}>{avatar.rank}</Text>
      </View>
    );
  }

  if (avatar.kind === 'icon') {
    // En ikon-navn fra en nyere server blir konvolutten, ikke en tom skive.
    const Icon = ICONS[avatar.icon] ?? KonvoluttIcon;
    return (
      <View style={styles.disc} testID="inbox-icon-disc">
        <PlaceBackground />
        <Icon size={16} color={dark ? colors.text : colors.primary} />
      </View>
    );
  }

  const firstInk = dark ? colors.onPrimary : colors.onStrong;
  const ring = `0 0 0 2px ${colors.surface}`;
  if (avatar.initials.length === 1 && avatar.more === 0) {
    return (
      <View style={[styles.disc, { backgroundColor: colors.primary }]} testID="inbox-initials-disc">
        <Text style={[styles.initials, { color: firstInk }]}>{avatar.initials[0]}</Text>
      </View>
    );
  }
  return (
    <View style={styles.stack} testID="inbox-initials-stack">
      {avatar.initials.map((initials, index) => (
        <View
          key={index}
          style={[
            styles.disc,
            index > 0 ? styles.overlap : null,
            {
              boxShadow: ring,
              backgroundColor:
                index === 0 ? colors.primary : dark ? colors.surfaceStrong : colors.primarySoft,
            },
          ]}
        >
          <Text style={[styles.initials, { color: index === 0 ? firstInk : colors.primary }]}>
            {initials}
          </Text>
        </View>
      ))}
      {avatar.more > 0 ? (
        <View style={[styles.disc, styles.overlap, { boxShadow: ring, backgroundColor: colors.trackBg }]}>
          <Text style={[styles.initials, { color: dark ? colors.text : colors.muted }]}>
            +{avatar.more}
          </Text>
        </View>
      ) : null}
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
  stack: { flexDirection: 'row', flexShrink: 0 },
  overlap: { marginLeft: -8 },
  initials: { ...interLine(10, 12), fontFamily: FONTS.sansSemiBold },
  rank: { ...fraunces(600, 13) },
});
