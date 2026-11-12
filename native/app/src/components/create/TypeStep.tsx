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

  return (
    <View testID="create-step-type">
      <Text style={ui.title}>{ARRANGEMENT_TEXT.title}</Text>
      {/* To i bredden: hver celle er halve rutenettet, med halve mellomrommet
          som luft på hver side. Da står en flis alene like bred som de andre. */}
      <View style={styles.grid}>
        {intents.map((intent) => {
          const active = intent === selected;
          const Icon = ICONS[intent];
          const tile = ARRANGEMENT_TILES[intent];
          return (
            <View key={intent} style={styles.cell}>
              <Pressable
                testID={`create-type-${intent}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={tile.label}
                onPress={() => onSelect(intent)}
                style={[
                  styles.tile,
                  active
                    ? { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderWidth: 2 }
                    : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                ]}
              >
                <Icon color={colors.primary} size={26} strokeWidth={1.6} />
                <Text style={[styles.label, { color: colors.text }]}>{tile.label}</Text>
                <Text style={[styles.description, { color: colors.muted }]}>{tile.description}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const GAP = 10;

const styles = StyleSheet.create({
  // Artboardet har 16 fra kanten (skjermen har 20) og 10 mellom flisene.
  grid: { marginTop: 8, marginHorizontal: -4 - GAP / 2, flexDirection: 'row', flexWrap: 'wrap', rowGap: GAP },
  cell: { width: '50%', paddingHorizontal: GAP / 2 },
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
