// #2256: «Personvern og konto» — e-posten, utloggingen, personvernerklæringen
// og veien til sletting, flyttet ut av profilen da den ble en bag-tag.
//
// Raden til personvernerklæringen kom fra `Profile.tsx` (#2229: Apple krever
// at den kan nås inne i appen). #2216 satte den under «Du bestemmer», der
// designet for «Dine data» (Data-forslag, #2332) har den, med designets ord og
// pil. Resten av «Dine data» kommer med #2332. «Slett konto» står fortsatt
// alene nederst i rødt, med luft over, og fører til bekreftelsessiden
// (`DeleteAccount`). Tilbake derfra (`goBack`) lander her.
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
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DesignSwitch } from '../components/DesignSwitch';
import { SettingList, SettingRow } from '../components/SettingRow';
import { fetchOwnAiConsent, saveAiConsent } from '../data/aiConsent';
import { rememberAiConsentAnswered } from '../data/aiConsentGate';
import { logOut } from '../data/logout';
import { AI_CONSENT_TEXT } from '../lib/aiConsentCopy';
import { PROFILE_TEXT, unsentStrokesWarning } from '../lib/profileCopy';
import { isStagingBuild } from '../lib/stagingGate';
import { PRIVACY_PATH, describeWebLinkFailure, openWeb } from '../lib/webLink';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { FONTS, useTheme } from '../theme';

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
    void openWeb(PRIVACY_PATH).then((result) => {
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

      <Text style={ui.sectionTitle}>{PROFILE_TEXT.sectionYouDecide}</Text>
      <SettingList testID="account-you-decide">
        <AiConsentSetting />
        <SettingRow
          label={PROFILE_TEXT.privacyRow}
          sublabel={PROFILE_TEXT.privacySublabel}
          chevron
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

/**
 * #2561 PR B: bryteren for AI-tekstene, der svaret på spørsmålet kan endres.
 *
 * Raden følger listekortet «HVA SOM VARSLES» i Varsler-tegningen (tittel
 * 15/600, undertekst 12, bryteren 52 × 32 til høyre, 12 i gap, 12 × 14 i luft);
 * selve raden har ingen egen tegning. Bryteren vises først når svaret er lest,
 * så den aldri viser et gjettet samtykke; feiler lesingen, står raden uten
 * bryter. En lagring som ikke gikk gjennom, ruller tilbake og sier fra.
 */
function AiConsentSetting() {
  const { userId } = useSession();
  const { colors, scheme } = useTheme();
  const [value, setValue] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchOwnAiConsent(userId)
      .then((answer) => {
        if (cancelled) return;
        setValue(answer === true);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        console.error('[AccountSettings] AI-svaret kunne ikke leses', err);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const onToggle = async (next: boolean) => {
    setBusy(true);
    setFailed(false);
    setValue(next);
    const result = await saveAiConsent(userId, next);
    setBusy(false);
    if (!result.ok) {
      setValue(!next);
      setFailed(true);
      AccessibilityInfo.announceForAccessibility(AI_CONSENT_TEXT.toggleFailed);
      return;
    }
    await rememberAiConsentAnswered(userId);
  };

  return (
    <View style={styles.aiRow} testID="account-ai-consent">
      <View style={styles.aiTexts}>
        <Text style={[styles.aiTitle, { color: colors.text }]}>{AI_CONSENT_TEXT.toggleTitle}</Text>
        <Text style={[styles.aiSub, { color: colors.muted }]}>{AI_CONSENT_TEXT.toggleSubtitle}</Text>
        {failed ? (
          <Text
            style={[styles.aiSub, { color: colors.danger }]}
            accessibilityLiveRegion="polite"
            testID="account-ai-consent-error"
          >
            {AI_CONSENT_TEXT.toggleFailed}
          </Text>
        ) : null}
      </View>
      {loaded ? (
        <DesignSwitch
          value={value === true}
          disabled={busy}
          onValueChange={(next) => void onToggle(next)}
          label={AI_CONSENT_TEXT.toggleTitle}
          // Varsler-tegningens bryter på en lys liste: skog når den er på,
          // varm grå når den er av. Mørk drakt har ingen tegning; av-sporet er
          // den dempede tekstfargen med 45 % dekning (samme grep som
          // `NotificationsAndTheme`), så det synes mot kortet. Kantfargen
          // forsvant nesten.
          onColor={colors.primary}
          offColor={scheme === 'dark' ? `${colors.muted}73` : SWITCH_OFF_LIGHT}
          testID="account-ai-consent-switch"
        />
      ) : null}
    </View>
  );
}

/** Av-sporet i Varsler-tegningens liste (`#d9d2c2`). */
const SWITCH_OFF_LIGHT = '#D9D2C2';

const styles = StyleSheet.create({
  dangerGap: { marginTop: 24 },
  aiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  aiTexts: { flex: 1, gap: 2 },
  aiTitle: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  aiSub: { fontSize: 12, fontFamily: FONTS.sans },
});
