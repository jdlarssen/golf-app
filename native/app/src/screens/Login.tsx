// Native N1 (#1818): OTP-innloggingen — flyttet ut av `App.tsx` da N3 (#1825)
// satte inn en navigasjons-stack bak login-porten. Samme to steg (be om kode →
// skriv koden).
//
// Ingen `next`-redirect og ingen dyplenker: appen har ingen URL å komme fra,
// og `onAuthStateChange` i `App.tsx` bytter til stacken av seg selv når
// `verifyOtp` har satt sesjonen.
//
// #2216: **kode-veien går gjennom nettsiden.** «Send meg kode» kaller
// `/api/auth/send-code` (`data/loginCode.ts`) med nettsidens sperrer:
// fartsgrensen, bryteren for nye kontoer, sperren mot engangs-e-post og
// invitasjonen som åpner for ny konto. En ny e-post får altså konto her, som på
// nettsiden. Når koden er godtatt, kjøres stegene etter innloggingen
// (`finishLogin`), så en invitert finner spillet sitt på Hjem. Skjermen er
// bygget etter designet (Innlogging-forslag, #2349): skogbåndet øverst,
// «Steg 1 av 2» og «Steg 2 av 2», åtte ruter som sender koden av seg selv, og
// nedtellingen til ny kode. Invitasjonslinja i båndet finnes ikke i appen:
// uten en invitasjonslenke ville den fortalt hvem som helst som skrev en
// adresse, hvem som inviterte den.
//
// #1954 (P1b): en skjult passord-inngang for App Review. Holdes ordmerket i
// båndet inne i halvannet sekund, dukker et passordfelt og «Logg inn med
// passord» opp under e-postfeltet. Ingen env-gate og ingen e-post-sjekk i
// appen — inngangen må virke i butikk-bygget, der webbens
// `REVIEW_ACCOUNT_EMAIL`-port ikke finnes. Sperren er den samme som alt gjelder
// for direkte kall mot `/auth/v1/token`: Supabases rate-limit pluss et 28-tegns
// tilfeldig passord, og bare review-kontoen har et passord i det hele tatt.
// Passord-veien kan aldri lage en konto.
//
// Ordmerket er app-navnet fra den oppløste configen (`expo-constants`), ikke
// en streng her: «Tørny Dev» i dev-bygget, «Tørny» når butikk-varianten (P2)
// setter navnet.
//
// #1923: i Tørny Dev mot staging står en boks «Testbrukere (staging)» under
// skjemaet — ett trykk på et navn logger inn som den testbrukeren. Gaten og
// lista bor i `devLogin.ts`; i alle andre bygg er `devConfig` null, ingenting
// hentes og skjermen er som før.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  APP_NAME_FALLBACK,
  LOGIN_TEXT,
  OTP_LENGTH,
  REVEAL_PASSWORD_LOGIN_MS,
  classifyVerifyError,
  describeLoginError,
  formatCountdown,
  resendWaitSeconds,
} from '../lib/loginCopy';
import { finishLogin, landsOnCodeStep, requestLoginCode } from '../data/loginCode';
import {
  DEV_LOGIN_ROLE_LABEL,
  DEV_LOGIN_TEXT,
  fetchDevLoginUsers,
  readDevLoginEnv,
  resolveDevLoginConfig,
  signInAsDevUser,
  type DevLoginUser,
} from '../devLogin';
import { supabase } from '../supabase';
import { FONTS, fraunces, useTheme, withAlpha } from '../theme';

/** 44 pt trykkflate rundt «Feil adresse?» (linja er 20 høy). */
const CHANGE_EMAIL_HIT_SLOP = { top: 12, bottom: 12, left: 6, right: 12 };

/** Hvilken knapp som venter på svar — alle veiene deler ett felt. */
type Busy = 'code' | 'resend' | 'password' | 'dev' | null;

