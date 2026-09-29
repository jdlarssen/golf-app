// #2256: «Personvern og konto» — e-posten, personvernerklæringen og veien til
// sletting, flyttet ut av profilen da den ble en bag-tag.
//
// Raden til personvernerklæringen er flyttet uendret fra `Profile.tsx`
// (#2229: Apple krever at den kan nås inne i appen). «Slett konto» står
// fortsatt alene nederst i rødt, med luft over, og fører til
// bekreftelsessiden (`DeleteAccount`). Tilbake derfra (`goBack`) lander her.
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SettingList, SettingRow } from '../components/SettingRow';
import { PROFILE_TEXT } from '../lib/profileCopy';
import { describeWebLinkFailure, openWeb } from '../lib/webLink';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { useTheme } from '../theme';

export function AccountSettings({ navigation }: ScreenProps<'AccountSettings'>) {
  const { email } = useSession();
  const { ui } = useTheme();
  // Null til et trykk ikke fikk åpnet nettsiden; da står grunnen under raden
  // til neste trykk.
  const [privacyNote, setPrivacyNote] = useState<string | null>(null);

  // `openWeb` kaster aldri — den svarer typet — så det finnes ingen
  // catch-gren å skrive her.
  const onOpenPrivacy = useCallback(() => {
    setPrivacyNote(null);
    void openWeb('/legal/privacy').then((result) => {
      if (!result.ok) setPrivacyNote(describeWebLinkFailure(result.reason));
    });
  }, []);

  return (
    <ScrollView contentContainerStyle={ui.scroll} testID="account-settings-screen">
      <Text style={ui.sectionTitle}>{PROFILE_TEXT.sectionAccount}</Text>
      {/* Innlogging går via engangskode på e-post, så feltet er i praksis
          alltid satt — men sesjonstypen tillater null, og da er «Innlogget»
          ærligere enn en tom linje. */}
      <View style={ui.card}>
        <Text style={ui.body} testID="account-email">
          {email ?? 'Innlogget'}
        </Text>
      </View>

      <Text style={ui.sectionTitle}>{PROFILE_TEXT.sectionAbout}</Text>
      <SettingList testID="account-about">
        <SettingRow
          label={PROFILE_TEXT.privacyRow}
          sublabel={PROFILE_TEXT.privacySublabel}
          onPress={onOpenPrivacy}
          testID="account-privacy"
        />
      </SettingList>

      {privacyNote ? (
        <Text style={ui.error} testID="account-privacy-error">
          {privacyNote}
        </Text>
      ) : null}

      {/* Luften over sletting er en tap-buffer, ikke en marg: `SettingList` har
          alt 8 på toppen, og disse 24 gjør avstanden ned fra raden over til 32. */}
      <View style={styles.dangerGap}>
        <SettingList testID="account-danger">
          <SettingRow
            label={PROFILE_TEXT.deleteRow}
            tone="danger"
            chevron
            onPress={() => navigation.navigate('DeleteAccount')}
            testID="account-delete-entry"
          />
        </SettingList>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  dangerGap: { marginTop: 24 },
});
