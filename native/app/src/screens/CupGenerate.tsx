// #2752: «Fordel & generer», det nettets `GenerateMatches` og `GenerateMatchesWizard`
// gir: lagfordeling og antall kamper per økt, så forslaget med bytte av spillere. Bunter
// for delt dag og slagene på greensomen er med. Regnestykket er delt med nettet
// (`lib/cup/matchPlan.ts`), og `CupGenerate.test.tsx` holder de to til samme fasit.
//
// Bane, tee og format kommer fra den lagrede planen, og serveren er fasit ved innsending.
// Alt krever nett. En generering legger til kamper, så kroppen sier hvor mange skjermen
// så da du første gang sendte. Stemmer ikke tallet, svarer ruta `matches_changed` uten å
// skrive, og du sendes til cupen for å se hva som finnes.
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AppCupGenerateView } from '../../../../lib/cup/appCupGenerateView';
import {
  adjustedSessionOverrides,
  buildSubmissionMatches,
  canAdvanceRoster,
  changeMatchPlayer,
  generateMatchPlan,
  isSplitDayPreset,
  plannedMatchTotal,
  rosterBlock,
  sessionCountRowsFor,
  type MatchPlanSetup,
  type PlanMatch,
  type TeamAssignment,
  type TeamStrokesInputs,
} from '../../../../lib/cup/matchPlan';
import { swapFlightPlayer, type FlightTeamSide } from '../../../../lib/cup/splitDayLineup';
import type { PlannedBundleMatch } from '../../../../lib/cup/cupPairing';
import { GeneratePreview, GenerateRecap } from '../components/cup/GeneratePreview';
import { GenerateRoster, GenerateSessionCounts } from '../components/cup/GenerateRoster';
import { Note } from '../components/create/primitives';
import { KEYBOARD_SCROLL_PROPS, useBottomInsetUnlessKeyboard } from '../components/KeyboardInset';
import { createCupMatches, fetchCupGenerate } from '../data/cupSetup';
import { backTo, openOrReturn } from '../lib/backTo';
import { GENERATE_TEXT, generateFailureText } from '../lib/cupGenerateCopy';
import { SETUP_APP_TEXT, setupLoadFailureText } from '../lib/cupSetupCopy';
import { formatMessage } from '../lib/kavalkadeCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, interLine, TAP, useTheme } from '../theme';

type Step = 1 | 2;
type CupArrival = 'matches_generated' | 'matches_changed';
const TOTAL_STEPS = 2;

