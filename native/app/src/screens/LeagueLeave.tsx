// native/app/src/screens/LeagueLeave.tsx
// #2839: bekreftelsen for å melde seg av en klubbliga, det nettets
// `/liga/[id]/meld-av` viser: «Meld deg av «{liga}»?», nettets undertekst, den røde
// knappen og «Avbryt». Husregelen for destruktive flyter: egen skjerm, aldri en dialog.
//
// Skjermen leser bare liganavnet (`GET /api/liga/[id]`). Om du kan melde deg av,
// avgjør `leave_club_league` ved trykket (via `POST /api/liga/[id]/meld-av`), og
// hver avvisning har sin tekst her, som på nettet. Ingenting legges i kø: uten nett
// står feilen, og ingenting er skrevet.
//
// Tilbake (`docs/user-flows.md` §Tilbake): «Avbryt» og en vellykket avmelding går
// til ligasiden, som henter ligaen på nytt og nå viser «Bli med» igjen. Et sent svar
// flytter ikke en skjerm som har mistet fokus (#2757).
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LeagueLoadFailed, LeagueLoading } from '../components/league/LeagueStates';
import { fetchLeague, leaveClubLeague, type LeagueLoadFailure } from '../data/league';
import { backTo } from '../lib/backTo';
import { formatMessage } from '../lib/kavalkadeCopy';
import { LEAGUE_SELF_TEXT, describeClubLeagueLeaveFailure } from '../lib/leagueCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, fraunces, interLine, useTheme } from '../theme';

export function LeagueLeave({ navigation, route }: ScreenProps<'LeagueLeave'>) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const { leagueId } = route.params;
  const [name, setName] = useState<string | null>(null);
  const [failure, setFailure] = useState<LeagueLoadFailure | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Knappen er deaktivert først når `busy` er tegnet. Refen stopper trykk nummer to før det.
  const leaving = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchLeague(leagueId);
    setLoading(false);
    if (result.ok) {
      setName(result.view.league.name);
      setFailure(null);
    } else {
      setFailure(result.reason);
    }
  }, [leagueId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const toLeague = useCallback(() => {
    backTo(navigation, 'League', { leagueId });
  }, [leagueId, navigation]);

  const onLeave = useCallback(async () => {
    if (leaving.current) return;
    leaving.current = true;
    setBusy(true);
    setError(null);
    const result = await leaveClubLeague(leagueId);
    leaving.current = false;
    setBusy(false);
    if (!result.ok) {
      setError(describeClubLeagueLeaveFailure(result.reason));
      return;
    }
    if (navigation.isFocused()) toLeague();
  }, [leagueId, navigation, toLeague]);

  if (name === null) {
    return failure === null ? (
      <LeagueLoading />
    ) : (
      <LeagueLoadFailed reason={failure} retrying={loading} onRetry={() => void load()} />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { backgroundColor: colors.bg, paddingBottom: insets.bottom + 24 }]}
      testID="league-leave-screen"
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header" testID="league-leave-heading">
          {formatMessage(LEAGUE_SELF_TEXT.leaveHeading, { name })}
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>{LEAGUE_SELF_TEXT.leaveSubtitle}</Text>
      </View>

      {error ? (
        <Text style={[styles.error, { color: colors.danger }]} testID="league-leave-error">
          {error}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          style={[ui.button, { backgroundColor: colors.danger }]}
          onPress={() => void onLeave()}
          testID="league-leave-submit"
        >
          <Text style={ui.buttonText}>{busy ? LEAGUE_SELF_TEXT.leavePending : LEAGUE_SELF_TEXT.leaveButton}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          style={ui.buttonSecondary}
          onPress={toLeague}
          testID="league-leave-cancel"
        >
          <Text style={ui.buttonSecondaryText}>{LEAGUE_SELF_TEXT.cancel}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 16 },
  head: { paddingTop: 10, gap: 6, paddingBottom: 8 },
  title: { ...fraunces(500, 26, 30, { multiline: true }) },
  subtitle: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  error: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, paddingTop: 4 },
  actions: { paddingTop: 14 },
});
