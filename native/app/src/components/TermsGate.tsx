// #3019: vilkårene står foran resten av appen til spilleren har sagt ja én
// gang (per versjon, `TERMS_VERSION`). Samme form som `AiConsentGate`: porten
// slipper spilleren inn ved tvil (uten nett, treg lesing, lesefeil), og
// spørsmålet kommer da neste gang appen starter med nett. Den står etter
// «Fullfør profilen» og før spørsmålet om AI-tekster.
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, View } from 'react-native';
import { saveTermsAccepted } from '../data/terms';
import { rememberTermsAccepted, termsStepFor } from '../data/termsGate';
import { logOut } from '../data/logout';
import { MODERATION_TEXT } from '../lib/moderationCopy';
import { PROFILE_TEXT, unsentStrokesWarning } from '../lib/profileCopy';
import { describeWebLinkFailure, openWeb } from '../lib/webLink';
import { TermsQuestion, type TermsAnswer } from '../screens/TermsQuestion';
import { useTheme } from '../theme';
import { TERMS_PATH } from '../../../../lib/legal/terms';

type GateState = { kind: 'checking' } | { kind: 'open' } | { kind: 'step' };

export function TermsGate({ userId, children }: { userId: string; children: ReactNode }) {
  const { colors, ui } = useTheme();
  const [state, setState] = useState<GateState>({ kind: 'checking' });
  const [pending, setPending] = useState<TermsAnswer | null>(null);
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ask = await termsStepFor(userId);
      if (!cancelled) setState(ask ? { kind: 'step' } : { kind: 'open' });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const fail = (text: string) => {
    setLine(text);
    AccessibilityInfo.announceForAccessibility(text);
  };

  const onAnswer = async (answer: TermsAnswer) => {
    setPending(answer);
    setLine(null);
    if (answer === 'decline') {
      // Utloggingen bytter til innloggingsskjermen, og porten forsvinner med
      // resten. Slag som ikke er sendt, får samme spørsmål som «Logg ut» i
      // «Personvern og konto».
      const result = await logOut().catch((err: unknown) => {
        console.error('[TermsGate] utlogging kastet', err);
        return { ok: false as const, reason: 'signout-failed' as const };
      });
      if (result.ok) return;
      if (result.reason === 'unsent') {
        askLogOutWithUnsent(result.pending);
        return;
      }
      setPending(null);
      fail(PROFILE_TEXT.logoutOfflineNote);
      return;
    }
    const result = await saveTermsAccepted(userId);
    setPending(null);
    if (!result.ok) {
      fail(MODERATION_TEXT.termsSaveFailed);
      return;
    }
    await rememberTermsAccepted(userId);
    setState({ kind: 'open' });
  };

  const askLogOutWithUnsent = (count: number) => {
    Alert.alert(
      PROFILE_TEXT.unsentStrokesTitle,
      unsentStrokesWarning(count),
      [
        { text: PROFILE_TEXT.unsentStrokesCancel, style: 'cancel', onPress: () => setPending(null) },
        {
          text: PROFILE_TEXT.unsentStrokesConfirm,
          style: 'destructive',
          onPress: () => {
            void logOut({ keepUnsent: true })
              .then((result) => {
                if (result.ok) return;
                setPending(null);
                fail(PROFILE_TEXT.logoutOfflineNote);
              })
              .catch((err: unknown) => {
                console.error('[TermsGate] utlogging kastet', err);
                setPending(null);
                fail(PROFILE_TEXT.logoutFailedNote);
              });
          },
        },
      ],
      { cancelable: false },
    );
  };

  const onRead = () => {
    setLine(null);
    void openWeb(TERMS_PATH).then((result) => {
      if (!result.ok) fail(describeWebLinkFailure(result.reason));
    });
  };

  if (state.kind === 'checking') {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (state.kind === 'step') {
    return <TermsQuestion pending={pending} line={line} onAnswer={(a) => void onAnswer(a)} onRead={onRead} />;
  }
  return <>{children}</>;
}
