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
// **Android** har ikke dekket. Android tar bildet til appvelgeren når aktiviteten
// pauser, før `AppState` sier «background», så et dekk i React rekker det ikke. Dekket
// på Androids `blur` rakk det, men la seg bak hvert bunnark og hver dialog (en RN-`Modal`
// tar vindusfokus; målt på emulatoren). I stedet ber vi systemet la være å ta bildet
// mens låsen er på (`lib/recentsScreenshot.ts`, Android 13 og nyere): appvelgeren viser
// da temaets bakgrunn uten innhold, og skjermbilder virker som før (eierens valg
// 12.11). Under Android 13 er det ingen beskyttelse i appvelgeren.
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
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { askForUnlock, useAppLock } from '../lib/appLock';
import { APP_LOCK_TEXT } from '../lib/appLockCopy';
import { setRecentsScreenshotEnabled } from '../lib/recentsScreenshot';
import { useTheme } from '../theme';
import { ShareWordmark } from './ShareCardParts';

const LOCK_MARK_PT = 65;
const LOCK_MARK_TOP = 0.36;
const COVER_MARK_PT = 79;
const COVER_MARK_TOP = 0.4;
/** Android klipper halen på «y» mot Satoris stramme linjeboks (målt på emulatoren); iOS er uendret. */
const MARK_LINE_HEIGHT_EM = Platform.OS === 'android' ? 1.3 : 1;

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

  // Android 13+: ingen bilde til appvelgeren mens låsen er på, også mens låseskjermen
  // står. Aktiviteten kan gjenskapes (tema, språk), så kallet gjentas når appen blir aktiv.
  useEffect(() => {
    const apply = () => {
      setRecentsScreenshotEnabled(!lockOn);
    };
    apply();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') apply();
    });
    return () => {
      sub.remove();
      setRecentsScreenshotEnabled(true);
    };
  }, [lockOn]);

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
      {/* Statuslinjen i appen står bak låsen og er ikke montert ennå: uten denne er teksten lys på lin. */}
      <StatusBar style="auto" />
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
        <ShareWordmark
          size={markPt * PixelRatio.get()}
          weight={500}
          color={colors.text}
          lineHeightEm={MARK_LINE_HEIGHT_EM}
        />
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
