// native/app/src/screens/CreateGame.tsx
// Native N6a (#1854): opprett-veiviseren — format, oppsett, bane og tid,
// spillere, publiser.
//
// **Fem steg i ÉN skjerm**, ikke fem skjermer i stacken. Utkastet lever i
// minnet og forkastes hvis arrangøren går ut; draft-lagring og gjenopptak er
// web-eid (kontraktens Key Decision), og med lokal steg-state slipper vi å
// tre halve utkast gjennom navigasjons-parametre.
//
// **Skjermen bestemmer ingenting om golf.** Den samler valg og gir dem til
// `publishGame`, som kjører den delte `buildGameInsertPayload`. Alt som kan
// avvise en runde — spillerantall, lagbalanse, `mode_config`, tee-off i
// fortiden — bor der. Det eneste denne fila håndhever selv er spillertaket
// (så ingen blir stille droppet, se `rosterLimits.ts`) og at man er på nett.
//
// **Opprettelsen går aldri i sync-køen.** Den er ikke idempotent: et
// dobbelttrykk eller en kø-retry ville laget to runder. Offline svarer vi
// derfor rolig i stedet for å la det se ut som en databasefeil.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CourseStep } from '../components/create/CourseStep';
import { FormatStep } from '../components/create/FormatStep';
import { PlayersStep } from '../components/create/PlayersStep';
import {
  SummaryStep,
  type SummaryLine,
  type SummaryWarning,
} from '../components/create/SummaryStep';
import type { CommonSetup, SetupText } from '../components/create/SetupStep';
import { SetupStep } from '../components/create/SetupStep';
import {
  fetchCourses,
  fetchRosterCandidates,
  publishGame,
  type CourseOption,
  type RosterCandidate,
} from '../data/createGame';
import { fetchFormatCatalog } from '../data/formatCatalog';
import { isDeviceOnline } from '../data/syncTriggers';
import { APP_MODE_LABELS, type AppGameMode } from '../lib/appFormats';
import { describeCreateGameFailure } from '../lib/createGameCopy';
import { displayName, formatTeeOff } from '../lib/display';
import {
  describePlayerCounts,
  maxPlayersForMode,
  rosterFitsMode,
  teamLayoutFor,
} from '../lib/rosterLimits';
import {
  defaultGameName,
  draftNeedsTeamAssignment,
  isParStableford,
  teeOffInstant,
  type DraftPlayer,
  type GameDraft,
  type ModeSetup,
} from '../lib/wizardPayload';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { useTheme } from '../theme';

const STEPS = ['format', 'setup', 'course', 'players', 'summary'] as const;
type Step = (typeof STEPS)[number];

const STEP_TITLES: Record<Step, string> = {
  format: 'Format',
  setup: 'Oppsett',
  course: 'Bane og tid',
  players: 'Spillere',
  summary: 'Oppsummering',
};

const OFFLINE_NOTE = 'Du må være på nett for å opprette et spill.';

/**
 * Én henting med de to tilstandene som betyr noe: har vi dataen, og feilet
 * forsøket? Alle tre lesningene kaster ved feil (husets regel), og en tom
 * liste er et gyldig svar — derfor er `failed` et eget flagg og ikke «data er
 * tom».
 */
function useRemote<T>(fetcher: () => Promise<T>): {
  data: T | null;
  failed: boolean;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  // Teller opp per «prøv igjen». Effekten kjører på nytt av seg selv, i stedet
  // for at knappen kaller `setFailed` synkront under render — en setState rett
  // i en effekt-kropp gir kaskaderendring (react-hooks/set-state-in-effect).
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, fetcher]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { data, failed, reload };
}

/**
 * Det veiviseren faktisk VELGER om en spiller. Tee-kjønnet står ikke her —
 * det leses ut av profilen når utkastet settes sammen, så det aldri kan bli
 * en foreldet kopi.
 */
interface PickedPlayer {
  userId: string;
  teamNumber: number | null;
}

/** Neste hele time, minst en time fram. Tee-off skal aldri starte tomt. */
function defaultTeeOff(): Date {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 2);
  return date;
}

/**
 * Profilens kjønn → tee-kjønnet spilleren starter med.
 * `users.gender` er enumen `mens | ladies` (0036); junior-teer finnes på
 * banene, men ikke i profilen, så `J` kan ikke utledes her.
 */
function teeGenderFor(candidate: RosterCandidate | null): 'M' | 'D' {
  return candidate?.gender === 'ladies' ? 'D' : 'M';
}

