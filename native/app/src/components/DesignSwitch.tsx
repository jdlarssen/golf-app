// native/app/src/components/DesignSwitch.tsx
// Bryteren fra Varsler-tegningen (#2256), flyttet ut av `NotificationsAndTheme`
// da «Personvern og konto» fikk en bryter for AI-tekstene (#2561). Utseende og
// oppførsel er uendret.
import { Pressable, StyleSheet, View } from 'react-native';
import { PALETTES, type Scheme, type ThemeColors } from '../theme';

/**
 * Bryteren fra tegningen: 52 × 32 spor og en rund knott på 26 pt, 3 pt fra
 * kanten. iOS sin egen `Switch` har en annen form (iOS 26 har en avlang
 * knott), så den tegnes her. Trykkflaten er 44 pt høy, og skjermleseren
 * hører en bryter med «på» eller «av».
 */
export function DesignSwitch({
  value,
  disabled,
  onValueChange,
  label,
  onColor,
  offColor,
  testID,
}: {
  value: boolean;
  disabled: boolean;
  onValueChange: (next: boolean) => void;
  label: string;
  onColor: string;
  offColor: string;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      hitSlop={SWITCH_HIT_SLOP}
      style={[
        styles.switchTrack,
        { backgroundColor: value ? onColor : offColor },
        value ? styles.switchOn : null,
        disabled ? styles.switchDisabled : null,
      ]}
      testID={testID}
    >
      <View style={styles.switchKnob} />
    </Pressable>
  );
}

/**
 * Av-sporet når bryteren står i en liste. Den dempede tekstfargen med 60 %
 * dekning i lys drakt og 80 % i mørk, så sporet måler minst 3:1 mot kortet
 * (WCAG 1.4.11): 3,33:1 mot hvitt, 3,59:1 mot mørkt kort og 3,23:1 mot det
 * innfelte mørke kortet. Før var det `#D9D2C2` (1,51:1) og 45 % dekning
 * (2,06:1). Én kilde for kontoinnstillingene og veiviseren (#2709).
 */
export function listSwitchOffColor(colors: ThemeColors, scheme: Scheme): string {
  return scheme === 'dark' ? `${colors.muted}CC` : `${colors.muted}99`;
}

const SWITCH_HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 };

const styles = StyleSheet.create({
  switchTrack: {
    width: 52,
    height: 32,
    borderRadius: 16,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  switchOn: { alignItems: 'flex-end' },
  switchDisabled: { opacity: 0.5 },
  // Knotten er hvit i begge drakter, som i tegningen og som iOS sin egen:
  // lys drakts flate.
  switchKnob: { width: 26, height: 26, borderRadius: 13, backgroundColor: PALETTES.light.surface },
});