export function CupGenerate({ route, navigation }: ScreenProps<'CupGenerate'>) {
  const { colors, ui } = useTheme();
  const bottomInset = useBottomInsetUnlessKeyboard();
  const { cupId } = route.params;

  const [view, setView] = useState<AppCupGenerateView | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [assignments, setAssignments] = useState<Record<string, TeamAssignment>>({});
  const [overrides, setOverrides] = useState<Record<number, number>>({});
  const [matches, setMatches] = useState<PlanMatch[]>([]);
  const [strokes, setStrokes] = useState<TeamStrokesInputs>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leaving = useRef(false);
  // Knappen er deaktivert først når `busy` er tegnet. Refen stopper trykk nummer to før det.
  const sending = useRef(false);
  // Svaret er her. Lå en annen skjerm oppå da det kom, går vi videre når du er tilbake.
  const arrived = useRef<CupArrival | null>(null);
  // Antallet fra første innsending. Gikk svaret tapt, kan kampene være skrevet, og en ny
  // lesing ville vist dem som om de alltid var der. Da ville neste forsøk laget alle på nytt.
  const sentFrom = useRef<number | null>(null);

  const load = useCallback(async () => {
    const result = await fetchCupGenerate(cupId);
    if (result.ok) {
      setView(result.view);
      setFailure(null);
    } else {
      if (result.reason === 'not_found' || result.reason === 'not_manager') setView(null);
      setFailure(result.reason);
    }
  }, [cupId]);

  const toCup = useCallback(
    (notice: CupArrival) => {
      leaving.current = true;
      backTo(navigation, 'Cup', { cupId, notice });
    },
    [cupId, navigation],
  );

  useFocusEffect(
    useCallback(() => {
      if (arrived.current) {
        toCup(arrived.current);
        return;
      }
      // Forslaget er laget av det som ble lest. Bare steg 1 tegnes av nye tall.
      if (step === 1) void load();
    }, [load, step, toCup]),
  );

  // Tilbake fra forslaget går til lagene, og ikke midt i en innsending.
  usePreventRemove(step === 2, ({ data }) => {
    if (leaving.current) {
      navigation.dispatch(data.action);
      return;
    }
    if (busy) return;
    setError(null);
    setStep(1);
  });

  if (view === null && failure === null) {
    return (
      <View style={ui.centered} testID="cup-generate-loading">
        <ActivityIndicator color={colors.primary} />
        <Text style={ui.muted}>{SETUP_APP_TEXT.loading}</Text>
      </View>
    );
  }
  if (view === null) {
    const final = failure === 'not_found' || failure === 'not_manager';
    return (
      <View style={ui.centered} testID="cup-generate-failed">
        <Text style={[styles.failure, { color: final ? colors.text : colors.danger }]}>
          {setupLoadFailureText(failure ?? 'load_failed')}
        </Text>
        {final ? null : <RetryButton onPress={() => void load()} />}
      </View>
    );
  }
  if (view.status !== 'draft') {
    return (
      <View style={ui.centered} testID="cup-generate-locked">
        <Text style={[styles.failure, { color: colors.text }]}>{generateFailureText('not_draft')}</Text>
      </View>
    );
  }

  const { plan } = view;
  if (plan === null || view.players.length === 0) {
    return (
      <ScrollView
        {...KEYBOARD_SCROLL_PROPS}
        contentContainerStyle={[ui.scroll, { paddingBottom: 20 + bottomInset }]}
        testID="cup-generate-empty"
      >
        <Text style={ui.title}>{GENERATE_TEXT.pageTitle}</Text>
        <Text style={ui.muted}>{`${view.team1Name} ${GENERATE_TEXT.mot} ${view.team2Name}`}</Text>
        {failure !== null ? <StaleNote reason={failure} onRetry={() => void load()} /> : null}
        {plan === null ? (
          <View style={styles.empty}>
            <Note testID="cup-generate-no-plan">{GENERATE_TEXT.emptyNoPlan}</Note>
            <Pressable
              accessibilityRole="button"
              style={ui.buttonSecondary}
              onPress={() => openOrReturn(navigation, 'CreateCup', { cupId })}
              testID="cup-generate-open-setup"
            >
              <Text style={ui.buttonSecondaryText}>{GENERATE_TEXT.emptyNoPlanLink}</Text>
            </Pressable>
          </View>
        ) : null}
        {view.players.length === 0 ? (
          <View style={styles.empty}>
            <Note testID="cup-generate-no-players">{GENERATE_TEXT.emptyNoParticipants}</Note>
            <Pressable
              accessibilityRole="button"
              style={ui.buttonSecondary}
              onPress={() => openOrReturn(navigation, 'CupParticipants', { cupId })}
              testID="cup-generate-open-players"
            >
              <Text style={ui.buttonSecondaryText}>{GENERATE_TEXT.emptyNoParticipantsLink}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    );
  }

  const setup: MatchPlanSetup = {
    presetId: plan.presetId,
    customSessions: plan.customSessions,
    strategy: plan.strategy,
  };
  const splitDay = isSplitDayPreset(plan.presetId);
  const team1Players = view.players.filter((p) => assignments[p.id] === 'team1');
  const team2Players = view.players.filter((p) => assignments[p.id] === 'team2');
  const team1Count = team1Players.length;
  const team2Count = team2Players.length;
  const plannedTotal = plannedMatchTotal(setup, team1Count, team2Count, overrides);
  const matchCap = view.matchCap ?? undefined;
  const overCap = matchCap !== undefined && plannedTotal > matchCap;
  const canAdvance = canAdvanceRoster(setup, team1Count, team2Count, plannedTotal, matchCap);
  const sessionRows = splitDay ? [] : sessionCountRowsFor(setup, team1Count, team2Count, overrides);

  const block = rosterBlock(setup, team1Count, team2Count, plannedTotal);
  const blockText =
    block?.kind === 'team_min'
      ? formatMessage(GENERATE_TEXT.teamMin, {
          team: block.side === 'team1' ? view.team1Name : view.team2Name,
          minPerTeam: block.minPerTeam,
        })
      : block?.kind === 'zero_matches'
        ? GENERATE_TEXT.zeroMatches
        : null;

  const runGenerate = () => {
    // Slag tastet mot forrige oppstilling stemmer ikke lenger.
    setStrokes({});
    setMatches(generateMatchPlan({ setup, team1Players, team2Players, overrides }));
  };

  const submission = buildSubmissionMatches({
    presetId: plan.presetId,
    matches,
    team1Players,
    team2Players,
    selectedTee: plan.tee,
    teamStrokesInputs: strokes,
  });

  const submit = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    const expectedExisting = sentFrom.current ?? view.existingMatchCount;
    sentFrom.current = expectedExisting;
    const result = await createCupMatches(cupId, { matches: submission, expectedExisting });
    sending.current = false;
    setBusy(false);
    if (!result.ok && result.reason !== 'matches_changed') {
      setError(generateFailureText(result.reason));
      return;
    }
    // `matches_changed` kan være et svar som gikk tapt, rester etter en feil eller en annen
    // arrangør. Ingenting ble skrevet nå, så kvitteringen sier ikke at disse kampene er laget.
    const arrival = result.ok ? 'matches_generated' : 'matches_changed';
    arrived.current = arrival;
    if (navigation.isFocused()) toCup(arrival);
  };

  const heading = step === 1 ? GENERATE_TEXT.step1Heading : GENERATE_TEXT.step2Heading;

  return (
    // Nøkkelen: «Neste» står nederst, og neste steg skal åpne øverst.
    <ScrollView
      key={step}
      {...KEYBOARD_SCROLL_PROPS}
      contentContainerStyle={[ui.scroll, { paddingBottom: 20 + bottomInset }]}
      testID="cup-generate-screen"
    >
      <Text style={ui.sectionTitle} testID="cup-generate-progress">
        {formatMessage(SETUP_APP_TEXT.step, { n: step, total: TOTAL_STEPS, title: heading })}
      </Text>

      {step === 1 ? (
        <>
          {failure !== null ? <StaleNote reason={failure} onRetry={() => void load()} /> : null}
          {matchCap !== undefined ? (
            <Note testID={overCap ? 'cup-generate-over-cap' : 'cup-generate-cap'}>
              {overCap
                ? formatMessage(splitDay ? GENERATE_TEXT.overCapSplitDay : GENERATE_TEXT.overCap, {
                    totalMatches: plannedTotal,
                    matchCap,
                  })
                : formatMessage(GENERATE_TEXT.capInfo, { matchCap })}
            </Note>
          ) : null}
          <GenerateRoster
            players={view.players}
            team1Name={view.team1Name}
            team2Name={view.team2Name}
            assignments={assignments}
            team1Count={team1Count}
            team2Count={team2Count}
            onAssign={(id, value) => setAssignments((prev) => ({ ...prev, [id]: value }))}
          />
          {sessionRows.length > 0 ? (
            <GenerateSessionCounts
              rows={sessionRows}
              onAdjust={(row, delta) => setOverrides((prev) => adjustedSessionOverrides(prev, row, delta))}
            />
          ) : null}
          {blockText ? (
            <Text style={[styles.block, { color: colors.warningText }]} testID="cup-generate-block">
              {blockText}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canAdvance }}
              disabled={!canAdvance}
              style={[ui.button, !canAdvance && styles.dimmed]}
              onPress={() => {
                runGenerate();
                setStep(2);
              }}
              testID="cup-generate-next"
            >
              <Text style={ui.buttonText}>{GENERATE_TEXT.next}</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={runGenerate}
            style={styles.regenerate}
            testID="cup-generate-regenerate"
          >
            <Text style={[styles.linkText, { color: colors.primary }]}>{GENERATE_TEXT.regenerate}</Text>
          </Pressable>
          <GeneratePreview
            presetId={plan.presetId}
            disabled={busy}
            matches={matches}
            team1Name={view.team1Name}
            team2Name={view.team2Name}
            team1Players={team1Players}
            team2Players={team2Players}
            selectedTee={plan.tee}
            teamStrokesInputs={strokes}
            onTeamStrokesChange={(matchId, side, value) =>
              setStrokes((prev) => ({ ...prev, [matchId]: { ...prev[matchId], [side]: value } }))
            }
            onMatchChange={(matchId, side, idx, userId) =>
              setMatches((prev) => changeMatchPlayer(prev, matchId, side, idx, userId))
            }
            onSwapPlayer={(flightIndex: number, side: FlightTeamSide, slotIndex: 0 | 1, playerId: string) =>
              setMatches((prev) =>
                swapFlightPlayer(prev as PlannedBundleMatch[], flightIndex, side, slotIndex, playerId),
              )
            }
          />
          <GenerateRecap matches={submission} courseName={plan.courseName} teeName={plan.teeName} />
          {error ? (
            <Text style={[styles.error, { color: colors.danger }]} testID="cup-generate-error">
              {error}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy, busy }}
              disabled={busy}
              style={[ui.button, busy && styles.dimmed]}
              onPress={() => void submit()}
              testID="cup-generate-submit"
            >
              <Text style={ui.buttonText}>
                {busy
                  ? GENERATE_TEXT.confirmPending
                  : formatMessage(GENERATE_TEXT.confirm, { count: submission.length })}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function RetryButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.retry, { borderColor: colors.primary }]}
      testID="cup-generate-retry"
    >
      <Text style={[styles.retryText, { color: colors.primary }]}>{SETUP_APP_TEXT.retry}</Text>
    </Pressable>
  );
}

function StaleNote({ reason, onRetry }: { reason: string; onRetry: () => void }) {
  return (
    <View style={styles.empty}>
      <Note testID="cup-generate-stale">{setupLoadFailureText(reason)}</Note>
      <RetryButton onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  failure: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  retry: { minHeight: TAP, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, borderWidth: 1, borderRadius: 22 },
  retryText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  empty: { gap: 8, marginTop: 12 },
  block: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, marginTop: 12 },
  error: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, paddingTop: 8 },
  actions: { paddingTop: 14, gap: 8 },
  dimmed: { opacity: 0.6 },
  regenerate: { minHeight: TAP, alignSelf: 'flex-end', justifyContent: 'center', paddingHorizontal: 8 },
  linkText: { fontSize: 13, fontFamily: FONTS.sansMedium, textDecorationLine: 'underline' },
});
