'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Kicker } from '@/components/ui/Kicker';
import { firstName } from '@/lib/firstName';
import { nameInitials } from '@/lib/names/initials';
import type { TeamFriendPickerData, TeamPickerFriend } from '@/lib/games/teamFriendPicker';
import {
  answeredYes,
  freeSlotCount,
  memberState,
  menuActions,
  orderedMembers,
  type MenuAction,
} from '@/lib/games/teamPageModel';
import {
  acceptTeamInvite,
  addTeamMember,
  attachToCaptainTeam,
  declineTeamInvite,
  removeTeamMember,
  resendTeamInvite,
  transferCaptaincy,
} from '../teamActions';
import {
  AddFriendSheet,
  Disc,
  FriendList,
  FriendSearchBar,
  LineupSlot,
} from '../TeamFriendPicker';

type Status = 'pending' | 'approved' | 'rejected' | 'withdrawn';

type MemberDisplay = {
  requestId: string;
  userId: string;
  displayName: string;
  status: Status;
  /** #2607: a guest has no login and can never take the captaincy. */
  isGuest: boolean;
};

type PersonDisplay = {
  requestId: string;
  userId: string;
  displayName: string;
  status: Status;
};

/**
 * Hva som skjer når du blir med: `instant` (open-modus → rett inn i spillet)
 * eller `approval` (manual_approval → arrangøren må godkjenne laget først).
 * Styrer neste-steg-copy så «bli med» ikke er en blind handling (#362).
 */
type JoinEffect = 'instant' | 'approval';

type TeamProps = {
  mode: 'captain' | 'member';
  shortId: string;
  myRowId: string;
  myStatus: Status;
  joinEffect: JoinEffect;
  captain: PersonDisplay | null;
  members: MemberDisplay[];
  /** The team's name, else the round's. */
  teamName: string;
  gameName: string;
  /** Players per team, the captain included; null = the format has no size. */
  teamSize: number | null;
  /** #543: the organiser closed signups; nobody changes the team. */
  signupsClosed: boolean;
  /** The captain's friends for «Velg en venn»; null for a teammate. */
  picker: TeamFriendPickerData | null;
};

type Props =
  | TeamProps
  | {
      mode: 'invited_unknown';
      shortId: string;
      invitationId: string;
      joinEffect: JoinEffect;
      /**
       * Laget + kapteinen invitasjonen kom fra. Siden rendrer denne modusen
       * kun når den vet sikkert hvilket lag det er (inviteren er kaptein i
       * spillet, #1343); er den usikker, stopper den før knappen. Feltene kan
       * likevel mangle — et lag uten navn — og da holdes teksten generisk.
       */
      teamName?: string;
      captainName?: string;
    };

/**
 * The team page (#199), as the drawing v3.1 draws it on the web (#2840 del 5):
 * the lineup with the captain's «K», one row per teammate with a disc, the
 * name and the status, and the rest behind «•••», a small menu by the row.
 * «Bytt med en venn» and «Velg en venn» stand in the open, and open the same
 * friend list as the team form. «Fjern fra laget» and «Gi kapteinsrollen» go
 * through a confirmation first. A teammate sees the team without «•••».
 * Someone invited by e-mail before #2840 gets «Bli med på lag»
 * (`invited_unknown`).
 *
 * Pending state via useTransition. After an action the server sends a fresh
 * snapshot (router.refresh()).
 */
