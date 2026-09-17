'use client';

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import type { CupTeamNumber } from '@/lib/cup/captainRoles';
import type {
  CupLineupBoard as Board,
  CupLineupPlayer,
  CupLineupSessionView,
} from '@/lib/cup/lineupData';
import {
  openCupLineupSession,
  setCupPlannedMatchCount,
  submitCupLineup,
  unlockCupLineup,
  deleteCupLineupSession,
  retryCupLineupReveal,
  type CupLineupActionError,
} from '@/lib/cup/lineupActions';
import { canRetryReveal, opponentHiddenLabel } from '@/lib/cup/lineupReveal';
import { seatsPerSlot } from '@/lib/cup/lineupValidation';
import { derivePointsToWin } from '@/lib/cup/pointsToWin';
import { formatPoints } from '@/lib/cup/formatPoints';

const INITIAL: CupLineupActionError = { error: '' };

/**
 * Status-merkelapp. Bevisst ikke `StatusChip` fra components/ui: den er låst
 * til cup-/spill-statusene (utkast/aktiv/signert) og skriver sin egen tekst.
 */
function Pill({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 font-sans text-[11px] font-medium ${
        on
          ? 'bg-[var(--score-under-bg)] text-[var(--score-under-fg)]'
          : 'bg-surface-muted text-muted'
      }`}
    >
      {children}
    </span>
  );
}

/**
 * Cupens eget format-vokabular, ikke `modes.*`. En singel-økt heter «Singel»
 * her og kampene den lager heter «Singel 1», «Singel 2» — `modes.*` ville
 * skrevet «Matchplay» i rommet og «Singel» på kampene rett under.
 */
const FORMAT_LABEL_KEY = {
  foursomes_matchplay: 'generate.formatFoursomes',
  fourball_matchplay: 'generate.formatFourball',
  singles_matchplay: 'generate.formatSingles',
  greensome_matchplay: 'generate.formatGreensome',
  chapman_matchplay: 'generate.formatChapman',
  gruesome_matchplay: 'generate.formatGruesome',
} as const;

const FORMATS = [
  'foursomes_matchplay',
  'fourball_matchplay',
  'singles_matchplay',
  'greensome_matchplay',
  'chapman_matchplay',
  'gruesome_matchplay',
] as const;

/**
 * Uttaks-rommets interaktive flate (#1884).
 *
 * Én `useActionState` deler feilen på tvers av alle formene — et
 * `intent`-felt router til riktig action, samme mønster som
 * `CupParticipantsList`. Feilen vises der knappen ble trykket (#2087): på
 * øktkortet for handlinger på en økt, øverst bare for resten. Kapteinens plass-valg er lokal state (ikke
 * ukontrollerte felt), fordi React 19 nullstiller skjemaet etter en
 * form-action og hele uttaket ville forsvunnet ved en valideringsfeil.
 */
export function CupLineupBoard({
  tournamentId,
  board,
}: {
  tournamentId: string;
  board: Board;
}) {
  const t = useTranslations('cup.lineup');
  const tf = useTranslations('cup');
  const isOrganizer = board.access.role.kind === 'organizer';
  const myTeam =
    board.access.role.kind === 'captain' ? board.access.role.teamNumber : null;

  const [state, dispatch, isPending] = useActionState(
    async (_prev: CupLineupActionError, formData: FormData) => {
      switch (formData.get('intent')) {
        case 'open':
          return openCupLineupSession(formData);
        case 'planned':
          return setCupPlannedMatchCount(formData);
        case 'unlock':
          return unlockCupLineup(formData);
        case 'delete':
          return deleteCupLineupSession(formData);
        case 'retry':
          return retryCupLineupReveal(formData);
        default:
          return submitCupLineup(formData);
      }
    },
    INITIAL,
  );

  // #2087: which session (and team, for «Lever uttaket» and «Lås opp») the
  // last action was about. Set before dispatching, so the error lands next to
  // the button that was pressed. The shared pending state disables every
  // button, so only one action runs at a time.
  const [actionTarget, setActionTarget] = useState<{
    sessionId: string | null;
    team: CupTeamNumber | null;
  }>({ sessionId: null, team: null });

  function submit(formData: FormData) {
    const sessionId = formData.get('session_id');
    const team = Number(formData.get('team'));
    setActionTarget({
      sessionId: typeof sessionId === 'string' && sessionId ? sessionId : null,
      team: team === 1 || team === 2 ? team : null,
    });
    startTransition(() => dispatch(formData));
  }

  const errorMessage = (() => {
    // While an action runs, `state` still holds the previous action's error but
    // the target already points at the new one. Hiding it avoids showing the old
    // message on the wrong card.
    if (!state.error || isPending) return null;
    const key = `errors.${state.error}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : t('errors.unexpected', { code: state.error });
  })();

  // A session error goes on its card. If the card is gone (deleted elsewhere
  // in the meantime), the top banner is the only place left to show it.
  const errorOnCard =
    errorMessage !== null &&
    actionTarget.sessionId !== null &&
    board.sessions.some((s) => s.id === actionTarget.sessionId);

  const captains = {
    1: board.access.participants.find((p) => p.isCaptain && p.teamNumber === 1),
    2: board.access.participants.find((p) => p.isCaptain && p.teamNumber === 2),
  };
  const bothCaptains = Boolean(captains[1] && captains[2]);

  // #1902: poengmålet skal være kjent før den første økta avdekker kamper.
  // Vektede cuper (#1441 D8) har ikke noe «først til X», så de slipper
  // spørsmålet — og dermed også sperren.
  const needsPlanned =
    board.hasDefaultWeights && board.plannedMatchCount === null;

  return (
    <div className="space-y-6">
      {errorMessage && !errorOnCard && (
        <Banner tone="error" testId="cup-lineup-error">
          {errorMessage}
        </Banner>
      )}

      {isOrganizer && !bothCaptains && (
        <Banner tone="info" testId="cup-lineup-needs-captains">
          {t('needsCaptains')}
        </Banner>
      )}

      {isOrganizer && bothCaptains && board.hasDefaultWeights && (
        <PlannedMatchCountForm
          tournamentId={tournamentId}
          board={board}
          onSubmit={submit}
          isPending={isPending}
        />
      )}

      {isOrganizer && bothCaptains && (
        <OpenSessionForm
          tournamentId={tournamentId}
          board={board}
          onSubmit={submit}
          isPending={isPending}
          needsPlanned={needsPlanned}
        />
      )}

      <section className="space-y-3">
        <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          {t('sessionsHeading')}
        </h2>
        {board.sessions.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              {isOrganizer ? t('emptyOrganizer') : t('emptyCaptain')}
            </p>
          </Card>
        ) : (
          board.sessions.map((session) => (
            <SessionCard
              key={session.id}
              tournamentId={tournamentId}
              board={board}
              session={session}
              isOrganizer={isOrganizer}
              myTeam={myTeam}
              onSubmit={submit}
              isPending={isPending}
              errorMessage={
                errorOnCard && session.id === actionTarget.sessionId
                  ? errorMessage
                  : null
              }
              errorTeam={actionTarget.team}
              formatLabel={(f) =>
                tf(
                  FORMAT_LABEL_KEY[
                    f as keyof typeof FORMAT_LABEL_KEY
                  ] as Parameters<typeof tf>[0],
                )
              }
            />
          ))
        )}
      </section>
    </div>
  );
}

