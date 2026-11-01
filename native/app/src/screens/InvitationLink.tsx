// native/app/src/screens/InvitationLink.tsx
// #2748: invitasjonsmailen åpnet appen. Skjermen åpner invitasjonen og går rett til
// spillet, der «Bekreft» står som før (`shouldConfirmParticipation`). Den vises bare
// mens kallet går, og når invitasjonen ikke gir et spill å åpne.
//
// Tilbake (`docs/user-flows.md` §Tilbake): spillet tar skjermens plass (`backTo`), og
// ligger det alt under, går du tilbake til det og får ingen kopi.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  openInvitationLink,
  type InvitationLinkFailure,
  type InvitationLinkOutcome,
} from '../data/invitationLink';
import { backTo } from '../lib/backTo';
import { INVITATION_LINK_TEXT, describeInvitationLinkFailure } from '../lib/invitationLinkCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, interLine, useTheme } from '../theme';

type Shown =
  | { state: 'opening' }
  | { state: 'outcome'; outcome: InvitationLinkOutcome }
  | { state: 'failed'; reason: InvitationLinkFailure };

const OUTCOME_TEXT: Record<InvitationLinkOutcome, string> = {
  started: INVITATION_LINK_TEXT.started,
  no_game: INVITATION_LINK_TEXT.noGame,
  other_account: INVITATION_LINK_TEXT.otherAccount,
  not_found: INVITATION_LINK_TEXT.notFound,
};

export function InvitationLink({ navigation, route }: ScreenProps<'InvitationLink'>) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const { token } = route.params;
  const [shown, setShown] = useState<Shown>({ state: 'opening' });
  // `attempt` teller «Prøv igjen»: hvert trykk spør på nytt.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await openInvitationLink(token);
      if (cancelled) return;
      if (result.ok) backTo(navigation, 'GameHome', { gameId: result.gameId });
      else if ('outcome' in result) setShown({ state: 'outcome', outcome: result.outcome });
      else setShown({ state: 'failed', reason: result.reason });
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, navigation, token]);

  if (shown.state === 'opening') {
    return (
      <View style={ui.centered} testID="invitation-link-opening">
        <ActivityIndicator color={colors.primary} />
        <Text style={ui.muted}>{INVITATION_LINK_TEXT.opening}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { backgroundColor: colors.bg, paddingBottom: insets.bottom + 20 }]}
      testID="invitation-link-screen"
    >
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {shown.state === 'outcome' ? (
          <>
            <Text style={[styles.body, { color: colors.text }]} testID={`invitation-link-${shown.outcome}`}>
              {OUTCOME_TEXT[shown.outcome]}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.popToTop()}
              style={[styles.button, { backgroundColor: colors.primary }]}
              testID="invitation-link-home"
            >
              <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{INVITATION_LINK_TEXT.toHome}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.body, { color: colors.text }]} testID="invitation-link-failed">
              {describeInvitationLinkFailure(shown.reason)}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setShown({ state: 'opening' });
                setAttempt((n) => n + 1);
              }}
              style={[ui.buttonSecondary, styles.flush]}
              testID="invitation-link-retry"
            >
              <Text style={ui.buttonSecondaryText}>{INVITATION_LINK_TEXT.retry}</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}

// Samme kort som «Bli med i liga» og «Bli venn med …».
const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 14, marginTop: 16, marginHorizontal: 16 },
  body: { ...interLine(15, 21.75, { multiline: true }), fontFamily: FONTS.sans },
  button: { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  flush: { marginTop: 0 },
});
