'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import {
  acceptTeamInvite,
  declineTeamInvite,
  removeTeamMember,
  resendTeamInvite,
  attachToCaptainTeam,
} from '../teamActions';

type Status = 'pending' | 'approved' | 'rejected' | 'withdrawn';

const STATUS_TONES: Record<Status, 'success' | 'warning' | 'error' | 'info'> = {
  pending: 'info',
  approved: 'success',
  rejected: 'error',
  withdrawn: 'warning',
};

type MemberDisplay = {
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

type Props =
  | {
      mode: 'captain';
      shortId: string;
      myRowId: string;
      myStatus: Status;
      joinEffect: JoinEffect;
      captain: {
        requestId: string;
        userId: string;
        displayName: string;
        status: Status;
      } | null;
      members: MemberDisplay[];
    }
  | {
      mode: 'member';
      shortId: string;
      myRowId: string;
      myStatus: Status;
      joinEffect: JoinEffect;
      captain: {
        requestId: string;
        userId: string;
        displayName: string;
        status: Status;
      } | null;
      members: MemberDisplay[];
    }
  | {
      mode: 'invited_unknown';
      shortId: string;
      invitationId: string;
      joinEffect: JoinEffect;
    };

/**
 * Captain dashboard + member view + ukjent-attach. Rendres som en av tre
 * modi avhengig av rolle:
 *   - captain: oversikt over alle medspillere med remove/resend-knapper.
 *   - member: viser laget med aksepter/avslå-knapper hvis status='pending'.
 *   - invited_unknown: viser "Bli med på lag"-knapp som kjører attach-action.
 *
 * Pending state via useTransition. Resultater vises som inline-banner. Vi
 * router.refresh()-er etter handling slik at serveren leverer ny snapshot.
 */
export function TeamDashboardClient(props: Props) {
  const t = useTranslations('signup');
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const runAction = (
    key: string,
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    successMessage: string,
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
          // Soft reload — server-componenten henter på nytt på neste
          // navigasjon. For umiddelbar effekt anbefaler vi brukeren å
          // refreshe (full reload), men suksess-banneret er tilstrekkelig
          // feedback for nå.
          if (typeof window !== 'undefined') {
            setTimeout(() => window.location.reload(), 500);
          }
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
      case 'db_error':
      default:
        return t('errors.teamDashDbError');
    }
  }

  if (props.mode === 'invited_unknown') {
    const nextStep =
      props.joinEffect === 'instant'
        ? t('teamDashAttachInstant')
        : t('teamDashAttachApproval');
    return (
      <div className="space-y-3">
        {error && <Banner tone="error">{error}</Banner>}
        {success && <Banner tone="success">{success}</Banner>}
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

  const isCaptain = props.mode === 'captain';

  return (
    <div className="space-y-4">
      {error && <Banner tone="error">{error}</Banner>}
      {success && <Banner tone="success">{success}</Banner>}

      {/* Kaptein-rad */}
      {props.captain && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface/40 px-4 py-3">
          <div>
            <p className="font-sans text-xs uppercase tracking-[0.12em] text-muted">
              {t('teamDashCaptainLabel')}
            </p>
            <p className="font-sans text-sm font-medium text-text">
              {props.captain.displayName}
            </p>
          </div>
          <StatusChipMini status={props.captain.status} />
        </div>
      )}

      {/* Medspillere */}
      <div className="space-y-2">
        <p className="font-sans text-xs uppercase tracking-[0.12em] text-muted">
          {t('teamDashMembersHeading', { count: props.members.length })}
        </p>
        {props.members.length === 0 ? (
          <p className="font-sans text-sm text-muted">{t('teamDashNoMembers')}</p>
        ) : (
          props.members.map((m) => (
            <div
              key={m.requestId}
              className="space-y-2 rounded-xl border border-border bg-surface/40 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-sans text-sm text-text">{m.displayName}</p>
                <StatusChipMini status={m.status} />
              </div>
              {isCaptain && m.status === 'pending' && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    pending={pendingKey === `resend:${m.requestId}`}
                    disabled={isPending}
                    pendingLabel={t('teamDashResendPending')}
                    onClick={() =>
                      runAction(
                        `resend:${m.requestId}`,
                        () => resendTeamInvite(m.requestId, props.shortId),
                        t('teamDashResendSuccess'),
                      )
                    }
                  >
                    {t('teamDashResendButton')}
                  </Button>
                  <Button
                    variant="danger"
                    pending={pendingKey === `remove:${m.requestId}`}
                    disabled={isPending}
                    pendingLabel={t('teamDashRemovePending')}
                    onClick={() =>
                      runAction(
                        `remove:${m.requestId}`,
                        () => removeTeamMember(m.requestId, props.shortId),
                        t('teamDashRemoveSuccess'),
                      )
                    }
                  >
                    {t('teamDashRemoveButton')}
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Medspiller-aksjoner: aksepter/avslå hvis egen rad er pending */}
      {props.mode === 'member' && props.myStatus === 'pending' && (
        <div className="space-y-2 pt-2">
          <p className="font-sans text-sm text-text">
            {t('teamDashPendingInviteIntro')}
          </p>
          <p className="font-sans text-sm text-muted">
            {props.joinEffect === 'instant'
              ? t('teamDashPendingInstant')
              : t('teamDashPendingApproval')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
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
              variant="secondary"
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

function StatusChipMini({ status }: { status: Status }) {
  const t = useTranslations('signup');
  const tone = STATUS_TONES[status];
  const palette: Record<typeof tone, string> = {
    success: 'bg-primary-soft text-success border-success/40',
    error: 'bg-danger/[0.10] text-danger border-danger/30',
    info: 'bg-accent/[0.10] text-text border-accent/40',
    warning: 'bg-warning/[0.10] text-warning border-warning/40',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-sans text-[11px] font-medium tracking-tight ${palette[tone]}`}
    >
      {t(`memberStatus.${status}` as Parameters<typeof t>[0])}
    </span>
  );
}
