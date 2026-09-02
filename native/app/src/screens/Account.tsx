// native/app/src/screens/Account.tsx
// Native #1876: kontoflata — hvem du er logget inn som, og de to tingene du kan
// gjøre med selve kontoen.
//
// **Hvorfor en egen skjerm og ikke bare en lenke i hjem-footeren.** App Review
// skal kunne finne slette-veien uten forklaring, og en «Slett konto»-lenke rett
// under «Logg ut» på hjem gir en irreversibel handling samme vekt som å logge
// ut. Her ligger den ett trykk unna, i et rom som handler om kontoen — og selve
// slettingen har fortsatt sin egen bekreftelsesskjerm bak seg.
//
// **«Logg ut» står to steder med vilje.** Hjem-footeren beholder sin, for det er
// den veien alle allerede kjenner; denne er her fordi et konto-rom uten utlogging
// ville sendt folk tilbake til hjem for den ene tingen de faktisk kom for.
//
// Skjermen har ingen egen tilstand: alt den viser kommer fra sesjonen.
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ACCOUNT_TEXT } from '../lib/accountCopy';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { supabase } from '../supabase';
import { useTheme } from '../theme';

export function Account({ navigation }: ScreenProps<'Account'>) {
  const { email } = useSession();
  const { ui } = useTheme();

  return (
    <ScrollView contentContainerStyle={ui.scroll} testID="account-screen">
      <Text style={ui.title}>{ACCOUNT_TEXT.accountHeading}</Text>

      <View style={ui.card} testID="account-identity">
        <Text style={ui.label}>{ACCOUNT_TEXT.signedInAs}</Text>
        {/* Samme fallback som hjem-footeren. Innlogging går via engangskode på
            e-post, så feltet er i praksis alltid satt — men sesjonstypen tillater
            null, og da er «Innlogget» ærligere enn en tom linje. */}
        <Text style={ui.body} testID="account-email">
          {email ?? 'Innlogget'}
        </Text>
      </View>

      <Pressable
        style={ui.buttonSecondary}
        onPress={() => void supabase.auth.signOut()}
        testID="account-sign-out"
      >
        <Text style={ui.buttonSecondaryText}>{ACCOUNT_TEXT.signOut}</Text>
      </Pressable>

      {/* Lavmælt med vilje: en lenke, ikke en knapp. Den skal være til å finne,
          ikke til å snuble i. */}
      <Pressable
        style={ui.link}
        onPress={() => navigation.navigate('DeleteAccount')}
        testID="account-delete-entry"
      >
        <Text style={ui.linkText}>{ACCOUNT_TEXT.deleteEntry}</Text>
      </Pressable>
    </ScrollView>
  );
}
