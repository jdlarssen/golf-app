'use client';

// #2283 (part D3): the pieces the side-contest row and sheet are built from,
// shared by closest to pin / longest drive (`SideContestEntry`) and GIR
// (`GirContestEntry`). The drawings: `Sidekonk-kortet`, `Sidekonk-gir` and
// `Sidekonk-hullet` H2 (the owner's choice 15.11: «B, rad og ark»). The app has
// the same parts in `native/app/src/components/hole/SideContestParts.tsx`.
//
// - The row stands on the hole and opens the sheet. It shows what the flight
//   has reported, or «Meld inn». Offline, and when no read has succeeded, it is
//   locked with an explanation.
// - The sheet is the web `BottomSheet` with a kicker. Each line is a button
//   with `aria-pressed` (radio-like for CTP/LD, a toggle for GIR); the status
//   is a live region and a save error is an alert, which `BingoBangoBongoEntry`
//   has neither of.
// - The distance (closest to pin only) is typed or stepped in half metres.
import { useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { parseClaimDistance } from '@/lib/games/sideContest';
import { stepDistance, useSideContestText } from './sideContestText';

// -----------------------------------------------------------------------------
// Icons, as drawn (24 grid, 2 px line). Decorative: the text beside them speaks.
// -----------------------------------------------------------------------------

function Icon({
  size,
  strokeWidth = 2,
  className,
  children,
}: {
  size: number;
  strokeWidth?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className ?? ''}`}
    >
      {children}
    </svg>
  );
}

/** Closest to pin: a flag on a pole with the ball beside it. */
export function PinFlagContestIcon({ size = 20 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M6 21V4" />
      <path d="M6 4l9 3.5L6 11" />
      <circle cx="16" cy="19" r="2" />
    </Icon>
  );
}

/** Longest drive: the ball, and the arc it flies. */
export function DriveContestIcon({ size = 20 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M3 21h18" />
      <circle cx="5.5" cy="16.5" r="2" />
      <path d="M8 14.5C11 9 15.5 6.8 21 7.5" />
      <path d="M17.6 4.6L21 7.5l-2.9 3.3" />
    </Icon>
  );
}

/** GIR: a flag in a hole on the green. */
export function GirContestIcon({ size = 20 }: { size?: number }) {
  return (
    <Icon size={size}>
      <ellipse cx="12" cy="18" rx="9" ry="3.5" />
      <path d="M12 18V4" />
      <path d="M12 4l6 2.5L12 9" />
    </Icon>
  );
}

function ChevronIcon() {
  return (
    <Icon size={20}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  );
}

function OfflineIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <path d="M2 8.8a15 15 0 0 1 4.2-2.6" />
      <path d="M10.7 5.1A15 15 0 0 1 22 8.8" />
      <path d="M5 12.6a10 10 0 0 1 5.2-2.6" />
      <path d="M16.9 10.7A10 10 0 0 1 19 12.6" />
      <path d="M8.5 16.4a5 5 0 0 1 7 0" />
      <path d="M12 20h.01" />
      <path d="M3 3l18 18" />
    </Icon>
  );
}

function AlertIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5" />
      <path d="M12 16.2h.01" />
    </Icon>
  );
}

function CheckIcon({ size, strokeWidth }: { size: number; strokeWidth: number }) {
  return (
    <Icon size={size} strokeWidth={strokeWidth}>
      <path d="M5 12l5 5 9-10" />
    </Icon>
  );
}

// -----------------------------------------------------------------------------
// The row
// -----------------------------------------------------------------------------

/** What the row shows to the right, and whether it can be opened. */
export type ContestRowState = 'report' | 'answered' | 'offline' | 'failed';

/** The row on the hole: min height 64, icon tile 36, «Meld inn» or a chevron. */
export function ContestRow({
  icon,
  title,
  subtitle,
  state,
  onPress,
  testId,
}: {
  icon: ReactNode;
  title: string;
  /** The answer, the points line, or the explanation when the row is locked. */
  subtitle: string;
  state: ContestRowState;
  onPress: () => void;
  testId: string;
}) {
  const text = useSideContestText();
  const disabled = state === 'offline' || state === 'failed';
  // The drawing: the answer in the text colour, the points line and «Fikk ikke
  // hentet» in the muted one, «Uten nett» in the warning colour.
  const subtitleColor =
    state === 'offline' ? 'text-warning-text' : state === 'answered' ? 'text-text' : 'text-muted';
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-haspopup="dialog"
      data-testid={testId}
      className="flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-left disabled:cursor-default"
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-surface"
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] leading-[19px] font-semibold text-text">{title}</span>
        <span
          className={`truncate text-[13px] leading-[17px] tabular-nums ${subtitleColor}`}
          data-testid={`${testId}-subtitle`}
        >
          {subtitle}
        </span>
      </span>
      {state === 'report' ? (
        <span
          aria-hidden="true"
          className="h-9 shrink-0 rounded-full bg-primary px-3.5 text-[14px] leading-9 font-semibold text-white dark:text-bg"
        >
          {text.report}
        </span>
      ) : state === 'answered' ? (
        <span aria-hidden="true" className="text-muted">
          <ChevronIcon />
        </span>
      ) : state === 'offline' ? (
        <span aria-hidden="true" className="text-warning-text">
          <OfflineIcon size={20} />
        </span>
      ) : (
        <span aria-hidden="true" className="text-muted">
          <AlertIcon size={20} />
        </span>
      )}
    </button>
  );
}

// -----------------------------------------------------------------------------
// The sheet
// -----------------------------------------------------------------------------

/** The notice at the top of the sheet: offline, or a save error. */
export type SheetNotice = { kind: 'offline' | 'error'; text: string } | null;

/**
 * The sheet: kicker, title and close, notice, content, status and «Ferdig».
 * «Ferdig» only closes; each tap on a line is already saved.
 */
export function ContestSheet({
  open,
  onClose,
  kicker,
  title,
  notice,
  status,
  saved,
  children,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  kicker: string;
  title: string;
  notice: SheetNotice;
  /** The line above «Ferdig». */
  status: string;
  /** Something is saved: the status gets a tick and green text. */
  saved: boolean;
  children: ReactNode;
  testId: string;
}) {
  const t = useTranslations('holes.sideContest');
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      kicker={kicker}
      title={title}
      doneLabel={t('done')}
      closeLabel={t('close')}
    >
      {notice ? (
        <div
          // A save error is an alert (read out at once); «you are offline» is a status.
          role={notice.kind === 'error' ? 'alert' : 'status'}
          data-testid={`${testId}-notice`}
          className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 text-[13px] leading-[18px] font-medium ${
            notice.kind === 'offline' ? 'border-transparent bg-warning-soft text-warning-text' : 'text-danger'
          }`}
          style={
            notice.kind === 'error'
              ? {
                  background: 'color-mix(in srgb, var(--danger) 6%, var(--surface))',
                  borderColor: 'color-mix(in srgb, var(--danger) 28%, transparent)',
                }
              : undefined
          }
        >
          {notice.kind === 'offline' ? <OfflineIcon size={18} /> : <AlertIcon size={18} />}
          <span className="min-w-0">{notice.text}</span>
        </div>
      ) : null}
      {children}
      <div
        role="status"
        data-testid={`${testId}-status`}
        className={`mx-1 flex items-center gap-1.5 pb-1 text-xs leading-4 ${
          saved ? 'font-semibold text-success-text' : 'text-muted'
        }`}
      >
        {saved ? <CheckIcon size={14} strokeWidth={2.4} /> : null}
        <span>{status}</span>
      </div>
    </BottomSheet>
  );
}

