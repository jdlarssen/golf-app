'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import {
  registerForOpenGame,
  requestApproval,
  type ActionError,
  type ActionResult,
} from './actions';

type Mode = 'open' | 'manual_approval';

const ERROR_MESSAGES: Record<ActionError, string> = {
  not_authed: 'Du må logge inn for å melde deg på.',
  profile_incomplete: 'Du må fylle inn profilen din først.',
  game_not_found: 'Fant ikke spillet. Lenken kan være feil.',
  wrong_mode: 'Påmelding er ikke åpen for dette spillet.',
  game_locked: 'Spillet er startet eller avsluttet — påmelding er stengt.',
  already_registered: 'Du er allerede påmeldt dette spillet.',
  already_requested: 'Du har allerede sendt en forespørsel.',
  message_too_long: 'Hilsenen er for lang (maks 200 tegn).',
  team_not_supported_yet:
    'Lag-påmelding kommer i neste versjon. Be arrangøren om å invitere deg direkte i mellomtiden.',
  rate_limited:
    'Du har gjort for mange påmeldinger den siste tida. Prøv igjen senere.',
  db_error: 'Klarte ikke å fullføre handlingen. Prøv igjen om litt.',
  bad_side: 'Velg hvilken side du vil spille på.',
  side_full: 'Siden ble nettopp full. Velg den andre siden.',
  game_full: 'Spillet er fullt — alle plassene er tatt.',
};

const MESSAGE_MAX = 200;

/** Side-data sendt ned fra serveren for matchplay åpne spill. */
export type MatchplaySideData = {
  teamSize: number;
  side1: { count: number; playerNames: string[] };
  side2: { count: number; playerNames: string[] };
};

export function RegistrationForm({
  mode,
  shortId,
  sideData = null,
}: {
  mode: Mode;
  shortId: string;
  sideData?: MatchplaySideData | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [message, setMessage] = useState('');
  const [selectedSide, setSelectedSide] = useState<1 | 2 | null>(null);

  // Dersom bare én side har ledig plass, forhåndsvelg den.
  // Kalles kun én gang ved montering (stale fra parent server-render er OK).
  const [autoSelected] = useState<1 | 2 | null>(() => {
    if (!sideData || mode !== 'open') return null;
    const side1Full = sideData.side1.count >= sideData.teamSize;
    const side2Full = sideData.side2.count >= sideData.teamSize;
    if (!side1Full && side2Full) return 1;
    if (side1Full && !side2Full) return 2;
    return null;
  });

  // Bruk autoSelected som initial verdi hvis ingenting er eksplisitt valgt
  const activeSide = selectedSide ?? autoSelected;

  const handleSubmit = (form: HTMLFormElement) => {
    const data = new FormData(form);
    data.set('shortId', shortId);
    if (sideData && mode === 'open' && activeSide) {
      data.set('side', String(activeSide));
    }
    startTransition(async () => {
      const action =
        mode === 'open' ? registerForOpenGame : requestApproval;
      const res = await action(data);
      setResult(res);
    });
  };

  // Manual-approval suksess viser kvittering i stedet for form. Open-mode
  // suksess redirecter via server-action, så vi når aldri hit i den grenen.
  if (result?.ok && mode === 'manual_approval') {
    return (
      <Banner tone="success">
        Forespørsel sendt — arrangøren får varsel og bestemmer seg så snart
        de kan. Du får beskjed via varsel og mail.
      </Banner>
    );
  }

  const errorMessage =
    result && !result.ok ? ERROR_MESSAGES[result.error] : null;

  // ── Side-velger for åpne matchplay-spill ──────────────────────────────
  if (sideData && mode === 'open') {
    const side1Full = sideData.side1.count >= sideData.teamSize;
    const side2Full = sideData.side2.count >= sideData.teamSize;
    const bothFull = side1Full && side2Full;

    if (bothFull) {
      return (
        <Banner tone="warning">
          Spillet er fullt — alle plassene er tatt.
        </Banner>
      );
    }

    const spotsLabel = (count: number): string => {
      const spots = sideData.teamSize - count;
      return spots === 1 ? '1 plass igjen' : `${spots} plasser igjen`;
    };

    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(e.currentTarget);
        }}
        className="space-y-4"
      >
        {/* Honeypot */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          aria-hidden="true"
          autoComplete="off"
          className="absolute left-[-9999px] h-0 w-0 opacity-0"
        />

        <p className="font-sans text-sm leading-relaxed text-text">
          Velg hvilken side du vil spille på.
        </p>

        {/* Side-kort: to kort side ved side */}
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Velg side">
          {([1, 2] as const).map((sideNum) => {
            const sideInfo = sideNum === 1 ? sideData.side1 : sideData.side2;
            const isFull = sideInfo.count >= sideData.teamSize;
            const isActive = activeSide === sideNum;

            return (
              <button
                key={sideNum}
                type="button"
                role="radio"
                aria-checked={isActive}
                disabled={isFull}
                onClick={() => setSelectedSide(sideNum)}
                className={[
                  'flex flex-col items-start rounded-2xl border-2 p-4 text-left transition-colors',
                  'min-h-[44px]', // tap-target
                  isFull
                    ? 'border-border bg-surface opacity-40 cursor-not-allowed'
                    : isActive
                    ? 'border-primary bg-primary/5 cursor-pointer'
                    : 'border-border bg-surface hover:border-primary/50 cursor-pointer',
                ].join(' ')}
              >
                <span className="font-serif text-[17px] font-medium tracking-[-0.01em] text-text">
                  Side {sideNum}
                </span>
                {sideInfo.playerNames.length > 0 && (
                  <span className="mt-1 font-sans text-xs text-muted">
                    {sideInfo.playerNames.join(', ')}
                  </span>
                )}
                <span className="mt-1.5 font-sans text-[11px] tabular-nums text-muted">
                  {isFull ? 'Full' : spotsLabel(sideInfo.count)}
                </span>
              </button>
            );
          })}
        </div>

        {errorMessage && <Banner tone="error">{errorMessage}</Banner>}

        <Button
          type="submit"
          disabled={activeSide === null}
          pending={isPending}
          pendingLabel="Melder deg på …"
          className="w-full"
        >
          Meld meg på
        </Button>
      </form>
    );
  }

  // ── Standard form (solo-modi eller manual_approval) ───────────────────
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit(e.currentTarget);
      }}
      className="space-y-4"
    >
      {/* Honeypot — skjult fra ekte brukere via aria-hidden + tabIndex.
          Form-filling bots populerer felt med plausible navn (website,
          url, homepage). Server-action short-circuiter til success-shape
          uten DB-write hvis dette har verdi. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      {mode === 'manual_approval' && (
        <label className="block">
          <span className="mb-1.5 block font-sans text-xs font-medium tracking-tight text-muted">
            Valgfri hilsen til arrangøren
          </span>
          <textarea
            name="message"
            rows={3}
            maxLength={MESSAGE_MAX}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="«Hei! Jeg er kompis av Per — håper det er plass.»"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm tracking-tight text-text placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <span className="mt-1 block text-right font-sans text-[11px] tabular-nums text-muted">
            {message.length}/{MESSAGE_MAX}
          </span>
        </label>
      )}

      {errorMessage && <Banner tone="error">{errorMessage}</Banner>}

      <Button
        type="submit"
        pending={isPending}
        pendingLabel={mode === 'open' ? 'Melder deg på …' : 'Sender forespørsel …'}
        className="w-full"
      >
        {mode === 'open' ? 'Meld meg på' : 'Send forespørsel'}
      </Button>
    </form>
  );
}
