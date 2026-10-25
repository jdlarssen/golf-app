'use client';

import { useId } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { SmartLink } from '@/components/ui/SmartLink';
import { Kicker } from '@/components/ui/Kicker';
import { StartScheduledGameButton } from '@/app/[locale]/admin/games/[id]/StartScheduledGameButton';
import { formatTeeOffParts } from '@/lib/i18n/format';
import { invitationWhen } from '@/lib/games/invitationCard';
import { hcpAllowanceInPlay } from '@/lib/games/hcpAllowance';
import { PRIZE_SLOTS } from '@/lib/games/prizes';
import type { EditSection } from '@/lib/games/editSections';
import type { StructuralBlockReason } from '@/lib/games/startBlockReasons';
import type { GameFormState } from './useGameFormState';
import {
  readyChecklist,
  teeOffIso,
  type ReadyRowKey,
  type ReadyRowStatus,
} from './sections/readyChecklistRules';

/**
 * Why the round cannot start, resolved on the server (#2204,
 * `readCreatorStartBlock`). The sentence comes from `admin.game.errors`, which
 * is not a client namespace on the organiser's route (#2227), so it arrives
 * translated.
 */
export type OverviewStartBlock = {
  reason: StructuralBlockReason;
  /** `startBlockMessage`; `null` for `unassigned_flights`, which has its own line. */
  message: string | null;
  /** Active players without a flight (`unassignedActivePlayers`). */
  unassignedCount: number;
};

export type EditNav = {
  /** The edit route itself: the overview, and where «Avbryt» goes. */
  baseHref: string;
  deleteHref: string;
  startlistHref: string;
  startBlock: OverviewStartBlock | null;
  /**
   * Flights among the active players, as stored. Read from the roster, not the
   * form: a solo format's form posts no flights (the Startlista sets them).
   */
  flightCount: number;
  /** The game's name as the page shows it (`localizeGameName`). */
  title: string;
  /** `gameStatus.scheduled`, resolved on the server like the start texts. */
  statusLabel: string;
  /**
   * «Start runden nå» with the game page's confirmation. The action comes
   * bound; label and question are `admin.game.buttons` texts, resolved on the
   * server for the same reason as `startBlock`.
   */
  start?: {
    action: () => void | Promise<void>;
    label: string;
    confirmText: string;
  };
};

type Row = {
  section: EditSection;
  title: string;
  value: string;
  /** From `readyChecklist`; the two rows the checklist has no row for have none. */
  status: ReadyRowStatus | null;
  /** «Mangler: …» and the past tee-off sentence for a red row. */
  problem: string | null;
  /** The start block that belongs to this row. */
  block: OverviewStartBlock | null;
};

/** Which row says why the round cannot start. */
function sectionForBlock(reason: StructuralBlockReason): EditSection {
  return reason === 'tee_missing' || reason === 'tee_missing_rating' ? 'bane' : 'spillere';
}

const STATUS_FOR_SECTION: Partial<Record<EditSection, ReadyRowKey>> = {
  'navn-og-tid': 'teeOff',
  bane: 'course',
  format: 'format',
  spillere: 'players',
};

const MARK: Record<'ok' | 'block', { glyph: string; className: string }> = {
  ok: { glyph: '✓', className: 'bg-primary text-xs text-white dark:text-bg' },
  block: { glyph: '!', className: 'bg-danger text-[13px] font-semibold text-white dark:text-bg' },
};

function capitalize(value: string, locale: AppLocale): string {
  return value.charAt(0).toLocaleUpperCase(locale) + value.slice(1);
}

/**
 * «Rediger spill» for a scheduled game (#2322, artboard «Forslag: rediger
 * spillet»): the game's name and status, then six rows with what is set
 * today and «Endre», which opens that part alone (`?del=`). Every value and
 * status comes from the form state (`useGameFormState`) and the checklist
 * rule (`readyChecklist`), so the overview keeps no rules of its own.
 */
