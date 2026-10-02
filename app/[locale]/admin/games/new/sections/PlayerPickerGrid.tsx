'use client';

/**
 * «Hvem skal spille?» on step 4 of the wizard (#2321), drawn as the artboard
 * `Spillere-forslag`: a search field, the players as cards in four columns
 * (three under 360 px), the dashed «+ Gjest» and «✉ E-post» cards and the hint.
 * The tray at the bottom is `PlayerTray`.
 *
 * - The cards are the picker source (`selectableIds`: friends, club members or
 *   everyone, plus this session's guests) and everyone already selected, in the
 *   server's order: you first, then the people you last played with.
 * - A tap selects, another removes; a card never leaves the grid on a tap.
 *   While the search has text only the matching cards show, selected or not.
 * - Each card is a `<label>` around a visually hidden checkbox, so the focus
 *   ring rule from #2240 draws on the card. At `cap` the cards that are not
 *   selected are disabled and greyed; a selected card can always be removed.
 * - «+ Gjest» opens the guest form and «✉ E-post» the e-mail form under the
 *   grid, one at a time. Both are local state.
 */

import { useRef, useState, type Ref } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { choiceStateClass } from '@/components/ui/ChoiceCard';
import { FormSection } from '@/components/ui/FormSection';
import { GuestBadge } from '@/components/ui/GuestBadge';
import { MiniChip } from '@/components/ui/MiniChip';
import { firstName } from '@/lib/firstName';
import { formatHcpDisplay } from '@/lib/handicap/signFormat';
import { nameInitials } from '@/lib/names/initials';
import { inviteEmailRoom } from '@/lib/wizard/playerTarget';
import type { PickerSource } from '@/lib/wizard/selectablePlayers';
import type { PlayerOption } from '../GameForm';
import { playerMatchesSearch, type GameFormState } from '../useGameFormState';
import { GuestPlayerFields } from './GuestPlayerAdd';
import { InviteEmailForm, InviteEmailList } from './InviteEmailFields';
import { playerOptionLabel } from './playerLabels';

/** More player cards than this fold away behind «Vis alle {n}». */
export const PICKER_COLLAPSED_CARDS = 16;

const KICKER = {
  friends: 'kickerFriends',
  club: 'kickerClub',
  all: 'kickerAll',
} as const;

function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

const CARD_BASE =
  'relative flex min-h-[92px] flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-center transition-colors duration-150';

