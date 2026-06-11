'use client';

import { useTranslations } from 'next-intl';
import type { PlayerOption } from '../GameForm';
import { PENDING_PLAYER_LABEL } from '../playerDisplay';

interface RoundRobinSetupProps {
  /**
   * Spillere i nåværende slottrekkefølge. Slot 1 (= første element) er A,
   * slot 2 er B osv. Alle permutasjoner gir identiske totaler (alle
   * partnerer alle uansett rekkefølge), så tildeling er kosmetisk.
   * Tom liste = brukeren har ikke valgt 4 spillere ennå.
   */
  roundRobinOrder: PlayerOption[];
  disabled?: boolean;
}

const SLOT_LABELS = ['A', 'B', 'C', 'D'] as const;

/**
 * Segmentpartnere for slot n (1-indeksert) i hvert 6-hulls-segment:
 * Segment 1 (hull 1–6):   A+B vs C+D
 * Segment 2 (hull 7–12):  A+C vs B+D
 * Segment 3 (hull 13–18): A+D vs B+C
 */
const PARTNER_BY_SLOT: Record<
  1 | 2 | 3 | 4,
  readonly [string, string, string]
> = {
  1: ['B', 'C', 'D'],
  2: ['A', 'D', 'C'],
  3: ['D', 'A', 'B'],
  4: ['C', 'B', 'A'],
};

/**
 * Round Robin-spesifikk konfig som vises i wizardens steg 2 når
 * game_mode='round_robin'.
 *
 * Viser de 4 valgte spillerne i slottrekkefølge (A/B/C/D) og rotasjons-
 * forklaringen (hvem du spiller med i hvert segment). Ingen gross/netto-
 * toggle — Round Robin bruker allowance_pct som rendes separat i
 * GameWizard, akkurat som fourball_matchplay.
 */
export function RoundRobinSetup({
  roundRobinOrder,
  disabled = false,
}: RoundRobinSetupProps) {
  const t = useTranslations('wizard.sections.roundRobin');
  const slots = [1, 2, 3, 4] as const;

  return (
    <fieldset
      className="space-y-5 rounded-md border border-border bg-surface px-4 py-4"
      disabled={disabled}
    >
      <legend className="px-1 text-sm font-semibold text-foreground">
        {t('legend')}
      </legend>

      <div>
        <p className="text-xs font-medium text-muted">{t('slotsLabel')}</p>
        <p className="mt-1 text-xs text-muted/80">
          {t('slotsDescription')}
        </p>
        <ul className="mt-3 space-y-2">
          {slots.map((slot) => {
            const player = roundRobinOrder[slot - 1];
            const label = SLOT_LABELS[slot - 1];
            const partners = PARTNER_BY_SLOT[slot];
            return (
              <li
                key={slot}
                data-testid={`round-robin-slot-${slot}`}
                className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 font-semibold tabular-nums text-primary">
                    {label}
                  </span>
                  <span
                    className={
                      player
                        ? 'font-medium text-foreground'
                        : 'italic text-muted/60'
                    }
                  >
                    {player ? playerLabel(player) : t('selectPlayerPlaceholder')}
                  </span>
                </div>
                <span className="text-muted">
                  {t('partnerLabel', { p1: partners[0], p2: partners[1], p3: partners[2] })}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted/80">
        <strong className="text-foreground">{t('rotationHeading')}</strong>{' '}
        {t('rotationSummary')}
      </div>
    </fieldset>
  );
}

function playerLabel(p: PlayerOption): string {
  return p.nickname || p.name || p.email || PENDING_PLAYER_LABEL;
}
