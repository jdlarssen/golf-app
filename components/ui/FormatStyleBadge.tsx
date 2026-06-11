'use client';

import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import {
  formatPlayStyle,
  type GameMode,
} from '@/lib/scoring/modes/types';

/**
 * Lite merke som forteller hvordan et format spilles — Solo eller Lag (#478,
 * #498). Vises på format-kortene i veiviseren og på /spillformater så man ser
 * med en gang om man spiller for seg selv eller på lag.
 *
 * #498: «Hver for seg» ble slått sammen til «Solo», og chipene fikk kategori-
 * farger — skifer for Solo, terrakotta for Lag (tokens i globals.css). Gull
 * (`--accent`) er reservert til vinnere, så stilen får sin egen rolige palett.
 * Fleksible format (stableford-familien) uten valgt lagstørrelse viser begge
 * chipene side om side i stedet for den gamle «Solo eller lag»-teksten.
 */

type ChipKind = 'solo' | 'team';

const CHIP_STYLE: Record<ChipKind, CSSProperties> = {
  solo: {
    background: 'var(--chip-solo-bg)',
    color: 'var(--chip-solo-fg)',
    borderColor: 'var(--chip-solo-border)',
  },
  team: {
    background: 'var(--chip-team-bg)',
    color: 'var(--chip-team-fg)',
    borderColor: 'var(--chip-team-border)',
  },
};

function Chip({ kind, label }: { kind: ChipKind; label: string }) {
  return (
    <span
      className="inline-block rounded-full border px-[7px] py-[2px] font-sans text-[9.5px] font-medium leading-none"
      style={CHIP_STYLE[kind]}
    >
      {label}
    </span>
  );
}

export function FormatStyleBadge({
  mode,
  teamSize,
  className,
}: {
  mode: GameMode;
  /**
   * Valgfri lagstørrelse for å låse et fleksibelt format (stableford-familien)
   * til en konkret stil: ≥2 → «Lag», 1 → «Solo». Brukes på /spillformater der
   * 4BBB-varianten har et eget kort. Utelatt (veiviseren) → fleksible format
   * viser begge chipene «Solo» + «Lag» fordi lagstørrelse ikke er valgt ennå.
   */
  teamSize?: number;
  className?: string;
}) {
  const t = useTranslations('modes.playStyle');
  const base = formatPlayStyle(mode);

  // Fleksibelt format uten valgt lagstørrelse (veiviseren) → vis begge chips.
  if (base === 'flexible' && teamSize === undefined) {
    return (
      <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
        <Chip kind="solo" label={t('solo')} />
        <Chip kind="team" label={t('team')} />
      </span>
    );
  }

  // Ellers: én chip. Fleksibelt med lagstørrelse låses til solo/team; solo og
  // individual deler «Solo»-chippen; team får «Lag».
  let kind: ChipKind | null;
  if (base === 'team' || (base === 'flexible' && (teamSize ?? 1) >= 2)) {
    kind = 'team';
  } else if (base === 'solo' || base === 'individual' || base === 'flexible') {
    kind = 'solo';
  } else {
    // Defensivt: en ukjent slug (f.eks. nytt format seedet før koden er
    // deployet) faller gjennom uten kjent stil — vis da ingenting.
    kind = null;
  }

  if (kind === null) return null;

  const label = kind === 'team' ? t('team') : t('solo');

  return (
    <span className={`inline-flex items-center ${className ?? ''}`}>
      <Chip kind={kind} label={label} />
    </span>
  );
}
