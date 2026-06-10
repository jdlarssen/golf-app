'use client';

import { useMemo, useState, useTransition } from 'react';
import { useLocale } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { formatDateTime } from '@/lib/i18n/format';
import { approveRequest, rejectRequest } from './actions';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { RequestRow, TabKey } from './types';

type Props = {
  gameId: string;
  requests: RequestRow[];
  tab: TabKey;
  locked: boolean;
};

const REJECTION_REASON_MAX = 200;

const TAB_EMPTY_MESSAGE: Record<TabKey, string> = {
  pending: 'Ingen påmeldinger venter på godkjenning.',
  approved: 'Ingen godkjente påmeldinger ennå.',
  rejected: 'Ingen avviste påmeldinger ennå.',
  withdrawn: 'Ingen spillere har trukket seg.',
};

const STATUS_LABEL: Record<RequestRow['status'], string> = {
  pending: 'Venter',
  approved: 'Godkjent',
  rejected: 'Avvist',
  withdrawn: 'Trukket',
};

const STATUS_TONE: Record<RequestRow['status'], string> = {
  pending: 'border-warning/40 bg-warning/10 text-warning',
  approved: 'border-success/40 bg-success/10 text-success',
  rejected: 'border-danger/40 bg-danger/10 text-danger',
  withdrawn: 'border-border bg-surface text-muted',
};

