// #2256: «Personvern og konto» — e-posten, utloggingen, personvernerklæringen
// og veien til sletting, flyttet ut av profilen da den ble en bag-tag.
//
// Raden til personvernerklæringen kom fra `Profile.tsx` (#2229: Apple krever
// at den kan nås inne i appen). #2216 satte den under «Du bestemmer», der
// designet for «Dine data» (Data-forslag, #2332) har den, med designets ord og
// pil. «Slett konto» står fortsatt alene nederst i rødt, med luft over, og
// fører til bekreftelsessiden (`DeleteAccount`). Tilbake derfra (`goBack`)
// lander her.
//
// **#2332: «Dine data» øverst.** Skjermen åpner med hva Tørny lagrer og hvem
// som ser det (`DATA_TEXT`, hjemmelen står over `DATA_ROWS` i
// `profileCopy.ts`). Så kommer «Du bestemmer», «Konto» med e-posten og
// utloggingen, utviklerflaten i staging og til slutt sletting. Designet har
// ikke e-posten, Face ID, AI-bryteren eller utviklerflaten, og ingen av dem er
// fjernet. #2894 la «Del sjeldne slag med alle» under AI-bryteren.
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
import {
  AccessibilityInfo,
  Alert,
  AppState,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DesignSwitch, listSwitchOffColor } from '../components/DesignSwitch';
import { PageTitle } from '../components/PageTitle';
import { SettingList, SettingRow } from '../components/SettingRow';
import { fetchOwnAiConsent, saveAiConsent } from '../data/aiConsent';
import { rememberAiConsentAnswered } from '../data/aiConsentGate';
import { downloadDataExport } from '../data/dataExport';
import { fetchOwnRareShotSharing, saveRareShotSharing } from '../data/pushPreferences';
import { logOut } from '../data/logout';
import { AI_CONSENT_TEXT } from '../lib/aiConsentCopy';
import {
  askForUnlock,
  readAppLockSupport,
  setAppLock,
  useAppLock,
  type AppLockSupport,
} from '../lib/appLock';
import { appLockLabel, appLockSublabel } from '../lib/appLockCopy';
import {
  DATA_ROWS,
  DATA_TEXT,
  PROFILE_TEXT,
  describeDataExportFailure,
  unsentStrokesWarning,
} from '../lib/profileCopy';
import { isStagingBuild } from '../lib/stagingGate';
import { PRIVACY_PATH, describeWebLinkFailure, openWeb } from '../lib/webLink';
import type { ScreenProps } from '../navigation';
import { useFocusEffect } from '@react-navigation/native';
import { listBlocks } from '../data/blocks';
import { MODERATION_TEXT, blockedCountLabel } from '../lib/moderationCopy';
import { CONTACT_EMAIL } from '../../../../lib/legal/terms';
import { useSession } from '../session';
import { FONTS, interLine, useTheme } from '../theme';

