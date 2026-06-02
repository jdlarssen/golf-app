'use client';

import { useState, useTransition } from 'react';
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

const STATUS_LABELS: Record<Status, string> = {
  pending: 'Venter på svar',
  approved: 'Med på laget',
  rejected: 'Avslått',
  withdrawn: 'Trakk seg',
};

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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const runAction = (
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    successMessage: string,
  ) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
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
    });
  };

  if (props.mode === 'invited_unknown') {
    const nextStep =
      props.joinEffect === 'instant'
        ? 'Du blir med i spillet med en gang, og får scorekortet når runden starter.'
        : 'Arrangøren må godkjenne laget før dere er påmeldt. Du får varsel når det er klart.';
    return (
      <div className="space-y-3">
        {error && <Banner tone="error">{error}</Banner>}
        {success && <Banner tone="success">{success}</Banner>}
        <p className="font-sans text-sm text-text">{nextStep}</p>
        <Button
          disabled={isPending}
          onClick={() =>
            runAction(
              () => attachToCaptainTeam(props.invitationId, props.shortId),
              props.joinEffect === 'instant'
                ? 'Du er med på laget. Siden lastes på nytt…'
                : 'Meldt på laget. Venter på arrangøren. Siden lastes på nytt…',
            )
          }
          className="w-full"
        >
          {isPending ? 'Kobler på…' : 'Bli med på lag'}
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
              Kaptein
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
          Medspillere ({props.members.length})
        </p>
        {props.members.length === 0 ? (
          <p className="font-sans text-sm text-muted">Ingen medspillere ennå.</p>
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
                    disabled={isPending}
                    onClick={() =>
                      runAction(
                        () => resendTeamInvite(m.requestId, props.shortId),
                        'Påminnelse sendt.',
                      )
                    }
                  >
                    Send påminnelse
                  </Button>
                  <Button
                    variant="danger"
                    disabled={isPending}
                    onClick={() =>
                      runAction(
                        () => removeTeamMember(m.requestId, props.shortId),
                        'Medspiller fjernet.',
                      )
                    }
                  >
                    Fjern
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
            Kapteinen har invitert deg. Vil du være med?
          </p>
          <p className="font-sans text-sm text-muted">
            {props.joinEffect === 'instant'
              ? 'Sier du ja, er du med i spillet med en gang.'
              : 'Sier du ja, må arrangøren godkjenne laget før dere er påmeldt. Du får varsel når det er klart.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isPending}
              onClick={() =>
                runAction(
                  () => acceptTeamInvite(props.myRowId, props.shortId),
                  props.joinEffect === 'instant'
                    ? 'Du er med på laget. Siden lastes på nytt…'
                    : 'Meldt på laget. Venter på arrangøren. Siden lastes på nytt…',
                )
              }
            >
              {isPending ? 'Behandler…' : 'Aksepter'}
            </Button>
            <Button
              variant="secondary"
              disabled={isPending}
              onClick={() =>
                runAction(
                  () => declineTeamInvite(props.myRowId, props.shortId),
                  'Avslag registrert.',
                )
              }
            >
              Avslå
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusChipMini({ status }: { status: Status }) {
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
      {STATUS_LABELS[status]}
    </span>
  );
}

function mapError(code: string): string {
  switch (code) {
    case 'not_authed':
      return 'Du må logge inn på nytt.';
    case 'not_found':
      return 'Fant ikke laget eller medspilleren.';
    case 'game_locked':
      return 'Spillet er startet — endringer er ikke tillatt lenger.';
    case 'db_error':
    default:
      return 'Klarte ikke å fullføre handlingen. Prøv igjen om litt.';
  }
}