export function TeamDashboardClient(props: Props) {
  const t = useTranslations('signup');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const runAction = (
    key: string,
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    successMessage: string,
    onDone?: () => void,
  ) => {
    setError(null);
    setSuccess(null);
    setPendingKey(key);
    startTransition(async () => {
      try {
        const res = await action();
        if (!res.ok) {
          setError(mapError(res.error));
        } else {
          setSuccess(successMessage);
          onDone?.();
          // Soft refresh — server-componenten henter laget på nytt uten
          // full sidelast, og suksess-banneret blir stående.
          router.refresh();
        }
      } finally {
        setPendingKey(null);
      }
    });
  };

  function mapError(code: string): string {
    switch (code) {
      case 'not_authed':
        return t('errors.teamDashNotAuthed');
      case 'not_found':
        return t('errors.teamDashNotFound');
      case 'game_locked':
        return t('errors.teamDashGameLocked');
      case 'signup_closed':
        return t('errors.teamDashSignupClosed');
      // #1343: attach-action-en stoppet fordi den ikke fant laget.
      case 'team_unknown':
        return t('errors.teamDashTeamUnknown');
      // #2358: overføringen krever en lagkamerat som står på spillerlista.
      case 'not_approved':
        return t('errors.teamDashNotApproved');
      // #2607: en gjest kan ikke bli kaptein (0228).
      case 'captain_is_guest':
        return t('errors.teamDashCaptainIsGuest');
      // #2840: «Velg en venn» and «Bytt med en venn».
      case 'team_full':
        return t('errors.team_full');
      case 'teammate_not_friend':
        return t('errors.teammate_not_friend');
      case 'already_registered':
        return t('teamPage.friendTaken');
      case 'db_error':
      default:
        return t('errors.teamDashDbError');
    }
  }

  const banners = (
    <>
      {error && <Banner tone="error">{error}</Banner>}
      {success && <Banner tone="success">{success}</Banner>}
    </>
  );

  if (props.mode === 'invited_unknown') {
    const nextStep =
      props.joinEffect === 'instant' ? t('teamDashAttachInstant') : t('teamDashAttachApproval');
    const invitedBy =
      props.teamName && props.captainName
        ? t('teamDashInvitedByCaptain', {
            teamName: props.teamName,
            captainName: props.captainName,
          })
        : null;
    return (
      <div className="space-y-3">
        {banners}
        {invitedBy && <p className="font-sans text-sm font-medium text-text">{invitedBy}</p>}
        <p className="font-sans text-sm text-text">{nextStep}</p>
        <Button
          pending={pendingKey === 'attach'}
          disabled={isPending}
          pendingLabel={t('teamDashJoinPending')}
          onClick={() =>
            runAction(
              'attach',
              () => attachToCaptainTeam(props.invitationId, props.shortId),
              props.joinEffect === 'instant'
                ? t('teamDashJoinSuccessInstant')
                : t('teamDashJoinSuccessApproval'),
            )
          }
          className="w-full"
        >
          {t('teamDashJoinButton')}
        </Button>
      </div>
    );
  }

  return (
    <TeamView
      {...props}
      banners={banners}
      isPending={isPending}
      pendingKey={pendingKey}
      runAction={runAction}
      clearMessages={() => {
        setError(null);
        setSuccess(null);
      }}
    />
  );
}

type RunAction = (
  key: string,
  action: () => Promise<{ ok: true } | { ok: false; error: string }>,
  successMessage: string,
  onDone?: () => void,
) => void;

/** What fills the page: the team, the friend picker, or a confirmation. */
type Screen =
  | { kind: 'team' }
  | { kind: 'pick'; replace: MemberDisplay | null }
  | { kind: 'confirm'; action: 'remove' | 'transfer'; member: MemberDisplay };

