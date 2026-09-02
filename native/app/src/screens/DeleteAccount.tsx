// native/app/src/screens/DeleteAccount.tsx
// Native #1876: bekreftelsesskjermen for konto-sletting.
//
// **Egen skjerm, husregelen.** Det som ikke kan angres får sin egen flate — samme
// valg som avslutt-runden (N6c) og som webbens `/profile/slett-konto`. Ingen
// modal, ingen bryter på en annen side: du må ha gått hit, lest hva som skjer, og
// trykket på en rød knapp.
//
// **Skjermen kjenner ingen regel.** Om kontoen kan slettes avgjøres av
// `getDeleteBlockReason` på serveren; her spør vi (`fetchDeleteStatus`) og viser
// svaret. Er svaret «blokkert», finnes slette-knappen ikke i det hele tatt — den
// er ikke grå, den er borte, akkurat som på web. En grå knapp ville sagt «prøv
// igjen senere» om noe som krever at du avslutter en runde først.
//
// **Rekkefølgen bak knappen bor i `data/account.ts`** (POST → wipe → lokal
// signOut), ikke her. Ved suksess gjør skjermen ingenting: sesjonen forsvinner,
// `App.tsx` bytter til Login, og denne skjermen unmountes med resten av stacken.
// Derfor står den i «Sletter …»-tilstand helt til den er borte — det er ikke en
// glemt opprydding, det er den siste sanne tilstanden den har.
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { deleteAccount, fetchDeleteStatus, type AccountDeleteStatus } from '../data/account';
import {
  ACCOUNT_TEXT,
  DISPLAY_NAME_FALLBACK,
  describeDeleteBlock,
  describeDeleteFailure,
} from '../lib/accountCopy';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { supabase } from '../supabase';
import { FONTS, useTheme } from '../theme';

