// #2752: veiviseren for en cup, det nettets `CupSetup`, `CupPlanForm`, `SideAwardsPanel`
// og Spillere-rommet gir: navn og lag, bane og oppsett, sidepoeng, og spillerne. Hvert
// steg lagres på serveren før neste, så et utkast kan fortsettes fra cup-rommet. Da
// hopper veiviseren over navn og lag, som nettet ikke lar deg endre.
//
// Reglene er serverens (`lib/cup/setupCore.ts`, `parseCupDraftForm`, `parseCupPlanForm`,
// `isValidSideAward`), så skjermen sjekker ingenting selv og viser nettets setning for
// hver kode. Alt krever nett.
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AppCupSetupView } from '../../../../lib/cup/appCupSetupView';
import type { CupSessionFormat } from '../../../../lib/cup/cupTemplates';
import type { SideAwardConfigInput } from '../../../../lib/cup/sideAwardRows';
import { CourseStep } from '../components/create/CourseStep';
import { Chips, Field, SelectRow } from '../components/create/primitives';
import { CupPlayersBody } from '../components/cup/CupPlayersBody';
import { KEYBOARD_SCROLL_PROPS, useBottomInsetUnlessKeyboard } from '../components/KeyboardInset';
import { fetchCourses, type CourseOption } from '../data/createGame';
import { fetchOwnProfile } from '../data/profile';
import { createCup, fetchCupSetup, saveCupPlan, saveCupSideAwards } from '../data/cupSetup';
import { backTo, openOrReturn } from '../lib/backTo';
import {
  AWARD_KINDS,
  AWARD_SETUP_TEXT,
  DETAILS_TEXT,
  PLAN_TEXT,
  PLAYERS_TEXT,
  PRESETS,
  SETUP_APP_TEXT,
  awardFailureText,
  detailsFailureText,
  planFailureText,
  setupLoadFailureText,
} from '../lib/cupSetupCopy';
import { sideAwardKind } from '../lib/cupManageCopy';
import { formatMessage } from '../lib/kavalkadeCopy';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { FONTS, interLine, TAP, useTheme } from '../theme';

type Step = 'details' | 'plan' | 'awards' | 'players';

const STEP_TITLE: Record<Step, string> = {
  details: SETUP_APP_TEXT.stepDetails,
  plan: SETUP_APP_TEXT.stepPlan,
  awards: SETUP_APP_TEXT.stepAwards,
  players: SETUP_APP_TEXT.stepPlayers,
};

/** En rad i sidepoengene, som tekst til den sendes. `count` er vinnere, eller maks per lag for GIR. */
type AwardRow = { key: string; kind: 'ctp' | 'ld' | 'gir'; hole: string; points: string; count: string };

const asNumber = (text: string) => Number(text.trim().replace(',', '.'));
const pointsText = (value: number) => String(value).replace('.', ',');

function toRow(award: SideAwardConfigInput, index: number): AwardRow {
  return {
    key: `lagret-${index}`,
    kind: award.kind,
    hole: String(award.holeNumber),
    points: pointsText(award.points),
    count: String(award.kind === 'gir' ? award.maxPerTeam : award.winnerCount),
  };
}

function toAward(row: AwardRow): SideAwardConfigInput {
  const base = { holeNumber: asNumber(row.hole), points: asNumber(row.points) };
  return row.kind === 'gir'
    ? { kind: 'gir', ...base, maxPerTeam: asNumber(row.count) }
    : { kind: row.kind, ...base, winnerCount: asNumber(row.count) };
}

/** Neste hele time, minst en time fram, som i «Nytt spill». */
function defaultTeeOff(): Date {
  const at = new Date(Date.now() + 60 * 60 * 1000);
  at.setMinutes(0, 0, 0);
  at.setHours(at.getHours() + 1);
  return at;
}

