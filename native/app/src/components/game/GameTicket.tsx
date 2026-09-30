// #2255: startbilletten øverst på spillets side.
//
// Ren presentasjon: skjermen regner ut hodet og feltene (`lib/gameTicket.ts`),
// og stubben kommer inn som `children`. Billetten vet ingenting om status.
//
// **Drakten er designlerretets, identisk** (eieren 30.09: «identisk med
// artboardet»): gull kicker og fylt statusmerke i salvie på samme rad,
// banenavnet i 30 pt, tre like kolonner med 24 pt-tall, deg først i
// avatarraden med fornavnene i egen kolonne, en tett perforering med rette
// streker og kortskyggen fra DESIGN.md. Ingen faktalinje: den står ikke på
// tegningen. Gull kicker er et bevisst unntak fra «gull er medalje» (DESIGN.md).
//
// **Skjermleseren.** Banenavnet er overskriften. Hvert felt er én node med
// etikett og verdi («Dine slag: 15»), og avatarraden er én node med navnene.
// Skivene, perforeringen og hakkene er dekor og skjult.
//
// **Hakkene** ligger over billetten som søsken, ikke inni den, av samme grunn
// som på Hjem (`NextStartTicket`): iOS tegner et elements kant over sine egne
// barn, så et hakk inni billetten ble en bule under kantlinja. Perforeringen
// står på en høyde som avhenger av innholdet over, så hakkene plasseres etter
// at den er målt.
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { BundlePlayer } from '../../data/gameBundle';
import { shortDisplayName } from '../../lib/display';
import { MAX_TICKET_COMPANIONS, companionsOf } from '../../lib/flightRoster';
import { rosterNames } from '../../lib/gameTicket';
import { rosterA11y } from '../../lib/ticketCopy';
import { FONTS, cardShadow, useTheme, withAlpha } from '../../theme';
import { FlightAvatars } from '../home/FlightAvatars';

export interface TicketField {
  label: string;
  value: string;
  /** En andre linje under verdien, som datoen under klokkeslettet. */
  sub?: string | null;
  /** Hele feltet som én setning for skjermleseren. */
  a11y: string;
  testID: string;
}

