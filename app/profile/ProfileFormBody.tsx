'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useFormStatus } from 'react-dom';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';

type InitialValues = {
  name: string;
  nickname: string;
  hcpIndex: string;
};

type Props = {
  email: string;
  initial: InitialValues;
  action: (formData: FormData) => void;
};

/**
 * Save button gated on two flags:
 * - `dirty`: the form values differ from what was loaded from the server.
 * - `pending` (from useFormStatus): the action is in flight after submit.
 * The label flips to 'Lagrer …' while pending so the user sees something
 * happening and doesn't tap twice.
 */
function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || !dirty}>
      {pending ? 'Lagrer …' : 'Lagre'}
    </Button>
  );
}

export function ProfileFormBody({ email, initial, action }: Props) {
  const [dirty, setDirty] = useState(false);
  const initialRef = useRef(initial);

  function recomputeDirty(form: HTMLFormElement) {
    const fd = new FormData(form);
    const cur = {
      name: String(fd.get('name') ?? '').trim(),
      nickname: String(fd.get('nickname') ?? '').trim(),
      hcpIndex: String(fd.get('hcp_index') ?? '').trim(),
    };
    const base = initialRef.current;
    setDirty(
      cur.name !== base.name.trim() ||
        cur.nickname !== base.nickname.trim() ||
        cur.hcpIndex !== base.hcpIndex.trim(),
    );
  }

  function handleChange(e: FormEvent<HTMLFormElement>) {
    recomputeDirty(e.currentTarget);
  }

  return (
    <form action={action} onChange={handleChange} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text mb-1.5">
          E-post
        </label>
        <p className="text-sm text-text">{email}</p>
        <p className="text-xs text-muted mt-1.5">
          E-post kan ikke endres her.
        </p>
      </div>

      <Input
        id="name"
        name="name"
        type="text"
        label="Navn"
        defaultValue={initial.name}
        autoComplete="name"
        required
      />

      <Input
        id="nickname"
        name="nickname"
        type="text"
        label="Kallenavn"
        hint="Valgfritt — det navnet folk kjenner deg som på banen"
        defaultValue={initial.nickname}
        autoComplete="nickname"
      />

      <Input
        id="hcp_index"
        name="hcp_index"
        type="number"
        label="Handicap-index"
        hint="Tallet du har i Golfbox akkurat nå"
        step="0.1"
        min={-10}
        max={54.0}
        defaultValue={initial.hcpIndex}
        required
        inputMode="decimal"
        inputClassName="score-num"
      />

      <div className="flex items-center gap-3 pt-2">
        <SaveButton dirty={dirty} />
        <SmartLink
          href="/"
          className="text-sm text-muted hover:text-text transition-colors"
        >
          Avbryt
        </SmartLink>
      </div>
    </form>
  );
}
