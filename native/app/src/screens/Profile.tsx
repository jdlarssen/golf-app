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
// med luft over, nå i «Personvern og konto» (`AccountSettings.tsx`). Luften er
// ikke pynt — den er avstanden en tommel på vei mot raden over trenger for
// ikke å treffe sletting.
//
// **Rommet leser; skrivingen bor i sitt eget rom.** «Rediger» fører til
// `EditProfile`, og lagringen derfra går gjennom `PUT /api/profile` — appen kan
// aldri skrive rett mot `users`, for en handicap-retting må også regne om de
// frosne banehandicapene i pågående runder, og den jobben er service-role. Her
// vises resultatet: kommer spilleren tilbake med en kvittering, står banneret
// øverst og raden hentes på nytt.
//
// **#2256: rommet åpner på bag-taggen.** Kortet sier hvem du er (klubb, navn,
// handicap), flisene under viser sesongen, og en kort meny fører videre:
// «Varsler og tema» og «Personvern og konto» er egne skjermer. «Rediger»
// står oppe til høyre (navigatorens header). Personvernerklæringen og «Slett
// konto» bor nå i «Personvern og konto»; «Logg ut» står igjen nederst her.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { BagTag } from '../components/profile/BagTag';
import { SeasonTiles } from '../components/profile/SeasonTiles';
import { SettingList, SettingRow } from '../components/SettingRow';
import { fetchBagTagExtras, type BagTagExtras } from '../data/bagTag';
import { fetchFriends } from '../data/friends';
import { logOut } from '../data/logout';
import { fetchOwnProfile, type OwnProfile } from '../data/profile';
import { bagTagModel } from '../lib/bagTag';
import { PROFILE_TEXT, friendsWaitingLine, unsentStrokesWarning } from '../lib/profileCopy';
import { isStagingBuild } from '../lib/stagingGate';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { useTheme } from '../theme';

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
  // Klubben og sesongen (#2256). `undefined` mens de lastes; hver del kan
  // være `null` for seg når oppslaget feilet (`data/bagTag.ts`).
  const [extras, setExtras] = useState<BagTagExtras | undefined>(undefined);
  // Hvor mange som venter på svar fra deg (#2256 PR 2). `0` til noe annet er
  // kjent; en feilet henting lar raden stå med den vanlige underlinja.
  const [friendsWaiting, setFriendsWaiting] = useState(0);

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

  // Klubben og sesongen hentes én gang når rommet åpnes. De avhenger ikke av
  // profilraden, så en lagring i skjemaet trenger ikke hente dem på nytt, og
  // kortet venter aldri på dem.
  useEffect(() => {
    let cancelled = false;
    void fetchBagTagExtras(userId, new Date()).then((next) => {
      if (!cancelled) setExtras(next);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Ny lagring → les raden på nytt, så kortet viser det som faktisk står i
  // basen og ikke det skjemaet trodde det sendte. Opprydningen fra `load`
  // kastes her: kvitteringen kommer én gang, og en avbrutt henting ville vært
  // nettopp den vi ba om.
  useEffect(() => {
    if (!updated) return;
    load();
  }, [updated, load]);

  // Antallet som venter på svar hentes hver gang rommet får fokus, så raden
  // stemmer også når spilleren kommer tilbake fra vennesiden. Best-effort:
  // uten nett eller svar står den vanlige underlinja.
  useEffect(
    () =>
      navigation.addListener('focus', () => {
        void fetchFriends().then((result) => {
          if (result.ok) setFriendsWaiting(result.data.incoming.length);
        });
      }),
    [navigation],
  );

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

  // #1973: overskriften venter på raden i stedet for å bytte tekst foran
  // øynene på deg. Mens raden lastes, står navnelinja på bag-taggen tom med
  // full høyde. Feiler hentingen, faller navnet til e-posten (det ærligste vi
  // har), og feillinja står under kortet. Kjeden eget navn → e-post → «Profil»
  // bor i `bagTagModel`.
  // `undefined` = klubben lastes ennå; `null` = ingen klubb. Forskjellen er
  // hele poenget: uten den sto «Tørny» som kicker til klubben landet.
  const club = extras === undefined ? undefined : extras.club;
  const model = useMemo(
    () => (profile ? bagTagModel(profile, club, new Date(), email) : null),
    [profile, club, email],
  );
  const failedName = email?.trim() || PROFILE_TEXT.displayNameFallback;
  const openEditProfile = useCallback(() => navigation.navigate('EditProfile'), [navigation]);

  return (
    <ScrollView contentContainerStyle={ui.scroll} testID="profile-screen">
      {updated ? (
        <View style={ui.banner}>
          <Text style={ui.body} testID="profile-updated-banner">
            {PROFILE_TEXT.updatedBanner}
          </Text>
        </View>
      ) : null}

      <BagTag
        model={model}
        placeholderName={loadFailed ? failedName : ''}
        onEditProfile={openEditProfile}
      />
      {loadFailed ? (
        <Text style={ui.error} testID="profile-load-error">
          {PROFILE_TEXT.loadFailedNote}
        </Text>
      ) : null}

      {/* Flisene står tomme med full høyde mens sesongen lastes, og forsvinner
          bare når runde-lista ikke kunne leses. */}
      {extras === undefined ? (
        <SeasonTiles year={new Date().getFullYear()} season={null} />
      ) : extras.season ? (
        <SeasonTiles year={extras.year} season={extras.season} />
      ) : null}

      {/* Chevron: hver rad fører til et rom. «Historikk og statistikk» (#2265)
          kommer inn her når skjermen finnes. */}
      <SettingList testID="profile-menu">
        <SettingRow
          label={PROFILE_TEXT.friendsRow}
          sublabel={
            friendsWaiting > 0 ? friendsWaitingLine(friendsWaiting) : PROFILE_TEXT.friendsSublabel
          }
          chevron
          onPress={() => navigation.navigate('Friends')}
          testID="profile-friends"
        />
        <SettingRow
          label={PROFILE_TEXT.menuNotificationsTheme}
          chevron
          onPress={() => navigation.navigate('NotificationsAndTheme')}
          testID="profile-notifications-theme"
        />
        <SettingRow
          label={PROFILE_TEXT.menuAccount}
          chevron
          onPress={() => navigation.navigate('AccountSettings')}
          testID="profile-account-settings"
        />
      </SettingList>

      {/* I et butikk-bygg finnes utvikler-seksjonen ikke i treet i det hele
          tatt — `isStagingBuild` er fail-closed, og en skjult rad er fortsatt
          en rad. */}
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

      {/* Ingen chevron: raden navigerer ikke, den handler. Og ingen knappeform
          — utlogging er dagligdags, og skal ikke veie mer enn den er verdt.
          Ingen «Konto»-overskrift over den lenger: menyraden «Personvern og
          konto» ville da stått rett over en seksjon med nesten samme navn. */}
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
    </ScrollView>
  );
}
