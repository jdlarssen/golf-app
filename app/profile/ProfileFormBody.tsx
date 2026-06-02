'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useFormStatus } from 'react-dom';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

type InitialValues = {
  name: string;
  nickname: string;
  hcpIndex: string;
  /** True når brukeren IKKE er meldt av månedsbrevet (product-updates). */
  productUpdatesOptIn: boolean;
  gender: 'mens' | 'ladies' | null;
  level: 'junior' | 'normal' | 'senior';
};

type Props = {
  email: string;
  initial: InitialValues;
  action: (formData: FormData) => void;
  /**
   * Optional same-origin path the action should redirect to on success.
   * Already validated by `safeNextPath` upstream — rendered as a hidden
   * input so the action picks it up from FormData.
   */
  next?: string | null;
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

function DisclosureChevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-4 w-4 shrink-0 text-muted transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ProfileFormBody({ email, initial, action, next }: Props) {
  const [dirty, setDirty] = useState(false);
  // Sjelden-endrede felt (kjønn, spillerklasse, månedsbrev) ligger bak en
  // disclosure for å holde skjemaet kort. Åpen som standard når kjønn ennå
  // ikke er satt, så gender-soft-prompten (#kjonn-ankeret) treffer et synlig
  // felt. Innholdet skjules med `hidden` (ikke unmount) så verdiene fortsatt
  // sendes med ved lagring — ellers ville en kollapset bruker tape gender.
  const [showMore, setShowMore] = useState(initial.gender === null);
  const initialRef = useRef(initial);

  useEffect(() => {
    function openIfKjonn() {
      if (window.location.hash === '#kjonn') {
        setShowMore(true);
        // Re-scroll etter at seksjonen er foldet ut (ankeret rakk å scrolle
        // mens elementet fortsatt var display:none).
        setTimeout(() => {
          document
            .getElementById('kjonn')
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 0);
      }
    }
    openIfKjonn();
    window.addEventListener('hashchange', openIfKjonn);
    return () => window.removeEventListener('hashchange', openIfKjonn);
  }, []);

  function recomputeDirty(form: HTMLFormElement) {
    const fd = new FormData(form);
    const cur = {
      name: String(fd.get('name') ?? '').trim(),
      nickname: String(fd.get('nickname') ?? '').trim(),
      hcpIndex: String(fd.get('hcp_index') ?? '').trim(),
      productUpdatesOptIn: fd.get('product_updates_opt_in') === 'on',
      gender: (fd.get('gender') as string | null) ?? null,
      level: (fd.get('level') as string | null) ?? null,
    };
    const base = initialRef.current;
    setDirty(
      cur.name !== base.name.trim() ||
        cur.nickname !== base.nickname.trim() ||
        cur.hcpIndex !== base.hcpIndex.trim() ||
        cur.productUpdatesOptIn !== base.productUpdatesOptIn ||
        cur.gender !== base.gender ||
        cur.level !== base.level,
    );
  }

  function handleChange(e: FormEvent<HTMLFormElement>) {
    recomputeDirty(e.currentTarget);
  }

  return (
    <form action={action} onChange={handleChange} className="space-y-3">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <label className="block text-sm font-medium text-text mb-1">
          E-post
        </label>
        <p className="text-sm text-text">{email}</p>
        <p className="text-xs text-muted mt-1">E-post kan ikke endres her.</p>
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
        hint="Valgfritt — navnet folk kjenner deg som på banen"
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

      <div className="border-t border-border/60 pt-3 dark:border-border/80">
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          aria-controls="profile-more-settings"
          className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
        >
          <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            Flere innstillinger
          </span>
          <DisclosureChevron open={showMore} />
        </button>

        <div
          id="profile-more-settings"
          className={showMore ? 'mt-3 space-y-5' : 'hidden'}
        >
          <fieldset id="kjonn">
            <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              Kjønn
            </legend>
            <div className="mt-2 flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="gender"
                  value="mens"
                  defaultChecked={initial.gender === 'mens'}
                />
                <span className="font-serif text-base text-text">Herre</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="gender"
                  value="ladies"
                  defaultChecked={initial.gender === 'ladies'}
                />
                <span className="font-serif text-base text-text">Dame</span>
              </label>
            </div>
            <p className="mt-1 text-xs text-muted">
              Brukes til å foreslå riktig tee og beregne course handicap riktig.
            </p>
          </fieldset>

          <fieldset>
            <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              Spillerklasse
            </legend>
            <div className="mt-2 flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="level"
                  value="junior"
                  defaultChecked={initial.level === 'junior'}
                />
                <span className="font-serif text-base text-text">Junior</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="level"
                  value="normal"
                  defaultChecked={initial.level === 'normal'}
                />
                <span className="font-serif text-base text-text">Voksen</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="level"
                  value="senior"
                  defaultChecked={initial.level === 'senior'}
                />
                <span className="font-serif text-base text-text">Senior</span>
              </label>
            </div>
            <p className="mt-1 text-xs text-muted">
              Junior gir juniortee når banen har en. Senior er en informasjons-tag for nå.
            </p>
          </fieldset>

          <div>
            <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted mb-2">
              Mail-innstillinger
            </p>
            <label className="flex items-start gap-3 cursor-pointer min-h-11">
              <input
                type="checkbox"
                name="product_updates_opt_in"
                defaultChecked={initial.productUpdatesOptIn}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-border text-primary focus:ring-2 focus:ring-primary/30"
              />
              <span className="font-sans text-sm leading-snug text-text">
                Få månedsbrev fra Tørny med oppsummering av nye funksjoner.
                <span className="block text-xs text-muted mt-0.5">
                  Maks én mail per måned. Du kan melde deg av når som helst.
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <SaveButton dirty={dirty} />
      </div>
    </form>
  );
}
