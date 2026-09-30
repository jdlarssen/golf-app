// #2254: «Neste start» — neste planlagte runde som en billett med perforering.
//
// Hele billetten er ett trykkfelt til spillets side, og derfor ett element for
// skjermleseren: etiketten samler det øyet leser i stubben og til høyre,
// avatarraden inkludert.
//
// #2385 la billetten på designlerretet (`Hjem-forslag`): stubben er 104 pt
// med datoen som gull kicker, klokkeslettet stort i Fraunces og nærheten
// under, og til høyre står navnet, linja og skivene i designets størrelser.
//
// **Perforeringen** er en kolonne små streker, ikke `borderStyle: 'dashed'`.
// React Native tegner stiplet kant på én side ujevnt på iOS, og strekene ser
// like ut på iOS og Android.
//
// **Hakkene** oppe og nede ligger OVER billetten som søsken, ikke inni den:
// iOS tegner et elements kant over sine egne barn, så et hakk inni billetten
// ble en bule under kantlinja i stedet for et kutt i den (simulator-beviset,
// #2254). Hvert hakk er en halvsirkel i sidens bakgrunnsfarge med kantfarget
// bue, klippet av en boks så bare den indre halvdelen synes.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GameBundle } from '../../data/gameBundle';
import type { HomeCard } from '../../data/homeList';
import { APP_MODE_LABELS, isAppSupportedMode } from '../../lib/appFormats';
import { displayName, formatClock } from '../../lib/display';
import {
  HOME_TEXT,
  companionsLabel,
  flightPart,
  proximityText,
  ticketA11yLabel,
} from '../../lib/homeCopy';
import { formatStubClock, formatStubDate, teeOffProximityLocal } from '../../lib/homeDates';
import { MAX_HOME_COMPANIONS, companionsOf } from '../../lib/flightRoster';
import { FONTS, useTheme } from '../../theme';
import { FlightAvatars } from './FlightAvatars';

const DASHES = 9;

export function NextStartTicket({
  card,
  bundle,
  userId,
  now,
  onPress,
}: {
  card: HomeCard;
  /** Spillets bundel for flighten, eller `null` før den er hentet. */
  bundle: GameBundle | null;
  userId: string;
  now: Date;
  onPress: () => void;
}) {
  const { colors, ui } = useTheme();
  const date = formatStubDate(card.scheduledTeeOffAt);
  // Stort klokkeslett uten «kl.» i stubben; etiketten leser «kl. 09:20».
  const time = formatClock(card.scheduledTeeOffAt);
  const clock = formatStubClock(card.scheduledTeeOffAt);
  const proximity = proximityText(teeOffProximityLocal(card.scheduledTeeOffAt, now));
  const format = isAppSupportedMode(card.gameMode) ? APP_MODE_LABELS[card.gameMode] : null;
  const flightNumber =
    bundle?.players.find((p) => p.userId === userId)?.flightNumber ?? card.flightNumber;
  const detailParts = [
    card.courseName,
    flightNumber != null ? flightPart(flightNumber) : null,
    format,
  ].filter((part): part is string => part != null);
  const detail = detailParts.join(' · ');
  const companions = bundle ? companionsOf(bundle.players, userId, flightNumber) : [];

  const a11yLabel = ticketA11yLabel([
    card.name,
    date ? [date, clock].filter(Boolean).join(' ') : HOME_TEXT.noTeeOff,
    proximity,
    // Komma, ikke «·»: VoiceOver leser midtpunktet høyt.
    detailParts.join(', '),
    companions.length > 0
      ? companionsLabel(companions.map(displayName), flightNumber != null, MAX_HOME_COMPANIONS)
      : null,
  ]);

  const notch = { backgroundColor: colors.bg, borderColor: colors.border };
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        style={[styles.ticket, { backgroundColor: colors.surface, borderColor: colors.border }]}
        testID={`home-ticket-${card.gameId}`}
      >
        <View style={styles.stub}>
          {date ? (
            <>
              <Text style={[styles.date, { color: colors.accentText }]} testID="home-ticket-date">
                {date}
              </Text>
              {time ? (
                <Text style={[styles.clock, { color: colors.text }]} testID="home-ticket-clock">
                  {time}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={[ui.muted, styles.noTime]} testID="home-ticket-no-time">
              {HOME_TEXT.noTeeOff}
            </Text>
          )}
          {proximity ? (
            <Text style={[styles.proximity, { color: colors.muted }]} testID="home-ticket-proximity">
              {proximity}
            </Text>
          ) : null}
        </View>

        <View
          style={styles.perforation}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID="home-ticket-perforation"
        >
          {Array.from({ length: DASHES }, (_, i) => (
            <View key={i} style={[styles.dash, { backgroundColor: colors.border }]} />
          ))}
        </View>

        <View style={styles.body}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={3}>
            {card.name}
          </Text>
          {detail ? (
            <Text style={[styles.detail, { color: colors.muted }]} testID="home-ticket-detail">
              {detail}
            </Text>
          ) : null}
          {bundle ? (
            <FlightAvatars
              players={bundle.players}
              userId={userId}
              flightNumber={flightNumber}
              testID="home-ticket-avatars"
            />
          ) : null}
        </View>
      </Pressable>
      <View
        style={[styles.notchClip, styles.notchClipTop]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={[styles.notch, styles.notchTop, notch]} />
      </View>
      <View
        style={[styles.notchClip, styles.notchClipBottom]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={[styles.notch, styles.notchBottom, notch]} />
      </View>
    </View>
  );
}

const NOTCH = 18;
const STUB = 104;
/** Billettens kant; hakkene sentreres på den. */
const EDGE = 1;
/** Perforeringen er en smal kolonne, som designets stiplede strek på 2 pt. */
const PERFORATION = 2;

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  ticket: {
    flexDirection: 'row',
    borderWidth: EDGE,
    borderRadius: 16,
  },
  stub: {
    width: STUB,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  date: {
    fontSize: 11,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  clock: {
    fontSize: 30,
    lineHeight: 33,
    fontFamily: FONTS.serifScore,
    fontVariant: ['tabular-nums'],
  },
  noTime: { fontSize: 13, textAlign: 'center' },
  proximity: { fontSize: 11, fontFamily: FONTS.sans },
  perforation: {
    width: PERFORATION,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: NOTCH / 2 + 4,
  },
  // Boksen dekker kanten og den indre halvdelen av sirkelen; resten klippes.
  notchClip: {
    position: 'absolute',
    pointerEvents: 'none',
    left: EDGE + STUB + PERFORATION / 2 - NOTCH / 2,
    width: NOTCH,
    height: NOTCH / 2 + EDGE,
    overflow: 'hidden',
  },
  notchClipTop: { top: 0 },
  notchClipBottom: { bottom: 0 },
  notch: {
    position: 'absolute',
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    borderWidth: EDGE,
  },
  notchTop: { top: EDGE / 2 - NOTCH / 2 },
  notchBottom: { bottom: EDGE / 2 - NOTCH / 2 },
  dash: { width: 2, height: 6, borderRadius: 1 },
  body: { flex: 1, padding: 14, gap: 6, justifyContent: 'center' },
  name: { fontSize: 18, lineHeight: 23, fontFamily: FONTS.serifDisplay },
  detail: { fontSize: 12, fontFamily: FONTS.sans },
});
