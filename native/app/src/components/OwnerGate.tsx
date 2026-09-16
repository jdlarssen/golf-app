// native/app/src/components/OwnerGate.tsx
// Native #1942/#1959: eier-porten mellom sesjonen og stacken. Bodde i `App.tsx`
// til #1959 ga den en tredje tilstand; egen fil så den kan render-testes uten
// fonter, splash og hele app-rota.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { OwnerWipeFailedError, ensureLocalDataOwnerOnDevice } from '../data/localOwner';
import { logOut } from '../data/logout';
import { OWNER_GATE_TEXT } from '../lib/ownerGateCopy';
import { useTheme } from '../theme';

/**
 * Eier-vakten (#1942) mellom sesjonen og stacken.
 *
 * Barna (og dermed `startSyncTriggers` i Hjem) rendres ikke før vakten har
 * svart, og aldri mens eierbytte-wipen står som feilet (#1959). Kalleren setter `key={userId}`, så porten monteres på nytt for hver
 * bruker og starter alltid som «ikke sjekket»; det er derfor ingen effekt
 * trenger å nullstille noe når sesjonen bytter.
 */
export function OwnerGate({ userId, children }: { userId: string; children: ReactNode }) {
  const { colors, ui } = useTheme();
  const [state, setState] = useState<'checking' | 'ok' | 'wipe-failed'>('checking');
  const [busy, setBusy] = useState<null | 'retry' | 'logout'>(null);
  const [note, setNote] = useState<string | null>(null);

  // Svaret porten gir på ett vaktforsøk. Kaster aldri.
  const runGuard = useCallback(
    (): Promise<'ok' | 'wipe-failed'> =>
      ensureLocalDataOwnerOnDevice(userId).then(
        () => 'ok' as const,
        (err: unknown) => {
          // #1959: fail-CLOSED bare når wipen selv kastet ved eierbytte —
          // forrige brukers kø ligger fortsatt i basen, og en drain under
          // denne sesjonen ender i karantene. Alle andre feil er defensive
          // som før (som webbens SyncBoot): logg og slipp appen videre.
          console.error('[App] eier-vakten feilet', err);
          return err instanceof OwnerWipeFailedError ? ('wipe-failed' as const) : ('ok' as const);
        },
      ),
    [userId],
  );

  useEffect(() => {
    let cancelled = false;
    void runGuard().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [runGuard]);

  const onRetry = useCallback(() => {
    setBusy('retry');
    setNote(null);
    void runGuard().then((next) => {
      setState(next);
      setBusy(null);
    });
  }, [runGuard]);

  // Den vanlige utloggingen: den ser selv at stempelet er en annens, og hopper
  // over drain og wipe (#1959). Ved suksess bytter `SIGNED_OUT` til Login og
  // porten unmountes, så `busy` får bevisst stå.
  const onLogOut = useCallback(() => {
    setBusy('logout');
    setNote(null);
    void logOut()
      .then((result) => {
        if (result.ok) return;
        setBusy(null);
        setNote(OWNER_GATE_TEXT.logoutOfflineNote);
      })
      .catch((err: unknown) => {
        console.error('[App] utlogging fra eier-porten kastet', err);
        setBusy(null);
        setNote(OWNER_GATE_TEXT.logoutFailedNote);
      });
  }, []);

  if (state === 'checking') {
    // Millisekundene AsyncStorage bruker — og en wipe, den ene gangen det er
    // en annen bruker.
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (state === 'wipe-failed') {
    // Barna rendres ikke, og dermed starter heller ingen `startSyncTriggers`.
    // Ingen «fortsett likevel» (eierens svar i #1959): bare prøv igjen eller
    // logg ut.
    return (
      <View style={ui.centered} testID="owner-gate-wipe-failed">
        <Text style={ui.body}>{OWNER_GATE_TEXT.wipeFailed}</Text>
        <Pressable
          style={ui.button}
          onPress={onRetry}
          disabled={busy != null}
          testID="owner-gate-retry"
        >
          <Text style={ui.buttonText}>{OWNER_GATE_TEXT.retry}</Text>
        </Pressable>
        <Pressable
          style={ui.buttonSecondary}
          onPress={onLogOut}
          disabled={busy != null}
          testID="owner-gate-logout"
        >
          <Text style={ui.buttonSecondaryText}>
            {busy === 'logout' ? OWNER_GATE_TEXT.logoutPending : OWNER_GATE_TEXT.logout}
          </Text>
        </Pressable>
        {note ? <Text style={ui.error}>{note}</Text> : null}
      </View>
    );
  }
  return <>{children}</>;
}
