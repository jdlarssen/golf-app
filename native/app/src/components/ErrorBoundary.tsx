// #2228: appens feilgrense. Kaster noe under render (en `assertNever` i delt
// kode, cache-data med feil form, en SQLite-lesing som feilet første gang), får
// spilleren en norsk skjerm med «Prøv igjen» i stedet for et krasj eller en
// hvit skjerm midt i runden. Webben har det samme i `error.tsx` per rute.
//
// Hver skjerm har sin egen grense (`screenLayout` i `navigation.tsx`), så
// headerens tilbakeknapp virker fortsatt. En ytre grense rundt navigatoren
// fanger resten. Skjermen er tegnet på designlerretet («Feilskjerm-forslag»),
// og varianten (`errorBoundaryCopy.ts`) velger teksten.
//
// Ingen global handler (`ErrorUtils.setGlobalHandler`): den ville erstattet
// React Natives fatale standard-handler og gjort krasjrapportene verre.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ERROR_BOUNDARY_TEXT, type ErrorBoundaryVariant } from '../lib/errorBoundaryCopy';
import { FONTS, fraunces, interLine, useTheme } from '../theme';

interface Props {
  children?: ReactNode;
  variant?: ErrorBoundaryVariant;
}

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  // Barna var avmontert mens reserveskjermen sto, så de monteres på nytt og
  // leser alt fra start.
  private retry = (): void => {
    this.setState({ failed: false });
  };

  render(): ReactNode {
    if (this.state.failed) {
      return <ErrorFallback variant={this.props.variant ?? 'default'} onRetry={this.retry} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({
  variant,
  onRetry,
}: {
  variant: ErrorBoundaryVariant;
  onRetry: () => void;
}) {
  const { colors, ui } = useTheme();
  return (
    <View style={ui.centered} testID="error-boundary">
      <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
        {ERROR_BOUNDARY_TEXT.title}
      </Text>
      <Text style={[styles.body, { color: colors.text }]} lineBreakStrategyIOS="push-out">
        {variant === 'noBack' ? ERROR_BOUNDARY_TEXT.bodyNoBack : ERROR_BOUNDARY_TEXT.body}
      </Text>
      {variant === 'game' ? (
        <Text
          style={[styles.note, { color: colors.muted }]}
          lineBreakStrategyIOS="push-out"
          testID="error-boundary-game-note"
        >
          {ERROR_BOUNDARY_TEXT.gameNote}
        </Text>
      ) : null}
      <Pressable
        style={ui.button}
        onPress={onRetry}
        accessibilityRole="button"
        testID="error-boundary-retry"
      >
        <Text style={ui.buttonText}>{ERROR_BOUNDARY_TEXT.retry}</Text>
      </Pressable>
    </View>
  );
}

// Lerretet: tittel 26/32, brødtekst 16 med 1,45 og notis 14 med 1,45, begge
// høyst 300 brede. All tekst er midtstilt. Lerretet bryter med
// `text-wrap: pretty` (ikke ett ord alene på siste linje); `push-out` er
// iOS-regelen for det samme.
const styles = StyleSheet.create({
  title: { ...fraunces(600, 26, 32, { multiline: true }), textAlign: 'center' },
  body: {
    ...interLine(16, 23.2, { multiline: true }),
    fontFamily: FONTS.sans,
    maxWidth: 300,
    textAlign: 'center',
  },
  note: {
    ...interLine(14, 20.3, { multiline: true }),
    fontFamily: FONTS.sans,
    maxWidth: 300,
    textAlign: 'center',
  },
});
