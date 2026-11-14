// native/app/src/components/friends/FriendSheet.tsx
// #2256, #2878: arket fra en person — navnet, de tre tallene og en bunn som
// kan byttes. Venner bruker det med «Fjern venn» (#2256), ligaen med «Legg til
// venn», «Godta» eller ingen knapp (#2878). Bakteppet, dra-ned og
// `accessibilityViewIsModal` er de samme begge steder.
//
// Delene arket er bygget av (`Avatar`, `Pill`, `RowsCard`) bor her også, og
// Venner bruker dem derfra.
import { Children, Fragment, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nameInitials } from '../../../../../lib/names/initials';
import { FRIENDS_TEXT, friendStatusLine } from '../../lib/friendsCopy';
import { FONTS, fraunces, sheetGrabber, sheetScrim, TAP, useTheme } from '../../theme';
import { HakeIcon } from '../icons/Icons';

export type AvatarTone = 'strong' | 'soft' | 'warm';

/** Det arket viser om personen. `rows` er de tre ferdig skrevne tallene. */
export interface SheetPerson {
  id: string;
  name: string;
  /** Linja under navnet («Vil bli venn med deg», «Dere er venner»). */
  subline?: string | null;
  avatarTone: AvatarTone;
  rows: { hcp: string; rounds: string; lastPlayed: string };
}

/** Det som står nederst, over «Lukk». */
export type SheetBottom =
  | { kind: 'remove'; onRemove: () => void }
  | {
      kind: 'action';
      label: string;
      pendingLabel: string;
      onPress: () => void;
      busy: boolean;
      testID: string;
    }
  | { kind: 'sent' }
  | { kind: 'none' };

/**
 * Arket: navnet, de tre tallene og bunnen. Dras ned eller lukkes med «Lukk»
 * og med et trykk utenfor. `errorLine` står over bunnen når noe gikk galt.
 */
export function FriendSheet({
  person,
  bottom,
  errorLine = null,
  loading = false,
  onClose,
}: {
  person: SheetPerson | null;
  bottom: SheetBottom;
  errorLine?: string | null;
  /** Mens forholdet hentes: en liten hjul der knappen kommer. */
  loading?: boolean;
  onClose: () => void;
}) {
  const { ui, colors, scheme } = useTheme();
  // #1954 D3: en Modal i bunnen går under navigasjonslinja med kant til kant.
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={person !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: sheetScrim(colors, scheme) }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={FRIENDS_TEXT.sheetClose}
          testID="friend-sheet-backdrop"
        />
        {person ? (
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.bg, borderColor: colors.border, paddingBottom: 36 + insets.bottom },
            ]}
            accessibilityViewIsModal
            testID="friend-sheet"
          >
            <View style={[styles.grabber, { backgroundColor: sheetGrabber(scheme) }]} />
            <View style={styles.sheetHead}>
              <Avatar name={person.name} tone={person.avatarTone} />
              <View style={styles.sheetNameBlock}>
                <Text
                  accessibilityRole="header"
                  style={[styles.sheetName, { color: colors.text }]}
                  numberOfLines={2}
                >
                  {person.name || FRIENDS_TEXT.someoneFallback}
                </Text>
                {person.subline ? (
                  <Text style={[styles.sheetSub, { color: colors.muted }]} testID="friend-sheet-subline">
                    {person.subline}
                  </Text>
                ) : null}
              </View>
            </View>
            <RowsCard>
              <SheetRow label={FRIENDS_TEXT.sheetHcp} value={person.rows.hcp} testID="friend-sheet-hcp" />
              <SheetRow label={FRIENDS_TEXT.sheetRounds} value={person.rows.rounds} testID="friend-sheet-rounds" />
              <SheetRow
                label={FRIENDS_TEXT.sheetLastPlayed}
                value={person.rows.lastPlayed}
                testID="friend-sheet-last"
              />
            </RowsCard>
            {errorLine ? (
              <Text style={[styles.errorLine, { color: colors.danger }]} testID="friend-sheet-error">
                {errorLine}
              </Text>
            ) : null}
            {loading ? (
              <View style={styles.bottomSlot} testID="friend-sheet-loading">
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <SheetBottomView bottom={bottom} personId={person.id} />
            )}
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={ui.buttonSecondary}
              testID="friend-sheet-close"
            >
              <Text style={ui.buttonSecondaryText}>{FRIENDS_TEXT.sheetClose}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function SheetBottomView({ bottom, personId }: { bottom: SheetBottom; personId: string }) {
  const { colors } = useTheme();
  switch (bottom.kind) {
    case 'remove':
      return (
        <Pill
          tone="danger"
          size="large"
          label={FRIENDS_TEXT.removeConfirmLabel}
          onPress={bottom.onRemove}
          testID={`friends-remove-${personId}`}
        />
      );
    case 'action':
      return (
        <Pill
          tone="filled"
          size="large"
          label={bottom.label}
          pendingLabel={bottom.pendingLabel}
          pending={bottom.busy}
          // Låst mens handlingen går, men ikke dempet: «Sender …» skal leses.
          disabled={bottom.busy}
          onPress={bottom.onPress}
          testID={bottom.testID}
        />
      );
    case 'sent':
      return (
        <View style={styles.sent} testID="friend-sheet-sent">
          <HakeIcon size={18} color={colors.successText} />
          <Text style={[styles.sentText, { color: colors.successText }]}>
            {friendStatusLine('requested')?.text}
          </Text>
        </View>
      );
    case 'none':
      return null;
  }
}