export function DeleteAccount({ navigation }: ScreenProps<'DeleteAccount'>) {
  const { userId, email } = useSession();
  const { colors, ui } = useTheme();

  const [status, setStatus] = useState<AccountDeleteStatus | null>(null);
  const [ownName, setOwnName] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Status og navn hentes i parallell: navnet pynter på én setning, statusen
  // avgjør hva skjermen i det hele tatt er. Skjermen venter derfor bare på
  // statusen.
  useEffect(() => {
    let cancelled = false;
    fetchDeleteStatus()
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch(() => {
        // Datamodulen svarer selv på alt den forutser. Et kast her er noe annet,
        // og skjermen skal si fra i stedet for å stå og spinne.
        if (!cancelled) setStatus({ ok: false, reason: 'status_failed' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchOwnName(userId).then((name) => {
      if (!cancelled) setOwnName(name);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  /**
   * Trykket på den røde knappen.
   *
   * Ved suksess settes ingenting tilbake: kontoen er borte, den lokale basen er
   * tømt og utloggingen er på vei til å bytte ut hele stacken. Å nullstille
   * `pending` her ville gitt et halvt sekund med en fristende knapp til en konto
   * som ikke finnes lenger.
   */
  const confirm = useCallback(async () => {
    setPending(true);
    setNotice(null);
    try {
      const result = await deleteAccount();
      if (result.ok) return;
      setNotice(describeDeleteFailure(result.reason));
    } catch (err) {
      console.error('[DeleteAccount] sletting kastet', err);
      setNotice(describeDeleteFailure('delete_failed'));
    }
    setPending(false);
  }, []);

  if (status === null) {
    return (
      <View style={ui.centered} testID="delete-account-loading">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // To veier inn i samme tilstand: serveren sa «blokkert», eller vi fikk ikke
  // spurt (uten nett, utløpt sesjon, feil i bygget). Begge betyr at vi ikke vet
  // at kontoen kan slettes — og da tilbys ingen sletting.
  const blockText = status.ok
    ? status.blocked && describeDeleteBlock(status.blocked)
    : describeDeleteFailure(status.reason);

  if (blockText) {
    return (
      <ScrollView contentContainerStyle={ui.scroll} testID="delete-account-screen">
        <Text style={ui.title}>{ACCOUNT_TEXT.heading}</Text>
        <View style={ui.banner}>
          <Text style={ui.body} testID="delete-account-banner">
            {blockText}
          </Text>
        </View>
        <Pressable
          style={ui.link}
          onPress={() => navigation.goBack()}
          testID="delete-account-back"
        >
          <Text style={ui.linkText}>{ACCOUNT_TEXT.backLabel}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // Webbens kjede, tegn for tegn: eget navn, ellers e-posten, ellers literalen.
  const shownName = ownName || email?.trim() || DISPLAY_NAME_FALLBACK;

  return (
    <ScrollView contentContainerStyle={ui.scroll} testID="delete-account-screen">
      <Text style={ui.title}>{ACCOUNT_TEXT.heading}</Text>

      <Text style={ui.sectionTitle}>{ACCOUNT_TEXT.deletedHeading}</Text>
      <View style={ui.card} testID="delete-account-deleted">
        {ACCOUNT_TEXT.deletedBullets.map((line) => (
          <Bullet key={line} text={line} />
        ))}
      </View>

      <Text style={ui.sectionTitle}>{ACCOUNT_TEXT.keptHeading}</Text>
      <View style={ui.card} testID="delete-account-kept">
        <Bullet text={ACCOUNT_TEXT.keptBullet} />
      </View>

      {/* Webbens `confirmParagraph` er én streng med <strong> rundt navnet.
          React Native har ingen HTML, så navnet er en egen <Text> mellom de to
          halvdelene — samme setning, samme uthevning. */}
      <Text style={[ui.body, styles.confirm]} testID="delete-account-confirm-text">
        {ACCOUNT_TEXT.confirmLead}
        <Text style={styles.name} testID="delete-account-name">
          {shownName}
        </Text>
        {ACCOUNT_TEXT.confirmTrail}
      </Text>

      <Pressable
        style={[ui.button, { backgroundColor: colors.danger }, pending && styles.buttonOff]}
        disabled={pending}
        accessibilityState={{ disabled: pending }}
        onPress={() => void confirm()}
        testID="delete-account-submit"
      >
        <Text style={ui.buttonText}>
          {pending ? ACCOUNT_TEXT.deletePending : ACCOUNT_TEXT.deleteButton}
        </Text>
      </Pressable>

      <Pressable
        style={ui.link}
        disabled={pending}
        onPress={() => navigation.goBack()}
        testID="delete-account-cancel"
      >
        <Text style={ui.linkText}>{ACCOUNT_TEXT.cancelButton}</Text>
      </Pressable>

      {notice ? (
        <Text style={ui.error} testID="delete-account-notice">
          {notice}
        </Text>
      ) : null}
    </ScrollView>
  );
}

/**
 * Navnet på egen rad i `users`, eller `null`.
 *
 * Lesningen bor her og ikke i `data/account.ts` fordi den ikke er en del av
 * slette-flyten: den pynter på én setning, og ingen annen flate trenger den.
 * RLS slipper selv-lesning gjennom, så anon-klienten holder.
 *
 * **Feiler den, blokkerer den ingenting.** Skjermen faller videre på e-posten og
 * til slutt på literalen — å nekte noen å slette kontoen sin fordi et navn ikke
 * lot seg hente, ville vært helt feil pris å ta.
 */
async function fetchOwnName(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('users')
    .select('name')
    .eq('id', userId)
    .maybeSingle<{ name: string | null }>();

  if (error) {
    console.error('[DeleteAccount] navneoppslag feilet', error);
    return null;
  }
  return data?.name?.trim() || null;
}

/** Ett kulepunkt. Egen komponent fordi den trenger sitt eget tema-oppslag. */
function Bullet({ text }: { text: string }) {
  const { ui } = useTheme();
  return (
    <View style={styles.bulletRow}>
      <Text style={ui.body}>{'•'}</Text>
      <Text style={[ui.body, styles.bulletText]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletText: { flex: 1 },
  confirm: { marginTop: 16 },
  name: { fontFamily: FONTS.sansBold },
  buttonOff: { opacity: 0.4 },
});
