// native/app/src/components/friends/FriendParts.tsx
// #2256, #2381: delene Venner og vennesiden er bygget av — sirkelen med
// initialene, pillene og radkortet. Arket fra en person (#2256, #2878) er
// erstattet av vennesiden (`screens/FriendPage.tsx`), så fila heter ikke lenger
// etter det.
import { Children, Fragment, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Tap } from '../Tap';
import { nameInitials } from '../../../../../lib/names/initials';
import { FONTS, TAP, useTheme } from '../../theme';

export type AvatarTone = 'strong' | 'soft' | 'warm';

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

/** Sirkelens størrelser: 36 i lister, 44 i «Mot hverandre» og 56 øverst på vennesiden. */
type AvatarSize = 36 | 44 | 56;

/** 36 er sirkelen fra Venner, uendret; de to nye har designets linjehøyder. */
const AVATAR_TEXT: Record<AvatarSize, { fontSize: number; lineHeight?: number }> = {
  36: { fontSize: 12 },
  44: { fontSize: 14, lineHeight: 18 },
  56: { fontSize: 20, lineHeight: 24 },
};

/**
 * Initialene i en sirkel. Skogen for venner, den lyse grønne for forespørsler
 * og kremtonen (`trackBg`) for forslag, som i designet. Pynt: navnet står ved
 * siden av. `initials` overstyrer initialene av navnet (din egen sirkel på
 * vennesiden, der navnet er «Du»).
 */
export function Avatar({
  name,
  tone,
  size = 36,
  initials,
}: {
  name: string;
  tone: AvatarTone;
  size?: AvatarSize;
  initials?: string | null;
}) {
  const { colors } = useTheme();
  const look =
    tone === 'strong'
      ? { bg: colors.surfaceStrong, ink: colors.onStrong }
      : tone === 'soft'
        ? { bg: colors.primarySoft, ink: colors.primary }
        : { bg: colors.trackBg, ink: colors.muted };
  return (
    <View
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: look.bg }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.avatarText, AVATAR_TEXT[size], { color: look.ink }]}>
        {initials ?? nameInitials(name)}
      </Text>
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
    <Tap
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
    </Tap>
  );
}

const styles = StyleSheet.create({
  rowsCard: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  separator: { height: 1 },

  avatar: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontFamily: FONTS.sansSemiBold },

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
});