export function GameTicket({
  kicker,
  title,
  headerLine,
  statusLabel,
  fields,
  roster,
  children,
}: {
  /** Spillnavnet over banenavnet, eller `null` når spillnavnet er tittelen. */
  kicker: string | null;
  title: string;
  headerLine: string;
  statusLabel: string;
  fields: readonly TicketField[];
  /** Hvem du spiller med. `null` når skjermen ikke vet hvem du er. */
  roster: { players: readonly BundlePlayer[]; userId: string; flightNumber: number | null } | null;
  /** Stubben under perforeringen. */
  children: ReactNode;
}) {
  const { colors, ui, scheme } = useTheme();
  const [perforationY, setPerforationY] = useState<number | null>(null);
  const ink = { color: colors.onStrong };
  const companions = roster ? companionsOf(roster.players, roster.userId, roster.flightNumber) : [];
  const names = rosterNames(companions.map(shortDisplayName), MAX_TICKET_COMPANIONS);

  const notch = { backgroundColor: colors.bg, borderColor: colors.border };
  const notchTop = perforationY === null ? null : perforationY + PERFORATION / 2 - NOTCH / 2;

  return (
    <View style={[styles.wrap, { boxShadow: cardShadow(scheme) }]} testID="game-ticket">
      <View style={[styles.ticket, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.head, { backgroundColor: colors.surfaceStrong }]}>
          <View style={[styles.kickerRow, !kicker && styles.kickerRowEnd]}>
            {kicker ? (
              <Text
                style={[ui.kicker, styles.kicker, { color: colors.accent }]}
                numberOfLines={1}
                testID="game-ticket-kicker"
              >
                {kicker}
              </Text>
            ) : null}
            {/* Fylt merke uten kant, som i designet: salvie (`live`) i 22 %
                dekning og den varme kremen (`onStrongWarm`, #ECE5D2). Hodet er
                skog i begge draktene, så merket er likt i begge. */}
            <View style={[styles.badge, { backgroundColor: withAlpha(colors.live, BADGE_ALPHA) }]} testID="game-ticket-status">
              <Text style={[styles.badgeText, { color: colors.onStrongWarm }]}>{statusLabel}</Text>
            </View>
          </View>
          <Text accessibilityRole="header" style={[styles.title, ink]} testID="game-ticket-title">
            {title}
          </Text>
          {headerLine ? (
            <Text style={[styles.headerLine, ink]} testID="game-ticket-line">
              {headerLine}
            </Text>
          ) : null}
        </View>

        <View style={styles.fields}>
          {fields.map((field) => (
            <View
              key={field.testID}
              accessible
              accessibilityLabel={field.a11y}
              style={styles.field}
              testID={field.testID}
            >
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>{field.label}</Text>
              <Text style={[styles.fieldValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                {field.value}
              </Text>
              {field.sub ? <Text style={[styles.small, ui.num, { color: colors.muted }]}>{field.sub}</Text> : null}
            </View>
          ))}
        </View>

        {roster && companions.length > 0 ? (
          <View
            accessible
            accessibilityLabel={rosterA11y(roster.flightNumber != null, names)}
            style={styles.roster}
            testID="game-ticket-roster"
          >
            <FlightAvatars
              players={roster.players}
              userId={roster.userId}
              flightNumber={roster.flightNumber}
              variant="ticket"
              testID="game-ticket-avatars"
            />
            <Text style={[styles.names, { color: colors.muted }]} testID="game-ticket-names">
              {names}
            </Text>
          </View>
        ) : null}

        <View
          style={styles.perforation}
          onLayout={(event) => setPerforationY(event.nativeEvent.layout.y)}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID="game-ticket-perforation"
        >
          {Array.from({ length: DASHES }, (_, i) => (
            <View key={i} style={[styles.dash, { backgroundColor: colors.border }]} />
          ))}
        </View>

        <View style={styles.stub} testID="game-ticket-stub">
          {children}
        </View>
      </View>

      {notchTop !== null ? (
        <>
          <View
            style={[styles.notchClip, styles.notchClipLeft, { top: notchTop }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <View style={[styles.notch, styles.notchLeft, notch]} />
          </View>
          <View
            style={[styles.notchClip, styles.notchClipRight, { top: notchTop }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <View style={[styles.notch, styles.notchRight, notch]} />
          </View>
        </>
      ) : null}
    </View>
  );
}

/**
 * Perforeringen som i designet (`border-top: 2px dashed`, som nettleseren
 * tegner med 6 pt lange streker): 33 rette streker fra hakk til hakk.
 */
const DASHES = 33;
/** Statusmerket: designets `rgba(125,170,138,0.22)`, altså `live` i 22 %. */
const BADGE_ALPHA = 0.22;
const NOTCH = 20;
const PERFORATION = 20;
const RADIUS = 20;
/** Billettens kant; hakkene sentreres på den. */
const EDGE = 1;

const styles = StyleSheet.create({
  // Avstanden over billetten gir skjermen (8 pt under toppen, som i designet).
  wrap: { borderRadius: RADIUS },
  ticket: { borderWidth: EDGE, borderRadius: RADIUS, overflow: 'hidden' },
  head: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  kickerRowEnd: { justifyContent: 'flex-end' },
  // Selve stilen er den delte `ui.kicker` (#2385); her bare krympingen.
  kicker: { flexShrink: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  // Linjehøydene er det nettleseren gir designets `line-height: normal`.
  badgeText: { fontSize: 11, lineHeight: 14, fontFamily: FONTS.sansSemiBold },
  title: { fontSize: 30, lineHeight: 34.5, fontFamily: FONTS.serifDisplay, marginTop: 8 },
  headerLine: { fontSize: 13, fontFamily: FONTS.sans, opacity: 0.9, marginTop: 4 },
  fields: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 16 },
  field: { flex: 1 },
  fieldLabel: {
    fontSize: 10,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  fieldValue: {
    fontSize: 24,
    lineHeight: 29,
    fontFamily: FONTS.serifScore,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  small: { fontSize: 12, fontFamily: FONTS.sans },
  roster: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 16 },
  names: { flex: 1, fontSize: 12, lineHeight: 16, fontFamily: FONTS.sans },
  perforation: {
    height: PERFORATION,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  dash: { width: 6, height: 2 },
  stub: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, gap: 12 },
  // Boksen dekker kanten og den indre halvdelen av sirkelen; resten klippes.
  notchClip: {
    position: 'absolute',
    pointerEvents: 'none',
    width: NOTCH / 2 + EDGE,
    height: NOTCH,
    overflow: 'hidden',
  },
  notchClipLeft: { left: 0 },
  notchClipRight: { right: 0 },
  notch: {
    position: 'absolute',
    top: 0,
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    borderWidth: EDGE,
  },
  notchLeft: { left: EDGE / 2 - NOTCH / 2 },
  notchRight: { right: EDGE / 2 - NOTCH / 2 },
});