/**
 * #1902 — arrangørens «hvor mange kamper skal cupen ha?».
 *
 * Eget kort over «Åpne en økt», ikke et felt inne i den: tallet kan rettes
 * uten å åpne noe (skrivefeil, for høyt tall), og en cup som alt har startet
 * får det nye poengmålet med én gang det lagres.
 *
 * Konsekvenslinja regnes lokalt med den samme rene funksjonen serveren bruker,
 * så arrangøren ser målet FØR hun lagrer — «28 kamper gir et poengmål på 14,5».
 */
function PlannedMatchCountForm({
  tournamentId,
  board,
  onSubmit,
  isPending,
}: {
  tournamentId: string;
  board: Board;
  onSubmit: (fd: FormData) => void;
  isPending: boolean;
}) {
  const t = useTranslations('cup.lineup');

  // Gulvet serveren håndhever: kampene som alt finnes + plassene i åpnede,
  // ikke-avdekkede økter, aldri under 2.
  const floor = Math.max(2, board.matchCount + board.pendingSlotCount);
  const [value, setValue] = useState(
    board.plannedMatchCount === null ? '' : String(board.plannedMatchCount),
  );

  const parsed = Number(value);
  const preview =
    value.trim() !== '' && Number.isInteger(parsed) && parsed >= floor
      ? parsed
      : null;

  return (
    <Card>
      <h2 className="font-serif text-lg text-text">{t('plannedHeading')}</h2>
      <p className="mt-1 text-xs text-muted">{t('plannedHelper')}</p>

      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData();
          fd.set('intent', 'planned');
          fd.set('id', tournamentId);
          fd.set('planned_match_count', value.trim());
          onSubmit(fd);
        }}
      >
        <label className="block">
          <span className="font-sans text-xs text-muted">
            {t('plannedLabel')}
          </span>
          <input
            data-testid="cup-lineup-planned-input"
            type="number"
            inputMode="numeric"
            min={floor}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1 w-full min-h-[44px] rounded-xl border border-line bg-bg px-3 font-serif text-lg tabular-nums text-text"
          />
        </label>

        {preview !== null && (
          <p
            data-testid="cup-lineup-planned-target"
            className="text-xs text-muted tabular-nums"
          >
            {/* formatPoints: norsk desimalkomma (2,5 — ikke 2.5), samme
                helper som cup-siden og resultat-flatene bruker. */}
            {t('plannedTarget', {
              count: preview,
              points: formatPoints(derivePointsToWin(preview)),
            })}
          </p>
        )}

        {/* Aktiv cup: hva tavla sier akkurat nå, så arrangøren ser at det
            lagrede tallet faktisk slo gjennom. */}
        {board.pointsToWin !== null && (
          <p className="text-xs text-muted tabular-nums">
            {t('plannedCurrent', { points: formatPoints(board.pointsToWin) })}
          </p>
        )}

        <Button
          type="submit"
          disabled={isPending || value.trim() === ''}
          data-testid="cup-lineup-planned-save"
        >
          {t('plannedSave')}
        </Button>
      </form>
    </Card>
  );
}

