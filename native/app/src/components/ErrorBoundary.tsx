// #2228: appens feilgrense. Kaster noe under render (en `assertNever` i delt
// kode, cache-data med feil form, en SQLite-lesing som feilet første gang), får
// spilleren en norsk skjerm med «Prøv igjen» i stedet for et krasj eller en
// hvit skjerm midt i runden. Webben har det samme i `error.tsx` per rute.
//
// Hver skjerm har sin egen grense (`screenLayout` i `navigation.tsx`), så
// headerens tilbakeknapp virker fortsatt. En ytre grense rundt navigatoren
// fanger resten.
//
// Ingen global handler (`ErrorUtils.setGlobalHandler`): den ville erstattet
// React Natives fatale standard-handler og gjort krasjrapportene verre.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ERROR_BOUNDARY_TEXT } from '../lib/errorBoundaryCopy';
import { useTheme } from '../theme';

interface Props {
  children?: ReactNode;
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
    if (this.state.failed) return <ErrorFallback onRetry={this.retry} />;
    return this.props.children;
  }
}

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { ui } = useTheme();
  return (
    <View style={ui.centered} testID="error-boundary">
      <Text style={ui.title} accessibilityRole="header">
        {ERROR_BOUNDARY_TEXT.title}
      </Text>
      <Text style={ui.body}>{ERROR_BOUNDARY_TEXT.body}</Text>
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
