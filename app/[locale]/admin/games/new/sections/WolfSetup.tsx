'use client';

import { useTranslations } from 'next-intl';
import type { PlayerOption } from '../GameForm';

export type WolfScoring = 'gross' | 'net';

interface WolfSetupProps {
  scoring: WolfScoring;
  onScoringChange: (next: WolfScoring) => void;
  /**
   * Spillere i nåværende rotasjonsrekkefølge. Slot 1 (= første element) er
   * Wolf på hull 1, n+1, 2n+1 … Tom liste (eller <3) = brukeren har ikke valgt
   * nok spillere ennå, og preview-en viser en hint i stedet for slots.
   */
  wolfOrder: PlayerOption[];
  /**
   * Trigger random permutasjon av wolfOrder. Disablet når antall valgte
   * spillere ikke er 3-5 (#465).
   */
  onShuffle: () => void;
  disabled?: boolean;
}

/**
 * Hull-fordeling for en rotation-slot (#465). n = antall spillere (3-5),
 * R = floor(18/n)*n er siste rotasjons-hull. Slot s er Wolf på hull s, s+n,
 * s+2n … ≤ R. Resten (R+1..18) er trailing-wolf, vist som egen note.
 */
function holesForSlot(slot: number, n: number, R: number): number[] {
  const holes: number[] = [];
  for (let h = slot; h <= R; h += n) holes.push(h);
  return holes;
}

/**
 * Wolf-spesifikk konfig som vises i wizardens step 2 når game_mode='wolf'.
 *
 * To kontroller:
 *  - Scoring-toggle: 'Med handicap (netto)' vs 'Brutto'. Default netto.
 *  - Rotasjons-shuffle: viser de 3-5 valgte spillerne i rekkefølge, med
 *    badge for hvilke hull de er Wolf på. Knapp re-randomiserer.
 *
 * Hull etter R (= floor(18/n)*n) vises som "trailing-wolf" — spilleren med
 * lavest poeng-total etter forrige hull blir Wolf. Det avgjøres runtime og er
 * ikke en del av shuffle-state. Med 3 spillere er R=18, så ingen trailing.
 */
export function WolfSetup({
  scoring,
  onScoringChange,
  wolfOrder,
  onShuffle,
  disabled = false,
}: WolfSetupProps) {
  const t = useTranslations('wizard.sections.wolf');
  const tPlayers = useTranslations('wizard.sections.players');
  const pendingLabel = tPlayers('pendingLabel');

  function playerLabel(p: PlayerOption): string {
    return p.nickname || p.name || p.email || pendingLabel;
  }
  const n = wolfOrder.length;
  const hasRotation = n >= 3 && n <= 5;
  const R = hasRotation ? Math.floor(18 / n) * n : 0;
  const slots = hasRotation
    ? Array.from({ length: n }, (_, i) => i + 1)
    : [];
  const canShuffle = !disabled && hasRotation;

  return (
    <fieldset className="space-y-5 rounded-md border border-border bg-surface px-4 py-4">
      <legend className="px-1 text-sm font-semibold text-foreground">
        {t('legend')}
      </legend>

      <div>
        <p className="text-xs font-medium text-muted">{t('scoringLabel')}</p>
        <p className="mt-1 text-xs text-muted/80">
          {t('scoringDescription')}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('scoringAriaLabel')}>
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
            {t('scoringNet')}
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
            {t('scoringGross')}
          </label>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted">{t('rotationLabel')}</p>
          <button
            type="button"
            onClick={onShuffle}
            disabled={!canShuffle}
            data-testid="wolf-shuffle"
            className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-foreground transition enabled:hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('shuffleButton')}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted/80">
          {t('rotationHint')}
        </p>
        {hasRotation ? (
          <>
            <ul className="mt-3 space-y-2">
              {slots.map((slot) => {
                const player = wolfOrder[slot - 1];
                const holes = holesForSlot(slot, n, R).join(', ');
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
                      <span className="font-medium text-foreground">
                        {player ? playerLabel(player) : t('selectPlayerPlaceholder')}
                      </span>
                    </div>
                    <span className="tabular-nums text-muted">
                      {t('hullLabel', { holes })}
                    </span>
                  </li>
                );
              })}
            </ul>
            {R < 18 && (
              <p
                data-testid="wolf-trailing-note"
                className="mt-2 text-xs text-muted/80"
              >
                {t('trailingNote', { from: R + 1 })}
              </p>
            )}
          </>
        ) : (
          <p
            data-testid="wolf-rotation-hint"
            className="mt-3 rounded-md border border-dashed border-border bg-surface-2 px-3 py-3 text-xs italic text-muted/70"
          >
            {t('rotationEmptyHint')}
          </p>
        )}
      </div>
    </fieldset>
  );
}

