// native/app/src/components/AppLockGate.tsx
// #2841: låsen på appen. Står rett innenfor `if (session)` i `App.tsx`, foran
// `OwnerGate`, så ingenting med data monteres før den er låst opp. Låsen ligger
// over en sesjon som alt finnes: den lager, fornyer eller sletter aldri en sesjon.
//
// **Appen spør bare ved kaldstart** (eierens svar 12.11). Er låsen på da
// (`startLocked`), monteres ikke barna før telefonen har sagt ja. Spørsmålet
// kommer av seg selv i det splashen er borte. En app som iOS eller Android har
// avsluttet i bakgrunnen og som startes på nytt, er en kaldstart, og spør. Å
// komme tilbake fra bakgrunnen spør aldri, uansett hvor lenge appen lå der.
//
// **Dekket i appvelgeren.** Er låsen på, legges et ugjennomsiktig dekke med
// bakgrunnsfargen og ordmerket over appen så snart `AppState` er `inactive` eller
// `background`, og det fjernes ved `active`. Dekket låser ikke og spør ikke:
// barna står montert hele tiden, så spilleren lander på samme hull og synken går
// videre. Fordi bare dekket står, kan Face ID-dialogen (som gir `inactive`) ikke
// lage en løkke. Dekket skjuler barna for skjermleseren.
//
// **Låseskjermen** er bakgrunnen, ordmerket og én knapp, «Lås opp», som spør på
// nytt. Ingen «Logg ut»: telefonens kode er alltid reserveveien. Avbryter
// spilleren, blir skjermen stående. Har telefonen ingenting å spørre med, slippes
// spilleren inn (se `askForUnlock`).
//
// Målene er tegningen eieren godkjente 12.11 (#2841): ordmerket 65 pt med
// midten på 36 % av høyden, knappen 52 høy med 20 til sidene og 48 fra bunnen;
// dekket har ordmerket på 40 %.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AppState,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { askForUnlock, useAppLock } from '../lib/appLock';
import { APP_LOCK_TEXT } from '../lib/appLockCopy';
import { useTheme } from '../theme';
import { ShareWordmark } from './ShareCardParts';

const LOCK_MARK_PT = 65;
const LOCK_MARK_TOP = 0.36;
const COVER_MARK_PT = 79;
const COVER_MARK_TOP = 0.4;

type Props = {
  /** Låsen var på da appen startet, og spilleren hadde en sesjon. Leses ved kaldstart. */
  startLocked: boolean;
  /** Telefonen sa ja (eller har ingenting å spørre med): barna kan monteres. */
  onUnlocked: () => void;
  children: ReactNode;
};

export function AppLockGate({ startLocked, onUnlocked, children }: Props) {
  const lockOn = useAppLock();
  const [away, setAway] = useState(isAway(AppState.currentState));
  const [asking, setAsking] = useState(false);
  const askingRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => setAway(isAway(next)));
    return () => sub.remove();
  }, []);

  const ask = useCallback(async () => {
    if (askingRef.current) return;
    askingRef.current = true;
    setAsking(true);
    const answer = await askForUnlock();
    askingRef.current = false;
    if (!aliveRef.current) return;
    setAsking(false);
    if (answer !== 'denied') onUnlocked();
  }, [onUnlocked]);

  // Kaldstart med låsen på: slipp splashen først, så spørsmålet aldri kommer
  // mens den står. `App.tsx` slipper den også, men barnas effekter går før
  // forelderens.
  useEffect(() => {
    if (!startLocked) return;
    let cancelled = false;
    void (async () => {
      try {
        await SplashScreen.hideAsync();
      } catch {
        // Allerede borte.
      }
      if (!cancelled) await ask();
    })();
    return () => {
      cancelled = true;
    };
  }, [startLocked, ask]);

  if (startLocked) {
    return (
      <LockScreen asking={asking} onUnlock={() => void ask()} />
    );
  }

  const covered = lockOn && away;
  // Dekket er søsken til barna, ikke barn av dem: ellers ville det skjules for
  // skjermleseren sammen med innholdet. Omslaget står alltid, så barna aldri monteres på nytt.
  return (
    <>
      <View
        style={styles.fill}
        accessibilityElementsHidden={covered}
        importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      {covered ? (
        <Backdrop markPt={COVER_MARK_PT} markTop={COVER_MARK_TOP} testID="app-lock-cover" />
      ) : null}
    </>
  );
}

/** `inactive` er også Face ID-dialogen og varslingssenteret; begge skal dekkes. */
function isAway(state: string | null | undefined): boolean {
  return state === 'inactive' || state === 'background';
}

function LockScreen({ asking, onUnlock }: { asking: boolean; onUnlock: () => void }) {
  const { ui } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Backdrop markPt={LOCK_MARK_PT} markTop={LOCK_MARK_TOP} testID="app-lock-screen">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={APP_LOCK_TEXT.unlockButton}
        accessibilityState={{ disabled: asking, busy: asking }}
        disabled={asking}
        onPress={onUnlock}
        style={[
          ui.button,
          styles.unlock,
          { bottom: Math.max(48, insets.bottom + 16) },
          asking ? styles.unlockBusy : null,
        ]}
        testID="app-lock-unlock"
      >
        <Text style={ui.buttonText}>{APP_LOCK_TEXT.unlockButton}</Text>
      </Pressable>
    </Backdrop>
  );
}

function Backdrop({
  markPt,
  markTop,
  testID,
  children,
}: {
  markPt: number;
  markTop: number;
  testID: string;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} testID={testID}>
      <View style={[styles.mark, { top: height * markTop }]}>
        {/* `ShareWordmark` regner i rutas piksler (`size / PixelRatio`), så pt-størrelsen skaleres opp. */}
        <ShareWordmark size={markPt * PixelRatio.get()} weight={500} color={colors.text} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  mark: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  unlock: { position: 'absolute', left: 20, right: 20, minHeight: 52, marginTop: 0 },
  unlockBusy: { opacity: 0.6 },
});