function formatTimestamp(iso: string, locale: AppLocale): string {
  // Lokalisert kort dato + klokkeslett — tabular-nums sikrer at radhøyden
  // ikke hopper mellom rader.
  return formatDateTime(iso, locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Group rows by team-formation. Captains come first, with their team-children
 * directly underneath. Solo rows fall through as standalone entries. Children
 * without a matching captain in the current tab become standalone too — that
 * happens when fanene splitter en pending kaptein fra en allerede approved
 * team-medlem-rad, og er sjelden men håndteres uten å feile.
 */
function groupByTeam(rows: RequestRow[]): RequestRow[][] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const consumed = new Set<string>();
  const groups: RequestRow[][] = [];

  for (const row of rows) {
    if (consumed.has(row.id)) continue;
    if (row.isTeamCaptain) {
      const children = rows.filter(
        (r) => r.teamRequestId === row.id && !consumed.has(r.id),
      );
      groups.push([row, ...children]);
      consumed.add(row.id);
      for (const c of children) consumed.add(c.id);
    } else if (row.teamRequestId && byId.has(row.teamRequestId)) {
      // Will be picked up by the captain iteration above.
      continue;
    } else {
      groups.push([row]);
      consumed.add(row.id);
    }
  }
  return groups;
}

export function PåmeldingerClient({ gameId, requests, tab, locked }: Props) {
  const locale = useLocale();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [rejectingFor, setRejectingFor] = useState<RequestRow | null>(null);
  const [reason, setReason] = useState('');
  const [, startTransition] = useTransition();

  const visibleRequests = useMemo(
    () => requests.filter((r) => !pendingIds.has(r.id)),
    [requests, pendingIds],
  );

  const groups = useMemo(() => groupByTeam(visibleRequests), [visibleRequests]);

  function handleApprove(row: RequestRow) {
    if (locked) return;
    setPendingIds((s) => {
      const next = new Set(s);
      next.add(row.id);
      // Pre-hide team-children optimistically — cascade i actionen sørger for
      // at de blir approved samtidig på serveren.
      if (row.isTeamCaptain) {
        for (const r of requests) {
          if (r.teamRequestId === row.id) next.add(r.id);
        }
      }
      return next;
    });
    startTransition(() => {
      void approveRequest(row.id);
    });
  }

  function openReject(row: RequestRow) {
    if (locked) return;
    setRejectingFor(row);
    setReason('');
  }

  function submitReject(formData: FormData) {
    if (!rejectingFor) return;
    const row = rejectingFor;
    setPendingIds((s) => {
      const next = new Set(s);
      next.add(row.id);
      if (row.isTeamCaptain) {
        for (const r of requests) {
          if (r.teamRequestId === row.id) next.add(r.id);
        }
      }
      return next;
    });
    setRejectingFor(null);
    startTransition(() => {
      void rejectRequest(row.id, formData);
    });
  }

  // Mute the param so unused-var lint doesn't bite when gameId is needed by
  // caller-side wiring (action ids) but not here.
  void gameId;

  if (groups.length === 0) {
    return (
      <div className="px-3.5 py-6 text-center text-sm text-muted">
        {TAB_EMPTY_MESSAGE[tab]}
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {groups.map((group) => (
          <li key={group[0].id} className="px-3.5 py-3.5">
            {group[0].isTeamCaptain && group[0].teamName ? (
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Lag · {group[0].teamName}
                </p>
                <p className="font-sans text-[11px] text-muted">
                  {group.length}{' '}
                  {group.length === 1 ? 'spiller' : 'spillere'}
                </p>
              </div>
            ) : null}

            {group.map((row, idx) => (
              <div
                key={row.id}
                className={`flex flex-col gap-2 ${idx > 0 ? 'mt-3 border-t border-border pt-3' : ''} sm:flex-row sm:items-start sm:justify-between`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="text-sm font-medium text-text">
                      {row.displayName}
                    </p>
                    {row.isTeamCaptain && (
                      <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-[2px] font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                        Kaptein
                      </span>
                    )}
                    <span
                      className={`rounded-full border px-2 py-[2px] font-sans text-[10px] font-semibold uppercase tracking-[0.16em] ${STATUS_TONE[row.status]}`}
                    >
                      {STATUS_LABEL[row.status]}
                    </span>
                  </div>
                  <p className="mt-1 font-sans text-[11px] tabular-nums text-muted">
                    Påmeldt {formatTimestamp(row.createdAt, locale)}
                    {row.decidedAt
                      ? ` · Avgjort ${formatTimestamp(row.decidedAt, locale)}`
                      : ''}
                  </p>
                  {row.message && (
                    <blockquote className="mt-2 border-l-2 border-border pl-3 font-serif text-[13px] italic text-muted">
                      «{row.message}»
                    </blockquote>
                  )}
                  {row.rejectionReason && (
                    <p className="mt-1.5 text-xs text-muted">
                      Begrunnelse: {row.rejectionReason}
                    </p>
                  )}
                </div>

                {row.status === 'pending' && !locked && idx === 0 && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => handleApprove(row)}
                      pending={pendingIds.has(row.id)}
                      pendingLabel="Godkjenner …"
                    >
                      Godkjenn
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => openReject(row)}
                      pending={pendingIds.has(row.id)}
                      pendingLabel="Avviser …"
                    >
                      Avvis
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </li>
        ))}
      </ul>

      {rejectingFor && (
        <RejectModal
          row={rejectingFor}
          reason={reason}
          setReason={setReason}
          onCancel={() => setRejectingFor(null)}
          onSubmit={submitReject}
        />
      )}
    </>
  );
}

function RejectModal({
  row,
  reason,
  setReason,
  onCancel,
  onSubmit,
}: {
  row: RequestRow;
  reason: string;
  setReason: (v: string) => void;
  onCancel: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 py-6 backdrop-blur-sm sm:items-center"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="reject-modal-title"
          className="font-serif text-lg font-medium leading-snug text-text"
        >
          Avvis påmelding fra {row.displayName}?
        </h2>
        {row.isTeamCaptain && (
          <p className="mt-2 text-sm text-muted">
            Hele laget «{row.teamName}» blir avvist samtidig.
          </p>
        )}

        <form
          action={(fd) => onSubmit(fd)}
          className="mt-4 space-y-3"
        >
          {/* Honeypot — skjult fra ekte admin, populated kun av bots. */}
          <div aria-hidden="true" style={{ display: 'none' }}>
            <label htmlFor="reject-website">Website</label>
            <input
              id="reject-website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              defaultValue=""
            />
          </div>

          <label
            htmlFor="reject-reason"
            className="block font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-muted"
          >
            Valgfri begrunnelse
          </label>
          <textarea
            id="reject-reason"
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, REJECTION_REASON_MAX))}
            maxLength={REJECTION_REASON_MAX}
            rows={3}
            placeholder="(valgfritt) — vises i varselet til spilleren"
            className="w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-text placeholder-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <p className="text-right text-[11px] tabular-nums text-muted">
            {reason.length} / {REJECTION_REASON_MAX}
          </p>

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <SubmitButton
              className="flex-1"
              pendingLabel="Avviser …"
            >
              Avvis påmelding
            </SubmitButton>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium tracking-tight text-text transition-colors hover:bg-primary-soft"
            >
              Avbryt
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