/** Arrangørens «åpne økt»-form: format + antall plasser. */
function OpenSessionForm({
  tournamentId,
  board,
  onSubmit,
  isPending,
  needsPlanned,
}: {
  tournamentId: string;
  board: Board;
  onSubmit: (fd: FormData) => void;
  isPending: boolean;
  /** #1902: planlagt antall mangler → økta kan ikke åpnes ennå. */
  needsPlanned: boolean;
}) {
  const t = useTranslations('cup.lineup');
  const tf = useTranslations('cup');
  const [format, setFormat] = useState<(typeof FORMATS)[number]>(
    'foursomes_matchplay',
  );

  // Default-antallet utledes av de varige lagstørrelsene, som i veiviseren:
  // singel gir én match per spiller, 2v2-format halvparten. Den minste
  // stallen bestemmer.
  const teamSize = Math.min(board.squads[1].length, board.squads[2].length);
  const derived =
    format === 'singles_matchplay' ? teamSize : Math.floor(teamSize / 2);
  const [count, setCount] = useState(derived);
  const effective = Math.min(Math.max(1, count), Math.max(1, derived));

  return (
    <Card>
      <h2 className="font-serif text-lg text-text">{t('openHeading')}</h2>
      <p className="mt-1 text-xs text-muted">{t('openHelper')}</p>

      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData();
          fd.set('intent', 'open');
          fd.set('id', tournamentId);
          fd.set('format', format);
          fd.set('slot_count', String(effective));
          onSubmit(fd);
        }}
      >
        <label className="block">
          <span className="font-sans text-xs text-muted">{t('formatLabel')}</span>
          <select
            data-testid="cup-lineup-format"
            className="mt-1 w-full min-h-[44px] rounded-xl border border-line bg-bg px-3 text-sm text-text"
            value={format}
            onChange={(e) => {
              const next = e.target.value as (typeof FORMATS)[number];
              setFormat(next);
              setCount(
                next === 'singles_matchplay' ? teamSize : Math.floor(teamSize / 2),
              );
            }}
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {tf(FORMAT_LABEL_KEY[f] as Parameters<typeof tf>[0])}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center justify-between gap-3">
          <span className="font-sans text-xs text-muted">
            {t('slotCountLabel')}
          </span>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              aria-label={t('decrease')}
              disabled={effective <= 1}
              onClick={() => setCount((c) => Math.max(1, c - 1))}
            >
              −
            </Button>
            <span
              data-testid="cup-lineup-slot-count"
              className="font-serif text-lg tabular-nums text-text min-w-[3ch] text-center"
            >
              {effective}
            </span>
            <Button
              type="button"
              variant="secondary"
              aria-label={t('increase')}
              disabled={effective >= derived}
              onClick={() => setCount((c) => Math.min(derived, c + 1))}
            >
              +
            </Button>
          </div>
        </div>

        <Button
          type="submit"
          disabled={isPending || derived < 1 || needsPlanned}
          data-testid="cup-lineup-open"
        >
          {t('openButton')}
        </Button>
        {needsPlanned && (
          <p className="text-xs text-muted" data-testid="cup-lineup-needs-planned">
            {t('needsPlanned')}
          </p>
        )}
        {derived < 1 && (
          <p className="text-xs text-muted">{t('squadTooSmall')}</p>
        )}
      </form>
    </Card>
  );
}

