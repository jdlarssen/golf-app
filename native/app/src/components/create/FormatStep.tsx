// native/app/src/components/create/FormatStep.tsx
// Native N6a (#1854, #2753): steg 2 — hvilket spill skal dette være?
//
// **Alle formatene vises, ingen filtreres bort på spillerantall.** Rosteret
// settes først i steg 5, så på dette tidspunktet er arrangøren alene i lista;
// et antalls-filter ville skjult de fleste kortene på en fersk veiviser og
// fått appen til å se ødelagt ut. Kortene bærer i stedet antallet formatet
// krever («3–5 spillere»), og steg 5 sier fra hvis rosteret ikke passer. Det
// er også webbens semantikk: den gater ved steg-overgangen, ikke ved å
// nullstille formatvalget under føttene på arrangøren.
//
// Feilet hentingen, vises den ærlige noten — aldri en tom liste. «Ingen
// formater er aktive» og «vi fikk ikke sjekket» er to forskjellige svar, og
// bare det ene betyr at det er nettet som er nede (#1832-guardrailen).
import type { ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Tap } from '../Tap';
import {
  FORMAT_CATALOG_FETCH_NOTE,
  type FormatCatalogEntry,
} from '../../data/formatCatalog';
import type { AppGameMode } from '../../lib/appFormats';
import {
  CREATE_ON_WEB_LABEL,
  CREATE_ON_WEB_PATH,
} from '../../lib/createGameCopy';
import { describePlayerCounts } from '../../lib/rosterLimits';
import { useTheme } from '../../theme';
import { WebLinkButton } from '../WebLinkButton';
import { linkSlop, SelectRow } from './primitives';

export function FormatStep({
  entries,
  failed,
  selected,
  onSelect,
  onRetry,
  beforeList,
}: {
  /** `null` mens hentingen pågår. */
  entries: FormatCatalogEntry[] | null;
  failed: boolean;
  selected: AppGameMode | null;
  onSelect: (mode: AppGameMode) => void;
  onRetry: () => void;
  /** Mellom tittelen og lista: klubbvalget i en klubbturnering (#2753). */
  beforeList?: ReactNode;
}) {
  const { colors, ui } = useTheme();

  return (
    <View testID="create-step-format">
      <Text style={ui.title}>Hva skal dere spille?</Text>

      {beforeList}

      {failed ? (
        <View style={ui.banner}>
          <Text style={ui.error} testID="create-format-error">
            {FORMAT_CATALOG_FETCH_NOTE}
          </Text>
          {/* #2928: en ekte knapp. Den usynlige utvidelsen gir 44 pt i høyden
              uten å flytte noe; over står bare feilteksten. */}
          <Tap
            onPress={onRetry}
            hitSlop={linkSlop()}
            testID="create-format-retry"
            accessibilityRole="button"
          >
            <Text style={ui.linkText}>Prøv igjen</Text>
          </Tap>
        </View>
      ) : null}

      {entries === null && !failed ? (
        <View style={ui.banner}>
          <ActivityIndicator color={colors.primary} testID="create-format-loading" />
          <Text style={ui.muted}>Henter formatene …</Text>
        </View>
      ) : null}

      {entries !== null && entries.length === 0 ? (
        <>
          <Text style={ui.body} testID="create-format-empty">
            Ingen formater er slått på akkurat nå. Opprett spillet på nettsiden.
          </Text>
          {/* #1891: uten knapp var dette veiviserens blindvei — ingen formater
              å velge, og ingen vei videre. Webbens `/opprett-spill` er den
              åpne veiviseren, ikke Sekretariatet. */}
          <WebLinkButton
            label={CREATE_ON_WEB_LABEL}
            path={CREATE_ON_WEB_PATH}
            testID="create-format-empty-link"
          />
        </>
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
