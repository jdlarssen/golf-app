'use client';

import { useState, type CSSProperties, type JSX } from 'react';
import { useTranslations } from 'next-intl';
import {
  isBingoBangoBongoNoOp,
  type BingoBangoBongoCategoryKey,
} from '@/lib/bbb/mergeBingoBangoBongoCategory';
import { setBingoBangoBongoHole } from '@/lib/bbb/setBingoBangoBongoHole';
import type { BingoBangoBongoHoleInput } from '@/lib/scoring/modes/types';

export interface BingoBangoBongoEntryPlayer {
  userId: string;
  name: string;
}

export interface BingoBangoBongoEntryProps {
  gameId: string;
  holeNumber: number;
  /** 2–16 spillere (#460) med id + visningsnavn. */
  players: BingoBangoBongoEntryPlayer[];
  /** Gjeldende lagrede verdier for hullet — null betyr ingen rad finnes ennå. */
  savedHole: BingoBangoBongoHoleInput | null;
  /** True når spillet er avsluttet — disabler alle knapper. */
  disabled?: boolean;
  /**
   * Kalles med kategorien som ble lagret og mottakeren, etter vellykket
   * lagring. Parent fletter bare den kategorien inn i hullets rad (#1950), så
   * en flight-kamerats samtidige kategori blir stående.
   */
  onSaved: (key: BingoBangoBongoCategoryKey, userId: string | null) => void;
  /**
   * Ber om en fersk lesing uten å lagre (#2090). Kalles når trykket ikke endrer
   * det chipsene viser, så et gammelt bilde rettes i stedet for å skrives over.
   */
  onRefresh: () => void;
}

const CATEGORY_KEYS = [
  { key: 'bingoUserId' as const, labelKey: 'bingo' as const, descKey: 'bingoDesc' as const },
  { key: 'bangoUserId' as const, labelKey: 'bango' as const, descKey: 'bangoDesc' as const },
  { key: 'bongoUserId' as const, labelKey: 'bongo' as const, descKey: 'bongoDesc' as const },
] as const;

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
  const t = useTranslations('holes.bingoBangoBongo');
  const {
    gameId,
    holeNumber,
    players,
    savedHole,
    disabled = false,
    onSaved,
    onRefresh,
  } = props;

  // Local state for optimistic UI — speiler wolf-mønstret for valgstate, og
  // mirrors `savedHole` (server-prop + realtime-merges fra flight-kamerater,
  // #1836) via prop-synkroniseringen under.
  const [localHole, setLocalHole] = useState<BingoBangoBongoHoleInput>(() => ({
    holeNumber,
    bingoUserId: savedHole?.bingoUserId ?? null,
    bangoUserId: savedHole?.bangoUserId ?? null,
    bongoUserId: savedHole?.bongoUserId ?? null,
  }));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Follow `savedHole` when it changes after mount: the parent merges realtime
  // rows from flight-mates into it, and without this the chips would keep the
  // value they were seeded with (#1836). This is React's render-phase
  // "adjust state when a prop changes" pattern rather than an effect — an
  // effect that setStates synchronously is a lint error here (cascading
  // renders), and adjusting during render avoids the extra paint.
  // Skipped while a save is in flight so the echo of an older row can't
  // overwrite the optimistic edit in progress — `handleSelect` owns
  // `localHole` until it settles, and the sync catches up once `saving` clears
  // because `syncedHole` is only advanced when the sync actually runs.
  const [syncedHole, setSyncedHole] = useState(savedHole);
  if (savedHole !== syncedHole && !saving) {
    setSyncedHole(savedHole);
    setLocalHole({
      holeNumber,
      bingoUserId: savedHole?.bingoUserId ?? null,
      bangoUserId: savedHole?.bangoUserId ?? null,
      bongoUserId: savedHole?.bongoUserId ?? null,
    });
  }

  async function handleSelect(
    key: BingoBangoBongoCategoryKey,
    userId: string | null,
  ) {
    if (disabled || saving) return;

    // #2090: the chips can be an old snapshot while realtime lags. A tap that
    // matches what they show («Ingen» on an empty category) could only write
    // NULL over a flight-mate's registration, so read again instead.
    if (isBingoBangoBongoNoOp(localHole, key, userId)) {
      onRefresh();
      return;
    }

    // Optimistisk oppdatering: set lokal state med en gang. Hele raden vises,
    // men bare den trykte kategorien sendes (#1950).
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
        key,
        userId,
      });

      if (result.ok) {
        onSaved(key, userId);
      } else {
        // Tilbakestill ved feil.
        setLocalHole(prev);
        setError(t('saveFailed'));
      }
    } catch {
      setLocalHole(prev);
      setError(t('unknownError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-testid="bbb-entry" style={wrapperStyle}>
      <h3 style={headingStyle}>{t('heading')}</h3>
      <p style={captionStyle}>
        {t('caption')}
      </p>

      {CATEGORY_KEYS.map(({ key, labelKey, descKey }) => {
        const selectedUserId = localHole[key];
        return (
          <div key={key} style={rowStyle} data-testid={`bbb-row-${key}`}>
            <span style={rowLabelStyle}>
              {t(labelKey)}
              <span style={rowDescStyle}>({t(descKey)})</span>
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
                {t('noOne')}
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