export function EditOverview({
  state,
  editNav,
  playersSummary,
  formatSummary,
  registrationSummary,
  settingsSummary,
}: {
  state: GameFormState;
  editNav: EditNav;
  playersSummary: string;
  formatSummary: string;
  registrationSummary: string;
  settingsSummary: string;
}) {
  const t = useTranslations('wizard.form.overview');
  const tForm = useTranslations('wizard.form');
  const tReady = useTranslations('wizard.ready');
  const tBasics = useTranslations('wizard.sections.basics');
  const locale = useLocale() as AppLocale;
  const listId = useId();

  const { gameMode } = state;
  const { startBlock } = editNav;
  const iso = teeOffIso(state.scheduledTeeOffAt);
  const when = invitationWhen(iso, locale);

  const teeOffPastMessage = state.teeOffInPast ? tBasics('teeOffPastError') : null;
  const checklist = readyChecklist({
    codes: state.missingForPublishCodes,
    messages: state.missingForPublish,
    teeOffPastMessage,
    intent: undefined,
    expectedPlayerCount: undefined,
    selectedCount: state.selectedPlayerIds.length,
    lockGameMode: state.lockGameMode,
    gameMode,
    guestOnly: state.guestOnly,
  });

  function statusFor(section: EditSection): { status: ReadyRowStatus | null; problem: string | null } {
    const key = STATUS_FOR_SECTION[section];
    const row = key ? checklist.find((r) => r.key === key) : undefined;
    if (!row) return { status: null, problem: null };
    if (row.status !== 'block') return { status: row.status, problem: null };
    const missing = row.messages.filter((m) => m !== teeOffPastMessage);
    const problem = [
      missing.length > 0 ? tForm('missingPrefix', { items: missing.join(', ') }) : null,
      row.messages.includes(teeOffPastMessage ?? '') ? teeOffPastMessage : null,
    ]
      .filter(Boolean)
      .join(' ');
    return { status: 'block', problem };
  }

  const teeBox = state.availableTees.find((tee) => tee.id === state.teeBoxId) ?? null;
  const courseValue = state.selectedCourse
    ? teeBox
      ? t('courseValue', { course: state.selectedCourse.name, tee: teeBox.name })
      : state.selectedCourse.name
    : t('notSet');

  const allowance = hcpAllowanceInPlay(gameMode, state.shambleScoring)
    ? state.hcpAllowance === 0
      ? tReady('checklist.gross')
      : tReady('checklist.allowancePct', { pct: state.hcpAllowance })
    : null;

  const prizeCount = PRIZE_SLOTS.filter(
    (slot) => state.prizeDraft[slot.key].description.trim() !== '',
  ).length;

  const values: Record<EditSection, string> = {
    'navn-og-tid': when ? capitalize(tReady('checklist.teeOff', when), locale) : t('notSet'),
    bane: courseValue,
    format: [formatSummary, allowance].filter(Boolean).join(' · '),
    spillere: [
      playersSummary,
      editNav.flightCount > 0 ? t('flights', { count: editNav.flightCount }) : null,
    ]
      .filter(Boolean)
      .join(' · '),
    pamelding: registrationSummary,
    innstillinger: [settingsSummary, prizeCount > 0 ? t('prizes', { count: prizeCount }) : null]
      .filter(Boolean)
      .join(' · '),
  };

  const titles: Record<EditSection, string> = {
    'navn-og-tid': t('rows.nameAndTime'),
    bane: t('rows.course'),
    format: t('rows.format'),
    spillere: t('rows.players'),
    pamelding: t('rows.registration'),
    innstillinger: t('rows.settings'),
  };

  const rows: Row[] = (Object.keys(titles) as EditSection[]).map((section) => ({
    section,
    title: titles[section],
    value: values[section],
    ...statusFor(section),
    block: startBlock && sectionForBlock(startBlock.reason) === section ? startBlock : null,
  }));

  // The cron sweep starts the round at tee-off, unless something stops it: the
  // Sekretariat's start card says the same (`scheduledStartBodyAutoStart`).
  const autoStart =
    iso && !state.teeOffInPast && !startBlock
      ? t('autoStart', formatTeeOffParts(new Date(iso), locale))
      : null;

  return (
    <div data-testid="edit-overview" className="leading-[normal]">
      <div className="pt-1">
        <h1 className="font-serif text-[28px] font-medium text-text">{editNav.title}</h1>
        <div className="mt-1 flex items-center gap-2">
          <span className="flex h-[22px] items-center rounded-full bg-primary-soft px-2 font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
            {editNav.statusLabel}
          </span>
          {autoStart && (
            <span data-testid="edit-overview-autostart" className="font-sans text-xs leading-[normal] text-muted">
              {autoStart}
            </span>
          )}
        </div>
      </div>

      <section aria-labelledby={listId} className="-mx-1 mt-4">
        <h2 id={listId} className="sr-only">
          {t('listHeading')}
        </h2>
        <ul data-focus-inset className="overflow-hidden rounded-2xl border border-border bg-surface">
          {rows.map((row, i) => (
            <OverviewRow
              key={row.section}
              row={row}
              last={i === rows.length - 1}
              baseHref={editNav.baseHref}
              startlistHref={editNav.startlistHref}
            />
          ))}
        </ul>
      </section>

      <p className="mx-[-4px] mt-3 font-sans text-xs leading-[normal] text-muted">{t('footnote')}</p>

      <div className="-mx-1 mt-[18px] flex flex-col gap-1 border-t border-border pt-3.5">
        {editNav.start && (
          <StartScheduledGameButton
            startAction={editNav.start.action}
            label={`${editNav.start.label} →`}
            confirmText={editNav.start.confirmText}
            className="flex min-h-11 w-full items-center text-left font-sans text-sm leading-[normal] font-semibold text-primary"
          />
        )}
        <SmartLink
          href={editNav.deleteHref}
          data-testid="edit-overview-delete"
          className="flex min-h-11 items-center font-sans text-sm leading-[normal] font-semibold text-danger"
        >
          {t('delete')}
        </SmartLink>
      </div>
    </div>
  );
}

