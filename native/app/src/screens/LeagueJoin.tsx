// native/app/src/screens/LeagueJoin.tsx
// #2748: «Bli med i liga», skjermen ligalenka åpner i appen. Tilstandene er
// nettsidens (`/liga/bli-med/[code]`, #2662): du kan bli med, ligaen er avsluttet,
// profilen mangler handicap, og lenka fører ingen steder. Er du alt med, går du
// rett til ligasiden uten noen mellomskjerm.
//
// Tegningen står på bevissiden til PR-en (lys og natt, én per tilstand): samme
// topp som ligasiden, liganavnet stort, og skogkortet fra «Bli venn med …» med
// rundene, antall påmeldte og den kremfargede knappen.
//
// Alt kommer fra `GET /api/liga/bli-med/[code]`, og regelen er den nettsiden
// bruker (`evaluateLeagueJoin`). Skrivingen er `POST` på samme sti. Ingenting
// legges i kø: uten nett står feilen og «Prøv igjen», og ingenting er skrevet.
//
// Tilbake (`docs/user-flows.md` §Tilbake): åpnet lenka appen, går tilbake til Hjem.
// Sto du på en annen skjerm, går tilbake dit (unntaket i regel 1). «Bli med» er et
// sendt skjema, så skjermen er borte fra tilbake-veien etterpå (`backTo`). Ligger
// ligaen alt under, går du tilbake til den og får ingen kopi.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppLeagueJoinView } from '../../../../lib/league/appLeagueView';
import { LeagueLoadFailed, LeagueLoading } from '../components/league/LeagueStates';
import { fetchLeagueJoin, joinLeague, type LeagueLoadFailure } from '../data/league';
import { backTo, openOrReturn } from '../lib/backTo';
import {
  LEAGUE_JOIN_TEXT,
  LEAGUE_TEXT,
  describeLeagueJoinFailure,
  joinFormatLine,
  joinLateLine,
  joinPlayersLine,
  joinRoundsLine,
} from '../lib/leagueCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, fraunces, interLine, useTheme, withAlpha } from '../theme';

