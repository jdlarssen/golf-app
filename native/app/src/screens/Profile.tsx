// native/app/src/screens/Profile.tsx
// Native #1906: profil-rommet — hvem du er, og det du kan gjøre med kontoen din.
//
// **Hvorfor dette erstatter Konto-skjermen (#1876).** Den flata svarte på ett
// spørsmål — hvilken konto er jeg logget inn på — mens alt annet som handlet om
// deg selv lå strødd nederst på hjem: e-posten, «Konto», «Sync-lab» og «Logg
// ut» på rad. Fire lenker under spillene dine er ingen flate, det er en
// restehylle. Nå står det ett ord oppe til høyre på hjem, og bak det ligger
// rommet — samme form som webbens `/profile`.
//
// **Hierarkiet er hele endringen.** På Konto-skjermen var «Logg ut» en
// innrammet knapp og «Slett konto» en dempet lenke under den: den reversible
// handlingen sto tyngst, og den som ikke kan angres så ut som en fotnote. Her
// er «Logg ut» en helt vanlig rad, og «Slett konto» står alene nederst i rødt
// med luft over. Luften er ikke pynt — den er avstanden en tommel på vei mot
// «Logg ut» trenger for ikke å treffe sletting.
//
// **Rommet leser, det skriver ikke.** Redigering av profilfeltene kommer i
// PR B (`PUT /api/profile`), og derfor finnes det ingen rad her som later som
// om den fører til et skjema.
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SettingList, SettingRow } from '../components/SettingRow';
import { logOut } from '../data/logout';
import { fetchOwnProfile, type OwnProfile } from '../data/profile';
import {
  PROFILE_TEXT,
  describeHandicapAge,
  formatHcpNb,
  unsentStrokesWarning,
} from '../lib/profileCopy';
import { isStagingBuild } from '../lib/stagingGate';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { useTheme } from '../theme';

export function Profile({ navigation }: ScreenProps<'Profile'>) {
  const { userId, email } = useSession();
  const { ui } = useTheme();

  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState(false);
  // Null = ingenting galt. Ellers er det linja som skal stå under raden: enten
  // «du er fortsatt logget inn» (sesjonen overlevde, `signout-failed`) eller
  // den generelle når kallet kastet. To ulike årsaker, to ulike setninger.
  const [logoutNote, setLogoutNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOwnProfile(userId)
      .then((row) => {
        if (!cancelled) setProfile(row);
      })
      .catch((err: unknown) => {
        console.error('[Profile] profiloppslag feilet', err);
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

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
                console.error('[Profile] utlogging kastet', err);
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
        console.error('[Profile] utlogging kastet', err);
        setPending(false);
        setLogoutNote(PROFILE_TEXT.logoutFailedNote);
      });
  }, [askAboutUnsent]);

  // Webbens kjede: eget navn, ellers e-posten, ellers literalen.
  const shownName =
    profile?.name?.trim() || email?.trim() || PROFILE_TEXT.displayNameFallback;

  return (
    <ScrollView contentContainerStyle={ui.scroll} testID="profile-screen">
      <View style={ui.card} testID="profile-identity">
        <Text style={ui.value} testID="profile-name">
          {shownName}
        </Text>
        {/* Innlogging går via engangskode på e-post, så feltet er i praksis
            alltid satt — men sesjonstypen tillater null, og da er «Innlogget»
            ærligere enn en tom linje. */}
        <Text style={ui.muted} testID="profile-email">
          {email ?? 'Innlogget'}
        </Text>

        {loadFailed ? (
          <Text style={ui.error} testID="profile-load-error">
            {PROFILE_TEXT.loadFailedNote}
          </Text>
        ) : profile ? (
          <HandicapLine profile={profile} />
        ) : null}
      </View>

      {/* Utvikler-seksjonen står ØVERST av de to, slik at sletting forblir den
          siste raden på skjermen uansett hvilket bygg appen er. I et
          butikk-bygg finnes den ikke i treet i det hele tatt — `isStagingBuild`
          er fail-closed, og en skjult rad er fortsatt en rad. */}
      {isStagingBuild() ? (
        <>
          <Text style={ui.sectionTitle}>{PROFILE_TEXT.sectionDeveloper}</Text>
          <SettingList testID="profile-developer">
            <SettingRow
              label={PROFILE_TEXT.syncLabRow}
              sublabel={PROFILE_TEXT.syncLabSublabel}
              chevron
              onPress={() => navigation.navigate('SyncLab')}
              testID="profile-sync-lab"
            />
          </SettingList>
        </>
      ) : null}

      <Text style={ui.sectionTitle}>{PROFILE_TEXT.sectionAccount}</Text>
      {/* Ingen chevron: raden navigerer ikke, den handler. Og ingen knappeform
          — utlogging er dagligdags, og skal ikke veie mer enn den er verdt. */}
      <SettingList testID="profile-account">
        <SettingRow
          label={pending ? PROFILE_TEXT.logoutPending : PROFILE_TEXT.logout}
          disabled={pending}
          onPress={onLogOut}
          testID="profile-log-out"
        />
      </SettingList>

      {logoutNote ? (
        <Text style={ui.error} testID="profile-logout-error">
          {logoutNote}
        </Text>
      ) : null}

      {/* Luften over sletting er en tap-buffer, ikke en marg: `SettingList` har
          alt 8 på toppen, og disse 24 gjør avstanden ned fra «Logg ut» til 32.
          Webben klarer seg med 16 fordi en musepeker ikke bommer. */}
      <View style={styles.dangerGap}>
        <SettingList testID="profile-danger">
          <SettingRow
            label={PROFILE_TEXT.deleteRow}
            tone="danger"
            chevron
            onPress={() => navigation.navigate('DeleteAccount')}
            testID="profile-delete-entry"
          />
        </SettingList>
      </View>
    </ScrollView>
  );
}

/**
 * «hcp 12,4» med ferskheten på linja under.
 *
 * Uten handicap står det bare «hcp –». Webben setter en «Sett handicap»-lenke
 * ved siden av, men den lenka hopper til feltet i profilskjemaet — og det
 * skjemaet finnes ikke i appen før PR B. En dempet linje som ber deg gjøre noe
 * appen ikke lar deg gjøre er verre enn ingen linje, så den kommer sammen med
 * skjemaet den peker på.
 */
function HandicapLine({ profile }: { profile: OwnProfile }) {
  const { ui } = useTheme();
  // Lokal konstant, ikke `profile.hcpIndex` direkte: `tsc` snevrer inn en const
  // etter null-sjekken, men ikke et felt på et objekt som kan ha endret seg
  // mellom de to lesningene. Alternativet ville vært en cast.
  const hcp = profile.hcpIndex;

  return (
    <View style={styles.hcpLine} testID="profile-hcp">
      <Text style={ui.muted}>
        {'hcp '}
        {/* Tabulær tallbredde på selve tallet, ikke på ordet foran. */}
        <Text style={[ui.muted, ui.num]} testID="profile-hcp-value">
          {hcp != null ? formatHcpNb(hcp) : '–'}
        </Text>
      </Text>
      {/* Ferskhets-merket hører til et handicap. Uten et tall er det ingenting
          å si «oppdatert» om. */}
      {hcp != null ? (
        <Text style={ui.muted} testID="profile-hcp-age">
          {describeHandicapAge(profile.handicapUpdatedAt)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hcpLine: { gap: 2 },
  dangerGap: { marginTop: 24 },
});