export function AccountSettings({ navigation }: ScreenProps<'AccountSettings'>) {
  const { email } = useSession();
  const { ui, colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Null til et trykk ikke fikk åpnet nettsiden; da står grunnen under raden
  // til neste trykk.
  const [privacyNote, setPrivacyNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Null = ingenting galt. Ellers er det linja som skal stå under raden: enten
  // «du er fortsatt logget inn» (sesjonen overlevde, `signout-failed`) eller
  // den generelle når kallet kastet. To ulike årsaker, to ulike setninger.
  const [logoutNote, setLogoutNote] = useState<string | null>(null);

  // #3019 (tegning 11): «Blokkerte» viser hvor mange, lest hver gang skjermen
  // får fokus (lista kan ha endret seg). Feiler lesingen, står raden uten tall.
  const [blockedCount, setBlockedCount] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void listBlocks().then((result) => {
        if (!cancelled) setBlockedCount(result.ok ? result.blocks.length : null);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // #3019 (tegning 11): «Kontakt oss» åpner e-postappen. Åpner den ikke, står
  // adressen i linja under, så spilleren kan skrive selv.
  const [contactNote, setContactNote] = useState<string | null>(null);
  const onContact = useCallback(() => {
    setContactNote(null);
    Linking.openURL(`mailto:${CONTACT_EMAIL}`).catch(() => setContactNote(MODERATION_TEXT.contactFailed));
  }, []);

  // `openWeb` kaster aldri — den svarer typet — så det finnes ingen
  // catch-gren å skrive her.
  const onOpenPrivacy = useCallback(() => {
    setPrivacyNote(null);
    void openWeb(PRIVACY_PATH).then((result) => {
      if (!result.ok) setPrivacyNote(describeWebLinkFailure(result.reason));
    });
  }, []);

  // #2332 PR C: «Last ned dataene dine». Raden er låst mens fila hentes, så et
  // nytt trykk ikke starter en ny henting. Feiler den, står grunnen under lista
  // til neste trykk, som for personvernerklæringen. Et lukket delingsark er
  // ingen feil. `downloadDataExport` kaster aldri; den svarer typet.
  const [exportPending, setExportPending] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const onDownloadData = useCallback(() => {
    setExportPending(true);
    setExportNote(null);
    void downloadDataExport().then((result) => {
      setExportPending(false);
      if (!result.ok) setExportNote(describeDataExportFailure(result.reason));
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
    <ScrollView
      // #1954 D3: luften under innholdet står over systemlinja (navigasjonslinja på Android, hjemindikatoren på iPhone).
      contentContainerStyle={[styles.scroll, { paddingBottom: 20 + insets.bottom, backgroundColor: colors.bg }]}
      testID="account-settings-screen"
    >
      <View testID="account-data-intro">
        <PageTitle size="settings" title={DATA_TEXT.title} subtitle={DATA_TEXT.lede} />
      </View>

      <Text style={[ui.kicker, styles.label]} testID="account-section-stored">
        {DATA_TEXT.sectionStored}
      </Text>
      <DataInventory />
      <Text style={[styles.footnote, { color: colors.muted }]} testID="account-data-admin">
        {DATA_TEXT.adminLine}
      </Text>
      <Text style={[styles.footnote, { color: colors.muted }]} testID="account-data-processors">
        {DATA_TEXT.processorsLine}
      </Text>

      <Text style={[ui.kicker, styles.label]} testID="account-section-you-decide">
        {PROFILE_TEXT.sectionYouDecide}
      </Text>
      <SettingList testID="account-you-decide" style={styles.list}>
        <AppLockSetting />
        <AiConsentSetting />
        <RareShotSharingSetting />
        <SettingRow
          label={exportPending ? PROFILE_TEXT.exportPending : DATA_TEXT.exportRow}
          sublabel={DATA_TEXT.exportSublabel}
          chevron
          disabled={exportPending}
          onPress={onDownloadData}
          testID="account-export"
        />
        <SettingRow
          label={PROFILE_TEXT.privacyRow}
          sublabel={PROFILE_TEXT.privacySublabel}
          chevron
          onPress={onOpenPrivacy}
          testID="account-privacy"
        />
        <SettingRow
          label={MODERATION_TEXT.blockedRow}
          sublabel={blockedCount === null ? undefined : blockedCountLabel(blockedCount)}
          chevron
          onPress={() => navigation.navigate('BlockedUsers')}
          testID="account-blocked"
        />
      </SettingList>

      {exportNote ? (
        <Text style={[ui.error, styles.note]} testID="account-export-error">
          {exportNote}
        </Text>
      ) : null}
      {privacyNote ? (
        <Text style={[ui.error, styles.note]} testID="account-privacy-error">
          {privacyNote}
        </Text>
      ) : null}

      <Text style={[ui.kicker, styles.label]} testID="account-section-help">
        {MODERATION_TEXT.helpSection}
      </Text>
      <SettingList testID="account-help" style={styles.list}>
        <SettingRow
          label={MODERATION_TEXT.contactRow}
          sublabel={CONTACT_EMAIL}
          external
          onPress={onContact}
          testID="account-contact"
        />
      </SettingList>
      {contactNote ? (
        <Text style={[ui.error, styles.note]} testID="account-contact-error">
          {contactNote}
        </Text>
      ) : null}

      <Text style={[ui.kicker, styles.label]} testID="account-section-account">
        {PROFILE_TEXT.sectionAccount}
      </Text>
      {/* Innlogging går via engangskode på e-post, så feltet er i praksis
          alltid satt — men sesjonstypen tillater null, og da er «Innlogget»
          ærligere enn en tom linje. */}
      <View style={[ui.card, styles.cardRound]}>
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
        <Text style={[ui.error, styles.note]} testID="account-logout-error">
          {logoutNote}
        </Text>
      ) : null}

      {/* I et butikk-bygg finnes utvikler-seksjonen ikke i treet i det hele
          tatt — `isStagingBuild` er fail-closed, og en skjult rad er fortsatt
          en rad. */}
      {isStagingBuild() ? (
        <>
          <Text style={[ui.kicker, styles.label]}>{PROFILE_TEXT.sectionDeveloper}</Text>
          <SettingList testID="account-developer" style={styles.list}>
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
 * #2332: kortet under «Dette lagrer vi». En rad per id i {@link DATA_ROWS},
 * tittel 15/600 og tekst 12 dempet, med lista sine skillelinjer (designet
 * «Data-forslag»). Radene beskriver, de gjør ingenting, så de er ikke
 * trykkbare og har ingen pil.
 */
function DataInventory() {
  const { colors } = useTheme();
  return (
    <SettingList testID="account-data-rows" style={styles.list}>
      {DATA_ROWS.map((id) => (
        <View key={id} style={styles.dataRow} testID={`account-data-${id}`}>
          <Text style={[styles.dataTitle, { color: colors.text }]} testID={`account-data-${id}-title`}>
            {DATA_TEXT.rows[id].title}
          </Text>
          <Text style={[styles.dataBody, { color: colors.muted }]} testID={`account-data-${id}-body`}>
            {DATA_TEXT.rows[id].body}
          </Text>
        </View>
      ))}
    </SettingList>
  );
}

/**
 * #2841: «Lås med Face ID». Raden følger `AiConsentSetting` (samme tegning, tittel
 * 15/600, undertekst 12, bryter 52 × 32), og står øverst i «Du bestemmer».
 *
 * Raden finnes bare når telefonen har Face ID, Touch ID eller fingeravtrykk, og
 * navnet følger telefonen. Står ingenting registrert, er bryteren dempet og
 * underteksten sier hva spilleren må gjøre. Registrerer spilleren noe og kommer
 * tilbake, leses det på nytt.
 *
 * **Slå på krever ett vellykket spørsmål.** Bryteren går til «på» først når
 * telefonen har sagt ja; ellers står den av og ingenting lagres, så ingen låser
 * seg ute på første forsøk. Slå av krever ikke nytt spørsmål: spilleren er alt inne.
 */
function AppLockSetting() {
  const { colors, scheme } = useTheme();
  const on = useAppLock();
  const [support, setSupport] = useState<AppLockSupport | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const read = () => {
      void readAppLockSupport().then((next) => {
        if (!cancelled) setSupport(next);
      });
    };
    read();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') read();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const onToggle = async (next: boolean) => {
    if (!next) {
      setAppLock(false);
      return;
    }
    setBusy(true);
    const answer = await askForUnlock();
    setBusy(false);
    if (answer === 'success') setAppLock(true);
  };

  if (!support) return null;
  const title = appLockLabel(support.types, Platform.OS);
  // Er låsen på uten at noe er registrert, kan den fortsatt slås av.
  const disabled = busy || (!support.enrolled && !on);

  return (
    <View style={styles.aiRow} testID="account-app-lock">
      <View style={styles.aiTexts}>
        <Text style={[styles.aiTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.aiSub, { color: colors.muted }]} testID="account-app-lock-sub">
          {appLockSublabel(support.types, Platform.OS, { enrolled: support.enrolled, on })}
        </Text>
      </View>
      <DesignSwitch
        value={on}
        disabled={disabled}
        onValueChange={(next) => void onToggle(next)}
        label={title}
        onColor={colors.primary}
        offColor={listSwitchOffColor(colors, scheme)}
        testID="account-app-lock-switch"
      />
    </View>
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
          <Text style={[styles.aiSub, { color: colors.danger }]} testID="account-ai-consent-error">
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
          offColor={listSwitchOffColor(colors, scheme)}
          testID="account-ai-consent-switch"
        />
      ) : null}
    </View>
  );
}

/**
 * #2894: «Del sjeldne slag med alle», rett under AI-bryteren og tegnet som den (gruppe 10,
 * rad 99). Står den av, står spilleren ikke i kortet «Sjeldne slag» på Topplista; vennene og
 * ligaen får fortsatt vite det. Valget bor i `notification_preferences.share_rare_shots`
 * (0238), og serveren filtrerer (`lib/stats/rareShotOptOuts.ts`).
 *
 * Som AI-bryteren: bryteren vises først når valget er lest, feiler lesingen står raden uten
 * bryter, og en lagring som ikke gikk gjennom ruller tilbake og sier fra.
 */
function RareShotSharingSetting() {
  const { userId } = useSession();
  const { colors, scheme } = useTheme();
  const [value, setValue] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchOwnRareShotSharing(userId)
      .then((share) => {
        if (!cancelled) setValue(share);
      })
      .catch((err: unknown) => {
        console.error('[AccountSettings] delingsvalget kunne ikke leses', err);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const onToggle = async (next: boolean) => {
    setBusy(true);
    setFailed(false);
    setValue(next);
    const result = await saveRareShotSharing(userId, next);
    setBusy(false);
    if (!result.ok) {
      setValue(!next);
      setFailed(true);
      AccessibilityInfo.announceForAccessibility(PROFILE_TEXT.shareRareShotsFailed);
    }
  };

  return (
    <View style={styles.aiRow} testID="account-share-rare-shots">
      <View style={styles.aiTexts}>
        <Text style={[styles.aiTitle, { color: colors.text }]}>{PROFILE_TEXT.shareRareShotsTitle}</Text>
        <Text style={[styles.aiSub, { color: colors.muted }]}>{PROFILE_TEXT.shareRareShotsSublabel}</Text>
        {failed ? (
          <Text style={[styles.aiSub, { color: colors.danger }]} testID="account-share-rare-shots-error">
            {PROFILE_TEXT.shareRareShotsFailed}
          </Text>
        ) : null}
      </View>
      {value !== null ? (
        <DesignSwitch
          value={value}
          disabled={busy}
          onValueChange={(next) => void onToggle(next)}
          label={PROFILE_TEXT.shareRareShotsTitle}
          onColor={colors.primary}
          offColor={listSwitchOffColor(colors, scheme)}
          testID="account-share-rare-shots-switch"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // #2332, designet «Data-forslag»: kortene 16 pt fra kanten, og tittelen 4 pt
  // under topp-raden, som «Varsler». Siden har ingen `gap`; hver blokk setter
  // luften over seg selv.
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 4 },
  // Etiketten 20 pt fra kanten, 16 pt over og 8 under.
  label: { paddingHorizontal: 4, paddingTop: 16, paddingBottom: 8 },
  list: { marginTop: 0 },
  note: { marginTop: 8 },
  dataRow: { paddingVertical: 12, paddingHorizontal: 14, gap: 2 },
  dataTitle: { ...interLine(15, 18), fontFamily: FONTS.sansSemiBold },
  dataBody: { ...interLine(12, 15, { multiline: true }), fontFamily: FONTS.sans },
  // De to småtekstlinjene under kortet, i flukt med etiketten.
  footnote: {
    ...interLine(12, 15, { multiline: true }),
    fontFamily: FONTS.sans,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  // 16 som innstillingslistene rett under (#2709).
  cardRound: { borderRadius: 16 },
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