function TeamView({
  banners,
  isPending,
  pendingKey,
  runAction,
  clearMessages,
  ...props
}: TeamProps & {
  banners: ReactNode;
  isPending: boolean;
  pendingKey: string | null;
  runAction: RunAction;
  clearMessages: () => void;
}) {
  const t = useTranslations('signup');
  const tt = useTranslations('signup.teamPage');
  const tp = useTranslations('signup.friendPicker');
  const [screen, setScreen] = useState<Screen>({ kind: 'team' });
  // #2840: the screens replace each other in place, so the button that had focus
  // unmounts. Focus moves to the new screen's heading (not on the first render).
  const firstScreen = useRef(true);
  useEffect(() => {
    if (firstScreen.current) {
      firstScreen.current = false;
      return;
    }
    document.querySelector<HTMLElement>('[data-team-screen-heading]')?.focus();
  }, [screen.kind]);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const isCaptain = props.mode === 'captain';
  const canEdit = isCaptain && !props.signupsClosed;
  const members = orderedMembers(props.members);
  const free = freeSlotCount(props.teamSize, props.members.length);
  const go = (next: Screen) => {
    clearMessages();
    setMenuFor(null);
    setScreen(next);
  };

  if (screen.kind === 'confirm') {
    return (
      <ConfirmScreen
        {...screen}
        teamName={props.teamName}
        banners={banners}
        isPending={isPending}
        pendingKey={pendingKey}
        onCancel={() => go({ kind: 'team' })}
        onConfirm={() => {
          const m = screen.member;
          const who = firstName(m.displayName) ?? m.displayName;
          if (screen.action === 'remove') {
            runAction(
              `remove:${m.requestId}`,
              () => removeTeamMember(m.requestId, props.shortId),
              tt('removed', { firstName: who }),
              () => setScreen({ kind: 'team' }),
            );
          } else {
            runAction(
              `captain:${m.requestId}`,
              () => transferCaptaincy(m.requestId, props.shortId),
              tt('transferred', { firstName: who }),
              () => setScreen({ kind: 'team' }),
            );
          }
        }}
      />
    );
  }

  if (screen.kind === 'pick' && props.picker) {
    return (
      <PickScreen
        picker={props.picker}
        replace={screen.replace}
        teamName={props.teamName}
        free={free}
        teamUserIds={new Set([
          ...(props.captain ? [props.captain.userId] : []),
          ...props.members.map((m) => m.userId),
        ])}
        banners={banners}
        isPending={isPending}
        pendingKey={pendingKey}
        onCancel={() => go({ kind: 'team' })}
        onAdd={(friend) =>
          runAction(
            'add',
            () => addTeamMember(props.shortId, friend.id, screen.replace?.requestId),
            tt('added', { firstName: friend.shortName }),
            () => setScreen({ kind: 'team' }),
          )
        }
      />
    );
  }

  const { yes, of } = answeredYes(props.captain, props.members);
  const ownState = memberState(props.myStatus);
  const meta = isCaptain
    ? [
        props.myStatus === 'approved' ? tt('captainIn') : tt('captainWaiting'),
        free > 0 ? tt('freeSeats', { count: free }) : tt('progress', { yes, of }),
      ].join(' · ')
    : ownState === 'approved'
      ? tt('memberIn')
      : ownState === 'pending'
        ? tt('memberPending')
        : tt('memberDeclined');

  // The lineup: the captain first with the «K», then the teammates, then the
  // free seats dashed. Someone who has not said yes stands pale.
  const lineup = [
    ...(props.captain
      ? [{ key: props.captain.requestId, person: props.captain, captain: true, faded: false }]
      : []),
    ...members.map((m) => ({ key: m.requestId, person: m, captain: false, faded: m.status !== 'approved' })),
  ];
  const isMe = (requestId: string) =>
    requestId === props.myRowId || (isCaptain && requestId === props.captain?.requestId);

  // A teammate sees the captain in the list and not themselves; the captain
  // sees the teammates.
  const rows = isCaptain ? members : members.filter((m) => m.requestId !== props.myRowId);
  const captainFirstName = props.captain
    ? (firstName(props.captain.displayName) ?? props.captain.displayName)
    : t('teamDashCaptainLabel');

  return (
    <div className="space-y-4">
      <header className="px-1">
        <Kicker>{tt('kicker', { gameName: props.gameName })}</Kicker>
        <h1
          tabIndex={-1}
          data-team-screen-heading
          className="mt-1 font-serif text-[28px] leading-snug font-medium tracking-[-0.015em] text-text outline-none"
        >
          {props.teamName}
        </h1>
        <p className="mt-0.5 text-[13px] text-muted tabular-nums">{meta}</p>
      </header>

      {/* #543: stengt påmelding — endringer avvises server-side med
          signup_closed; banneret forklarer hvorfor på forhånd. */}
      {props.signupsClosed && <Banner tone="info">{t('teamDashSignupsClosedBanner')}</Banner>}
      {banners}

      <ul
        aria-label={tp('lineupLabel')}
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${Math.max(lineup.length + free, 1)}, minmax(0, 1fr))`,
        }}
      >
        {lineup.map(({ key, person, captain, faded }) => (
          <li key={key}>
            <LineupSlot
              disc={
                <Disc
                  initials={nameInitials(person.displayName)}
                  tone={isMe(person.requestId) ? 'me' : 'other'}
                  size="lg"
                  captain={captain}
                  faded={faded}
                  ringOn="bg"
                />
              }
              label={
                isMe(person.requestId)
                  ? tp('you')
                  : (firstName(person.displayName) ?? person.displayName)
              }
              muted={faded}
            />
          </li>
        ))}
        {Array.from({ length: free }, (_, i) => (
          <li key={`free-${i}`}>
            <LineupSlot disc={<Disc tone="empty" size="lg" />} label={tp('free')} muted />
          </li>
        ))}
      </ul>

      <ul className="rounded-[18px] bg-surface py-1" data-testid="team-rows">
        {!isCaptain && props.captain && (
          <li className="flex min-h-[60px] items-center gap-3 px-3.5 py-2">
            <Disc initials={nameInitials(props.captain.displayName)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-medium text-text">
                {props.captain.displayName}
              </span>
              <span className="mt-0.5 block text-[13px] text-muted">{tp('captain')}</span>
            </span>
          </li>
        )}
        {rows.map((m) => {
          const state = memberState(m.status);
          const actions = canEdit ? menuActions(m) : [];
          return (
            <li
              key={m.requestId}
              className="relative flex min-h-[60px] items-center gap-3 px-3.5 py-2"
              data-testid={`team-row-${m.requestId}`}
            >
              <Disc initials={nameInitials(m.displayName)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium text-text">{m.displayName}</span>
                <span
                  className={`mt-0.5 block text-[13px] ${
                    state === 'pending' ? 'text-warning-text' : 'text-muted'
                  }`}
                >
                  {t(`memberStatus.${state === 'declined' ? 'rejected' : state}` as Parameters<typeof t>[0])}
                </span>
              </span>
              {canEdit && state === 'declined' && props.picker && (
                <Button
                  type="button"
                  variant="outline"
                  size="chip"
                  onClick={() => go({ kind: 'pick', replace: m })}
                  data-testid="team-swap"
                >
                  {tt('swap')}
                </Button>
              )}
              {actions.length > 0 && (
                <RowMenu
                  name={m.displayName}
                  actions={actions}
                  open={menuFor === m.requestId}
                  onToggle={(open) => setMenuFor(open ? m.requestId : null)}
                  busy={isPending}
                  onPick={(action) => {
                    if (action === 'resend') {
                      setMenuFor(null);
                      runAction(
                        `resend:${m.requestId}`,
                        () => resendTeamInvite(m.requestId, props.shortId),
                        tt('resent', { firstName: firstName(m.displayName) ?? m.displayName }),
                      );
                    } else {
                      go({ kind: 'confirm', action, member: m });
                    }
                  }}
                />
              )}
            </li>
          );
        })}
        {Array.from({ length: free }, (_, i) => (
          <li key={`free-${i}`} className="flex min-h-[60px] items-center gap-3 px-3.5 py-2">
            <Disc tone="empty" />
            <span className="min-w-0 flex-1 text-base font-medium text-muted">{tt('freeSlot')}</span>
            {canEdit && props.picker && (
              <Button
                type="button"
                variant="outline"
                size="chip"
                onClick={() => go({ kind: 'pick', replace: null })}
                data-testid="team-pick-friend"
              >
                {tt('pickFriend')}
              </Button>
            )}
          </li>
        ))}
      </ul>

      <p className="rounded-2xl bg-surface px-3.5 py-3 text-sm leading-snug text-muted">
        {isCaptain ? tt('captainNote') : tt('memberNote')}
      </p>

      {/* The teammate's answer: yes or no, when the own row waits. */}
      {props.mode === 'member' && props.myStatus === 'pending' && (
        <div className="space-y-3 rounded-[18px] bg-surface p-4">
          <p className="font-serif text-[22px] leading-snug font-medium text-text">
            {tt('inviteTitle', { firstName: captainFirstName })}
          </p>
          <p className="text-[15px] leading-snug text-text">
            {props.joinEffect === 'instant' ? t('teamDashPendingInstant') : t('teamDashPendingApproval')}
          </p>
          <div className="grid gap-2">
            <Button
              data-testid="team-accept"
              size="large"
              pending={pendingKey === 'accept'}
              disabled={isPending}
              pendingLabel={t('teamDashAcceptPending')}
              onClick={() =>
                runAction(
                  'accept',
                  () => acceptTeamInvite(props.myRowId, props.shortId),
                  props.joinEffect === 'instant'
                    ? t('teamDashJoinSuccessInstant')
                    : t('teamDashJoinSuccessApproval'),
                )
              }
            >
              {t('teamDashAcceptButton')}
            </Button>
            <Button
              variant="outline"
              size="large"
              pending={pendingKey === 'decline'}
              disabled={isPending}
              pendingLabel={t('teamDashDeclinePending')}
              onClick={() =>
                runAction(
                  'decline',
                  () => declineTeamInvite(props.myRowId, props.shortId),
                  t('teamDashDeclineSuccess'),
                )
              }
            >
              {t('teamDashDeclineButton')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * «•••» and its small menu by the row (#2840): the actions that apply to this
 * teammate. Esc or a click outside closes it, and focus goes back to «•••».
 */
function RowMenu({
  name,
  actions,
  open,
  onToggle,
  onPick,
  busy,
}: {
  name: string;
  actions: MenuAction[];
  open: boolean;
  onToggle: (open: boolean) => void;
  onPick: (action: MenuAction) => void;
  busy: boolean;
}) {
  const tt = useTranslations('signup.teamPage');
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The latest `onToggle` without re-running the effect (and re-focusing the
  // first item) on every render.
  const onToggleRef = useRef(onToggle);
  useEffect(() => {
    onToggleRef.current = onToggle;
  });

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onToggleRef.current(false);
      buttonRef.current?.focus();
    }
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) onToggleRef.current(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const label: Record<MenuAction, string> = {
    resend: tt('resend'),
    transfer: tt('transfer'),
    remove: tt('remove'),
  };

  return (
    <div ref={wrapRef} className="-mr-2.5 shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-label={tt('more', { name })}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => onToggle(!open)}
        data-testid="team-row-menu"
        className={`grid size-11 place-items-center rounded-full text-xl tracking-[1px] text-muted ${
          open ? 'bg-primary-soft' : 'hover:bg-primary-soft'
        }`}
      >
        <span aria-hidden>•••</span>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={name}
          className="absolute top-[calc(100%-4px)] right-2 z-30 w-[220px] rounded-[14px] bg-surface py-1 shadow-[0_0_0_1px_var(--border),0_8px_24px_rgba(0,0,0,0.12)]"
        >
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              role="menuitem"
              onClick={() => onPick(action)}
              data-testid={`team-menu-${action}`}
              className={`flex min-h-11 w-full items-center px-3.5 text-left text-[15px] hover:bg-primary-soft ${
                action === 'remove' ? 'text-danger' : 'text-text'
              }`}
            >
              {label[action]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The confirmation before «Fjern fra laget» and «Gi kapteinsrollen» (#2840):
 * the page turns into the question, with the danger on its own button and
 * «Avbryt» beside it. Nothing happens before the second click.
 */
function ConfirmScreen({
  action,
  member,
  teamName,
  banners,
  isPending,
  pendingKey,
  onCancel,
  onConfirm,
}: {
  action: 'remove' | 'transfer';
  member: MemberDisplay;
  teamName: string;
  banners: ReactNode;
  isPending: boolean;
  pendingKey: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const tt = useTranslations('signup.teamPage');
  const who = firstName(member.displayName) ?? member.displayName;
  const remove = action === 'remove';
  return (
    <div className="space-y-4" data-testid={`team-confirm-${action}`}>
      <div className="px-1 pt-2">
        <Disc initials={nameInitials(member.displayName)} size="lg" captain={!remove} ringOn="bg" />
        <h1
          tabIndex={-1}
          data-team-screen-heading
          className="mt-3 font-serif text-[26px] leading-snug font-medium text-text outline-none"
        >
          {remove
            ? tt('removeTitle', { name: member.displayName })
            : tt('transferTitle', { name: member.displayName })}
        </h1>
      </div>
      {banners}
      <p className="rounded-[18px] bg-surface p-4 text-[15px] leading-snug text-text">
        {remove
          ? member.status === 'pending'
            ? tt('removeBodyPending', { firstName: who, teamName })
            : tt('removeBody', { firstName: who, teamName })
          : tt('transferBody', { firstName: who, teamName })}
      </p>
      <div className="grid gap-2">
        <Button
          type="button"
          size="large"
          variant={remove ? 'danger' : 'primary'}
          pending={pendingKey === `${remove ? 'remove' : 'captain'}:${member.requestId}`}
          pendingLabel={remove ? tt('removing') : tt('transferring')}
          disabled={isPending}
          onClick={onConfirm}
          data-testid="team-confirm-button"
        >
          {remove ? tt('removeButton', { name: member.displayName }) : tt('transfer')}
        </Button>
        <Button type="button" size="large" variant="outline" disabled={isPending} onClick={onCancel}>
          {tt('cancel')}
        </Button>
      </div>
    </div>
  );
}

/**
 * «Velg en venn» and «Bytt med en venn» (#2840): the same list and search as
 * the team form, for one seat. Friends on the team say «På laget», friends in
 * the round already «Alt påmeldt i runden»; the ones you can pick come first.
 */
function PickScreen({
  picker,
  replace,
  teamName,
  free,
  teamUserIds,
  banners,
  isPending,
  pendingKey,
  onCancel,
  onAdd,
}: {
  picker: TeamFriendPickerData;
  replace: MemberDisplay | null;
  teamName: string;
  free: number;
  teamUserIds: Set<string>;
  banners: ReactNode;
  isPending: boolean;
  pendingKey: string | null;
  onCancel: () => void;
  onAdd: (friend: TeamPickerFriend) => void;
}) {
  const t = useTranslations('signup');
  const tt = useTranslations('signup.teamPage');
  const tp = useTranslations('signup.friendPicker');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const reasonFor = (f: TeamPickerFriend) =>
    teamUserIds.has(f.id) ? tp('onTeam') : f.unavailable ? tp('unavailable') : null;
  const friends = [...picker.friends].sort(
    (a, b) => Number(reasonFor(a) !== null) - Number(reasonFor(b) !== null),
  );
  const pickedFriend = picker.friends.find((f) => f.id === picked) ?? null;

  return (
    <div className="space-y-4" data-testid="team-picker">
      <header className="px-1">
        <h1 tabIndex={-1} data-team-screen-heading className="font-serif text-[28px] leading-snug font-medium text-text outline-none">
          {tt('pickerTitle')}
        </h1>
        <p className="mt-0.5 text-[13px] text-muted tabular-nums">
          {replace
            ? tt('pickerSwapMeta', { teamName, name: replace.displayName })
            : `${teamName} · ${tt('freeSeats', { count: free })}`}
        </p>
      </header>
      {banners}
      <FriendSearchBar query={query} onQuery={setQuery} onAddFriend={() => setSheetOpen(true)} />
      {friends.length === 0 ? (
        <p className="px-1 text-[15px] text-muted">{t('teamNoFriends')}</p>
      ) : (
        <FriendList
          friends={friends}
          query={query}
          isSelected={(id) => id === picked}
          reasonFor={reasonFor}
          onToggle={(f) => setPicked((cur) => (cur === f.id ? null : f.id))}
        />
      )}
      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-20 grid gap-2 border-t border-border bg-bg pt-3">
        <Button
          type="button"
          size="large"
          disabled={!pickedFriend}
          pending={pendingKey === 'add'}
          pendingLabel={tt('adding')}
          onClick={() => pickedFriend && onAdd(pickedFriend)}
          data-testid="team-add-friend"
        >
          {pickedFriend ? tt('addButton', { firstName: pickedFriend.shortName }) : tt('pickFriend')}
        </Button>
        <Button type="button" size="large" variant="outline" disabled={isPending} onClick={onCancel}>
          {tt('cancel')}
        </Button>
      </div>
      <AddFriendSheet open={sheetOpen} onClose={() => setSheetOpen(false)} linkPath={picker.friendLinkPath} />
    </div>
  );
}
