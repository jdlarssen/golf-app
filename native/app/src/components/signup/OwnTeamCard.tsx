// native/app/src/components/signup/OwnTeamCard.tsx
// #2840 del 4: «Meld på laget ditt» på runden, for arrangøren av en lagrunde med påmelding.
//
// Eierens svar 2 på v2: med lagpåmelding står du ikke på lista fra start
// (`organiserStartsOnRoster`). Når runden er publisert, tilbyr appen deg å melde på laget
// ditt, med deg som kaptein. Tegningen v3.1, rammen «ownTeam»: tittel i Fraunces, én
// linje under og en hovedknapp.
//
// Kortet ser selv etter om du alt har et lag, med samme titt som «Laget ditt»-raden
// (`fetchTeamPage` med `visit: false`, så ingen varsler merkes lest). Bare uten lag
// (`no_team`) står kortet. Har du et lag, står raden til lagsiden i stedet. Uten nett eller
// ved en feil står ingenting: påmeldingen finnes også via delelenken.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchTeamPage } from '../../data/teamPage';
import { OWN_TEAM_TEXT } from '../../lib/registrationCopy';
import { FONTS, fraunces, interLine, useTheme } from '../../theme';

export function OwnTeamCard({ shortId, onOpen }: { shortId: string; onOpen: () => void }) {
  const { colors, ui } = useTheme();
  const [noTeam, setNoTeam] = useState(false);
  const latest = useRef(0);

  // Ved fokus: kommer du tilbake fra påmeldingen med et lag, skal kortet gå bort.
  useFocusEffect(
    useCallback(() => {
      const thisLoad = ++latest.current;
      void fetchTeamPage(shortId, { visit: false }).then((result) => {
        if (thisLoad !== latest.current) return;
        if (result.ok) setNoTeam(result.view.kind === 'no_team');
        // En feil lar kortet stå som det sto.
      });
    }, [shortId]),
  );

  if (!noTeam) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]} testID="own-team-card">
      <Text style={[styles.title, { color: colors.text }]}>{OWN_TEAM_TEXT.title}</Text>
      <Text style={[styles.body, { color: colors.text }]}>{OWN_TEAM_TEXT.body}</Text>
      <Pressable
        testID="own-team-open"
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => [ui.button, styles.button, pressed ? styles.pressed : null]}
      >
        <Text style={ui.buttonText}>{OWN_TEAM_TEXT.button}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // `.block`: 18 i hjørnene, 16 inni, 12 mellom delene. Skjermen har alt kanten.
  card: { marginTop: 4, borderRadius: 18, padding: 16, gap: 12 },
  // `.big`: Fraunces 500, 22/27,5.
  title: fraunces(500, 22),
  // `.body`: 15 pt, linjehøyde 1,45.
  body: { ...interLine(15, 21.75, { multiline: true }), fontFamily: FONTS.sans },
  // `.btn`: 52 høy. Kortets mellomrom står allerede over.
  button: { marginTop: 0, minHeight: 52 },
  pressed: { opacity: 0.6 },
});
