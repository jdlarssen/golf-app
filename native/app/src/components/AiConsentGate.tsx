// native/app/src/components/AiConsentGate.tsx
// #2561 PR B: porten for spørsmålet om AI-tekster, i samme form som
// `ProfileGate` og montert innenfor den (App.tsx), så spørsmålet kommer etter
// «Fullfør profilen».
//
// **Slipper gjennom ved tvil.** Avgjørelsen bor i `data/aiConsentGate.ts`: et
// svar enheten har sett, leses ikke igjen; uten nett, når lesingen feiler, og
// når den henger lenger enn taket, rendres barna. Det er trygt, fordi navnet
// bare går til AI-en med «ja». Spørsmålet kommer da neste gang appen starter med nett.
//
// **Et svar som ikke ble lagret, slipper ikke spilleren inn.** Skjermen står
// med en linje om at svaret ikke ble lagret, og knappene kan trykkes igjen.
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, View } from 'react-native';
import { saveAiConsent } from '../data/aiConsent';
import { aiConsentStepFor, rememberAiConsentAnswered } from '../data/aiConsentGate';
import { AI_CONSENT_TEXT } from '../lib/aiConsentCopy';
import { AiConsentQuestion } from '../screens/AiConsentQuestion';
import { useTheme } from '../theme';

type GateState = { kind: 'checking' } | { kind: 'open' } | { kind: 'step' };

export function AiConsentGate({ userId, children }: { userId: string; children: ReactNode }) {
  const { colors, ui } = useTheme();
  const [state, setState] = useState<GateState>({ kind: 'checking' });
  const [pending, setPending] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ask = await aiConsentStepFor(userId);
      if (!cancelled) setState(ask ? { kind: 'step' } : { kind: 'open' });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const onAnswer = async (granted: boolean) => {
    setPending(granted);
    setFailed(false);
    const result = await saveAiConsent(userId, granted);
    setPending(null);
    if (!result.ok) {
      setFailed(true);
      // Skjermleseren skal høre det også, som i `CompleteProfile`.
      AccessibilityInfo.announceForAccessibility(AI_CONSENT_TEXT.saveFailed);
      return;
    }
    await rememberAiConsentAnswered(userId);
    setState({ kind: 'open' });
  };

  if (state.kind === 'checking') {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (state.kind === 'step') {
    return (
      <AiConsentQuestion
        pending={pending}
        failed={failed}
        onAnswer={(granted) => void onAnswer(granted)}
      />
    );
  }
  return <>{children}</>;
}