export function SheetRow({ label, value, testID }: { label: string; value: string; testID: string }) {
  const { ui, colors } = useTheme();
  return (
    <View style={styles.sheetRow} accessible accessibilityLabel={`${label}: ${value}`} testID={testID}>
      <Text style={[styles.sheetLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.sheetValue, ui.num, { color: colors.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** Radene i et kort, med streker mellom dem, ikke under den siste (som webben). */
export function RowsCard({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.rowsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {Children.toArray(children).map((row, index) => (
        <Fragment key={index}>
          {index > 0 ? <View style={[styles.separator, { backgroundColor: colors.divider }]} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

/**
 * Initialene i en sirkel. Skogen for venner, den lyse grønne for forespørsler
 * og kremtonen (`trackBg`) for forslag, som i designet. Pynt: navnet står ved
 * siden av.
 */
export function Avatar({ name, tone }: { name: string; tone: AvatarTone }) {
  const { colors } = useTheme();
  const look =
    tone === 'strong'
      ? { bg: colors.surfaceStrong, ink: colors.onStrong }
      : tone === 'soft'
        ? { bg: colors.primarySoft, ink: colors.primary }
        : { bg: colors.trackBg, ink: colors.muted };
  return (
    <View
      style={[styles.avatar, { backgroundColor: look.bg }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.avatarText, { color: look.ink }]}>{nameInitials(name)}</Text>
    </View>
  );
}

type PillTone = 'filled' | 'outline' | 'danger' | 'onStrongFilled' | 'onStrongOutline';

/** Knappene på siden: piller som i designet, ≥ 44 pt høye. */
export function Pill({
  label,
  pendingLabel,
  pending = false,
  disabled = false,
  tone = 'filled',
  size = 'regular',
  smallText = false,
  grow = false,
  expanded,
  accessibilityLabel,
  onPress,
  testID,
}: {
  label: string;
  pendingLabel?: string;
  pending?: boolean;
  disabled?: boolean;
  tone?: PillTone;
  size?: 'regular' | 'large';
  /** Høyden fra `size`, men 13 pt tekst («På e-post» i heltekortet). */
  smallText?: boolean;
  grow?: boolean;
  expanded?: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  const look = {
    filled: { bg: colors.primary, border: colors.primary, ink: colors.onPrimary },
    outline: { bg: 'transparent', border: colors.primary, ink: colors.primary },
    danger: { bg: 'transparent', border: colors.danger, ink: colors.danger },
    onStrongFilled: { bg: colors.onStrongWarm, border: colors.onStrongWarm, ink: colors.surfaceStrong },
    onStrongOutline: { bg: 'transparent', border: `${colors.onStrongWarm}80`, ink: colors.onStrongWarm },
  }[tone];
  // Fylte piller har ingen kant i designet, så de blir ikke 2 pt bredere.
  const filled = tone === 'filled' || tone === 'onStrongFilled';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, busy: pending, ...(expanded === undefined ? {} : { expanded }) }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.pill,
        size === 'large' ? styles.pillLarge : null,
        grow ? styles.pillGrow : null,
        { backgroundColor: look.bg, borderColor: look.border },
        filled ? styles.pillFilled : null,
        disabled && !pending ? styles.dimmed : null,
      ]}
      testID={testID}
    >
      <Text
        style={[
          styles.pillText,
          size === 'large' && !smallText ? styles.pillTextLarge : null,
          { color: look.ink },
        ]}
        numberOfLines={1}
      >
        {pending && pendingLabel ? pendingLabel : label}
      </Text>
    </Pressable>
  );
}

const AVATAR = 36;

const styles = StyleSheet.create({
  rowsCard: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  separator: { height: 1 },

  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 12, fontFamily: FONTS.sansSemiBold },

  pill: {
    minHeight: TAP,
    minWidth: TAP,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pillLarge: { minHeight: 48 },
  pillGrow: { flexGrow: 1 },
  pillFilled: { borderWidth: 0 },
  pillText: { fontSize: 13, fontFamily: FONTS.sansSemiBold },
  pillTextLarge: { fontSize: 15 },
  dimmed: { opacity: 0.5 },

  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  // Hinnen og grep-streken som de andre arkene (#2709): `sheetScrim` blir
  // mørkere i klubbhus-natt, og hjørnene er 20 som på QR- og send-tilbake-arket.
  backdrop: { ...StyleSheet.absoluteFill },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    // Bunnen: 36 + systemlinja, i komponenten. Toppen: 8 over grep-streken.
    paddingTop: 8,
    paddingHorizontal: 20,
    gap: 14,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetNameBlock: { flex: 1, minWidth: 0, gap: 2 },
  // Navnet kan gå over to linjer.
  sheetName: { ...fraunces(500, 22, undefined, { multiline: true }) },
  sheetSub: { fontSize: 12, lineHeight: 15, fontFamily: FONTS.sans },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: TAP,
    paddingHorizontal: 14,
  },
  sheetLabel: { fontSize: 14, fontFamily: FONTS.sans },
  sheetValue: { flexShrink: 1, fontSize: 15, fontFamily: FONTS.sansSemiBold, textAlign: 'right' },

  // #2878: linja over bunnen, 15/20 i `danger`, 4 inn som resten av arket.
  errorLine: { fontSize: 15, lineHeight: 20, fontFamily: FONTS.sans, paddingHorizontal: 4 },
  bottomSlot: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  // «Venneforespørsel sendt.» står der knappen var: 48 høy, midtstilt.
  sent: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  sentText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
});
