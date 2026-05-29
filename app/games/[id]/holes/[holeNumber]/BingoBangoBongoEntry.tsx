'use client';

import { useState, type CSSProperties, type JSX } from 'react';
import { setBingoBangoBongoHole } from '@/lib/bbb/setBingoBangoBongoHole';
import type { BingoBangoBongoHoleInput } from '@/lib/scoring/modes/types';

export interface BingoBangoBongoEntryPlayer {
  userId: string;
  name: string;
}

export interface BingoBangoBongoEntryProps {
  gameId: string;
  holeNumber: number;
  /** 2–4 flight-spillere med id + visningsnavn. */
  players: BingoBangoBongoEntryPlayer[];
  /** Gjeldende lagrede verdier for hullet — null betyr ingen rad finnes ennå. */
  savedHole: BingoBangoBongoHoleInput | null;
  /** True når spillet er avsluttet — disabler alle knapper. */
  disabled?: boolean;
  /**
   * Kalles med oppdatert input etter vellykket lagring.
   * Lar parent oppdatere lokal state optimistisk.
   */
  onSaved: (updated: BingoBangoBongoHoleInput) => void;
}

const CATEGORIES = [
  {
    key: 'bingoUserId' as const,
    label: 'Bingo',
    description: 'Første ball på green',
  },
  {
    key: 'bangoUserId' as const,
    label: 'Bango',
    description: 'Nærmest hullet når alle er på green',
  },
  {
    key: 'bongoUserId' as const,
    label: 'Bongo',
    description: 'Første ball i hull',
  },
] as const;

type CategoryKey = 'bingoUserId' | 'bangoUserId' | 'bongoUserId';

const wrapperStyle: CSSProperties = {
  margin: '0 14px 10px',
  padding: '14px 16px',
  borderRadius: 14,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const headingStyle: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 17,
  fontWeight: 500,
  color: 'var(--text)',
  margin: 0,
};

const captionStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 12,
  color: 'var(--text-muted)',
  margin: '0 0 4px',
  lineHeight: 1.4,
};

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const rowLabelStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.14em',
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
};

const rowDescStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 11,
  fontWeight: 400,
  textTransform: 'none' as const,
  letterSpacing: 0,
  color: 'var(--text-muted)',
};

const chipRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: 6,
};

function chipStyle(selected: boolean, disabled: boolean): CSSProperties {
  return {
    minHeight: 44,
    minWidth: 44,
    padding: '8px 14px',
    borderRadius: 22,
    border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
    background: selected ? 'var(--primary-soft)' : 'var(--surface-2)',
    color: selected ? 'var(--text)' : 'var(--text-muted)',
    fontFamily: 'var(--font-sans)',
    fontSize: 14,
    fontWeight: selected ? 700 : 500,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.12s, border-color 0.12s',
  };
}

const errorStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 12.5,
  color: 'var(--danger)',
  margin: '4px 0 0',
};

export function BingoBangoBongoEntry(
  props: BingoBangoBongoEntryProps,
): JSX.Element {
  const { gameId, holeNumber, players, savedHole, disabled = false, onSaved } =
    props;

  // Local state for optimistic UI — speiler wolf-mønstret for valgstate.
  const [localHole, setLocalHole] = useState<BingoBangoBongoHoleInput>(() => ({
    holeNumber,
    bingoUserId: savedHole?.bingoUserId ?? null,
    bangoUserId: savedHole?.bangoUserId ?? null,
    bongoUserId: savedHole?.bongoUserId ?? null,
  }));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(key: CategoryKey, userId: string | null) {
    if (disabled || saving) return;

    // Optimistisk oppdatering: set lokal state med en gang.
    const next: BingoBangoBongoHoleInput = {
      holeNumber,
      bingoUserId: key === 'bingoUserId' ? userId : localHole.bingoUserId,
      bangoUserId: key === 'bangoUserId' ? userId : localHole.bangoUserId,
      bongoUserId: key === 'bongoUserId' ? userId : localHole.bongoUserId,
    };
    const prev = localHole;
    setLocalHole(next);
    setError(null);
    setSaving(true);

    try {
      const result = await setBingoBangoBongoHole({
        gameId,
        holeNumber,
        bingoUserId: next.bingoUserId,
        bangoUserId: next.bangoUserId,
        bongoUserId: next.bongoUserId,
      });

      if (result.ok) {
        onSaved(next);
      } else {
        // Tilbakestill ved feil.
        setLocalHole(prev);
        setError('Kunne ikke lagre — prøv igjen.');
      }
    } catch {
      setLocalHole(prev);
      setError('Noe gikk galt. Prøv igjen.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-testid="bbb-entry" style={wrapperStyle}>
      <h3 style={headingStyle}>Bingo Bango Bongo</h3>
      <p style={captionStyle}>
        Tre poeng deles ut per hull — ett for hvert av de tre prestasjonene.
        Alle i flighten kan registrere.
      </p>

      {CATEGORIES.map(({ key, label, description }) => {
        const selectedUserId = localHole[key];
        return (
          <div key={key} style={rowStyle} data-testid={`bbb-row-${key}`}>
            <span style={rowLabelStyle}>
              {label}
              <span style={rowDescStyle}>({description})</span>
            </span>
            <div style={chipRowStyle}>
              {players.map((player) => {
                const isSelected = selectedUserId === player.userId;
                return (
                  <button
                    key={player.userId}
                    type="button"
                    data-testid={`bbb-chip-${key}-${player.userId}`}
                    aria-pressed={isSelected}
                    disabled={disabled || saving}
                    onClick={() =>
                      void handleSelect(
                        key,
                        // Klikk på allerede valgt spiller = tøm kategorien.
                        isSelected ? null : player.userId,
                      )
                    }
                    style={chipStyle(isSelected, disabled || saving)}
                  >
                    {player.name}
                  </button>
                );
              })}
              {/* Ingen/tøm-knapp — alltid tilgjengelig for å nullstille kategorien. */}
              <button
                type="button"
                data-testid={`bbb-chip-${key}-ingen`}
                aria-pressed={selectedUserId === null}
                disabled={disabled || saving}
                onClick={() => void handleSelect(key, null)}
                style={chipStyle(selectedUserId === null, disabled || saving)}
              >
                Ingen
              </button>
            </div>
          </div>
        );
      })}

      {error && (
        <p role="alert" data-testid="bbb-error" style={errorStyle}>
          {error}
        </p>
      )}
    </div>
  );
}
