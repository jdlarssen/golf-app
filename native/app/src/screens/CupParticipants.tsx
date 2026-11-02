// #2752: spillerlista som egen skjerm, som nettets Spillere-rom. Døra står i cup-rommet
// mens cupen er et utkast, og et trykk på `cup_signup` åpner den. Å åpne lista merker
// varselet om påmeldingen som lest, som på nettet.
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { CupPlayersBody } from '../components/cup/CupPlayersBody';
import { KEYBOARD_SCROLL_PROPS, useBottomInsetUnlessKeyboard } from '../components/KeyboardInset';
import { openOrReturn } from '../lib/backTo';
import { PLAYERS_TEXT } from '../lib/cupSetupCopy';
import { useMarkVisitRead } from '../lib/useMarkVisitRead';
import type { ScreenProps } from '../navigation';
import { fraunces, useTheme } from '../theme';

export function CupParticipants({ route, navigation }: ScreenProps<'CupParticipants'>) {
  const { colors } = useTheme();
  const bottomInset = useBottomInsetUnlessKeyboard();
  const { cupId, notice } = route.params;
  useMarkVisitRead('cupParticipants', cupId);

  return (
    <ScrollView
      {...KEYBOARD_SCROLL_PROPS}
      contentContainerStyle={[styles.scroll, { backgroundColor: colors.bg, paddingBottom: bottomInset + 24 }]}
      testID="cup-participants-screen"
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
          {PLAYERS_TEXT.pageTitle}
        </Text>
      </View>
      <CupPlayersBody
        cupId={cupId}
        notice={notice === 'participant_removed' ? PLAYERS_TEXT.removed : null}
        onRemove={(player, cupName) =>
          openOrReturn(navigation, 'CupRemovePlayer', {
            cupId,
            userId: player.userId,
            name: player.name,
            cupName,
            captain: player.isCaptain,
            returnTo: 'CupParticipants',
          })
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 16 },
  head: { paddingTop: 10, paddingBottom: 8 },
  title: { ...fraunces(500, 26, 30) },
});
