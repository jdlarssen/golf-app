// «Trekk deg fra spillet» på spillets side (#1954 A1).
//
// Nettsiden har lenka for alle påmeldte: før start for alle utenom cup-kamper,
// under runden når formatet kjenner frafall. Regelen bor i
// `lib/playerWithdraw.ts`; ordene er webbens (`PLAYER_WITHDRAW`). Selve trekket
// går gjennom samme rute og feiltekster som arrangørens «Trekk meg»
// (`data/withdrawSelf.ts`, `describeSelfWithdrawFailure`).
//
// Før start slettes påmeldingen, så spilleren har ikke noe å gjøre på siden
// etterpå: da går appen til Hjem, som nettsiden gjør. Under runden blir
// spilleren stående, og trukket-banneret med «Angre trekk» tar over.
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { withdrawSelf } from '../../data/withdrawSelf';
import type { PlayerWithdrawKind } from '../../lib/playerWithdraw';
import {
  describeSelfWithdrawFailure,
  PLAYER_WITHDRAW,
  playerWithdrawConfirmTitle,
} from '../../lib/rosterCopy';
import { useTheme } from '../../theme';

export function PlayerWithdraw({
  gameId,
  gameName,
  kind,
  onChanged,
  onLeft,
}: {
  gameId: string;
  gameName: string;
  kind: PlayerWithdrawKind;
  onChanged: () => Promise<void>;
  onLeft: () => void;
}) {
  const { ui, colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const withdraw = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await withdrawSelf(gameId);
      if (!result.ok) {
        setNotice(describeSelfWithdrawFailure(result.reason));
      } else if (kind === 'pre-start') {
        onLeft();
        return;
      }
    } catch {
      setNotice(describeSelfWithdrawFailure('withdraw_failed'));
    }
    await onChanged();
    setBusy(false);
  };

  const confirm = () => {
    Alert.alert(
      playerWithdrawConfirmTitle(gameName),
      kind === 'pre-start' ? PLAYER_WITHDRAW.bodyPreStart : PLAYER_WITHDRAW.bodyActive,
      [
        { text: 'Avbryt', style: 'cancel' },
        { text: PLAYER_WITHDRAW.confirmCta, style: 'destructive', onPress: () => void withdraw() },
      ],
    );
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={confirm}
        style={styles.link}
        testID="player-withdraw"
      >
        <Text style={[ui.muted, styles.linkText, { textDecorationColor: colors.muted }]}>
          {PLAYER_WITHDRAW.link}
        </Text>
      </Pressable>
      {notice ? (
        <Text style={ui.error} testID="player-withdraw-notice">
          {notice}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 4 },
  // Diskret lenke som på nettsiden, men med full trykkflate (≥ 44 pt).
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  linkText: { textDecorationLine: 'underline' },
});