export function CreateGame({ navigation }: ScreenProps<'CreateGame'>) {
  const { userId } = useSession();
  const { ui } = useTheme();

  const [step, setStep] = useState<Step>('format');
  const [gameMode, setGameMode] = useState<AppGameMode | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [common, setCommon] = useState<CommonSetup>({
    name: '',
    requirePeerApproval: false,
    scoreVisibility: 'live',
    sideTournamentEnabled: false,
    sideLdCount: 0,
    sideCtpCount: 0,
  });
  const [setup, setSetup] = useState<ModeSetup>({});
  const [setupText, setSetupText] = useState<SetupText>({
    allowance: '',
    krPerUnit: '',
  });
  const [courseId, setCourseId] = useState<string | null>(null);
  const [teeBoxId, setTeeBoxId] = useState<string | null>(null);
  const [teeOff, setTeeOff] = useState<Date>(defaultTeeOff);
  const [picked, setPicked] = useState<PickedPlayer[]>([
    { userId, teamNumber: null },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formats = useRemote(fetchFormatCatalog);
  const courses = useRemote(fetchCourses);
  const candidates = useRemote(fetchRosterCandidates);

  // Tee-kjønnet UTLEDES fra profilen i stedet for å kopieres inn i state.
  // Jeg selv står i lista før kandidatene er hentet, så en kopi ville stått
  // igjen på herretee til noen oppdaterte den — og en effekt som synker den
  // inn er nettopp kaskaderendringen lint-regelen advarer mot.
  const players = useMemo<DraftPlayer[]>(
    () =>
      picked.map((p) => ({
        userId: p.userId,
        teamNumber: p.teamNumber,
        teeGender: teeGenderFor(
          candidates.data?.find((c) => c.id === p.userId) ?? null,
        ),
      })),
    [candidates.data, picked],
  );

  const selectMode = useCallback(
    (mode: AppGameMode) => {
      // Trykk paa formatet som ALLEREDE er valgt er en no-op. Uten denne
      // ville et uskyldig dobbelttrykk paa kortet kastet «Par», greensome-
      // andelen og kr-per-poeng uten at noe sa fra.
      if (mode === gameMode) return;
      setGameMode(mode);
      // Lag betyr forskjellige ting per format (fire lag i best ball, to sider
      // i matchplay). Et tall fra forrige format ville vært feil her, så
      // tildelingen nullstilles — spillerne selv står.
      setPicked((prev) => prev.map((p) => ({ ...p, teamNumber: null })));
      // Oppsettet nullstilles av samme grunn: feltene er modus-spesifikke, og
      // de fleste har ingen UI utenfor sitt eget format. `stablefordTeamSize`
      // var det verste tilfellet (se `isParStableford`), men en allowance eller
      // en kr-per-poeng fra forrige format hører like lite hjemme her.
      setSetup({});
      setSetupText({ allowance: '', krPerUnit: '' });
      setCommon((prev) =>
        nameTouched ? prev : { ...prev, name: defaultGameName(mode) },
      );
    },
    [gameMode, nameTouched],
  );

  const togglePlayer = useCallback(
    (candidate: RosterCandidate) => {
      setPicked((prev) => {
        if (prev.some((p) => p.userId === candidate.id)) {
          return prev.filter((p) => p.userId !== candidate.id);
        }
        if (gameMode && prev.length >= maxPlayersForMode(gameMode)) return prev;
        return [...prev, { userId: candidate.id, teamNumber: null }];
      });
    },
    [gameMode],
  );

  const assignTeam = useCallback((playerId: string, teamNumber: number) => {
    setPicked((prev) =>
      prev.map((p) => (p.userId === playerId ? { ...p, teamNumber } : p)),
    );
  }, []);

  const resolvedSetup = useMemo<ModeSetup>(
    () => ({
      ...setup,
      greensomeAllowancePct:
        setupText.allowance === '' ? undefined : Number(setupText.allowance),
      krPerUnit:
        setupText.krPerUnit === '' ? undefined : Number(setupText.krPerUnit),
    }),
    [setup, setupText],
  );

  const draft = useMemo<GameDraft | null>(() => {
    if (!gameMode) return null;
    return {
      name: common.name,
      gameMode,
      courseId,
      teeBoxId,
      teeOffAt: teeOffInstant(teeOff),
      requirePeerApproval: common.requirePeerApproval,
      scoreVisibility: common.scoreVisibility,
      sideTournamentEnabled: common.sideTournamentEnabled,
      sideLdCount: common.sideLdCount,
      sideCtpCount: common.sideCtpCount,
      players,
      setup: resolvedSetup,
    };
  }, [common, courseId, gameMode, players, resolvedSetup, teeBoxId, teeOff]);

  const teamLayout = gameMode
    ? teamLayoutFor(gameMode, isParStableford(gameMode, resolvedSetup))
    : null;

  const publish = useCallback(async () => {
    // Dobbelttrykk-låsen står FØRST. `publishGame` er ikke idempotent, og to
    // gjennomkjøringer ville gitt to runder med samme navn.
    if (busy || !draft) return;
    if (!isDeviceOnline()) {
      setError(OFFLINE_NOTE);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await publishGame(draft);
      if (result.ok) {
        // `replace`, ikke `navigate`: en ferdig veiviser skal ikke ligge igjen
        // bak spillet i stacken — «tilbake» fra runden hører hjemme på Hjem.
        navigation.replace('GameHome', { gameId: result.gameId });
        return;
      }
      setError(describeCreateGameFailure(result.error));
    } catch {
      setError('Fikk ikke opprettet spillet. Sjekk nettet og prøv igjen.');
    }
    // Bevisst utenfor `finally`: på suksess er skjermen borte, og knappen skal
    // ikke låses opp igjen på vei ut.
    setBusy(false);
  }, [busy, draft, navigation]);

  const stepIndex = STEPS.indexOf(step);
  const blocker = stepBlocker(step, gameMode, common.name, courseId, teeBoxId);

  return (
    <ScrollView contentContainerStyle={ui.scroll} testID="create-screen">
      <Text style={ui.sectionTitle} testID="create-progress">
        {`Steg ${stepIndex + 1} av ${STEPS.length} · ${STEP_TITLES[step]}`}
      </Text>

      {step === 'format' ? (
        <FormatStep
          entries={formats.data}
          failed={formats.failed}
          selected={gameMode}
          onSelect={selectMode}
          onRetry={formats.reload}
        />
      ) : null}

      {step === 'setup' && gameMode ? (
        <SetupStep
          mode={gameMode}
          common={common}
          onCommon={(patch) => {
            if (patch.name !== undefined) setNameTouched(true);
            setCommon((prev) => ({ ...prev, ...patch }));
          }}
          setup={setup}
          onSetup={(patch) => setSetup((prev) => ({ ...prev, ...patch }))}
          text={setupText}
          onText={(patch) => setSetupText((prev) => ({ ...prev, ...patch }))}
        />
      ) : null}

      {step === 'course' ? (
        <CourseStep
          courses={courses.data}
          failed={courses.failed}
          courseId={courseId}
          teeBoxId={teeBoxId}
          teeOff={teeOff}
          onCourse={(id) => {
            setCourseId(id);
            // Teene hører til banen. Beholdt tee fra forrige bane ville vært en
            // fremmed rad i `tee_boxes` og gitt et banehandicap fra feil bane.
            setTeeBoxId(null);
          }}
          onTee={setTeeBoxId}
          onTeeOff={setTeeOff}
          onRetry={courses.reload}
        />
      ) : null}

      {step === 'players' && gameMode ? (
        <PlayersStep
          candidates={candidates.data}
          failed={candidates.failed}
          meId={userId}
          mode={gameMode}
          players={players}
          teamLayout={teamLayout}
          onToggle={togglePlayer}
          onTeam={assignTeam}
          onRetry={candidates.reload}
        />
      ) : null}

      {step === 'summary' && draft && gameMode ? (
        <SummaryStep
          lines={summaryLines(draft, gameMode, courses.data, candidates.data, teeOff)}
          warnings={summaryWarnings(draft, gameMode)}
          error={error}
          busy={busy}
          canPublish={courseId !== null && teeBoxId !== null}
          onPublish={() => void publish()}
        />
      ) : null}

      <View style={styles.nav}>
        <Pressable
          testID="create-back"
          accessibilityRole="button"
          style={[ui.buttonSecondary, styles.navButton]}
          onPress={() =>
            stepIndex === 0
              ? navigation.goBack()
              : setStep(STEPS[stepIndex - 1]!)
          }
        >
          <Text style={ui.buttonSecondaryText}>
            {stepIndex === 0 ? 'Avbryt' : 'Tilbake'}
          </Text>
        </Pressable>

        {step === 'summary' ? null : (
          <Pressable
            testID="create-next"
            accessibilityRole="button"
            style={[ui.button, styles.navButton, blocker !== null && styles.dimmed]}
            disabled={blocker !== null}
            onPress={() => setStep(STEPS[stepIndex + 1]!)}
          >
            <Text style={ui.buttonText}>Neste</Text>
          </Pressable>
        )}
      </View>

      {blocker && step !== 'summary' ? (
        <Text style={ui.muted} testID="create-next-hint">
          {blocker}
        </Text>
      ) : null}
    </ScrollView>
  );
}

/** Hva som mangler før steget er ferdig, eller `null` når det er det. */
function stepBlocker(
  step: Step,
  gameMode: AppGameMode | null,
  name: string,
  courseId: string | null,
  teeBoxId: string | null,
): string | null {
  if (step === 'format' && gameMode === null) return 'Velg et format for å gå videre.';
  if (step === 'setup' && name.trim() === '') return 'Gi spillet et navn.';
  if (step === 'course' && (courseId === null || teeBoxId === null)) {
    return 'Velg både bane og tee.';
  }
  return null;
}

function summaryLines(
  draft: GameDraft,
  mode: AppGameMode,
  courses: CourseOption[] | null,
  candidates: RosterCandidate[] | null,
  teeOff: Date,
): SummaryLine[] {
  const course = (courses ?? []).find((c) => c.id === draft.courseId) ?? null;
  const tee = course?.tees.find((t) => t.id === draft.teeBoxId) ?? null;
  const names = draft.players.map((p) => {
    const candidate = (candidates ?? []).find((c) => c.id === p.userId);
    return candidate ? displayName(candidate) : 'Deg';
  });

  const side = draft.sideTournamentEnabled
    ? [
        `${draft.sideLdCount} longest drive`,
        `${draft.sideCtpCount} closest to pin`,
      ].join(' · ')
    : 'Av';

  return [
    {
      key: 'format',
      label: 'Format',
      // Samme spoersmaal som resten av veiviseren stiller. Sto det
      // `stablefordTeamSize === 2` her, hadde regelen hatt to hjem, og
      // oppsummeringen kunne sagt «Wolf i par».
      value: isParStableford(mode, draft.setup)
        ? `${APP_MODE_LABELS[mode]} i par`
        : APP_MODE_LABELS[mode],
    },
    { key: 'name', label: 'Navn', value: draft.name.trim() || defaultGameName(mode) },
    {
      key: 'course',
      label: 'Bane',
      value: [course?.name, tee?.name].filter(Boolean).join(' · ') || 'Ikke valgt',
    },
    {
      key: 'teeoff',
      label: 'Tee-off',
      value: formatTeeOff(teeOff.toISOString()) ?? 'Ikke valgt',
    },
    {
      key: 'players',
      label: `Spillere (${draft.players.length})`,
      value: names.join(', '),
    },
    { key: 'side', label: 'Sideturnering', value: side },
    {
      key: 'approval',
      label: 'Levering',
      value: draft.requirePeerApproval
        ? 'Makker må godkjenne kortet'
        : 'Kortet leveres uten godkjenning',
    },
    {
      key: 'visibility',
      label: 'Resultater',
      value:
        draft.scoreVisibility === 'reveal'
          ? 'Vises når runden er avsluttet'
          : 'Vises underveis',
    },
  ];
}

function summaryWarnings(draft: GameDraft, mode: AppGameMode): SummaryWarning[] {
  const warnings: SummaryWarning[] = [];

  if (!rosterFitsMode(mode, draft.players.length)) {
    warnings.push({
      key: 'fit',
      text: `${APP_MODE_LABELS[mode]} spilles med ${describePlayerCounts(mode)}. Du har ${draft.players.length}.`,
    });
  }

  // Web-paritet: en spiller uten lag droppes fra runden i stedet for å stoppe
  // publiseringen. Da MÅ det stå her — en runde med færre folk enn arrangøren
  // valgte er verre enn en advarsel.
  if (draftNeedsTeamAssignment(draft)) {
    const missing = draft.players.filter((p) => p.teamNumber === null).length;
    if (missing > 0) {
      warnings.push({
        key: 'teams',
        text: `${missing} spillere mangler lag og blir ikke med i runden. Gå tilbake og gi dem et lag hvis alle skal spille.`,
      });
    }
  }

  return warnings;
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', gap: 12, marginTop: 24 },
  navButton: { flex: 1 },
  dimmed: { opacity: 0.5 },
});
