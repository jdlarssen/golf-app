// #2255: startbilletten øverst på spillets side.
//
// Ren presentasjon: skjermen regner ut hodet, feltene og faktalinja
// (`lib/gameTicket.ts`), og stubben kommer inn som `children`. Billetten vet
// ingenting om status.
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
import { displayName } from '../../lib/display';
import { companionsOf } from '../../lib/flightRoster';
import { rosterNames } from '../../lib/gameTicket';
import { rosterA11y } from '../../lib/ticketCopy';
import { FONTS, useTheme } from '../../theme';
import { FlightAvatars } from '../home/FlightAvatars';

export interface TicketField {
  label: string;
  value: string;
  /** En andre linje under verdien, som klokkeslettet under datoen. */
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
  facts,
  roster,
  children,
}: {
  /** Spillnavnet over banenavnet, eller `null` når spillnavnet er tittelen. */
  kicker: string | null;
  title: string;
  headerLine: string;
  statusLabel: string;
  fields: readonly TicketField[];
  facts: string;
  /** Hvem du spiller med. `null` når skjermen ikke vet hvem du er. */
  roster: { players: readonly BundlePlayer[]; userId: string; flightNumber: number | null } | null;
  /** Stubben under perforeringen. */
  children: ReactNode;
}) {
  const { colors, ui } = useTheme();
  const [perforationY, setPerforationY] = useState<number | null>(null);
  const ink = { color: colors.onStrong };
  const companions = roster ? companionsOf(roster.players, roster.userId, roster.flightNumber) : [];

  const notch = { backgroundColor: colors.bg, borderColor: colors.border };
  const notchTop = perforationY === null ? null : perforationY + PERFORATION / 2 - NOTCH / 2;

  return (
    <View style={styles.wrap} testID="game-ticket">
      <View style={[styles.ticket, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.head, { backgroundColor: colors.surfaceStrong }]}>
          {kicker ? (
            <Text style={[styles.kicker, ink]} testID="game-ticket-kicker">
              {kicker}
            </Text>
          ) : null}
          <View style={styles.titleRow}>
            <Text
              accessibilityRole="header"
              style={[styles.title, ink]}
              testID="game-ticket-title"
            >
              {title}
            </Text>
            <View style={[styles.badge, { borderColor: colors.onStrong }]} testID="game-ticket-status">
              <Text style={[styles.badgeText, ink]}>{statusLabel}</Text>
            </View>
          </View>
          {headerLine ? (
            <Text style={[styles.headerLine, ink]} testID="game-ticket-line">
              {headerLine}
            </Text>
          ) : null}
        </View>

        <View style={styles.body}>
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
                <Text style={[styles.fieldValue, { color: colors.text }]}>{field.value}</Text>
                {field.sub ? <Text style={[ui.muted, ui.num]}>{field.sub}</Text> : null}
              </View>
            ))}
          </View>
          {facts ? (
            <Text style={[ui.muted, ui.num]} testID="game-ticket-facts">
              {facts}
            </Text>
          ) : null}
          {roster && companions.length > 0 ? (
            <View
              accessible
              accessibilityLabel={rosterA11y(
                roster.flightNumber != null,
                rosterNames(companions.map(displayName)),
              )}
              style={styles.roster}
              testID="game-ticket-roster"
            >
              <FlightAvatars
                players={roster.players}
                userId={roster.userId}
                flightNumber={roster.flightNumber}
                testID="game-ticket-avatars"
              />
              <Text style={[ui.body, styles.names]}>
                {rosterNames(companions.map(displayName))}
              </Text>
            </View>
          ) : null}
        </View>

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

const DASHES = 14;
const NOTCH = 18;
const PERFORATION = 18;
/** Billettens kant; hakkene sentreres på den. */
const EDGE = 1;

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  ticket: { borderWidth: EDGE, borderRadius: 18, overflow: 'hidden' },
  head: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 16, gap: 4 },
  kicker: {
    fontSize: 12,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    opacity: 0.85,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { flex: 1, fontSize: 24, lineHeight: 30, fontFamily: FONTS.serifScore },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 4,
  },
  badgeText: { fontSize: 12, fontFamily: FONTS.sansSemiBold },
  headerLine: { fontSize: 14, fontFamily: FONTS.sans, opacity: 0.9 },
  body: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8, gap: 12 },
  fields: { flexDirection: 'row', gap: 10 },
  field: { flex: 1, gap: 2 },
  fieldLabel: {
    fontSize: 11,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  fieldValue: {
    fontSize: 19,
    lineHeight: 24,
    fontFamily: FONTS.serifScore,
    fontVariant: ['tabular-nums'],
  },
  roster: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  names: { flexShrink: 1 },
  perforation: {
    height: PERFORATION,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: NOTCH,
  },
  dash: { width: 8, height: 2, borderRadius: 1 },
  stub: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 18, gap: 10 },
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
