// #2348: lagringsbrikka på hullsiden (artboardet `Synk-forslag`).
//
// En pille med prikk som sier om slagene er sendt («Alt er lagret»), ligger på
// telefonen («3 slag på telefonen») eller ikke ble lagret («1 hull ikke
// lagret»). Trykk åpner arket «Trygt på telefonen». Ren visning: tilstanden og
// teksten kommer fra kalleren.
//
// Fargene er temaets: gul er `warningSoft`/`warningText`/`warning`, rød er
// `dangerSoft`/`dangerBorder`/`danger`, og grønn er `primarySoft`/`primary`
// som ✓-rutene i arket. Bare den gule er tegnet; grønn og rød er avledet. I
// sollys er pillen hvit med svart kant og svart tekst, som resten av hullsiden;
// bare prikken har farge.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SyncChipState } from '../../../../../lib/sync/roundSyncState';
import { SYNC_CHIP_TEXT } from '../../lib/syncChipCopy';
import { FONTS, TAP, type ThemeColors, useTheme, withAlpha } from '../../theme';

type Tone = { bg: string; border: string; text: string; dot: string };

function toneFor(state: SyncChipState, c: ThemeColors): Tone {
  if (state === 'quarantined') {
    return { bg: c.dangerSoft, border: c.dangerBorder, text: c.danger, dot: c.danger };
  }
  if (state === 'pending') {
    // Tegningens kant (#e3c98f) har ingen egen token: prikkens rav, halvt gjennomsiktig.
    return { bg: c.warningSoft, border: withAlpha(c.warning, 0.5), text: c.warningText, dot: c.warning };
  }
  return { bg: c.primarySoft, border: withAlpha(c.primary, 0.25), text: c.primary, dot: c.primary };
}

export function SyncChip({
  state,
  text,
  expanded,
  sunlight,
  onPress,
}: {
  state: SyncChipState;
  text: string;
  /** Arket er åpent. */
  expanded: boolean;
  sunlight: boolean;
  onPress: () => void;
}) {
  const { colors, hole } = useTheme();
  const tone = toneFor(state, colors);
  const pill = sunlight
    ? { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: hole.borderW }
    : { backgroundColor: tone.bg, borderColor: tone.border, borderWidth: 1 };

  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, pill]}
      testID="sync-chip"
      accessibilityRole="button"
      accessibilityLabel={SYNC_CHIP_TEXT.a11yLabel}
      accessibilityValue={{ text }}
      accessibilityState={{ expanded }}
    >
      <View style={[styles.dot, { backgroundColor: tone.dot }]} testID={`sync-chip-dot-${state}`} />
      <Text style={[styles.text, { color: sunlight ? colors.text : tone.text }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: TAP,
    paddingHorizontal: 14,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-end',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 13, fontFamily: FONTS.sansSemiBold, fontVariant: ['tabular-nums'] },
});
