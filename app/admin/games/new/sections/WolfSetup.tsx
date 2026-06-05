'use client';

import type { PlayerOption } from '../GameForm';
import { PENDING_PLAYER_LABEL } from '../playerDisplay';

export type WolfScoring = 'gross' | 'net';

interface WolfSetupProps {
  scoring: WolfScoring;
  onScoringChange: (next: WolfScoring) => void;
  /**
   * Spillere i nåværende rotasjonsrekkefølge. Slot 1 (= første element) er
   * Wolf på hull 1, 5, 9, 13. Tom liste = brukeren har ikke valgt 4 spillere
   * ennå, og preview-en viser placeholder-rader.
   */
  wolfOrder: PlayerOption[];
  /**
   * Trigger random permutasjon av wolfOrder. Disablet når selectedPlayers
   * !== 4 (ingenting å shuffle med).
   */
  onShuffle: () => void;
  disabled?: boolean;
}

const SLOT_HOLES: Record<number, string> = {
  1: '1, 5, 9, 13',
  2: '2, 6, 10, 14',
  3: '3, 7, 11, 15',
  4: '4, 8, 12, 16',
};

/**
 * Wolf-spesifikk konfig som vises i wizardens step 2 når game_mode='wolf'.
 *
 * To kontroller:
 *  - Scoring-toggle: 'Med handicap (netto)' vs 'Brutto'. Default netto.
 *  - Rotasjons-shuffle: viser de 4 valgte spillerne i rekkefølge, med
 *    badge for hvilke hull de er Wolf på. Knapp re-randomiserer.
 *
 * Hull 17 og 18 vises som "trailing-wolf" — spilleren med lavest poeng-
 * total etter forrige hull blir Wolf. Det avgjøres runtime og er ikke
 * en del av shuffle-state.
 */
export function WolfSetup({
  scoring,
  onScoringChange,
  wolfOrder,
  onShuffle,
  disabled = false,
}: WolfSetupProps) {
  const slots = [1, 2, 3, 4] as const;
  const canShuffle = !disabled && wolfOrder.length === 4;

  return (
    <fieldset className="space-y-5 rounded-md border border-border bg-surface px-4 py-4">
      <legend className="px-1 text-sm font-semibold text-foreground">
        Wolf-oppsett
      </legend>

      <div>
        <p className="text-xs font-medium text-muted">Scoring</p>
        <p className="mt-1 text-xs text-muted/80">
          Velger om Wolf-scoringen bruker spillernes handicap-strokes, eller
          om beste rene gross-slag avgjør hvert hull.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Wolf-scoring">
          <label
            className={`flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-xs font-medium transition ${
              scoring === 'net'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface-2 text-muted hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="wolf_scoring"
              value="net"
              checked={scoring === 'net'}
              onChange={() => onScoringChange('net')}
              disabled={disabled}
              className="sr-only"
            />
            Med handicap (netto)
          </label>
          <label
            className={`flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-xs font-medium transition ${
              scoring === 'gross'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface-2 text-muted hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="wolf_scoring"
              value="gross"
              checked={scoring === 'gross'}
              onChange={() => onScoringChange('gross')}
              disabled={disabled}
              className="sr-only"
            />
            Brutto
          </label>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted">Wolf-rotasjon</p>
          <button
            type="button"
            onClick={onShuffle}
            disabled={!canShuffle}
            data-testid="wolf-shuffle"
            className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-foreground transition enabled:hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Shuffle
          </button>
        </div>
        <p className="mt-1 text-xs text-muted/80">
          Velg 4 spillere først, så trekker du rotasjonen. Hull 17 og 18 går til
          spilleren som ligger sist på poeng-totalen — det avgjøres underveis.
        </p>
        <ul className="mt-3 space-y-2">
          {slots.map((slot) => {
            const player = wolfOrder[slot - 1];
            return (
              <li
                key={slot}
                data-testid={`wolf-slot-${slot}`}
                className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 font-semibold tabular-nums text-primary">
                    {slot}
                  </span>
                  <span
                    className={
                      player
                        ? 'font-medium text-foreground'
                        : 'italic text-muted/60'
                    }
                  >
                    {player ? playerLabel(player) : 'Velg en spiller'}
                  </span>
                </div>
                <span className="tabular-nums text-muted">
                  Hull {SLOT_HOLES[slot]}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </fieldset>
  );
}

function playerLabel(p: PlayerOption): string {
  return p.nickname || p.name || p.email || PENDING_PLAYER_LABEL;
}