function OverviewRow({
  row,
  last,
  baseHref,
  startlistHref,
}: {
  row: Row;
  last: boolean;
  baseHref: string;
  startlistHref: string;
}) {
  const t = useTranslations('wizard.form.overview');
  const tReady = useTranslations('wizard.ready');
  const { block } = row;
  return (
    <li
      data-testid={`edit-row-${row.section}`}
      data-status={row.status ?? undefined}
      className={`relative flex min-h-[60px] items-center gap-3 px-3.5 py-3 ${last ? '' : 'border-b border-row-divider-warm'}`}
    >
      {row.status !== null && (
        <span
          aria-hidden="true"
          className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full leading-[normal] ${MARK[row.status === 'block' ? 'block' : 'ok'].className}`}
        >
          {MARK[row.status === 'block' ? 'block' : 'ok'].glyph}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {row.status !== null && (
          <span className="sr-only">
            {tReady(row.status === 'block' ? 'checklist.statusBlock' : 'checklist.statusOk')}{' '}
          </span>
        )}
        <Kicker className="text-[11px]! tracking-[0.14em]! leading-[normal]">{row.title}</Kicker>
        <p className="font-sans text-[15px] leading-[normal] font-semibold text-text">{row.value}</p>
        {row.problem && (
          <p className="font-sans text-xs leading-[normal] font-semibold text-danger">{row.problem}</p>
        )}
        {block?.reason === 'unassigned_flights' ? (
          <>
            <p className="font-sans text-xs leading-[normal] font-semibold text-warning-text">
              {t('unassignedFlights', { count: block.unassignedCount })}
            </p>
            <SmartLink
              href={startlistHref}
              data-testid="edit-overview-startlist-link"
              className="relative z-10 inline-flex min-h-11 items-center font-sans text-xs leading-[normal] font-semibold text-primary underline underline-offset-2"
            >
              {t('startlistLink')}
            </SmartLink>
          </>
        ) : (
          block?.message && (
            <p className="font-sans text-xs leading-[normal] font-semibold text-warning-text">
              {block.message}
            </p>
          )
        )}
      </div>
      {/* The whole row is the target, as on the artboard: the link's ::after
          covers the row, and the Startlista link above sits on top of it. */}
      <SmartLink
        href={`${baseHref}?del=${row.section}`}
        aria-label={t('editLabel', { title: row.title.toLocaleLowerCase() })}
        data-testid={`edit-row-${row.section}-link`}
        className="flex min-h-11 shrink-0 items-center font-sans text-[13px] leading-[normal] font-semibold text-primary after:absolute after:inset-0"
      >
        {t('edit')}
      </SmartLink>
    </li>
  );
}
