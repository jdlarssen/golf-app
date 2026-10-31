// native/app/src/components/create/primitives.tsx
// Native N6a (#1854): de små byggeklossene de fire veiviser-stegene deler.
//
// Ingen av dem vet noe om golf. De finnes her fordi et skjema med fire steg
// ellers ville fått fire nesten like varianter av «rad man kan velge» — og
// fordi tap-flaten (44) og tema-fargene da måtte gjentas i hver av dem.
//
// Alle er tema-bevisste via `useTheme()`: dette er de første flatene i appen
// som bygges etter #1833, så ingenting her leser den statiske lys-paletten.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { TAP, useTheme } from '../../theme';
import { DesignSwitch, listSwitchOffColor } from '../DesignSwitch';

/** Etikett over et felt, med feltet under. */
export function Field({
  label,
  hint,
  children,
  testID,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  testID?: string;
}) {
  const { ui } = useTheme();
  return (
    <View style={styles.field} testID={testID}>
      <Text style={ui.label}>{label}</Text>
      {children}
      {hint ? <Text style={ui.muted}>{hint}</Text> : null}
    </View>
  );
}

/**
 * En rad man velger — format, bane, tee, spiller.
 *
 * `selected` tegner en skoggrønn ramme på lys grønn bunn, som veiviseren på
 * nettsiden (#2709). Gull er for vinnere. Rammen er 2 pt, og luften inni er
 * 1 pt mindre, så raden ikke flytter seg når den velges. `disabled` demper
 * raden uten å skjule den: en spiller som ikke får plass i formatet skal
 * fortsatt være synlig, ellers ser lista ut som om personen er borte.
 */
export function SelectRow({
  title,
  subtitle,
  selected = false,
  disabled = false,
  onPress,
  testID,
  right,
}: {
  title: string;
  subtitle?: string | null;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  testID: string;
  right?: ReactNode;
}) {
  const { colors, ui } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={[
        styles.row,
        selected
          ? { backgroundColor: colors.primarySoft, borderColor: colors.primary, ...styles.rowSelected }
          : { backgroundColor: colors.surface, borderColor: colors.border },
        disabled && styles.rowDisabled,
      ]}
    >
      <View style={styles.rowText}>
        <Text style={ui.body}>{title}</Text>
        {subtitle ? <Text style={ui.muted}>{subtitle}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

export interface ChipOption<T extends string | number> {
  value: T;
  label: string;
  testID: string;
  /**
   * Valget finnes, men kan ikke tas her (#1859: et tee-sett banen ikke rater).
   *
   * Dempet og synlig, ikke borte — som `SelectRow.disabled`. Forsvant chipen,
   * ville arrangøren lurt på om appen mangler juniortee i det hele tatt; står
   * den grå, sier raden hva banen har.
   */
  disabled?: boolean;
}

/**
 * Et lite valg på én linje — brutto/netto, live/til slutt, lag 1–4.
 *
 * Ikke en `Picker`: alternativene er få og korte, og en rad med chips er ett
 * tapp mot pickerens tre. Chipsene bryter til neste linje når de ikke får
 * plass, så lange etiketter aldri havner utenfor skjermen.
 */
export function Chips<T extends string | number>({
  options,
  value,
  onChange,
  testID,
  style,
}: {
  options: readonly ChipOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  testID?: string;
  /** Luft rundt raden der den ikke står i et `Field` (spillerlista, #2716). */
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, ui } = useTheme();
  return (
    <View style={[styles.chips, style]} testID={testID}>
      {options.map((option) => {
        const active = option.value === value;
        const disabled = option.disabled === true;
        return (
          <Pressable
            key={option.testID}
            testID={option.testID}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={[
              styles.chip,
              active
                ? { backgroundColor: colors.primarySoft, borderColor: colors.primary, ...styles.chipSelected }
                : { backgroundColor: colors.bg, borderColor: colors.border },
              disabled && styles.chipDisabled,
            ]}
          >
            <Text style={active ? ui.body : ui.muted}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Av/på med forklaring under — sideturnering, makker-godkjenning. */
export function ToggleRow({
  label,
  hint,
  value,
  onChange,
  testID,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  testID: string;
}) {
  const { colors, scheme, ui } = useTheme();
  return (
    <View style={styles.field}>
      <View style={styles.toggleRow}>
        <Text style={[ui.body, styles.toggleLabel]}>{label}</Text>
        {/* Tørnys egen bryter, som i innstillingene (#2709). */}
        <DesignSwitch
          testID={testID}
          value={value}
          disabled={false}
          onValueChange={onChange}
          label={label}
          onColor={colors.primary}
          offColor={listSwitchOffColor(colors, scheme)}
        />
      </View>
      {hint ? <Text style={ui.muted}>{hint}</Text> : null}
    </View>
  );
}

/** Rolig merknad — ikke en feil, men noe arrangøren bør se før publisering. */
export function Note({ children, testID }: { children: string; testID: string }) {
  const { ui } = useTheme();
  return (
    <View style={ui.banner}>
      <Text style={ui.muted} testID={testID}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6, marginTop: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: TAP + 12,
    // 16 som listene ellers i appen (#2709).
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 8,
  },
  rowSelected: { borderWidth: 2, paddingHorizontal: 13, paddingVertical: 9 },
  rowText: { flex: 1, gap: 2 },
  rowDisabled: { opacity: 0.4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipDisabled: { opacity: 0.4 },
  chip: {
    minHeight: TAP,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { borderWidth: 2, paddingHorizontal: 15 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: TAP,
    gap: 12,
  },
  toggleLabel: { flex: 1 },
});
