'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useModalFocus } from '@/hooks/useModalFocus';
import type { AppLocale } from '@/i18n/routing';
import {
  formatListLocale,
  formatShortDayMonthLocale,
  formatTeeOffTimeLocale,
} from '@/lib/i18n/format';
import { formatHcpDisplay } from '@/lib/handicap/signFormat';
import { nameInitials } from '@/lib/names/initials';
import {
  historyGroups,
  inboxGroups,
  signupAgo,
  signupFlag,
  type HistoryStatus,
  type SignupCapacity,
  type SignupFlag,
} from '@/lib/games/signupInbox';
import { approveRequest, rejectRequest, transferTeamCaptaincy } from './actions';
import { Button } from '@/components/ui/Button';
import { Kicker } from '@/components/ui/Kicker';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { RequestRow } from './types';
import { REJECTION_REASON_MAX } from '@/lib/games/registration';

type Props = {
  gameId: string;
  /** Every request on the game; the view picks its own rows (#2288). */
  requests: RequestRow[];
  /** The inbox, or one of the history views (`?tab=`). */
  view: 'pending' | HistoryStatus;
  locked: boolean;
  /** `signupCapacity`, or null when the format has no cap. */
  capacity: SignupCapacity | null;
  /** `inboxCounts().activeRosterUserIds` — who already has a seat. */
  activeRosterUserIds: string[];
  /** The number in the heading: people waiting, or rows in the history view. */
  headingCount: number;
  /** The server's clock, so «i går» reads the same on server and client. */
  renderedAt: string;
};

const AVATAR =
  'flex size-[38px] shrink-0 items-center justify-center rounded-full text-[12px] font-semibold leading-[normal]';
const RING = 'shadow-[0_0_0_2px_var(--surface)]';

/**
 * The signups cards (#2288, artboard «Forslag: påmeldingene»): one card per
 * request, a team as one card. The inbox has «Godkjenn» and «Avvis …» in the
 * card; the history views show the same cards without them, and «Gjør til
 * kaptein» on approved team members (#2358). Which rows go in, the seats and
 * the flags all come from `lib/games/signupInbox` — no rules here.
 */
