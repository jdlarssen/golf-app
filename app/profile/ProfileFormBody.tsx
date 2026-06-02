'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SegmentedField } from '@/components/ui/SegmentedField';
import { isHandicapStale } from '@/lib/handicap/staleness';
import { fromSignedHcp, formatGolfboxHcp } from '@/lib/handicap/sign';

type Gender = 'mens' | 'ladies';
type Level = 'junior' | 'normal' | 'senior';

type InitialValues = {
  name: string;
  nickname: string;
  /** Lagret (signert) hcp-index som streng, f.eks. «25.5» eller «-1.5», eller «». */
  hcpIndex: string;
  gender: Gender | null;
  level: Level;
};

type Props = {
  email: string;
  initial: InitialValues;
  /** ISO-streng for sist handicap-oppdatering, eller null. */
  handicapUpdatedAt?: string | null;
  action: (formData: FormData) => void;
  /**
   * Optional same-origin path the action should redirect to on success.
   * Already validated by `safeNextPath` upstream — rendered as a hidden input.
   */
  next?: string | null;
};

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

const GENDER_OPTIONS = [
  { value: 'mens', label: 'Herre' },
  { value: 'ladies', label: 'Dame' },
];
const LEVEL_OPTIONS = [
  { value: 'junior', label: 'Junior' },
  { value: 'normal', label: 'Voksen' },
  { value: 'senior', label: 'Senior' },
];

const INPUT_CLASS =
  'w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-text placeholder-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150';

/** Splitt lagret signert hcp-streng til magnitude-streng + plus-flagg. */
function splitInitialHcp(signed: string): { magnitude: string; isPlus: boolean } {
  const trimmed = signed.trim();
  if (trimmed === '') return { magnitude: '', isPlus: false };
  const parsed = Number.parseFloat(trimmed.replace(',', '.'));
  if (!Number.isFinite(parsed)) return { magnitude: '', isPlus: false };
  const { magnitude, isPlus } = fromSignedHcp(parsed);
  return { magnitude: String(magnitude), isPlus };
}

export function ProfileFormBody({
  email,
  initial,
  handicapUpdatedAt,
  action,
  next,
}: Props) {
  const initialHcp = useMemo(() => splitInitialHcp(initial.hcpIndex), [initial.hcpIndex]);

  const [name, setName] = useState(initial.name);
  const [nickname, setNickname] = useState(initial.nickname);
  const [magnitude, setMagnitude] = useState(initialHcp.magnitude);
  const [isPlus, setIsPlus] = useState(initialHcp.isPlus);
  const [gender, setGender] = useState<Gender | null>(initial.gender);
  const [level, setLevel] = useState<Level>(initial.level);

  // Golfprofil-feltene (kjønn/spillerklasse) ligger bak en disclosure for å
  // holde skjemaet kort. Åpen som standard når kjønn ennå ikke er satt, så
  // gender-soft-prompten (#kjonn-ankeret) treffer et synlig felt.
  const [showMore, setShowMore] = useState(initial.gender === null);

  useEffect(() => {
    function openIfKjonn() {
      if (window.location.hash === '#kjonn') {
        setShowMore(true);
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

  const dirty =
    name.trim() !== initial.name.trim() ||
    nickname.trim() !== initial.nickname.trim() ||
    magnitude.trim() !== initialHcp.magnitude.trim() ||
    isPlus !== initialHcp.isPlus ||
    gender !== initial.gender ||
    level !== initial.level;

  // Ferskhets-/bekreftelses-linja under hcp-raden. Når plusshandicap er på,
  // bekrefter vi hva som lagres (sikkerhetsnett mot stille feil-oppsett).
  const magnitudeNum = Number.parseFloat(magnitude.replace(',', '.'));
  const hasMagnitude = Number.isFinite(magnitudeNum);
  const stale = isHandicapStale(handicapUpdatedAt);
  const oppdatertDato =
    handicapUpdatedAt && !stale
      ? new Date(handicapUpdatedAt).toLocaleDateString('nb-NO', {
          day: 'numeric',
          month: 'long',
        })
      : null;

  return (
    <form action={action} className="space-y-3">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <Input
        id="name"
        name="name"
        type="text"
        label="Navn"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
        required
      />

      <div className="flex items-start gap-3">
        <div className="flex-1">
          <Input
            id="nickname"
            name="nickname"
            type="text"
            label="Kallenavn"
            placeholder="Valgfritt"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            autoComplete="nickname"
          />
        </div>
        <div className="w-[148px] shrink-0">
          <label
            htmlFor="hcp_index"
            className="block text-sm font-medium text-text mb-1.5"
          >
            Handicap
          </label>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setIsPlus((v) => !v)}
              aria-pressed={isPlus}
              aria-label="Plusshandicap"
              className={`flex min-h-[46px] w-11 shrink-0 items-center justify-center rounded-xl border text-lg font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                isPlus
                  ? 'border-primary bg-primary-soft text-text shadow-[inset_0_0_0_1px_var(--primary)]'
                  : 'border-border bg-surface text-muted hover:text-text'
              }`}
            >
              +
            </button>
            <input
              id="hcp_index"
              name="hcp_index"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              max={54}
              required
              value={magnitude}
              onChange={(e) => setMagnitude(e.target.value)}
              className={`${INPUT_CLASS} score-num min-w-0`}
            />
          </div>
        </div>
      </div>

      {/* Skjult flagg for plusshandicap — action regner ut signert verdi. */}
      <input type="hidden" name="hcp_plus" value={isPlus ? 'on' : ''} />

      {isPlus && hasMagnitude ? (
        <p className="-mt-1 text-xs text-muted">
          Lagres som{' '}
          <span className="font-medium text-text">
            {formatGolfboxHcp(magnitudeNum, true)}
          </span>{' '}
          · plusshandicap
        </p>
      ) : stale ? (
        <p className="-mt-1 text-xs text-warning">
          ⚠ Handicap ikke oppdatert på over en måned
        </p>
      ) : oppdatertDato ? (
        <p className="-mt-1 text-xs text-muted">
          Handicap oppdatert {oppdatertDato}
        </p>
      ) : null}

      <div className="border-t border-border/60 pt-3 dark:border-border/80">
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          aria-controls="profile-more-settings"
          className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
        >
          <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            Golfprofil
          </span>
          <DisclosureChevron open={showMore} />
        </button>

        <div
          id="profile-more-settings"
          className={showMore ? 'mt-3 space-y-5' : 'hidden'}
        >
          <SegmentedField
            id="kjonn"
            legend="Kjønn"
            options={GENDER_OPTIONS}
            value={gender}
            onChange={(v) => setGender(v as Gender)}
            hint="Brukes til å foreslå riktig tee og beregne course handicap."
          />
          <input type="hidden" name="gender" value={gender ?? ''} />

          <SegmentedField
            legend="Spillerklasse"
            options={LEVEL_OPTIONS}
            value={level}
            onChange={(v) => setLevel(v as Level)}
            hint="Junior gir juniortee. Senior er en info-tag for nå."
          />
          <input type="hidden" name="level" value={level} />
        </div>
      </div>

      <p className="border-t border-border/60 pt-3 text-xs text-muted dark:border-border/80">
        E-post: <span className="text-text">{email}</span> · kan ikke endres
      </p>

      <div className="pt-2">
        <SaveButton dirty={dirty} />
      </div>
    </form>
  );
}