/** The question over the lines. The section is named by it. */
export function SheetSection({ question, children }: { question: string; children: ReactNode }) {
  const questionId = useId();
  return (
    <section aria-labelledby={questionId} className="flex flex-col">
      <p id={questionId} className="mx-1 mb-3 text-sm leading-[19.6px] text-muted">
        {question}
      </p>
      {children}
    </section>
  );
}

/** The card the lines stand in. */
export function LineList({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-2xl border border-border bg-surface">{children}</div>;
}

/** A face with initials, or the dashed ring in front of «Ingen …». */
export type LineFace = { initials: string } | 'none';

function Faces({ faces }: { faces: readonly LineFace[] }) {
  if (faces.length === 1 && faces[0] === 'none') {
    return (
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-field-border text-muted"
      >
        <Icon size={20}>
          <path d="M7 12h10" />
        </Icon>
      </span>
    );
  }
  // A foursomes side: two 30 px faces, the second 6 px in over the first with a ring in the card's colour.
  const pair = faces.length > 1;
  return (
    <span aria-hidden="true" className="flex shrink-0">
      {faces.map((face, index) =>
        face === 'none' ? null : (
          <span
            key={index}
            className={`flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-text ${
              pair ? 'h-[30px] w-[30px]' : 'h-9 w-9'
            } ${index > 0 ? '-ml-1.5 shadow-[0_0_0_2px_var(--surface)]' : ''}`}
          >
            <span className={`font-semibold ${pair ? 'text-[11px] leading-[14px]' : 'text-[13px] leading-4'}`}>
              {face.initials}
            </span>
          </span>
        ),
      )}
    </span>
  );
}

/** The radio: an empty ring, or a green ring with a dot. */
function Radio({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full ${
        checked ? 'border-2 border-primary' : 'border-[1.5px] border-muted'
      }`}
    >
      {checked ? <span className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
    </span>
  );
}

/** The checkbox: an empty square, or filled with a tick. */
function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md ${
        checked ? 'bg-primary text-white dark:text-bg' : 'border-[1.5px] border-muted'
      }`}
    >
      {checked ? <CheckIcon size={14} strokeWidth={2.6} /> : null}
    </span>
  );
}

