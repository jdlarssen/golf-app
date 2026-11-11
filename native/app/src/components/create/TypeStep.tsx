// native/app/src/components/create/TypeStep.tsx
// #2753: steg 1 — hva slags arrangement?
//
// Flisene er nettets steg 1 (`IntentSelector`, artboardet
// `Nyttspill-1-arrangement`): to i bredden, 150 høye, ikon over navn og én
// linje forklaring. Et trykk velger flisen, og «Neste» går videre, som på
// artboardet. Hvilke typer som vises, avgjør skjermen: «Solo / test» finnes
// ikke i appen.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ARRANGEMENT_TEXT,
  ARRANGEMENT_TILES,
  type AppIntent,
} from '../../lib/arrangementCopy';
import { fraunces, interLine, FONTS, useTheme } from '../../theme';
import { CupIcon, KlubbIcon, KompisIcon, type IconProps } from '../icons/Icons';

const ICONS: Record<AppIntent, (props: IconProps) => React.JSX.Element> = {
  kompis: KompisIcon,
  klubb: KlubbIcon,
  cup: CupIcon,
};

export function TypeStep({
  intents,
  selected,
  onSelect,
}: {
  /** Typene arrangøren kan velge, i nettets rekkefølge. */
  intents: readonly AppIntent[];
  selected: AppIntent | null;
  onSelect: (intent: AppIntent) => void;
}) {
  const { colors, ui } = useTheme();

  // To i bredden. En rad med én flis får en tom plass ved siden av, så flisen
  // står like bred som de andre.
  const rows: (AppIntent | null)[][] = [];
  for (let i = 0; i < intents.length; i += 2) {
    rows.push([intents[i]!, intents[i + 1] ?? null]);
  }

  return (
    <View testID="create-step-type">
      <Text style={ui.title}>{ARRANGEMENT_TEXT.title}</Text>
      <View style={styles.grid}>
        {rows.map((row) => (
          <View key={row.join('-')} style={styles.row}>
            {row.map((intent, i) => {
              if (intent === null) return <View key={`empty-${i}`} style={styles.tileSlot} />;
              const active = intent === selected;
              const Icon = ICONS[intent];
              const tile = ARRANGEMENT_TILES[intent];
              return (
                <Pressable
                  key={intent}
                  testID={`create-type-${intent}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={tile.label}
                  onPress={() => onSelect(intent)}
                  style={[
                    styles.tileSlot,
                    styles.tile,
                    active
                      ? { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderWidth: 2 }
                      : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                  ]}
                >
                  <Icon color={colors.primary} size={26} strokeWidth={1.6} />
                  <Text style={[styles.label, { color: colors.text }]}>{tile.label}</Text>
                  <Text style={[styles.description, { color: colors.muted }]}>
                    {tile.description}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Artboardet har 16 fra kanten; skjermen har 20.
  grid: { marginTop: 8, marginHorizontal: -4, gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  tileSlot: { flex: 1 },
  tile: {
    minHeight: 150,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'flex-start',
    gap: 8,
  },
  label: fraunces(600, 17),
  description: { ...interLine(12, 16.8, { multiline: true }), fontFamily: FONTS.sans },
});
