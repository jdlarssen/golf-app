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
// **Hierarkiet.** På Konto-skjermen var «Logg ut» en innrammet knapp og
// «Slett konto» en dempet lenke under den: den reversible handlingen sto
// tyngst, og den som ikke kan angres så ut som en fotnote. Begge bor nå i
// «Personvern og konto» (`AccountSettings.tsx`), der «Logg ut» er en vanlig
// rad og «Slett konto» står alene nederst i rødt med luft over.
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
// «Venner», «Varsler og tema» og «Personvern og konto» er egne skjermer.
//
// **Profil v2: identisk med designlerretet.** Ingen navigasjonslinje over
// (tilbake til Hjem er sveipet, som på iOS ellers), «Profil» og «Rediger» øverst
// på samme rad, 16 pt til kanten, og siden slutter med «Del bag-taggen».
// «Logg ut» og utviklerflaten bor i «Personvern og konto»
// (`AccountSettings.tsx`), sammen med personvernerklæringen og «Slett konto».
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BagTag } from '../components/profile/BagTag';
import { SeasonTiles } from '../components/profile/SeasonTiles';
import { ShareBagTagButton } from '../components/profile/ShareBagTagButton';
import { SettingList, SettingRow } from '../components/SettingRow';
import { fetchBagTagExtras, type BagTagExtras } from '../data/bagTag';
import { fetchOwnProfile, type OwnProfile } from '../data/profile';
import { bagTagModel } from '../lib/bagTag';
import { PROFILE_TEXT } from '../lib/profileCopy';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { FONTS, TAP, useTheme } from '../theme';

export function Profile({ navigation, route }: ScreenProps<'Profile'>) {
  const { userId, email } = useSession();
  const { ui, colors } = useTheme();
  // Uten navigasjonslinje står innholdet rett under statuslinja.
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Klubben og sesongen (#2256). `undefined` mens de lastes; hver del kan
  // være `null` for seg når oppslaget feilet (`data/bagTag.ts`).
  const [extras, setExtras] = useState<BagTagExtras | undefined>(undefined);

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

  // Klubben, sesongen og handicap-kurven hentes når rommet åpnes, og kortet
  // venter aldri på dem. Kurven følger handicapet, så en lagring i skjemaet
  // henter dem på nytt (under).
  const loadExtras = useCallback(() => {
    let cancelled = false;
    void fetchBagTagExtras(userId, new Date()).then((next) => {
      if (!cancelled) setExtras(next);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(loadExtras, [loadExtras]);

  // Ny lagring → les raden og kurven på nytt, så kortet viser det som faktisk
  // står i basen og ikke det skjemaet trodde det sendte. Opprydningen kastes
  // her: kvitteringen kommer én gang, og en avbrutt henting ville vært nettopp
  // den vi ba om.
  useEffect(() => {
    if (!updated) return;
    load();
    loadExtras();
  }, [updated, load, loadExtras]);

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
    <ScrollView
      contentContainerStyle={[styles.scroll, { backgroundColor: colors.bg, paddingTop: insets.top }]}
      testID="profile-screen"
    >
      {/* Designet: «Profil» i Fraunces 22 og «Rediger» som pille på samme rad,
          med pillens høyrekant 8 pt fra skjermkanten. */}
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {PROFILE_TEXT.heading}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={openEditProfile}
          style={({ pressed }) => [
            styles.editPill,
            { borderColor: colors.border, backgroundColor: colors.surface },
            pressed ? styles.pressed : null,
          ]}
          testID="profile-edit-entry"
        >
          <Text style={[styles.editPillText, { color: colors.primary }]}>
            {PROFILE_TEXT.editAction}
          </Text>
        </Pressable>
      </View>
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
        trend={extras === undefined ? 'loading' : extras.trend}
      />
      {loadFailed ? (
        <Text style={[ui.error, styles.note]} testID="profile-load-error">
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
          kommer inn øverst her når skjermen finnes (kontrakten, del F). */}
      <View style={styles.menu}>
        <SettingList testID="profile-menu">
          <SettingRow
            label={PROFILE_TEXT.friendsRow}
            chevron
            onPress={() => navigation.navigate('Friends', { selfInitials: model?.initials })}
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
      </View>

      {/* «Del bag-taggen» (PR 3) rett under menyen, som i designet. Bare når
          kortet og sesongen er lastet: bildet skal være det du ser. */}
      {model && extras?.season ? (
        <ShareBagTagButton model={model} trend={extras.trend} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Designet: 16 pt til kanten, og avstandene står på hver blokk.
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 32 },
  // Tittelen 20 pt fra kanten; pillen går 8 pt forbi innholdskolonnen.
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingLeft: 4,
    marginRight: -8,
  },
  title: { flexShrink: 1, fontSize: 22, lineHeight: 27, fontFamily: FONTS.serifDisplay },
  // «Rediger» som i designet: en lys pille, 44 pt høy.
  editPill: {
    minHeight: TAP,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPillText: { fontSize: 14, fontFamily: FONTS.sansSemiBold },
  pressed: { opacity: 0.6 },
  // 20 pt fra flisene; lista har selv 8 på toppen.
  menu: { marginTop: 12 },
  // Siden har ingen `gap`; linja trenger luft under det skrå kortet.
  note: { marginTop: 12 },
});