export function PlayerPickerGrid({
  state,
  selectableIds,
  source,
  cap,
  allowEmail,
}: {
  state: GameFormState;
  selectableIds: ReadonlySet<string>;
  source: PickerSource;
  /** `pickerCap`: where the rest of the cards grey out. `null` = no ceiling. */
  cap: number | null;
  /** False in a cup match: invitations are only sent without a cup link. */
  allowEmail: boolean;
}) {
  const t = useTranslations('wizard.sections.players');
  const locale = useLocale();
  const pendingLabel = t('pendingLabel');
  const [openForm, setOpenForm] = useState<'guest' | 'email' | null>(null);
  const [showAll, setShowAll] = useState(false);
  const tGuest = useTranslations('game.players');
  // Focus goes back to «+ Gjest» once the added guest closes the form.
  const guestButtonRef = useRef<HTMLButtonElement>(null);

  const selected = new Set(state.selectedPlayerIds);
  const sessionGuests = new Set(state.extraPlayers.map((g) => g.id));
  const atCap = cap !== null && state.selectedPlayerIds.length >= cap;
  const room = inviteEmailRoom({ cap, selected: state.selectedPlayerIds.length });
  const query = state.playerSearch;
  const searching = query.trim() !== '';

  const eligible = state.allPlayers.filter((p) => selectableIds.has(p.id) || selected.has(p.id));
  const matching = eligible.filter((p) => playerMatchesSearch(p, query));
  // Folded: the first 16, plus every selected player and session guest past
  // them, so a choice is never hidden. A search always shows every match.
  const folded = !searching && !showAll && eligible.length > PICKER_COLLAPSED_CARDS;
  const cards = folded
    ? eligible.filter(
        (p, i) => i < PICKER_COLLAPSED_CARDS || selected.has(p.id) || sessionGuests.has(p.id),
      )
    : matching;

  const guestFormId = 'wizard-guest-form';
  const emailFormId = 'wizard-email-form';

  function toggleForm(form: 'guest' | 'email') {
    setOpenForm((cur) => (cur === form ? null : form));
  }

  function card(p: PlayerOption) {
    const isSelected = selected.has(p.id);
    const disabled = !isSelected && atCap;
    const name = p.pending ? pendingLabel : (firstName(p.name) ?? pendingLabel);
    return (
      <li key={p.id} className="min-w-0">
        <label
          className={`${CARD_BASE} ${choiceStateClass(isSelected)} ${
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
          }`}
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={isSelected}
            disabled={disabled}
            onChange={() => state.togglePlayer(p.id)}
            aria-label={`${playerOptionLabel(p, pendingLabel, locale)}${p.pending ? t('pendingPlayerAriaNote') : ''}`}
          />
          <span
            aria-hidden="true"
            className={`flex h-10 w-10 items-center justify-center rounded-full font-sans text-[13px] font-semibold leading-none ${
              isSelected ? 'bg-surface-strong text-bg-tint' : 'bg-hole-completed-bg text-muted'
            }`}
          >
            {nameInitials(p.pending ? null : p.name)}
          </span>
          <span
            aria-hidden="true"
            className="max-w-full truncate px-0.5 font-sans text-xs font-semibold leading-[normal] text-text"
          >
            {name}
          </span>
          {p.pending ? (
            <MiniChip tone="waiting">{t('waitingChip')}</MiniChip>
          ) : (
            <span
              aria-hidden="true"
              className="font-sans text-[10px] leading-[normal] tabular-nums text-muted"
            >
              {t('grid.hcp', { hcp: formatHcpDisplay(p.hcp_index, locale) })}
            </span>
          )}
          {p.isGuest && <GuestBadge />}
          {isSelected && (
            <span
              aria-hidden="true"
              className="absolute right-1.5 top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-primary text-[11px] leading-none text-white dark:text-bg"
            >
              ✓
            </span>
          )}
        </label>
      </li>
    );
  }

  function dashedCard({
    form,
    icon,
    iconClass,
    label,
    ariaLabel,
    controls,
    ref,
  }: {
    form: 'guest' | 'email';
    icon: string;
    iconClass: string;
    label: string;
    ariaLabel: string;
    controls: string;
    ref?: Ref<HTMLButtonElement>;
  }) {
    const open = openForm === form;
    return (
      <li className="min-w-0">
        <button
          ref={ref}
          type="button"
          aria-expanded={open}
          aria-controls={controls}
          aria-label={ariaLabel}
          disabled={atCap && !open}
          onClick={() => toggleForm(form)}
          className={`${CARD_BASE} w-full font-sans text-primary disabled:cursor-not-allowed disabled:opacity-50 ${
            open ? choiceStateClass(true) : 'border border-dashed border-slot-dashed bg-transparent'
          }`}
        >
          <span aria-hidden="true" className={`leading-none ${iconClass}`}>
            {icon}
          </span>
          <span aria-hidden="true" className="text-xs font-semibold leading-[normal]">
            {label}
          </span>
        </button>
      </li>
    );
  }

  return (
    <div>
      <div className="relative mt-3">
        <span className="pointer-events-none absolute left-[13px] top-1/2 flex -translate-y-1/2 text-muted">
          <SearchIcon />
        </span>
        <label htmlFor="player_search" className="sr-only">
          {t('searchLabel')}
        </label>
        <input
          id="player_search"
          type="search"
          value={query}
          onChange={(e) => state.setPlayerSearch(e.target.value)}
          placeholder={t('grid.searchPlaceholder')}
          autoComplete="off"
          className="h-12 w-full rounded-xl border border-field-border bg-surface pl-[38px] pr-3 font-sans text-base text-text placeholder:text-muted"
        />
      </div>

      <FormSection variant="bare" legendSpacing="tight" legend={t(`grid.${KICKER[source]}`)}>
        {searching && matching.length === 0 && (
          <p className="px-1 pb-2 font-sans text-xs leading-[normal] text-muted">
            {t('noSearchResults')}
          </p>
        )}
        <ul className="grid grid-cols-3 gap-2 min-[360px]:grid-cols-4">
          {cards.map(card)}
          {dashedCard({
            form: 'guest',
            icon: '+',
            iconClass: 'text-[22px]',
            label: t('grid.guest'),
            ariaLabel: t('grid.guestAria'),
            controls: guestFormId,
            ref: guestButtonRef,
          })}
          {allowEmail &&
            dashedCard({
              form: 'email',
              icon: '✉',
              iconClass: 'text-lg',
              label: t('grid.email'),
              ariaLabel: t('grid.emailAria'),
              controls: emailFormId,
            })}
        </ul>
        {folded && (
          <div className="pt-2.5">
            <Button type="button" variant="secondary" size="chip" onClick={() => setShowAll(true)}>
              {t('grid.showAll', { count: eligible.length })}
            </Button>
          </div>
        )}
      </FormSection>

      <p className="px-1 pt-2.5 font-sans text-xs leading-[normal] text-muted">
        {allowEmail ? t('grid.hint') : t('grid.hintCup')}
      </p>

      {openForm === 'guest' && (
        <FormSection variant="bare" legend={tGuest('guestForm.sectionHeading')}>
          <GuestPlayerFields
            id={guestFormId}
            state={state}
            disabled={atCap}
            onAdded={() => {
              setOpenForm(null);
              guestButtonRef.current?.focus();
            }}
          />
        </FormSection>
      )}
      {allowEmail && openForm === 'email' && (
        <InviteEmailForm state={state} room={room} id={emailFormId} />
      )}
      {allowEmail && <InviteEmailList state={state} room={room} />}
    </div>
  );
}