/**
 * The error from the last action on this session (#2087), shown on the card.
 *
 * Scrolls itself into view only when it is outside the viewport
 * (`block: 'nearest'`), which it can be when a tall lineup form sits between
 * the pressed button and the message. Usually it is already in view and
 * nothing moves.
 */
function SessionError({
  sessionIndex,
  message,
}: {
  sessionIndex: number;
  message: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [message]);
  return (
    <div ref={ref} role="alert">
      <Banner tone="error" testId={`cup-lineup-error-${sessionIndex}`}>
        {message}
      </Banner>
    </div>
  );
}

/** Ett øktkort: status per lag, kapteinens skjema, arrangørens nødluke. */
function SessionCard({
  tournamentId,
  board,
  session,
  isOrganizer,
  myTeam,
  onSubmit,
  isPending,
  errorMessage,
  errorTeam,
  formatLabel,
}: {
  tournamentId: string;
  board: Board;
  session: CupLineupSessionView;
  isOrganizer: boolean;
  myTeam: CupTeamNumber | null;
  onSubmit: (fd: FormData) => void;
  isPending: boolean;
  /** The last action's error, when it was about this session (#2087). */
  errorMessage: string | null;
  /** The team panel whose button caused `errorMessage`, if any. */
  errorTeam: CupTeamNumber | null;
  formatLabel: (format: string) => string;
}) {
  const t = useTranslations('cup.lineup');
  const revealed = session.revealedAt !== null;
  const stuck = canRetryReveal({
    revealedAt: session.revealedAt,
    team1SubmittedAt: session.teams[0].submittedAt,
    team2SubmittedAt: session.teams[1].submittedAt,
  });
  const error = errorMessage && (
    <SessionError sessionIndex={session.sessionIndex} message={errorMessage} />
  );
  // A team panel's own buttons put the error in that panel; the card-level
  // buttons («Prøv igjen», «Slett økten») keep it at card level.
  const cardError = errorTeam === null ? error : null;

  return (
    <Card data-testid={`cup-lineup-session-${session.sessionIndex}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-serif text-lg text-text">
            {formatLabel(session.format)}
          </p>
          <p className="text-xs text-muted tabular-nums">
            {t('slotSummary', { count: session.slotCount })}
          </p>
        </div>
        <Pill on={revealed}>{revealed ? t('revealed') : t('waiting')}</Pill>
      </div>

      <div className="mt-3 space-y-3">
        {session.teams.map((team) => (
          <TeamPanel
            key={team.teamNumber}
            tournamentId={tournamentId}
            board={board}
            session={session}
            team={team}
            isOrganizer={isOrganizer}
            myTeam={myTeam}
            onSubmit={onSubmit}
            isPending={isPending}
            error={errorTeam === team.teamNumber ? error : null}
          />
        ))}
      </div>

      {/* #2087: the error sits right above the buttons that caused it. With the
          retry block showing, that is between its explanation and the button. */}
      {!(isOrganizer && stuck) && cardError && (
        <div className="mt-4">{cardError}</div>
      )}

      {/* #1901: both lineups in, nothing revealed. The reveal error went to the
          captain who submitted last, so without this the organiser would see
          an ordinary-looking card and no way forward but unlocking. */}
      {isOrganizer && stuck && (
        <div className="mt-4 space-y-3">
          <Banner
            tone="warning"
            testId={`cup-lineup-stuck-${session.sessionIndex}`}
          >
            <p className="font-semibold">{t('retryHeading')}</p>
            <p className="mt-1 font-normal">{t('retryHelper')}</p>
          </Banner>
          {cardError}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData();
              fd.set('intent', 'retry');
              fd.set('id', tournamentId);
              fd.set('session_id', session.id);
              onSubmit(fd);
            }}
          >
            <Button
              type="submit"
              disabled={isPending}
              data-testid={`cup-lineup-retry-${session.sessionIndex}`}
            >
              {t('retryButton')}
            </Button>
          </form>
        </div>
      )}

      {isOrganizer && !revealed && (
        <form
          className="mt-4 border-t border-line pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData();
            fd.set('intent', 'delete');
            fd.set('id', tournamentId);
            fd.set('session_id', session.id);
            onSubmit(fd);
          }}
        >
          <Button
            type="submit"
            variant="secondary"
            disabled={isPending}
            data-testid={`cup-lineup-delete-${session.sessionIndex}`}
          >
            {t('deleteSession')}
          </Button>
        </form>
      )}
    </Card>
  );
}

/** Ett lags rute i et øktkort. */
function TeamPanel({
  tournamentId,
  board,
  session,
  team,
  isOrganizer,
  myTeam,
  onSubmit,
  isPending,
  error,
}: {
  tournamentId: string;
  board: Board;
  session: CupLineupSessionView;
  team: CupLineupSessionView['teams'][number];
  isOrganizer: boolean;
  myTeam: CupTeamNumber | null;
  onSubmit: (fd: FormData) => void;
  isPending: boolean;
  /** The error from this panel's last «Lever uttaket» or «Lås opp» (#2087). */
  error: React.ReactNode;
}) {
  const t = useTranslations('cup.lineup');
  const teamName = board.teamNames[team.teamNumber];
  const squad = board.squads[team.teamNumber];
  const submitted = team.submittedAt !== null;
  const revealed = session.revealedAt !== null;
  const canEdit =
    !revealed && !submitted && (isOrganizer || myTeam === team.teamNumber);

  const nameOf = (userId: string) =>
    [...board.squads[1], ...board.squads[2], ...board.squads.unassigned].find(
      (p) => p.userId === userId,
    )?.displayName ?? userId;

  return (
    <div
      className="rounded-xl border border-line p-3"
      data-testid={`cup-lineup-team-${session.sessionIndex}-${team.teamNumber}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-sans text-sm font-medium text-text truncate">
          {teamName}
        </p>
        <Pill on={submitted}>
          {submitted ? t('submitted') : t('notSubmitted')}
        </Pill>
      </div>

      {/* `slots === null` betyr «ikke synlig for deg» — aldri «tomt». Å vise en
          tom oppstilling her ville lest som at motstanderen ikke hadde levert. */}
      {team.slots === null ? (
        <p
          className="mt-2 text-xs text-muted"
          data-testid={`cup-lineup-hidden-${session.sessionIndex}-${team.teamNumber}`}
        >
          {/* #2088: once both are in, "hidden until both have submitted" is
              no longer true. */}
          {t(
            opponentHiddenLabel({
              revealedAt: session.revealedAt,
              team1SubmittedAt: session.teams[0].submittedAt,
              team2SubmittedAt: session.teams[1].submittedAt,
            }),
          )}
        </p>
      ) : canEdit ? (
        <LineupEditor
          // Plass-valgene er lokal state seedet fra serveren, og en
          // `useState`-initializer kjører kun ved mount. Uten en key som
          // følger datasettet ville en kladd som endret seg server-side
          // (arrangøren leverte på vegne av laget og låste opp igjen) blitt
          // stående som de gamle valgene i skjemaet.
          key={`${session.id}-${team.teamNumber}-${team.slots
            .map((s) => `${s.slotIndex}.${s.seat}.${s.userId}`)
            .join('|')}`}
          tournamentId={tournamentId}
          session={session}
          teamNumber={team.teamNumber}
          squad={squad}
          initial={team.slots}
          onSubmit={onSubmit}
          isPending={isPending}
          error={error}
        />
      ) : (
        <SlotList
          slots={team.slots}
          slotCount={session.slotCount}
          nameOf={nameOf}
        />
      )}

      {/* The editor shows its error above its own button. Without the editor
          (submitted, or hidden), the error sits above «Lås opp». */}
      {!(canEdit && team.slots !== null) && error && (
        <div className="mt-3">{error}</div>
      )}

      {isOrganizer && submitted && !revealed && (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData();
            fd.set('intent', 'unlock');
            fd.set('id', tournamentId);
            fd.set('session_id', session.id);
            fd.set('team', String(team.teamNumber));
            onSubmit(fd);
          }}
        >
          <Button
            type="submit"
            variant="secondary"
            disabled={isPending}
            data-testid={`cup-lineup-unlock-${session.sessionIndex}-${team.teamNumber}`}
          >
            {t('unlock')}
          </Button>
        </form>
      )}
    </div>
  );
}

