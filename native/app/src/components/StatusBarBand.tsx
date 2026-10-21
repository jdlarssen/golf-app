// #1954 D3 (søsken-funn fra iOS-runden): skjermene uten header (Hjem,
// innloggingen, «Fullfør profilen» og AI-spørsmålet) legger statuslinjas høyde
// inn i rulleinnholdet selv. Da ruller innholdet opp under klokka og batteriet
// uten noe bakteppe. Denne stripen ligger fast over rullevisningen, like høy som
// statuslinja, i fargen som står øverst på skjermen. Den tar ikke imot trykk.
//
// Skjermen legger den ETTER ScrollView-en, så den tegnes over.
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function StatusBarBand({ color }: { color: string }) {
  const insets = useSafeAreaInsets();
  if (insets.top === 0) return null;
  return (
    <View
      pointerEvents="none"
      style={[styles.band, { height: insets.top, backgroundColor: color }]}
      testID="status-bar-band"
    />
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', top: 0, left: 0, right: 0 },
});