export function PåmeldingerClient({
  gameId,
  requests,
  view,
  locked,
  capacity,
  activeRosterUserIds,
  headingCount,
  renderedAt,
}: Props) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations('admin.game.signups');
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [rejectingFor, setRejectingFor] = useState<RequestRow | null>(null);
  // #2358: lagmedlemmet arrangøren er i ferd med å gjøre til kaptein.
  // Bekreftelsen står på samme skjerm, ikke i en nettleser-confirm().
  const [captainFor, setCaptainFor] = useState<string | null>(null);
  const [transferring, setTransferring] = useState<string | null>(null);
  // Actionen svarer med en omdirigering (?status eller ?error), og siden sender
  // nye rader. Da er valget ferdig — også når det feilet — så knappen skal ikke
  // stå fast på «Lagrer …». Nullstilles under rendering, ikke i en effekt.
  const [seenRequests, setSeenRequests] = useState(requests);
  if (seenRequests !== requests) {
    setSeenRequests(requests);
    setCaptainFor(null);
    setTransferring(null);
  }
  const [reason, setReason] = useState('');
  const [, startTransition] = useTransition();

  const visibleRequests = useMemo(
    () => requests.filter((r) => !pendingIds.has(r.id)),
    [requests, pendingIds],
  );

  const groups = useMemo(
    () => (view === 'pending' ? inboxGroups(visibleRequests) : historyGroups(visibleRequests, view)),
    [visibleRequests, view],
  );

  // Optimistic hide: the captain's children go with the captain — the
  // action's cascade decides them on the server at the same time.
  function hideWithTeam(row: RequestRow) {
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
  }

  function handleApprove(row: RequestRow) {
    if (locked) return;
    hideWithTeam(row);
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
    hideWithTeam(row);
    setRejectingFor(null);
    startTransition(() => {
      void rejectRequest(row.id, formData);
    });
  }

  function confirmCaptain(row: RequestRow) {
    if (locked) return;
    setTransferring(row.id);
    startTransition(() => {
      void transferTeamCaptaincy(gameId, row.id);
    });
  }

  function signedUpText(iso: string): string {
    const ago = signupAgo(iso, Date.parse(renderedAt));
    const time = formatTeeOffTimeLocale(ago.date, locale);
    return ago.kind === 'date'
      ? t('signedUp.date', { date: formatShortDayMonthLocale(ago.date, locale), time })
      : t(`signedUp.${ago.kind}`, { time });
  }

  function soloLine(row: RequestRow): string {
    const signedUp = signedUpText(row.createdAt);
    return row.hcpIndex != null
      ? t('cardLine', { hcp: t('hcp', { hcp: formatHcpDisplay(row.hcpIndex, locale) }), signedUp })
      : signedUp;
  }

  function flagText(flag: NonNullable<SignupFlag>): string {
    if (flag.kind === 'teamShort') return t('flags.teamShort', { needed: flag.needed, free: flag.free });
    if (flag.kind === 'teamNone') return t('flags.teamNone', { needed: flag.needed });
    return t('flags.soloFull');
  }

  const headingId = `signups-${view}-heading`;
  const inInbox = view === 'pending';

  return (
    <section aria-labelledby={headingId}>
      {inInbox ? (
        <h2
          id={headingId}
          className="pt-[18px] pb-2 font-sans text-[10px] font-semibold uppercase leading-[normal] tracking-[0.2em] text-warning-text"
        >
          {t('waitingHeading', { count: headingCount })}
        </h2>
      ) : (
        <Kicker as="h2" id={headingId} className="pt-[18px] pb-2 leading-[normal]">
          {t(`historyHeadings.${view}`, { count: headingCount })}
        </Kicker>
      )}

      {groups.length === 0 ? (
        <p className="text-[13px] leading-[normal] text-muted">
          {t(`emptyMessages.${view}`)}
        </p>
      ) : (
        <ul aria-labelledby={headingId} className="-mx-1 flex flex-col gap-[10px]">
          {groups.map((group) => {
            const lead = group[0];
            const isTeam = lead.isTeamCaptain;
            const titleId = `req-${lead.id}-title`;
            const membersId = `req-${lead.id}-members`;
            const flag = inInbox && !locked ? signupFlag(group, capacity, activeRosterUserIds) : null;
            const describedBy = isTeam ? `${titleId} ${membersId}` : titleId;
            return (
              <li
                key={lead.id}
                data-testid="signup-card"
                data-team={isTeam ? 'true' : 'false'}
                data-flag={flag?.kind ?? ''}
                className="flex flex-col gap-[10px] rounded-2xl border border-border bg-surface px-3.5 py-3 leading-[normal]"
              >
                <div className="flex items-center gap-3">
                  {isTeam ? (
                    <span aria-hidden className="flex shrink-0">
                      {group.map((row, idx) => (
                        <span
                          key={row.id}
                          className={`${AVATAR} ${RING} ${idx > 0 ? '-ml-2.5' : ''} ${
                            idx > 0 && row.status === 'approved'
                              ? 'bg-primary-soft text-primary'
                              : 'bg-meter-track text-muted'
                          }`}
                        >
                          {nameInitials(row.userName)}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span aria-hidden className={`${AVATAR} bg-meter-track text-muted`}>
                      {nameInitials(lead.userName)}
                    </span>
                  )}
                  <span className="min-w-0 grow">
                    <span id={titleId} className="block text-[15px] font-semibold text-text">
                      {isTeam ? t('teamLabel', { name: lead.teamName ?? '' }) : lead.displayName}
                    </span>
                    {isTeam && (
                      <span id={membersId} className="sr-only">
                        {formatListLocale(
                          group.map((r) => r.displayName),
                          locale,
                        )}
                      </span>
                    )}
                    {isTeam && flag ? (
                      <span className="block text-[12px] font-semibold text-warning-text">
                        {flagText(flag)}
                      </span>
                    ) : (
                      <span className="block text-[12px] text-muted">
                        {isTeam ? signedUpText(lead.createdAt) : soloLine(lead)}
                      </span>
                    )}
                    {!isTeam && flag && (
                      <span className="block text-[12px] font-semibold text-warning-text">
                        {flagText(flag)}
                      </span>
                    )}
                  </span>
                </div>

                {lead.message && (
                  <blockquote className="border-l-2 border-border pl-3 font-serif text-[13px] italic text-muted">
                    «{lead.message}»
                  </blockquote>
                )}
                {lead.rejectionReason && (
                  <p className="text-[12px] text-muted">
                    {t('rejectionReasonDisplay', { reason: lead.rejectionReason })}
                  </p>
                )}

                {!inInbox && isTeam && (
                  <ul className="flex flex-col gap-2 border-t border-border pt-2.5">
                    {group.map((row, idx) => (
                      <li key={row.id} className="flex flex-col gap-2">
                        <span className="flex flex-wrap items-center gap-2 text-[14px] text-text">
                          {row.displayName}
                          {idx === 0 && (
                            <span className="rounded-full border border-border px-2 py-[2px] font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                              {t('captainBadge')}
                            </span>
                          )}
                        </span>
                        {/* #2358: arrangøren utpeker ny kaptein blant dem som står
                            på laget — bare godkjente lagmedlemmer, bare før start.
                            #2607: aldri en gjest. */}
                        {view === 'approved' &&
                          row.status === 'approved' &&
                          !row.isGuest &&
                          !locked &&
                          idx > 0 &&
                          (captainFor === row.id ? (
                            <div className="space-y-2" data-testid="make-captain-confirm">
                              <p className="text-sm text-text">
                                {t('makeCaptainConfirm', {
                                  name: row.displayName,
                                  teamName: lead.teamName ?? '',
                                })}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  data-testid="make-captain-confirm-button"
                                  onClick={() => confirmCaptain(row)}
                                  pending={transferring === row.id}
                                  pendingLabel={t('makeCaptainPending')}
                                >
                                  {t('makeCaptainConfirmButton')}
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() => setCaptainFor(null)}
                                  disabled={transferring === row.id}
                                >
                                  {t('makeCaptainCancel')}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="secondary"
                              data-testid="make-captain"
                              onClick={() => setCaptainFor(row.id)}
                            >
                              {t('makeCaptainButton')}
                            </Button>
                          ))}
                      </li>
                    ))}
                  </ul>
                )}

                {inInbox && !locked && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      data-testid="approve-request"
                      data-request-id={lead.id}
                      aria-describedby={describedBy}
                      onClick={() => handleApprove(lead)}
                      className="h-11 grow rounded-full bg-primary text-[14px] font-semibold leading-[normal] text-white transition-colors hover:bg-primary-hover dark:text-bg"
                    >
                      {isTeam ? t('approveTeamButton') : t('approveButton')}
                    </button>
                    <button
                      type="button"
                      aria-describedby={describedBy}
                      onClick={() => openReject(lead)}
                      className="h-11 grow rounded-full border border-border bg-surface text-[14px] font-semibold leading-[normal] text-text transition-colors hover:bg-primary-soft"
                    >
                      {t('rejectButton')}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {rejectingFor && (
        <RejectModal
          row={rejectingFor}
          reason={reason}
          setReason={setReason}
          onCancel={() => setRejectingFor(null)}
          onSubmit={submitReject}
          t={t}
        />
      )}
    </section>
  );
}

function RejectModal({
  row,
  reason,
  setReason,
  onCancel,
  onSubmit,
  t,
}: {
  row: RequestRow;
  reason: string;
  setReason: (v: string) => void;
  onCancel: () => void;
  onSubmit: (fd: FormData) => void;
  t: ReturnType<typeof useTranslations<'admin.game.signups'>>;
}) {
  // Modalen mountes kun når den er åpen, så `open` er konstant true her.
  // Fokus inn i dialogen, Tab holdes innenfor, og fokus tilbake på «Avvis»-
  // knappen ved unmount (#1590).
  const { containerRef } = useModalFocus<HTMLDivElement>(true);

  // Escape lukker. Forelderen eier begrunnelses-teksten, så `onCancel` er en ny
  // closure for hvert tastetrykk i feltet — lytteren leser den via ref slik at
  // effekten kjører én gang per åpning i stedet for per tegn.
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    cancelRef.current = onCancel;
  }, [onCancel]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') cancelRef.current();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 py-6 backdrop-blur-sm sm:items-center"
      onClick={onCancel}
    >
      <div
        className="max-h-full w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="reject-modal-title"
          className="font-serif text-lg font-medium leading-snug text-text"
        >
          {t('rejectModalTitle', { name: row.displayName })}
        </h2>
        {row.isTeamCaptain && (
          <p className="mt-2 text-sm text-muted">
            {t('rejectModalTeamCascade', { name: row.teamName ?? '' })}
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
            {t('rejectReasonLabel')}
          </label>
          <textarea
            id="reject-reason"
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, REJECTION_REASON_MAX))}
            maxLength={REJECTION_REASON_MAX}
            rows={3}
            placeholder={t('rejectReasonPlaceholder')}
            className="w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-text placeholder-muted/70 focus:border-accent"
          />
          <p className="text-right text-[11px] tabular-nums text-muted">
            {reason.length} / {REJECTION_REASON_MAX}
          </p>

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <SubmitButton
              className="flex-1"
              pendingLabel={t('rejectSubmittingBusy')}
            >
              {t('rejectSubmitButton')}
            </SubmitButton>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium tracking-tight text-text transition-colors hover:bg-primary-soft"
            >
              {t('rejectCancelButton')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