/** Skrivebeskyttet visning av et uttak — levert, eller avdekket for alle. */
function SlotList({
  slots,
  slotCount,
  nameOf,
}: {
  slots: { slotIndex: number; seat: 1 | 2; userId: string }[];
  slotCount: number;
  nameOf: (userId: string) => string;
}) {
  return (
    <ol className="mt-2 space-y-1">
      {Array.from({ length: slotCount }, (_, slotIndex) => (
        <li key={slotIndex} className="flex gap-2 text-sm text-text tabular-nums">
          <span className="text-muted w-6 shrink-0">{slotIndex + 1}.</span>
          <span className="min-w-0">
            {slots
              .filter((s) => s.slotIndex === slotIndex)
              .map((s) => nameOf(s.userId))
              .join(' / ') || '—'}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Kapteinens plass-skjema for én økt. */
function LineupEditor({
  tournamentId,
  session,
  teamNumber,
  squad,
  initial,
  onSubmit,
  isPending,
  error,
}: {
  tournamentId: string;
  session: CupLineupSessionView;
  teamNumber: CupTeamNumber;
  squad: CupLineupPlayer[];
  initial: { slotIndex: number; seat: 1 | 2; userId: string }[];
  onSubmit: (fd: FormData) => void;
  isPending: boolean;
  error: React.ReactNode;
}) {
  const t = useTranslations('cup.lineup');
  const seats = seatsPerSlot(session.format);

  const [picks, setPicks] = useState<string[][]>(() =>
    Array.from({ length: session.slotCount }, (_, slotIndex) =>
      Array.from(
        { length: seats },
        (_, seat) =>
          initial.find(
            (s) => s.slotIndex === slotIndex && s.seat === seat + 1,
          )?.userId ?? '',
      ),
    ),
  );

  /** Setter én spiller i ett sete. Egen funksjon, ikke en nøstet callback i
   *  JSX-en — fem nivåer inni hverandre var verken lesbart eller innenfor
   *  lint-grensa. */
  function setPick(slotIndex: number, seat: number, userId: string) {
    setPicks((prev) =>
      prev.map((slot, i) =>
        i === slotIndex
          ? slot.map((v, j) => (j === seat ? userId : v))
          : slot,
      ),
    );
  }

  const chosen = new Set(picks.flat().filter(Boolean));
  const complete = picks.every((slot) => slot.every(Boolean));

  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set('intent', 'submit');
        fd.set('id', tournamentId);
        fd.set('session_id', session.id);
        fd.set('team', String(teamNumber));
        fd.set(
          'slots',
          JSON.stringify(
            picks.map((userIds, slotIndex) => ({ slotIndex, userIds })),
          ),
        );
        onSubmit(fd);
      }}
    >
      {picks.map((slot, slotIndex) => (
        <div key={slotIndex} className="flex items-center gap-2">
          <span className="text-muted text-sm w-6 shrink-0 tabular-nums">
            {slotIndex + 1}.
          </span>
          <div className="flex-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {slot.map((value, seat) => (
              <select
                key={seat}
                aria-label={t('seatLabel', {
                  slot: slotIndex + 1,
                  seat: seat + 1,
                })}
                data-testid={`cup-lineup-pick-${session.sessionIndex}-${teamNumber}-${slotIndex}-${seat}`}
                className="min-h-[44px] w-full rounded-xl border border-line bg-bg px-3 text-sm text-text"
                value={value}
                onChange={(e) => setPick(slotIndex, seat, e.target.value)}
              >
                <option value="">{t('pickPlayer')}</option>
                {squad.map((p) => (
                  <option
                    key={p.userId}
                    value={p.userId}
                    // Allerede brukt i en annen plass — valgt i DENNE
                    // nedtrekken skal likevel stå åpen, ellers kan man ikke
                    // se hvem som står der.
                    disabled={chosen.has(p.userId) && p.userId !== value}
                  >
                    {p.displayName}
                  </option>
                ))}
              </select>
            ))}
          </div>
        </div>
      ))}

      {error}
      <Button
        type="submit"
        disabled={isPending || !complete}
        data-testid={`cup-lineup-submit-${session.sessionIndex}-${teamNumber}`}
      >
        {t('submitButton')}
      </Button>
      {!complete && <p className="text-xs text-muted">{t('fillAllSlots')}</p>}
    </form>
  );
}
