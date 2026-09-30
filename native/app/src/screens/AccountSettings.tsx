// #2256: «Personvern og konto» — e-posten, utloggingen, personvernerklæringen
// og veien til sletting, flyttet ut av profilen da den ble en bag-tag.
//
// Raden til personvernerklæringen er flyttet uendret fra `Profile.tsx`
// (#2229: Apple krever at den kan nås inne i appen). «Slett konto» står
// fortsatt alene nederst i rødt, med luft over, og fører til
// bekreftelsessiden (`DeleteAccount`). Tilbake derfra (`goBack`) lander her.
//
// **Profil v2: «Logg ut» og utviklerflaten bor her.** Profilen skal være
// identisk med designlerretet, og der slutter siden med «Del bag-taggen».
// Utloggingen står rett under e-posten den logger ut av. Logikken er flyttet
// uendret fra profilen: `logOut` spør før uleverte slag blir liggende, og raden
// låser seg ikke når sesjonen overlevde.
//
// **Hierarkiet.** «Logg ut» er en helt vanlig rad, og «Slett konto» står alene
// nederst i rødt med luft over. Luften er ikke pynt — den er avstanden en
// tommel på vei mot raden over trenger for ikke å treffe sletting.
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SettingList, SettingRow } from '../components/SettingRow';
import { logOut } from '../data/logout';
import { PROFILE_TEXT, unsentStrokesWarning } from '../lib/profileCopy';
import { isStagingBuild } from '../lib/stagingGate';
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
  const [pending, setPending] = useState(false);
  // Null = ingenting galt. Ellers er det linja som skal stå under raden: enten
  // «du er fortsatt logget inn» (sesjonen overlevde, `signout-failed`) eller
  // den generelle når kallet kastet. To ulike årsaker, to ulike setninger.
  const [logoutNote, setLogoutNote] = useState<string | null>(null);

  // `openWeb` kaster aldri — den svarer typet — så det finnes ingen
  // catch-gren å skrive her.
  const onOpenPrivacy = useCallback(() => {
    setPrivacyNote(null);
    void openWeb('/legal/privacy').then((result) => {
      if (!result.ok) setPrivacyNote(describeWebLinkFailure(result.reason));
    });
  }, []);

  /**
   * Spørsmålet `logOut` stiller når køen ikke er tom.
   *
   * Webben logger deg stille ut fordi den ikke har noe lokalt lager å rydde.
   * Appen har det (#1877), og et slag som ikke rakk å bli sendt ville forsvunnet
   * uten et ord. En teeboks uten dekning er ikke kanten her — det er det helt
   * normale tilfellet, og derfor spør vi i stedet for å velge på spillerens
   * vegne.
   *
   * Dialogen kan ikke avvises: hvert svar må komme fra en av de to knappene.
   * Kunne den lukkes med Android-tilbake eller et trykk utenfor, ville ingen
   * `onPress` fyrt, og raden stått deaktivert til neste gang skjermen bygges.
   */
  const askAboutUnsent = useCallback((unsent: number) => {
    Alert.alert(
      PROFILE_TEXT.unsentStrokesTitle,
      unsentStrokesWarning(unsent),
      [
        {
          text: PROFILE_TEXT.unsentStrokesCancel,
          style: 'cancel',
          // Ingenting har skjedd — ingen signOut, ingen wipe. Raden skal være
          // trykkbar igjen med det samme.
          onPress: () => setPending(false),
        },
        {
          text: PROFILE_TEXT.unsentStrokesConfirm,
          style: 'destructive',
          onPress: () => {
            void logOut({ keepUnsent: true })
              .then((result) => {
                // `unsent` kan ikke komme tilbake her — `keepUnsent` hopper
                // over den porten. Blir sesjonen stående, skal raden bli
                // trykkbar igjen med den ærlige forklaringen.
                if (result.ok || result.reason !== 'signout-failed') return;
                setPending(false);
                setLogoutNote(PROFILE_TEXT.logoutOfflineNote);
              })
              .catch((err: unknown) => {
                console.error('[AccountSettings] utlogging kastet', err);
                setPending(false);
                setLogoutNote(PROFILE_TEXT.logoutFailedNote);
              });
          },
        },
      ],
      { cancelable: false },
    );
  }, []);

  /**
   * Trykket på «Logg ut».
   *
   * Ved suksess settes `pending` bevisst ikke tilbake: sesjonen er borte,
   * `SIGNED_OUT` bytter til Login-stacken, og denne skjermen unmountes sammen
   * med resten. «Logger ut …» er da den siste sanne tilstanden raden har —
   * samme valg som `DeleteAccount` gjør etter en fullført sletting.
   */
  const onLogOut = useCallback(() => {
    setPending(true);
    setLogoutNote(null);
    void logOut()
      .then((result) => {
        if (result.ok) return;
        if (result.reason === 'unsent') {
          askAboutUnsent(result.pending);
          return;
        }
        // Sesjonen overlevde utloggingen. Spilleren ER innlogget, basen er
        // urørt, og raden må bli trykkbar igjen — ellers står «Logger ut …»
        // til appen startes på nytt, på en skjerm som ikke unmountes fordi
        // `SIGNED_OUT` aldri kom.
        setPending(false);
        setLogoutNote(PROFILE_TEXT.logoutOfflineNote);
      })
      .catch((err: unknown) => {
        console.error('[AccountSettings] utlogging kastet', err);
        setPending(false);
        setLogoutNote(PROFILE_TEXT.logoutFailedNote);
      });
  }, [askAboutUnsent]);

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

      {/* Ingen chevron: raden navigerer ikke, den handler. Og ingen knappeform
          — utlogging er dagligdags, og skal ikke veie mer enn den er verdt. */}
      <SettingList testID="account-logout">
        <SettingRow
          label={pending ? PROFILE_TEXT.logoutPending : PROFILE_TEXT.logout}
          disabled={pending}
          onPress={onLogOut}
          testID="account-log-out"
        />
      </SettingList>
      {logoutNote ? (
        <Text style={ui.error} testID="account-logout-error">
          {logoutNote}
        </Text>
      ) : null}

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

      {/* I et butikk-bygg finnes utvikler-seksjonen ikke i treet i det hele
          tatt — `isStagingBuild` er fail-closed, og en skjult rad er fortsatt
          en rad. */}
      {isStagingBuild() ? (
        <>
          <Text style={ui.sectionTitle}>{PROFILE_TEXT.sectionDeveloper}</Text>
          <SettingList testID="account-developer">
            <SettingRow
              label={PROFILE_TEXT.syncLabRow}
              sublabel={PROFILE_TEXT.syncLabSublabel}
              chevron
              onPress={() => navigation.navigate('SyncLab')}
              testID="account-sync-lab"
            />
          </SettingList>
        </>
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