/**
 * One line in the sheet: faces, a name and a radio (one choice) or a checkbox
 * (GIR, several). A button with `aria-pressed`, named by the label alone.
 */
export function ContestLine({
  faces,
  label,
  checked,
  kind,
  disabled,
  last,
  onPress,
  testId,
}: {
  /** One face, two for a foursomes side, or the ring for «Ingen …». */
  faces: readonly LineFace[];
  label: string;
  checked: boolean;
  kind: 'radio' | 'checkbox';
  disabled: boolean;
  last: boolean;
  onPress: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-pressed={checked}
      data-testid={testId}
      className={`flex min-h-14 w-full cursor-pointer items-center gap-3 px-3.5 py-1.5 text-left disabled:cursor-default disabled:opacity-40 ${
        last ? '' : 'border-b border-row-divider-warm'
      } ${checked ? 'bg-primary-soft' : 'bg-transparent'}`}
    >
      <Faces faces={faces} />
      <span
        className={`min-w-0 flex-1 text-base leading-5 text-text ${checked ? 'font-semibold' : 'font-normal'}`}
      >
        {label}
      </span>
      {kind === 'radio' ? <Radio checked={checked} /> : <Checkbox checked={checked} />}
    </button>
  );
}

// -----------------------------------------------------------------------------
// The distance
// -----------------------------------------------------------------------------

function StepButton({
  plus,
  disabled,
  onPress,
  label,
  testId,
}: {
  plus: boolean;
  disabled: boolean;
  onPress: () => void;
  label: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label={label}
      data-testid={testId}
      className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-field-border bg-surface text-text disabled:cursor-default"
    >
      <Icon size={18} strokeWidth={2.2}>
        <path d="M6 12h12" />
        {plus ? <path d="M12 6v12" /> : null}
      </Icon>
    </button>
  );
}

/**
 * «Hvor nær?» with − and + in half metres, and the number typed in («2,4» and
 * «2.4»). `onCommit` gets the new distance once it is valid and changed.
 */
export function DistanceField({
  value,
  disabled,
  onCommit,
  testId,
}: {
  value: number | null;
  disabled: boolean;
  onCommit: (distanceM: number | null) => void;
  testId: string;
}) {
  const text = useSideContestText();
  const t = useTranslations('holes.sideContest');
  const [typed, setTyped] = useState(value == null ? '' : text.formatDistance(value));
  const [editing, setEditing] = useState(false);
  // An answer from outside (saved, or a flight-mate's) stands in the field, but
  // not while the player types.
  const shown = editing ? typed : value == null ? '' : text.formatDistance(value);

  const step = (direction: -1 | 1) => {
    const next = stepDistance(value, direction);
    if (next != null) onCommit(next);
  };
  const commitTyped = () => {
    setEditing(false);
    const parsed = parseClaimDistance(typed);
    if (parsed.ok && parsed.distanceM !== value) onCommit(parsed.distanceM);
  };

  return (
    <div
      className="mt-2.5 rounded-2xl border border-border bg-surface px-3.5 py-1.5"
      data-testid={testId}
    >
      <div className={`flex items-center justify-between gap-2.5 ${disabled ? 'opacity-40' : ''}`}>
        <span className="text-sm leading-[18px] text-text">{t('distanceLabel')}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <StepButton
            plus={false}
            disabled={disabled || stepDistance(value, -1) == null}
            onPress={() => step(-1)}
            label={t('shorter')}
            testId={`${testId}-minus`}
          />
          <label className="flex w-16 items-baseline justify-center gap-[3px]">
            <input
              type="text"
              value={shown}
              disabled={disabled}
              onFocus={() => {
                setTyped(value == null ? '' : text.formatDistance(value));
                setEditing(true);
              }}
              onChange={(event) => setTyped(event.target.value)}
              onBlur={commitTyped}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              aria-label={t('metreField')}
              data-testid={`${testId}-input`}
              className="h-11 w-10 bg-transparent p-0 text-right font-serif text-[20px] leading-6 font-semibold text-text tabular-nums"
            />
            <span className="text-[13px] leading-4 text-muted">{t('metre')}</span>
          </label>
          <StepButton
            plus
            disabled={disabled || stepDistance(value, 1) == null}
            onPress={() => step(1)}
            label={t('longer')}
            testId={`${testId}-plus`}
          />
        </div>
      </div>
    </div>
  );
}