export function LeagueJoin({ navigation, route }: ScreenProps<'LeagueJoin'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { code } = route.params;
  const [view, setView] = useState<AppLeagueJoinView | null>(null);
  const [failure, setFailure] = useState<LeagueLoadFailure | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  // Knappen er deaktivert først når `busy` er tegnet. Refen stopper trykk nummer
  // to før det.
  const joining = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchLeagueJoin(code);
    setLoading(false);
    if (!result.ok) {
      setFailure(result.reason);
      return;
    }
    setFailure(null);
    if (result.view.decision === 'already_joined') {
      backTo(navigation, 'League', { leagueId: result.view.league.id });
      return;
    }
    setView(result.view);
  }, [code, navigation]);

  // Også ved fokus: kommer du tilbake fra profilen, kan svaret være et annet.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onJoin = useCallback(async () => {
    if (joining.current || !view) return;
    joining.current = true;
    setBusy(true);
    setJoinError(null);
    const result = await joinLeague(code);
    joining.current = false;
    setBusy(false);
    if (result.ok) {
      backTo(navigation, 'League', { leagueId: result.leagueId, joined: true });
      return;
    }
    if (result.reason === 'closed' || result.reason === 'profile_incomplete') {
      setView({ ...view, decision: result.reason });
    } else if (result.reason === 'not_found') {
      setFailure('not_found');
    } else {
      setJoinError(describeLeagueJoinFailure(result.reason));
    }
  }, [code, navigation, view]);

  const scroll = [styles.scroll, { backgroundColor: colors.bg, paddingBottom: insets.bottom + 20 }];

  if (failure === 'not_found') {
    return (
      <ScrollView contentContainerStyle={scroll} testID="league-join-screen">
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.body, { color: colors.text }]} testID="league-join-not-found">
            {LEAGUE_JOIN_TEXT.notFound}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.popToTop()}
            style={[styles.button, { backgroundColor: colors.primary }]}
            testID="league-join-home"
          >
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{LEAGUE_JOIN_TEXT.toHome}</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }
  if (view === null) {
    return failure === null ? (
      <LeagueLoading />
    ) : (
      <LeagueLoadFailed reason={failure} retrying={loading} onRetry={() => void load()} />
    );
  }

  const { decision, league } = view;
  const late = decision === 'closed' ? null : joinLateLine(view.lateJoin);

  return (
    <ScrollView contentContainerStyle={scroll} testID="league-join-screen">
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header" testID="league-join-name">
          {league.name}
        </Text>
        <Text style={[styles.format, { color: colors.muted }]} testID="league-join-format">
          {joinFormatLine(league)}
        </Text>
      </View>

      {decision === 'can_join' ? (
        <View style={[styles.hero, { backgroundColor: colors.surfaceStrong }]} testID="league-join-open">
          <Facts view={view} color={withAlpha(colors.onStrongWarm, 0.85)} />
          {late ? (
            <Text style={[styles.body, { color: colors.onStrongWarm }]} testID="league-join-late">
              {late}
            </Text>
          ) : null}
          <Text style={[styles.body, { color: colors.onStrongWarm }]}>{LEAGUE_JOIN_TEXT.invite}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            onPress={() => void onJoin()}
            style={[styles.button, { backgroundColor: colors.onStrongWarm }, busy ? styles.dimmed : null]}
            testID="league-join-button"
          >
            <Text style={[styles.buttonText, { color: colors.surfaceStrong }]}>
              {busy ? LEAGUE_JOIN_TEXT.joinPending : joinError ? LEAGUE_TEXT.retry : LEAGUE_JOIN_TEXT.joinButton}
            </Text>
          </Pressable>
          {joinError ? (
            <Text style={[styles.body, { color: colors.onStrongWarm }]} testID="league-join-error">
              {joinError}
            </Text>
          ) : null}
        </View>
      ) : (
        <View
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          testID={`league-join-${decision}`}
        >
          <Facts view={view} color={colors.muted} />
          {late ? (
            <Text style={[styles.body, { color: colors.text }]} testID="league-join-late">
              {late}
            </Text>
          ) : null}
          <Text style={[styles.body, { color: colors.text }]}>
            {decision === 'closed' ? LEAGUE_JOIN_TEXT.closed : LEAGUE_JOIN_TEXT.profileIncomplete}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              decision === 'closed'
                ? backTo(navigation, 'League', { leagueId: league.id })
                : openOrReturn(navigation, 'EditProfile')
            }
            style={[styles.button, { backgroundColor: colors.primary }]}
            testID="league-join-next"
          >
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>
              {decision === 'closed' ? LEAGUE_JOIN_TEXT.seeTable : LEAGUE_JOIN_TEXT.completeProfile}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

/** Rundene og antall påmeldte, med tall i like bredder. Aldri navn. */
function Facts({ view, color }: { view: AppLeagueJoinView; color: string }) {
  return (
    <View style={styles.facts}>
      <Text style={[styles.fact, { color }]} testID="league-join-rounds">
        {joinRoundsLine(view.rounds)}
      </Text>
      <Text style={[styles.fact, { color }]} testID="league-join-count">
        {joinPlayersLine(view.participantCount)}
      </Text>
    </View>
  );
}

// Målene er ligasidens topp (`.lh`, 6 under toppen og 20 fra kanten) og kortene
// fra «Bli venn med …»: 16 fra kanten, 16 inni, knappen 52 pt høy.
const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  head: { paddingTop: 6, paddingHorizontal: 20 },
  title: { ...fraunces(500, 28, 34, { multiline: true }) },
  format: { ...interLine(13, 16), fontFamily: FONTS.sans, marginTop: 6 + interLine(13, 16).marginTop },
  hero: { borderRadius: 18, padding: 16, gap: 14, marginTop: 16, marginHorizontal: 16 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 14, marginTop: 16, marginHorizontal: 16 },
  facts: { gap: 4 },
  fact: { ...interLine(14, 20), fontFamily: FONTS.sans, fontVariant: ['tabular-nums'] },
  body: { ...interLine(15, 21.75, { multiline: true }), fontFamily: FONTS.sans },
  button: { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  dimmed: { opacity: 0.5 },
});
