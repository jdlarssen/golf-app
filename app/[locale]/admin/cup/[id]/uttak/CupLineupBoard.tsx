'use client';

import { startTransition, useActionState, useState } from 'react';
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
  submitCupLineup,
  unlockCupLineup,
  deleteCupLineupSession,
  type CupLineupActionError,
} from '@/lib/cup/lineupActions';
import { seatsPerSlot } from '@/lib/cup/lineupValidation';

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
 * Én `useActionState` deler feilbanneret på tvers av alle formene — et
 * `intent`-felt router til riktig action, samme mønster som
 * `CupParticipantsList`. Kapteinens plass-valg er lokal state (ikke
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
  const tf = useTranslations('modes');
  const isOrganizer = board.access.role.kind === 'organizer';
  const myTeam =
    board.access.role.kind === 'captain' ? board.access.role.teamNumber : null;

  const [state, dispatch, isPending] = useActionState(
    async (_prev: CupLineupActionError, formData: FormData) => {
      switch (formData.get('intent')) {
        case 'open':
          return openCupLineupSession(formData);
        case 'unlock':
          return unlockCupLineup(formData);
        case 'delete':
          return deleteCupLineupSession(formData);
        default:
          return submitCupLineup(formData);
      }
    },
    INITIAL,
  );

  function submit(formData: FormData) {
    startTransition(() => dispatch(formData));
  }

  const errorMessage = (() => {
    if (!state.error) return null;
    const key = `errors.${state.error}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : t('errors.unexpected', { code: state.error });
  })();

  const captains = {
    1: board.access.participants.find((p) => p.isCaptain && p.teamNumber === 1),
    2: board.access.participants.find((p) => p.isCaptain && p.teamNumber === 2),
  };
  const bothCaptains = Boolean(captains[1] && captains[2]);

  return (
    <div className="space-y-6">
      {errorMessage && (
        <Banner tone="error" testId="cup-lineup-error">
          {errorMessage}
        </Banner>
      )}

      {isOrganizer && !bothCaptains && (
        <Banner tone="info" testId="cup-lineup-needs-captains">
          {t('needsCaptains')}
        </Banner>
      )}

      {isOrganizer && bothCaptains && (
        <OpenSessionForm
          tournamentId={tournamentId}
          board={board}
          onSubmit={submit}
          isPending={isPending}
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
              formatLabel={(f) => tf(f as Parameters<typeof tf>[0])}
            />
          ))
        )}
      </section>
    </div>
  );
}

/** Arrangørens «åpne økt»-form: format + antall plasser. */
function OpenSessionForm({
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
  const tf = useTranslations('modes');
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
                {tf(f as Parameters<typeof tf>[0])}
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
          disabled={isPending || derived < 1}
          data-testid="cup-lineup-open"
        >
          {t('openButton')}
        </Button>
        {derived < 1 && (
          <p className="text-xs text-muted">{t('squadTooSmall')}</p>
        )}
      </form>
    </Card>
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
  formatLabel,
}: {
  tournamentId: string;
  board: Board;
  session: CupLineupSessionView;
  isOrganizer: boolean;
  myTeam: CupTeamNumber | null;
  onSubmit: (fd: FormData) => void;
  isPending: boolean;
  formatLabel: (format: string) => string;
}) {
  const t = useTranslations('cup.lineup');
  const revealed = session.revealedAt !== null;

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
          />
        ))}
      </div>

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
}: {
  tournamentId: string;
  board: Board;
  session: CupLineupSessionView;
  team: CupLineupSessionView['teams'][number];
  isOrganizer: boolean;
  myTeam: CupTeamNumber | null;
  onSubmit: (fd: FormData) => void;
  isPending: boolean;
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
        <p className="mt-2 text-xs text-muted">{t('hidden')}</p>
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
        />
      ) : (
        <SlotList
          slots={team.slots}
          slotCount={session.slotCount}
          nameOf={nameOf}
        />
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
}: {
  tournamentId: string;
  session: CupLineupSessionView;
  teamNumber: CupTeamNumber;
  squad: CupLineupPlayer[];
  initial: { slotIndex: number; seat: 1 | 2; userId: string }[];
  onSubmit: (fd: FormData) => void;
  isPending: boolean;
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
