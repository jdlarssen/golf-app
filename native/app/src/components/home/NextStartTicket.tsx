// #2254: «Neste start» — neste planlagte runde som en billett med perforering.
//
// Hele billetten er ett trykkfelt til spillets side, og derfor ett element for
// skjermleseren: etiketten samler det øyet leser i stubben og til høyre,
// avatarraden inkludert.
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
import { displayName } from '../../lib/display';
import {
  HOME_TEXT,
  companionsLabel,
  flightPart,
  proximityText,
  ticketA11yLabel,
} from '../../lib/homeCopy';
import { formatStubClock, formatStubDate, teeOffProximityLocal } from '../../lib/homeDates';
import { MAX_AVATARS, companionsOf } from '../../lib/flightRoster';
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
      ? companionsLabel(companions.map(displayName), flightNumber != null, MAX_AVATARS)
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
              <Text style={[styles.date, { color: colors.text }]} testID="home-ticket-date">
                {date}
              </Text>
              {clock ? (
                <Text style={[ui.muted, ui.num]} testID="home-ticket-clock">
                  {clock}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={[ui.muted, styles.noTime]} testID="home-ticket-no-time">
              {HOME_TEXT.noTeeOff}
            </Text>
          )}
          {proximity ? (
            <Text style={[styles.proximity, { color: colors.primary }]} testID="home-ticket-proximity">
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
          <Text style={[ui.value, styles.name]} numberOfLines={3}>
            {card.name}
          </Text>
          {detail ? (
            <Text style={ui.muted} testID="home-ticket-detail">
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

const NOTCH = 16;
const STUB = 116;
/** Billettens kant; hakkene sentreres på den. */
const EDGE = 1;

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  ticket: {
    flexDirection: 'row',
    borderWidth: EDGE,
    borderRadius: 14,
    minHeight: 112,
  },
  stub: { width: STUB, paddingVertical: 14, paddingHorizontal: 12, gap: 4, justifyContent: 'center' },
  date: { fontSize: 16, fontFamily: FONTS.serifScore },
  noTime: { fontSize: 13 },
  proximity: { fontSize: 13, fontFamily: FONTS.sansSemiBold, marginTop: 2 },
  perforation: {
    width: NOTCH,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: NOTCH / 2 + 4,
  },
  // Boksen dekker kanten og den indre halvdelen av sirkelen; resten klippes.
  notchClip: {
    position: 'absolute',
    pointerEvents: 'none',
    left: EDGE + STUB,
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
  // Mindre enn `ui.value`: ved siden av stubben får et langt ord som
  // «Klubbmesterskap» ellers ikke plass på én linje og blir klippet.
  name: { fontSize: 19, lineHeight: 24 },
});