export function Login() {
  const { colors, ui } = useTheme();
  // Båndet går helt opp under statuslinja. Skjermen står utenfor navigatoren,
  // så innfellingen kommer fra providerne på app-rota (`App.tsx`).
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  // Vises først etter langtrykket, og går ikke tilbake: en reviewer som fikk
  // feltet fram skal ikke miste det på et ekstra trykk.
  const [passwordMode, setPasswordMode] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  // Når koden sist ble bedt om, til nedtellingen. `null` før første sending.
  const [sentAt, setSentAt] = useState<number | null>(null);
  // Løses én gang per montering: env er bakt inn i bundelen og endrer seg ikke.
  const [devConfig] = useState(() => resolveDevLoginConfig(readDevLoginEnv()));
  const [devUsers, setDevUsers] = useState<DevLoginUser[]>([]);
  // Koden sendes av seg selv når det siste sifferet kommer. Refen hindrer at
  // samme kode sendes to ganger før svaret er tilbake.
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!devConfig) return;
    const controller = new AbortController();
    fetchDevLoginUsers(devConfig, controller.signal).then((users) => {
      if (!controller.signal.aborted) setDevUsers(users);
    });
    return () => controller.abort();
  }, [devConfig]);

  /**
   * Adressen slik den sendes: trimmet og med små bokstaver, én gang. Samme
   * verdi går til ruta og til `verifyOtp`, så de to aldri ser hver sin adresse.
   */
  const normalizedEmail = email.trim().toLowerCase();

  const sendCode = async () => {
    // Ingen tur til serveren på et tomt felt.
    if (!normalizedEmail) {
      setError(LOGIN_TEXT.emailRequired);
      return;
    }
    setBusy('code');
    setError(null);
    const result = await requestLoginCode(normalizedEmail);
    setBusy(null);
    if (!result.ok) setError(describeLoginError(result.code));
    if (landsOnCodeStep(result)) {
      setCode('');
      submittedRef.current = false;
      setSentAt(Date.now());
      setStep('code');
    }
  };

  const resendCode = async () => {
    setBusy('resend');
    setError(null);
    const result = await requestLoginCode(normalizedEmail);
    setBusy(null);
    if (!result.ok) setError(describeLoginError(result.code));
    // Ett-minutts-sperren betyr at en kode alt er på vei; nedtellingen
    // starter da på nytt, slik den gjør etter en ny kode.
    if (landsOnCodeStep(result)) setSentAt(Date.now());
  };

  const verifyCode = useCallback(
    async (token: string) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setBusy('code');
      setError(null);
      const { error: err } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token,
        type: 'email',
      });
      if (err) {
        // En feil kode gir tomme ruter, som på nettsiden: neste forsøk er et
        // nytt forsøk, ikke en retting av sifrene som sto.
        submittedRef.current = false;
        setBusy(null);
        setCode('');
        setError(describeLoginError(classifyVerifyError(err)));
        return;
      }
      // Sesjonen er satt, og `App.tsx` bytter til stacken. Stegene etter
      // innloggingen er best-effort og blokkerer ingenting.
      void finishLogin();
    },
    [normalizedEmail],
  );

  const onCodeChange = (text: string) => {
    // Bare sifre teller: en innlimt «1234 5678» skal ikke miste det siste.
    const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setCode(digits);
    if (digits.length === OTP_LENGTH) void verifyCode(digits);
  };

  const changeEmail = () => {
    setStep('email');
    setCode('');
    setError(null);
    submittedRef.current = false;
  };

  const signInWithPassword = async () => {
    setBusy('password');
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(null);
    // Én melding uansett årsak, aldri Supabases tekst: ukjent adresse, konto
    // uten passord og feil passord skal være umulige å skille fra hverandre.
    if (err) {
      setError(LOGIN_TEXT.passwordFailed);
    }
  };

  const signInAsDev = async (user: DevLoginUser) => {
    if (!devConfig) return;
    setBusy('dev');
    setError(null);
    const { error: err } = await signInAsDevUser(user, devConfig);
    // Ved suksess bytter `App.tsx` til stacken; skjermen avmonteres.
    if (err) {
      setError(err);
      setBusy(null);
    }
  };

  // `color` settes EKSPLISITT: `TextInput` tegner ellers svart tekst uansett
  // palett, og i mørk modus blir feltet uleselig (samme regel som `ui.input`).
  const fieldColors = {
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
  };

  const errorLine = error ? (
    <Text style={[styles.error, { color: colors.danger }]} testID="login-error">
      {error}
    </Text>
  ) : null;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[styles.screen, { paddingBottom: insets.bottom + 20 }]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      testID="login-screen"
    >
      {/* Lys tekst i statuslinja: båndet under den er skogen, i begge drakter. */}
      <StatusBar style="light" />
      <View
        style={[
          styles.band,
          { backgroundColor: colors.surfaceStrong, paddingTop: insets.top + 22 },
        ]}
      >
        <Pressable
          onLongPress={() => setPasswordMode(true)}
          delayLongPress={REVEAL_PASSWORD_LOGIN_MS}
          accessibilityRole="header"
          testID="login-heading"
        >
          <Text style={[styles.wordmark, { color: colors.onStrongWarm }]}>
            {Constants.expoConfig?.name ?? APP_NAME_FALLBACK}
          </Text>
        </Pressable>
        {step === 'email' ? (
          <Text style={[styles.tagline, { color: withAlpha(colors.onStrongWarm, 0.85) }]}>
            {LOGIN_TEXT.taglinePre}
            <Text style={[styles.taglineGold, { color: colors.accent }]}>
              {LOGIN_TEXT.taglineGold}
            </Text>
            {LOGIN_TEXT.taglinePost}
          </Text>
        ) : null}
      </View>

      {step === 'email' ? (
        <>
          <View
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[ui.kicker, styles.stepKicker]}>{LOGIN_TEXT.stepOneKicker}</Text>
            <Text style={[styles.label, { color: colors.text }]}>{LOGIN_TEXT.emailLabel}</Text>
            <TextInput
              style={[styles.field, fieldColors]}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
              accessibilityLabel={LOGIN_TEXT.emailLabel}
              testID="email-input"
            />
            <PillButton
              label={busy === 'code' ? LOGIN_TEXT.sendPending : LOGIN_TEXT.sendButton}
              onPress={() => void sendCode()}
              disabled={busy != null}
              style={styles.cardButton}
              testID="send-code-button"
            />
            {passwordMode ? (
              <>
                <Text style={[styles.label, { color: colors.text }]}>
                  {LOGIN_TEXT.passwordLabel}
                </Text>
                <TextInput
                  style={[styles.field, fieldColors]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  testID="password-input"
                />
                <PillButton
                  label={
                    busy === 'password' ? LOGIN_TEXT.passwordPending : LOGIN_TEXT.passwordButton
                  }
                  onPress={() => void signInWithPassword()}
                  disabled={busy != null}
                  style={styles.cardButton}
                  testID="password-login-button"
                />
              </>
            ) : null}
            {errorLine}
          </View>
          {devConfig && devUsers.length > 0 ? (
            <View testID="dev-login-section" style={styles.devSection}>
              <Text style={ui.sectionTitle}>{DEV_LOGIN_TEXT.sectionTitle}</Text>
              {devUsers.map((user, index) => (
                <Pressable
                  key={user.email}
                  style={[ui.buttonSecondary, styles.devRow]}
                  onPress={() => void signInAsDev(user)}
                  disabled={busy != null}
                  accessibilityRole="button"
                  accessibilityLabel={DEV_LOGIN_TEXT.signInLabel(user.label)}
                  testID={`dev-login-user-${index}`}
                >
                  <Text style={ui.buttonSecondaryText}>{user.label}</Text>
                  <View style={[ui.badge, styles.devBadge]}>
                    <Text style={ui.badgeText}>{DEV_LOGIN_ROLE_LABEL[user.role]}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <>
          <View style={styles.codeTop}>
            <Text style={ui.kicker}>{LOGIN_TEXT.stepTwoKicker}</Text>
            <Text style={[styles.codeHeading, { color: colors.text }]}>
              {LOGIN_TEXT.codeHeading}
            </Text>
            {/* «Feil adresse?» er en egen trykkflate og ikke en lenke inni
                setningen: en nøstet `Text` er bare så høy som teksten, og den
                er eneste vei tilbake til e-posten. `hitSlop` gir 44 pt, og
                raden brekker før lenka når adressen er lang. */}
            <View style={styles.sentToRow}>
              <Text style={[styles.sentTo, { color: colors.muted }]}>
                {LOGIN_TEXT.sentToPrefix}
                <Text style={[styles.sentToEmail, { color: colors.text }]} testID="login-sent-to">
                  {normalizedEmail}
                </Text>
                {LOGIN_TEXT.sentToSuffix}{' '}
              </Text>
              <Pressable
                onPress={changeEmail}
                disabled={busy != null}
                hitSlop={CHANGE_EMAIL_HIT_SLOP}
                accessibilityRole="link"
                accessibilityState={{ disabled: busy != null }}
                testID="login-change-email"
              >
                <Text style={[styles.sentTo, styles.changeEmail, { color: colors.primary }]}>
                  {LOGIN_TEXT.changeEmail}
                </Text>
              </Pressable>
            </View>
            {errorLine}
          </View>

          <View style={styles.codeBlock}>
            <CodeBoxes code={code} onChangeText={onCodeChange} />
            <Text style={[styles.hint, { color: colors.muted }]}>{LOGIN_TEXT.codeHint}</Text>
          </View>

          <View style={styles.verifyBlock}>
            <PillButton
              label={busy === 'code' ? LOGIN_TEXT.verifyPending : LOGIN_TEXT.verifyButton}
              onPress={() => void verifyCode(code)}
              disabled={busy != null || code.length < OTP_LENGTH}
              testID="verify-code-button"
            />
          </View>

          <ResendCard
            sentAt={sentAt}
            busy={busy === 'resend'}
            disabled={busy != null}
            onResend={() => void resendCode()}
          />
        </>
      )}
    </ScrollView>
  );
}

/** Designets store pille: 52 høy, skogen, og blek mens den ikke kan trykkes. */
function PillButton({
  label,
  onPress,
  disabled,
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  /** Luft over knappen der den står i et kort; blokken over gir den ellers. */
  style?: StyleProp<ViewStyle>;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={[styles.pill, { backgroundColor: colors.primary }, disabled && styles.pillOff, style]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      testID={testID}
    >
      <Text style={[styles.pillText, { color: colors.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Åtte ruter i to grupper på fire, med ett ekte tekstfelt over seg.
 *
 * Rutene er bare tegning (skjult for skjermleseren). Feltet ligger over dem
 * med gjennomsiktig tekst, så et trykk på en rute treffer feltet, innliming
 * virker, og iOS kan tilby koden fra Mail over tastaturet (`oneTimeCode`).
 */
function CodeBoxes({
  code,
  onChangeText,
}: {
  code: string;
  onChangeText: (text: string) => void;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(true);
  const half = OTP_LENGTH / 2;
  const boxes = Array.from({ length: OTP_LENGTH }, (_, index) => {
    const digit = code[index];
    const active = focused && index === code.length;
    return (
      <View
        key={index}
        style={[
          styles.box,
          { backgroundColor: colors.surface, borderColor: colors.border },
          digit !== undefined && { borderWidth: 1.5, borderColor: colors.primary },
          active && {
            borderWidth: 2,
            borderColor: colors.primary,
            boxShadow: `0 0 0 3px ${withAlpha(colors.primary, 0.18)}`,
          },
        ]}
      >
        {digit !== undefined ? (
          <Text style={[styles.digit, { color: colors.text }]}>{digit}</Text>
        ) : active ? (
          <View style={[styles.caret, { backgroundColor: colors.text }]} />
        ) : null}
      </View>
    );
  });

  return (
    <View style={styles.boxRow}>
      <View
        style={styles.boxRow}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {boxes.slice(0, half)}
        <View style={[styles.groupDash, { backgroundColor: withAlpha(colors.muted, 0.3) }]} />
        {boxes.slice(half)}
      </View>
      <TextInput
        style={styles.hiddenInput}
        value={code}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus
        caretHidden
        selectionColor="transparent"
        accessibilityLabel={LOGIN_TEXT.codeLabel}
        accessibilityHint={LOGIN_TEXT.codeHint}
        testID="code-input"
      />
    </View>
  );
}

/**
 * «Kom ikke mailen?»: søppelpost-hintet, nedtellingen og «Send ny kode».
 *
 * Knappen er grå til minuttet har gått, for Supabase sier nei før det.
 * Tiden regnes mot klokka, ikke mot antall tikk: kommer spilleren tilbake fra
 * Mail-appen etter tjue sekunder, står det riktig tall med en gang.
 */
function ResendCard({
  sentAt,
  busy,
  disabled,
  onResend,
}: {
  sentAt: number | null;
  busy: boolean;
  disabled: boolean;
  onResend: () => void;
}) {
  const { colors } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  const left = sentAt === null ? 0 : resendWaitSeconds(sentAt, now);

  useEffect(() => {
    if (left === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [left, sentAt]);

  const waiting = left > 0;
  const off = waiting || disabled;
  return (
    <View
      style={[styles.resendCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Text style={[styles.resendTitle, { color: colors.text }]}>{LOGIN_TEXT.noMailTitle}</Text>
      <Text style={[styles.resendBody, { color: colors.muted }]}>{LOGIN_TEXT.spamHint}</Text>
      <View style={styles.resendRow}>
        {waiting ? (
          <Text style={[styles.countdown, { color: colors.muted }]} testID="login-resend-countdown">
            {LOGIN_TEXT.resendInPrefix}
            {formatCountdown(left)}
          </Text>
        ) : (
          <View />
        )}
        <Pressable
          style={[
            styles.resendButton,
            off
              ? { backgroundColor: colors.bg, borderColor: colors.border }
              : { backgroundColor: colors.surface, borderColor: colors.primary },
          ]}
          onPress={onResend}
          disabled={off}
          accessibilityRole="button"
          accessibilityState={{ disabled: off }}
          testID="login-resend"
        >
          <Text
            style={[
              styles.resendButtonText,
              { color: off ? withAlpha(colors.muted, 0.64) : colors.primary },
            ]}
          >
            {busy ? LOGIN_TEXT.resendPending : LOGIN_TEXT.resendButton}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// Målene er designets (Innlogging-forslag): bånd 22/20/20, ordmerke 22/600,
// overskrift 26/500, ruter 54 høye med 6 mellom, knapp 52, kort 16 i radius.
const styles = StyleSheet.create({
  screen: { flexGrow: 1 },
  band: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 10,
  },
  wordmark: { ...fraunces(600, 22) },
  tagline: { fontSize: 14, lineHeight: 20, fontFamily: FONTS.sans },
  taglineGold: { fontFamily: FONTS.sansSemiBold },
  card: {
    marginTop: 20,
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  stepKicker: { marginBottom: 12 },
  label: { fontSize: 14, fontFamily: FONTS.sansSemiBold, marginBottom: 6 },
  field: {
    height: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: FONTS.sans,
  },
  pill: {
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillOff: { opacity: 0.45 },
  cardButton: { marginTop: 16 },
  pillText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  error: { fontSize: 14, fontFamily: FONTS.sans, marginTop: 12 },
  devSection: { gap: 8, marginTop: 8, marginHorizontal: 16 },
  devRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // `gap` i seksjonen står for luften; knappens egen marginTop ville doblet den.
    marginTop: 0,
  },
  devBadge: { alignSelf: 'center' },
  codeTop: { paddingTop: 24, paddingHorizontal: 20 },
  codeHeading: { ...fraunces(500, 26, 30, { multiline: true }), marginTop: 6 },
  sentToRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', marginTop: 8 },
  sentTo: { fontSize: 14, lineHeight: 20, fontFamily: FONTS.sans },
  sentToEmail: { fontFamily: FONTS.sansSemiBold },
  // En lenke, som i designet: understreket.
  changeEmail: { fontFamily: FONTS.sansSemiBold, textDecorationLine: 'underline' },
  codeBlock: { paddingTop: 20, paddingHorizontal: 20 },
  boxRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  box: {
    flex: 1,
    height: 54,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: { ...fraunces(600, 24), fontVariant: ['tabular-nums'] },
  caret: { width: 2, height: 24 },
  groupDash: { width: 8, height: 2 },
  hiddenInput: {
    ...StyleSheet.absoluteFill,
    color: 'transparent',
    backgroundColor: 'transparent',
    fontSize: 16,
  },
  hint: { fontSize: 12, fontFamily: FONTS.sans, marginTop: 10 },
  verifyBlock: { paddingTop: 20, paddingHorizontal: 20 },
  resendCard: {
    marginTop: 20,
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  resendTitle: { fontSize: 14, fontFamily: FONTS.sansSemiBold },
  resendBody: { fontSize: 13, lineHeight: 19, fontFamily: FONTS.sans },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  countdown: { fontSize: 13, fontFamily: FONTS.sans, fontVariant: ['tabular-nums'] },
  resendButton: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resendButtonText: { fontSize: 13, fontFamily: FONTS.sansSemiBold },
});
