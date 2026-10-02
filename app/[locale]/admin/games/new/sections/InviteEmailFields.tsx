'use client';

/**
 * «Inviter på e-post» on step 4 of the wizard (#2321, owner answer 2 on
 * 02.10: the organiser types an address in the wizard, and the invitation goes
 * out when the game is published). The addresses live in the wizard's state
 * until then; `FormDataInputs` sends the ones the format has room for, and the
 * publish actions hand them to `sendPublishInvites`.
 *
 * The whole wizard is one form: the field has no `name`, is `type="text"` (a
 * half-typed `type="email"` would stop the publish with the browser's own
 * check), and Enter adds the address instead of submitting.
 */

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { FormSection, FormSectionText } from '@/components/ui/FormSection';
import { Input } from '@/components/ui/Input';
import { MiniChip } from '@/components/ui/MiniChip';
import { isPlausibleInviteEmail, normalizeInviteEmail } from '@/lib/games/inviteEmail';
import type { GameFormState } from '../useGameFormState';

/** The open form under the grid. `room` = `inviteEmailRoom(...)`. */
export function InviteEmailForm({
  state,
  room,
  id,
}: {
  state: GameFormState;
  room: number;
  /** For the «✉ E-post» card's `aria-controls`. */
  id: string;
}) {
  const t = useTranslations('wizard.sections.players.email');
  const fieldId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  const email = normalizeInviteEmail(value);
  const canAdd =
    isPlausibleInviteEmail(email) &&
    !state.inviteEmails.includes(email) &&
    state.inviteEmails.length < room;

  function add() {
    if (!canAdd) return;
    state.addInviteEmail(email);
    setValue('');
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    add();
  }

  return (
    <FormSection id={id} legend={t('legend')}>
      <FormSectionText>{t('hint')}</FormSectionText>
      <Input
        ref={inputRef}
        variant="card"
        id={`${fieldId}-email`}
        label={t('label')}
        type="text"
        inputMode="email"
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <Button
        type="button"
        variant="outline"
        size="medium"
        onClick={add}
        disabled={!canAdd}
        className="w-full"
      >
        {t('add')}
      </Button>
    </FormSection>
  );
}

/**
 * The addresses so far. The first `room` go out at publish; the rest are
 * marked «Ikke plass» (a selected player always goes before an address) and
 * stay until the organiser removes them or frees a place.
 */
export function InviteEmailList({ state, room }: { state: GameFormState; room: number }) {
  const t = useTranslations('wizard.sections.players.email');
  if (state.inviteEmails.length === 0) return null;
  const overflow = state.inviteEmails.length > room;
  return (
    <FormSection
      variant="list"
      legend={t('listLegend')}
      description={overflow ? t('noRoomDescription') : undefined}
    >
      {state.inviteEmails.map((email, i) => {
        const noRoom = i >= room;
        return (
          <div key={email} className="flex min-h-[52px] items-center gap-2 py-1 pl-3.5 pr-1">
            <span
              className={`min-w-0 flex-1 truncate font-sans text-[15px] ${noRoom ? 'text-muted' : 'text-text'}`}
            >
              {email}
            </span>
            {noRoom && <MiniChip tone="neutral">{t('noRoom')}</MiniChip>}
            <button
              type="button"
              onClick={() => state.removeInviteEmail(email)}
              aria-label={t('removeAria', { email })}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl leading-none text-muted hover:bg-primary-soft"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        );
      })}
    </FormSection>
  );
}
