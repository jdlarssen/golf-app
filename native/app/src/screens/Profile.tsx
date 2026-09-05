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
// **Rommet leser; skrivingen bor i sitt eget rom.** «Rediger profil» fører til
// `EditProfile`, og lagringen derfra går gjennom `PUT /api/profile` — appen kan
// aldri skrive rett mot `users`, for en handicap-retting må også regne om de
// frosne banehandicapene i pågående runder, og den jobben er service-role. Her
// vises resultatet: kommer spilleren tilbake med en kvittering, står banneret
// øverst og raden hentes på nytt.
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { TAP, useTheme } from '../theme';

export function Profile({ navigation, route }: ScreenProps<'Profile'>) {
  const { userId, email } = useSession();
  const { ui } = useTheme();

  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState(false);
  // Null = ingenting galt. Ellers er det linja som skal stå under raden: enten
  // «du er fortsatt logget inn» (sesjonen overlevde, `signout-failed`) eller
  // den generelle når kallet kastet. To ulike årsaker, to ulike setninger.
  const [logoutNote, setLogoutNote] = useState<string | null>(null);

  // Kvitteringen `EditProfile` kommer tilbake med. Banneret er RENT avledet av
  // ruteparameteren — ingen egen state, ingen setState i en effekt — og
  // parameteren nullstilles når rommet mister fokus (effekten lenger nede).
  const updated = route.params?.saved === true;

  // Hentingen bor i en callback fordi rommet leser raden to ganger: når det
  // åpnes, og på nytt når `EditProfile` kommer tilbake med en kvittering. Samme
  // funksjon begge veier — to lesninger som kunne drifte fra hverandre er
  // nettopp det vi ikke vil ha rett etter en lagring.
  const load = useCallback(() => {
    let cancelled = false;
    void fetchOwnProfile(userId)
      .then((row) => {
        if (cancelled) return;
        setProfile(row);
        setLoadFailed(false);
      })
      .catch((err: unknown) => {
        console.error('[Profile] profiloppslag feilet', err);
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(load, [load]);

  // Ny lagring → les raden på nytt, så kortet viser det som faktisk står i
  // basen og ikke det skjemaet trodde det sendte. Opprydningen fra `load`
  // kastes her: kvitteringen kommer én gang, og en avbrutt henting ville vært
  // nettopp den vi ba om.
  useEffect(() => {
    if (!updated) return;
    load();
  }, [updated, load]);

  // Kvitteringen er en engangsbeskjed, og den nullstilles når rommet mister
  // fokus. Uten det ville flagget blitt stående i ruteparameteren — skjermen
  // ligger jo igjen i stacken — og banneret dukket opp på nytt neste gang
  // spilleren kom tilbake hit, for eksempel etter å ha åpnet skjemaet og
  // ombestemt seg.
  useEffect(
    () =>
      navigation.addListener('blur', () => {
        navigation.setParams({ saved: false });
      }),
    [navigation],
  );

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
      {updated ? (
        <View style={ui.banner}>
          <Text style={ui.body} testID="profile-updated-banner">
            {PROFILE_TEXT.updatedBanner}
          </Text>
        </View>
      ) : null}

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
          <HandicapLine
            profile={profile}
            onSetHandicap={() => navigation.navigate('EditProfile')}
          />
        ) : null}
      </View>

      {/* Chevron: raden fører til et rom, den handler ikke her og nå. */}
      <SettingList testID="profile-edit">
        <SettingRow
          label={PROFILE_TEXT.editRow}
          chevron
          onPress={() => navigation.navigate('EditProfile')}
          testID="profile-edit-entry"
        />
      </SettingList>

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
 * Uten handicap står det «hcp –» og en «Sett handicap»-lenke i stedet for
 * ferskhets-linja — webbens ordlyd, og nå med et sted å gå: skjemaet den peker
 * på finnes fra og med denne PR-en. Lenka har tap-flate (`TAP`) selv om
 * teksten er smalere; to ord er ikke en trykkflate i seg selv.
 */
function HandicapLine({
  profile,
  onSetHandicap,
}: {
  profile: OwnProfile;
  onSetHandicap: () => void;
}) {
  const { ui } = useTheme();
  // Lokal konstant, ikke `profile.hcpIndex` direkte: `tsc` snevrer inn en const
  // etter null-sjekken, men ikke et felt på et objekt som kan ha endret seg
  // mellom de to lesningene. Alternativet ville vært en cast.
  //
  // #1979: en ufullført profil har ikke noe handicap å vise. Kolonnen er
  // `not null default 54.0`, så raden sier «54» selv om spilleren aldri har
  // tastet noe — og kortet sto dermed og presenterte databasens default som et
  // tall hen hadde valgt, med «Oppdatert i dag» under. Vi lar den falle til
  // samme gren som en tom profil: «hcp –» og en vei til skjemaet.
  const hcp = profile.profileCompletedAt == null ? null : profile.hcpIndex;

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
          å si «oppdatert» om — da er spørsmålet i stedet om å sette det. */}
      {hcp != null ? (
        <Text style={ui.muted} testID="profile-hcp-age">
          {describeHandicapAge(profile.handicapUpdatedAt)}
        </Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={onSetHandicap}
          style={styles.setHandicap}
          testID="profile-set-handicap"
        >
          <Text style={ui.linkText}>{PROFILE_TEXT.setHandicap}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hcpLine: { gap: 2 },
  setHandicap: { minHeight: TAP, justifyContent: 'center', alignSelf: 'flex-start' },
  dangerGap: { marginTop: 24 },
});
