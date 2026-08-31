// native/app/src/components/create/FormatStep.tsx
// Native N6a (#1854): steg 1 — hvilket spill skal dette være?
//
// **Alle formatene vises, ingen filtreres bort på spillerantall.** Rosteret
// settes først i steg 4, så på dette tidspunktet er arrangøren alene i lista;
// et antalls-filter ville skjult seks av åtte kort på en fersk veiviser og
// fått appen til å se ødelagt ut. Kortene bærer i stedet antallet formatet
// krever («3–5 spillere»), og steg 4 sier fra hvis rosteret ikke passer. Det
// er også webbens semantikk: den gater ved steg-overgangen, ikke ved å
// nullstille formatvalget under føttene på arrangøren.
//
// Feilet hentingen, vises den ærlige noten — aldri en tom liste. «Ingen
// formater er aktive» og «vi fikk ikke sjekket» er to forskjellige svar, og
// bare det ene betyr at det er nettet som er nede (#1832-guardrailen).
import { ActivityIndicator, Text, View } from 'react-native';
import {
  FORMAT_CATALOG_FETCH_NOTE,
  type FormatCatalogEntry,
} from '../../data/formatCatalog';
import type { AppGameMode } from '../../lib/appFormats';
import { describePlayerCounts } from '../../lib/rosterLimits';
import { useTheme } from '../../theme';
import { SelectRow } from './primitives';

export function FormatStep({
  entries,
  failed,
  selected,
  onSelect,
  onRetry,
}: {
  /** `null` mens hentingen pågår. */
  entries: FormatCatalogEntry[] | null;
  failed: boolean;
  selected: AppGameMode | null;
  onSelect: (mode: AppGameMode) => void;
  onRetry: () => void;
}) {
  const { colors, ui } = useTheme();

  return (
    <View testID="create-step-format">
      <Text style={ui.title}>Hva skal dere spille?</Text>

      {failed ? (
        <View style={ui.banner}>
          <Text style={ui.error} testID="create-format-error">
            {FORMAT_CATALOG_FETCH_NOTE}
          </Text>
          <Text
            style={ui.linkText}
            onPress={onRetry}
            testID="create-format-retry"
          >
            Prøv igjen
          </Text>
        </View>
      ) : null}

      {entries === null && !failed ? (
        <View style={ui.banner}>
          <ActivityIndicator color={colors.primary} testID="create-format-loading" />
          <Text style={ui.muted}>Henter formatene …</Text>
        </View>
      ) : null}

      {entries !== null && entries.length === 0 ? (
        <Text style={ui.body} testID="create-format-empty">
          Ingen formater er slått på akkurat nå. Opprett spillet på nettsiden.
        </Text>
      ) : null}

      {(entries ?? []).map((entry) => (
        <SelectRow
          key={entry.slug}
          testID={`create-format-${entry.slug}`}
          title={entry.label}
          subtitle={describePlayerCounts(entry.slug)}
          selected={entry.slug === selected}
          onPress={() => onSelect(entry.slug)}
        />
      ))}
    </View>
  );
}
