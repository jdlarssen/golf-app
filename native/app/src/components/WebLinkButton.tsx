// native/app/src/components/WebLinkButton.tsx
// Native #1891: den ene knappen som tar deg dit appen ikke kan gå.
//
// Ligger på toppen av `components/` og ikke i en av undermappene fordi den
// brukes på tvers av dem — opprett-veiviseren, spill-skjermene, scorekortet og
// leaderboard-visningene har alle minst ett sted der veien videre går om
// nettsiden (kartleggingen i #1891).
//
// **Sekundær, ikke primær.** Å forlate appen er aldri hovedhandlingen på en
// skjerm; det er utveien når en handling ikke finnes her ennå. Knappen får
// derfor `buttonSecondary` (og med den tap-flaten på 44) — den skal være
// tydelig og lett å treffe, men ikke konkurrere med skjermens egen CTA.
//
// **Underteksten er fast og står FØR trykket.** Appen og Safari deler ikke
// sesjon (OTP-kode uten URL), så det venter en innlogging på andre siden.
// Å oppdage det først etter at nettleseren har åpnet seg, føles som en feil —
// derfor står den som en setning under knappen, ikke som en overraskelse.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WEB_LINK_TEXT, describeWebLinkFailure, openWeb } from '../lib/webLink';
import { useTheme } from '../theme';

interface WebLinkButtonProps {
  /** Knappeteksten, f.eks. «Åpne cupen». Eies av kallstedet — den vet konteksten. */
  label: string;
  /** Stien på webben, med eller uten ledende skråstrek. */
  path: string;
  /** Settes på selve knappen, så kallstedets egne tester kan trykke på den. */
  testID?: string;
}

/**
 * Sekundær knapp som åpner en side på webben, med den ærlige feilen synlig når
 * den ikke lot seg åpne.
 *
 * Feilen rendres i knappens egen blokk og ikke i en `Alert`: mangler bygget
 * `EXPO_PUBLIC_WEB_BASE_URL`, er hvert eneste trykk forgjeves, og da skal
 * setningen bli stående i stedet for å måtte avvises én gang per forsøk.
 */
export function WebLinkButton({ label, path, testID }: WebLinkButtonProps) {
  const { ui } = useTheme();
  const [errorText, setErrorText] = useState<string | null>(null);

  async function open(): Promise<void> {
    const result = await openWeb(path);
    // Nullstilles på suksess: prøvde arrangøren igjen etter en feil og kom
    // gjennom, skal ikke den gamle setningen bli stående og si det motsatte.
    setErrorText(result.ok ? null : describeWebLinkFailure(result.reason));
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        style={ui.buttonSecondary}
        onPress={() => void open()}
        testID={testID}
      >
        <Text style={ui.buttonSecondaryText}>{label}</Text>
      </Pressable>
      <Text style={ui.muted}>{WEB_LINK_TEXT.hint}</Text>
      {errorText ? <Text style={ui.error}>{errorText}</Text> : null}
    </View>
  );
}

// `buttonSecondary` har allerede `marginTop`; her trengs bare luft mellom
// knappen, underteksten og en eventuell feil.
const styles = StyleSheet.create({
  wrap: { gap: 6 },
});
