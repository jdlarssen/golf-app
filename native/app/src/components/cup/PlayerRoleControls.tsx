// #2752: lag og kaptein for én spiller på lista, nettets `RoleForm` i Spillere-rommet.
// Kaptein krever lag, og å ta spilleren av laget tar også kapteinsflagget, som på nettet.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppCupEnrolled } from '../../../../../lib/cup/appCupSetupView';
import { ROLE_TEXT } from '../../lib/cupLineupCopy';
import { formatMessage } from '../../lib/kavalkadeCopy';
import { useTheme } from '../../theme';
import { Chips, ToggleRow } from '../create/primitives';

type TeamChoice = 0 | 1 | 2;

export function PlayerRoleControls({
  player,
  team1Name,
  team2Name,
  busy,
  onSave,
}: {
  player: AppCupEnrolled;
  team1Name: string;
  team2Name: string;
  busy: boolean;
  onSave: (teamNumber: 1 | 2 | null, isCaptain: boolean) => void;
}) {
  const { ui } = useTheme();
  const [team, setTeam] = useState<TeamChoice>(player.teamNumber ?? 0);
  const [captain, setCaptain] = useState(player.isCaptain);
  const dirty = team !== (player.teamNumber ?? 0) || captain !== player.isCaptain;
  const disabled = busy || !dirty;

  return (
    <View style={styles.controls} testID={`cup-player-role-${player.userId}`}>
      <Chips
        value={team}
        onChange={(next: TeamChoice) => {
          setTeam(next);
          // Uten lag kan man ikke være kaptein (CHECK i 0172).
          if (next === 0) setCaptain(false);
        }}
        options={[
          { value: 0, label: ROLE_TEXT.unassigned, testID: `cup-player-team-${player.userId}-0` },
          { value: 1, label: team1Name, testID: `cup-player-team-${player.userId}-1` },
          { value: 2, label: team2Name, testID: `cup-player-team-${player.userId}-2` },
        ]}
      />
      {team === 0 ? null : (
        <ToggleRow
          label={ROLE_TEXT.captainLabel}
          value={captain}
          onChange={setCaptain}
          testID={`cup-player-captain-${player.userId}`}
        />
      )}
      {dirty ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={formatMessage(ROLE_TEXT.saveRoleLabel, { name: player.name })}
          accessibilityState={{ disabled }}
          disabled={disabled}
          style={[ui.buttonSecondary, busy && styles.dimmed]}
          onPress={() => onSave(team === 0 ? null : team, captain)}
          testID={`cup-player-save-role-${player.userId}`}
        >
          <Text style={ui.buttonSecondaryText}>{ROLE_TEXT.saveRole}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { gap: 6 },
  dimmed: { opacity: 0.45 },
});
