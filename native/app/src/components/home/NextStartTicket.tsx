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
// like ut på iOS og Android. Hjem v2 (#2385) tegner dem som nettleseren gjør
// designets `border-right: 2px dashed`: streker på 6 pt med rundt 4 pt mellom,
// fra toppen til bunnen av billetten, med første og siste strek helt i hver
// ende. Hakkene dekker endene, så strekene går fra hakk til hakk.
//
// **Hakkene** oppe og nede ligger OVER billetten som søsken, ikke inni den:
// iOS tegner et elements kant over sine egne barn, så et hakk inni billetten
// ble en bule under kantlinja i stedet for et kutt i den (simulator-beviset,
// #2254). Designets hakk er en sirkel i sidens bakgrunnsfarge med kant bare
// nederst (øverste hakk) eller øverst (nederste): kanten er en tynn månesigd
// som er 1 pt midt på og smalner mot sidene. Her er den to sirkler, en i
// kantfarge forskjøvet 1 pt utover og en i bakgrunnsfarge over den.
import { useState } from 'react';
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
import { FONTS, frauncesLine, interLine, useTheme } from '../../theme';
import { FlightAvatars } from './FlightAvatars';

/** Designets stiplede strek på 2 pt: streker på 6 pt og rundt 4 pt mellom. */
const DASH = 6;
const DASH_GAP = 4;

/** Så mange streker som får plass, med en strek i hver ende. */
export function dashCount(length: number): number {
  return Math.max(2, Math.round((length + DASH_GAP) / (DASH + DASH_GAP)));
}

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

  const [perforation, setPerforation] = useState(0);
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
          onLayout={(e) => setPerforation(e.nativeEvent.layout.height)}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID="home-ticket-perforation"
        >
          {perforation > 0
            ? Array.from({ length: dashCount(perforation) }, (_, i) => (
                <View key={i} style={[styles.dash, { backgroundColor: colors.border }]} />
              ))
            : null}
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
      {(['top', 'bottom'] as const).map((side) => (
        <View
          key={side}
          style={[styles.notch, side === 'top' ? styles.notchTop : styles.notchBottom]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID={`home-ticket-notch-${side}`}
        >
          <View
            style={[
              styles.notchDisc,
              side === 'top' ? styles.notchDiscLow : null,
              { backgroundColor: colors.border },
            ]}
          />
          <View
            style={[
              styles.notchDisc,
              side === 'bottom' ? styles.notchDiscLow : null,
              { backgroundColor: colors.bg },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const NOTCH = 18;
const STUB = 104;
/** Billettens kant. */
const EDGE = 1;
/** Perforeringen er en smal kolonne, som designets stiplede strek på 2 pt. */
const PERFORATION = 2;
/**
 * Designets hakk står `left: 95px` og `top`/`bottom: -9px` fra innsiden av
 * kanten, og er 19 høyt (18 og kanten på 1). Midten står 1 pt til venstre for
 * perforeringens midte, og hakket rekker 10 pt inn i billetten.
 */
const NOTCH_LEFT = 95;
const NOTCH_OUT = 9;

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
  // Nettleserens linjebokser: Inter 11 er 14 pt høy, og klokka har
  // `line-height: 1.1` (33 pt).
  date: {
    ...interLine(11, 14),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  clock: { ...frauncesLine(30, 33), fontFamily: FONTS.serifScore },
  noTime: { fontSize: 13, textAlign: 'center' },
  proximity: { ...interLine(11, 14), fontFamily: FONTS.sans },
  perforation: {
    width: PERFORATION,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notch: {
    position: 'absolute',
    pointerEvents: 'none',
    left: EDGE + NOTCH_LEFT,
    width: NOTCH,
    height: NOTCH + EDGE,
  },
  notchTop: { top: EDGE - NOTCH_OUT },
  notchBottom: { bottom: EDGE - NOTCH_OUT },
  notchDisc: {
    position: 'absolute',
    top: 0,
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
  },
  notchDiscLow: { top: EDGE },
  dash: { width: PERFORATION, height: DASH },
  body: { flex: 1, padding: 14, gap: 6, justifyContent: 'center' },
  name: { fontSize: 18, lineHeight: 23, fontFamily: FONTS.serifDisplay },
  detail: { fontSize: 12, fontFamily: FONTS.sans },
});