export function CreateCup({ route, navigation }: ScreenProps<'CreateCup'>) {
  const { colors, ui } = useTheme();
  const bottomInset = useBottomInsetUnlessKeyboard();
  const { userId } = useSession();
  // Fastsatt ved start: en ny cup får `cupId` underveis, og fortsetter da ikke noe utkast.
  const [continuing] = useState(route.params?.cupId ?? null);
  const steps: readonly Step[] = continuing ? ['plan', 'awards', 'players'] : ['details', 'plan', 'awards', 'players'];

  const [cupId, setCupId] = useState<string | null>(continuing);
  const [step, setStep] = useState<Step>(steps[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<AppCupSetupView | null>(null);

  const [name, setName] = useState('');
  const [team1, setTeam1] = useState('');
  const [team2, setTeam2] = useState('');
  const [winPoints, setWinPoints] = useState('');
  const [tiePoints, setTiePoints] = useState('');

  // Bare for lenka til tee-editoren i banevalget, som er for administratorer. Lesingen
  // kan feile: å skjule en knapp er en bedre feil enn å love en låst dør.
  const [isAdmin, setIsAdmin] = useState(false);
  const [courses, setCourses] = useState<CourseOption[] | null>(null);
  const [coursesFailed, setCoursesFailed] = useState(false);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [teeBoxId, setTeeBoxId] = useState<string | null>(null);
  const [teeOffEnabled, setTeeOffEnabled] = useState(false);
  const [teeOff, setTeeOff] = useState<Date>(defaultTeeOff);
  const [presetId, setPresetId] = useState('klassisk');
  const [customSessions, setCustomSessions] = useState<CupSessionFormat[] | null>(null);
  const [strategy, setStrategy] = useState<'handicap' | 'random'>('handicap');
  const [bestBall, setBestBall] = useState('85');

  const [awards, setAwards] = useState<AwardRow[]>([]);
  const nextKey = useRef(0);

  const stepIndex = steps.indexOf(step);
  const leaving = useRef(false);
  // Knappen er deaktivert først når `busy` er tegnet. Refen stopper trykk nummer to før det.
  const sending = useRef(false);

  const finish = () => {
    leaving.current = true;
    if (cupId) backTo(navigation, 'Cup', { cupId });
  };

  // Tilbake går ett steg, som i «Nytt spill». Fra første steg forlater du veiviseren. Navn og
  // lag er ikke et steg å gå tilbake til: cupen finnes da, og «Neste» der ville laget en til.
  // Derfra går tilbake til cupen, der utkastet står.
  usePreventRemove(stepIndex > 0 || busy, ({ data }) => {
    if (leaving.current) {
      navigation.dispatch(data.action);
      return;
    }
    if (busy) return;
    const previous = steps[stepIndex - 1];
    if (previous === 'details') {
      finish();
      return;
    }
    setError(null);
    setStep(previous);
    // Lista tegnes på nytt når du kommer tilbake, og da hører ikke kvitteringen hjemme der.
    navigation.setParams({ notice: undefined });
  });

  const loadCourses = useCallback(() => {
    setCoursesFailed(false);
    fetchCourses()
      .then(setCourses)
      .catch(() => setCoursesFailed(true));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchCourses()
      .then((value) => {
        if (!cancelled) setCourses(value);
      })
      .catch(() => {
        if (!cancelled) setCoursesFailed(true);
      });
    fetchOwnProfile(userId)
      .then((profile) => {
        if (!cancelled) setIsAdmin(profile.isAdmin);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const loadSetup = useCallback(async () => {
    if (!continuing) return;
    const result = await fetchCupSetup(continuing);
    if (!result.ok) {
      setLoadFailure(result.reason);
      return;
    }
    setLoadFailure(null);
    const { view } = result;
    setLoaded(view);
    if (view.plan) {
      setCourseId(view.plan.courseId);
      setTeeBoxId(view.plan.teeBoxId);
      setTeeOffEnabled(view.plan.teeOffAt !== null);
      if (view.plan.teeOffAt) setTeeOff(new Date(view.plan.teeOffAt));
      setPresetId(view.plan.presetId);
      setCustomSessions(view.plan.customSessions);
      setStrategy(view.plan.strategy);
      setBestBall(String(view.plan.bestBallAllowancePct ?? 85));
    }
    setAwards(view.sideAwards.map(toRow));
  }, [continuing]);

  // Bare ved første fokus: en ny henting skulle ikke skrevet over det du har valgt.
  const setupAsked = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (setupAsked.current) return;
      setupAsked.current = true;
      void loadSetup();
    }, [loadSetup]),
  );

  const submit = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    if (step === 'details') {
      const result = await createCup({ name, team1Name: team1, team2Name: team2, winPoints: winPoints.replace(',', '.'), tiePoints: tiePoints.replace(',', '.') });
      if (result.ok) {
        setCupId(result.id);
        navigation.setParams({ cupId: result.id });
        setStep('plan');
      } else {
        setError(detailsFailureText(result.reason));
      }
    } else if (step === 'plan' && cupId) {
      const result = await saveCupPlan(cupId, {
        courseId: courseId ?? '',
        teeBoxId: teeBoxId ?? '',
        teeOffAt: teeOffEnabled ? teeOff.toISOString() : null,
        presetId,
        customSessions,
        strategy,
        bestBallAllowancePct: presetId === 'splittet-cup-dag' && bestBall.trim() !== '' ? asNumber(bestBall) : null,
      });
      if (result.ok) setStep('awards');
      else setError(planFailureText(result.reason));
    } else if (step === 'awards' && cupId) {
      const result = await saveCupSideAwards(cupId, awards.map(toAward));
      if (result.ok) setStep('players');
      else setError(awardFailureText(result.reason));
    }
    sending.current = false;
    setBusy(false);
  };

  if (continuing && loaded === null && loadFailure === null) {
    return (
      <View style={ui.centered} testID="create-cup-loading">
        <ActivityIndicator color={colors.primary} />
        <Text style={ui.muted}>{SETUP_APP_TEXT.loading}</Text>
      </View>
    );
  }
  if (continuing && loaded === null) {
    const final = loadFailure === 'not_found' || loadFailure === 'not_manager';
    return (
      <View style={ui.centered} testID="create-cup-failed">
        <Text style={[styles.failure, { color: final ? colors.text : colors.danger }]}>
          {setupLoadFailureText(loadFailure ?? 'load_failed')}
        </Text>
        {final ? null : (
          <Pressable
            onPress={() => void loadSetup()}
            accessibilityRole="button"
            style={[styles.retry, { borderColor: colors.primary }]}
            testID="create-cup-retry"
          >
            <Text style={[styles.retryText, { color: colors.primary }]}>{SETUP_APP_TEXT.retry}</Text>
          </Pressable>
        )}
      </View>
    );
  }
  if (loaded && loaded.status !== 'draft') {
    return (
      <View style={ui.centered} testID="create-cup-locked">
        <Text style={[styles.failure, { color: colors.text }]}>{SETUP_APP_TEXT.locked}</Text>
      </View>
    );
  }

  const setAward = (key: string, patch: Partial<AwardRow>) =>
    setAwards((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    // Nøkkelen: «Neste» står nederst, og neste steg skal åpne øverst.
    <ScrollView
      key={step}
      {...KEYBOARD_SCROLL_PROPS}
      contentContainerStyle={[ui.scroll, { paddingBottom: 20 + bottomInset }]}
      testID="create-cup-screen"
    >
      {loaded ? <Text style={ui.title} testID="create-cup-name">{loaded.name}</Text> : null}
      <Text style={ui.sectionTitle} testID="create-cup-progress">
        {formatMessage(SETUP_APP_TEXT.step, { n: stepIndex + 1, total: steps.length, title: STEP_TITLE[step] })}
      </Text>

      {step === 'details' ? (
        <View testID="create-cup-details">
          <Field label={DETAILS_TEXT.name}>
            <TextInput
              style={ui.input}
              value={name}
              onChangeText={setName}
              placeholder={DETAILS_TEXT.namePlaceholder}
              placeholderTextColor={colors.muted}
              maxLength={80}
              testID="create-cup-name-input"
            />
          </Field>
          <View style={styles.pair}>
            <View style={styles.half}>
              <Field label={DETAILS_TEXT.team1}>
                <TextInput
                  style={ui.input}
                  value={team1}
                  onChangeText={setTeam1}
                  placeholder={DETAILS_TEXT.team1Placeholder}
                  placeholderTextColor={colors.muted}
                  maxLength={40}
                  testID="create-cup-team1"
                />
              </Field>
            </View>
            <View style={styles.half}>
              <Field label={DETAILS_TEXT.team2}>
                <TextInput
                  style={ui.input}
                  value={team2}
                  onChangeText={setTeam2}
                  placeholder={DETAILS_TEXT.team2Placeholder}
                  placeholderTextColor={colors.muted}
                  maxLength={40}
                  testID="create-cup-team2"
                />
              </Field>
            </View>
          </View>
          <Text style={ui.sectionTitle}>{DETAILS_TEXT.pointsHeading}</Text>
          <Text style={ui.muted}>{DETAILS_TEXT.pointsHint}</Text>
          <View style={styles.pair}>
            <View style={styles.half}>
              <Field label={DETAILS_TEXT.win}>
                <TextInput
                  style={ui.input}
                  value={winPoints}
                  onChangeText={setWinPoints}
                  placeholder="1"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  testID="create-cup-win"
                />
              </Field>
            </View>
            <View style={styles.half}>
              <Field label={DETAILS_TEXT.tie}>
                <TextInput
                  style={ui.input}
                  value={tiePoints}
                  onChangeText={setTiePoints}
                  placeholder="0,5"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  testID="create-cup-tie"
                />
              </Field>
            </View>
          </View>
        </View>
      ) : null}

      {step === 'plan' ? (
        <View testID="create-cup-plan">
          <CourseStep
            courses={courses}
            failed={coursesFailed}
            courseId={courseId}
            teeBoxId={teeBoxId}
            teeOff={teeOff}
            onCourse={(id) => {
              setCourseId(id);
              // Teene hører til banen, så en tee fra forrige bane er en fremmed rad.
              setTeeBoxId(null);
            }}
            onTee={setTeeBoxId}
            onTeeOff={setTeeOff}
            onRetry={loadCourses}
            isAdmin={isAdmin}
            optionalTeeOff={{
              enabled: teeOffEnabled,
              onEnabled: setTeeOffEnabled,
              label: PLAN_TEXT.teeOffLabel,
              hint: PLAN_TEXT.teeOffHint,
            }}
          />
          <Text style={ui.sectionTitle}>{PLAN_TEXT.formatHeading}</Text>
          {PRESETS.map((preset) => (
            <SelectRow
              key={preset.id}
              title={preset.name}
              subtitle={preset.description}
              selected={presetId === preset.id}
              onPress={() => {
                setPresetId(preset.id);
                setCustomSessions(null);
              }}
              testID={`create-cup-preset-${preset.id}`}
            />
          ))}
          {customSessions ? (
            <SelectRow
              title={PLAN_TEXT.customName}
              subtitle={PLAN_TEXT.customDescription}
              selected={presetId === 'tilpasset'}
              onPress={() => setPresetId('tilpasset')}
              testID="create-cup-preset-tilpasset"
            />
          ) : null}
          {presetId === 'splittet-cup-dag' ? (
            <Field label={PLAN_TEXT.bestBallLabel} hint={PLAN_TEXT.bestBallHint}>
              <TextInput
                style={ui.input}
                value={bestBall}
                onChangeText={(text) => setBestBall(text.replace(/\D/g, ''))}
                keyboardType="number-pad"
                maxLength={3}
                testID="create-cup-best-ball"
              />
            </Field>
          ) : null}
          <Text style={ui.sectionTitle}>{PLAN_TEXT.strategyHeading}</Text>
          <SelectRow
            title={PLAN_TEXT.strategyHandicap}
            subtitle={PLAN_TEXT.strategyHandicapDescription}
            selected={strategy === 'handicap'}
            onPress={() => setStrategy('handicap')}
            testID="create-cup-strategy-handicap"
          />
          <SelectRow
            title={PLAN_TEXT.strategyRandom}
            subtitle={PLAN_TEXT.strategyRandomDescription}
            selected={strategy === 'random'}
            onPress={() => setStrategy('random')}
            testID="create-cup-strategy-random"
          />
        </View>
      ) : null}

      {step === 'awards' ? (
        <View testID="create-cup-awards">
          <Text style={ui.muted}>{AWARD_SETUP_TEXT.hint}</Text>
          {awards.length === 0 ? (
            <Text style={[ui.muted, styles.gapTop]} testID="create-cup-awards-empty">
              {AWARD_SETUP_TEXT.empty}
            </Text>
          ) : null}
          {awards.map((row) => (
            <View
              key={row.key}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              testID={`create-cup-award-${row.key}`}
            >
              <Field label={AWARD_SETUP_TEXT.kind}>
                <Chips
                  options={AWARD_KINDS.map((kind) => ({
                    value: kind,
                    label: sideAwardKind(kind),
                    testID: `create-cup-award-kind-${kind}-${row.key}`,
                  }))}
                  value={row.kind}
                  onChange={(kind) => setAward(row.key, { kind })}
                  testID={`create-cup-award-kind-${row.key}`}
                />
              </Field>
              <Field label={AWARD_SETUP_TEXT.hole}>
                <TextInput
                  style={ui.input}
                  value={row.hole}
                  onChangeText={(hole) => setAward(row.key, { hole: hole.replace(/\D/g, '') })}
                  keyboardType="number-pad"
                  maxLength={2}
                  testID={`create-cup-award-hole-${row.key}`}
                />
              </Field>
              <Field label={AWARD_SETUP_TEXT.points}>
                <TextInput
                  style={ui.input}
                  value={row.points}
                  onChangeText={(points) => setAward(row.key, { points })}
                  keyboardType="decimal-pad"
                  testID={`create-cup-award-points-${row.key}`}
                />
              </Field>
              <Field label={AWARD_SETUP_TEXT.winners}>
                <TextInput
                  style={ui.input}
                  value={row.count}
                  onChangeText={(count) => setAward(row.key, { count: count.replace(/\D/g, '') })}
                  keyboardType="number-pad"
                  maxLength={2}
                  testID={`create-cup-award-count-${row.key}`}
                />
              </Field>
              <Pressable
                accessibilityRole="button"
                onPress={() => setAwards((rows) => rows.filter((other) => other.key !== row.key))}
                style={styles.link}
                testID={`create-cup-award-remove-${row.key}`}
              >
                <Text style={[styles.linkText, { color: colors.primary }]}>{SETUP_APP_TEXT.removeRow}</Text>
              </Pressable>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const key = `ny-${nextKey.current++}`;
              setAwards((rows) => [...rows, { key, kind: 'ctp', hole: '', points: '1', count: '1' }]);
            }}
            style={styles.link}
            testID="create-cup-award-add"
          >
            <Text style={[styles.linkText, { color: colors.primary }]}>{AWARD_SETUP_TEXT.addRow}</Text>
          </Pressable>
          <Text style={ui.muted}>{AWARD_SETUP_TEXT.winnersHelp}</Text>
        </View>
      ) : null}

      {step === 'players' && cupId ? (
        <CupPlayersBody
          cupId={cupId}
          notice={route.params?.notice === 'participant_removed' ? PLAYERS_TEXT.removed : null}
          onRemove={(player, cupName) => {
            navigation.setParams({ notice: undefined });
            openOrReturn(navigation, 'CupRemovePlayer', {
              cupId,
              userId: player.userId,
              name: player.name,
              cupName,
              captain: player.isCaptain,
              returnTo: 'CreateCup',
            });
          }}
        />
      ) : null}

      {error ? (
        <Text style={[styles.error, { color: colors.danger }]} testID="create-cup-error">
          {error}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {step === 'players' ? (
          <Pressable accessibilityRole="button" style={ui.button} onPress={finish} testID="create-cup-done">
            <Text style={ui.buttonText}>{SETUP_APP_TEXT.done}</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            style={[ui.button, busy ? styles.dimmed : null]}
            onPress={() => void submit()}
            testID="create-cup-next"
          >
            <Text style={ui.buttonText}>{busy ? SETUP_APP_TEXT.saving : SETUP_APP_TEXT.next}</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  gapTop: { marginTop: 8 },
  pair: { flexDirection: 'row', gap: 12 },
  half: { flex: 1, minWidth: 0 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 4, marginTop: 10 },
  link: { minHeight: TAP, justifyContent: 'center' },
  linkText: { fontSize: 13, fontFamily: FONTS.sansMedium, textDecorationLine: 'underline' },
  error: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, paddingTop: 8 },
  actions: { paddingTop: 14, gap: 8 },
  dimmed: { opacity: 0.6 },
  failure: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  retry: { minHeight: TAP, justifyContent: 'center', paddingHorizontal: 20, borderWidth: 1, borderRadius: 22 },
  retryText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
});
