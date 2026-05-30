'use client';

/**
 * PlayersSection — spiller-velgeren med chips, søk og filtrert liste.
 *
 * Ansvar: mode-aware spiller-counter, chips for valgte spillere, søk på
 * navn/nickname/email, og filtrert liste med checkbox-rader. Lag/sider/
 * flighter ligger ikke her — det er TeamsAssignmentSection sitt domene.
 */

import type { PlayerOption } from '../GameForm';
import type { GameFormState } from '../useGameFormState';
import { StatusChip } from '@/components/ui/StatusChip';

type Props = {
  state: GameFormState;
  players: PlayerOption[];
  /**
   * Heading-tekst. Default «2. Spillere». Wizard-en overstyrer per steg
   * (f.eks. «Hvem skal spille?»).
   */
  heading?: string;
};

function playerLabel(p: PlayerOption): string {
  if (p.pending) {
    return p.email;
  }
  const displayName = p.name ?? p.email; // defensive — non-pending should always have name
  const hcp = p.hcp_index.toFixed(1);
  if (p.nickname) return `${displayName} «${p.nickname}» — HCP ${hcp}`;
  return `${displayName} — HCP ${hcp}`;
}

function shortName(p: PlayerOption): string {
  if (p.pending) return p.email;
  const displayName = p.name ?? p.email;
  return p.nickname ? `${displayName} «${p.nickname}»` : displayName;
}

export function PlayersSection({ state, players, heading = '2. Spillere' }: Props) {
  const {
    selectedPlayerIds,
    togglePlayer,
    playerSearch,
    setPlayerSearch,
    filteredPlayers,
    isBestBall,
    isMatchplay,
    isParStableford,
    isTexas,
    isAmbrose,
    isFlorida,
    requiresTeams,
    teamSize,
    eightSelected,
  } = state;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-text">{heading}</h2>
        {/* Counter er mode-aware:
            - best-ball: «X av 8 spillere valgt» (fast 8-krav)
            - par-stableford: «X spillere valgt» med subtilt hint om
              partall-krav for å hjelpe admin før publish-feilen treffer
            - matchplay: «X av 2 spillere valgt» (fast 2-krav) — grønn
              farge når akkurat 2 er valgt, ellers muted
            - solo: «X spillere valgt», ingen øvre tak */}
        {isBestBall ? (
          <span
            className={`text-xs font-medium tabular-nums ${eightSelected ? 'text-primary' : 'text-muted'}`}
          >
            {selectedPlayerIds.length} av 8 spillere valgt
          </span>
        ) : isMatchplay ? (
          <span
            className={`text-xs font-medium tabular-nums ${selectedPlayerIds.length === 2 ? 'text-primary' : 'text-muted'}`}
          >
            {selectedPlayerIds.length} av 2 spillere valgt
          </span>
        ) : (
          <span
            className={`text-xs font-medium tabular-nums ${selectedPlayerIds.length > 0 ? 'text-primary' : 'text-muted'}`}
          >
            {selectedPlayerIds.length}{' '}
            {selectedPlayerIds.length === 1 ? 'spiller' : 'spillere'} valgt
            {isParStableford && selectedPlayerIds.length >= 2 &&
              selectedPlayerIds.length % 2 !== 0 && (
              <span className="ml-1 text-muted/80">(par à 2)</span>
            )}
            {(isTexas || isAmbrose || isFlorida) &&
              selectedPlayerIds.length >= teamSize &&
              selectedPlayerIds.length % teamSize !== 0 && (
              <span className="ml-1 text-muted/80">
                (lag à {teamSize})
              </span>
            )}
          </span>
        )}
      </div>
      {players.length === 0 ? (
        <p className="text-sm text-muted">
          Ingen registrerte spillere ennå.
        </p>
      ) : (
        <>
          {/* Chips for valgte spillere — alltid synlig ABOVE søkefeltet
              slik at admin ikke mister oversikten når søk filtrerer
              listen under. Tab-rekkefølge: chips først (ÆØÅ-disiplin:
              avvelg via trykk), så søkefeltet, så filtrert liste. */}
          {selectedPlayerIds.length > 0 && (
            <ul
              aria-label="Valgte spillere"
              className="flex flex-wrap gap-2"
            >
              {selectedPlayerIds.map((pid) => {
                const p = players.find((x) => x.id === pid);
                if (!p) return null;
                return (
                  <li key={pid}>
                    <button
                      type="button"
                      onClick={() => togglePlayer(pid)}
                      aria-label={`Fjern ${shortName(p)} fra spill`}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 rounded-full border border-primary bg-primary-soft text-sm text-text hover:bg-primary/15 transition-colors"
                    >
                      <span className="max-w-[14ch] truncate">
                        {shortName(p)}
                      </span>
                      <span aria-hidden="true" className="text-base leading-none text-muted">
                        ×
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Søkefelt — substring-match (case-insensitive) på
              navn/nickname/email. Inputen er en standard <input>; ingen
              downshift/cmdk eller andre deps. min-h sikrer ≥44px
              tap-target på mobil. */}
          <div>
            <label htmlFor="player_search" className="sr-only">
              Søk i spillere
            </label>
            <input
              id="player_search"
              type="search"
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              placeholder="Søk i spillere…"
              aria-label="Søk i spillere"
              autoComplete="off"
              className="w-full min-h-[44px] rounded-xl border px-3.5 py-2.5 bg-surface text-text border-border focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150"
            />
          </div>

          {filteredPlayers.length === 0 ? (
            <p className="text-sm text-muted px-1">
              {playerSearch.trim() === ''
                ? 'Alle spillere er valgt.'
                : 'Ingen treff på søket.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {filteredPlayers.map((p) => {
                // Cap-en avhenger av modus:
                //  - matchplay: 2 spillere (1v1, strengt)
                //  - team-modi (best-ball/par-stableford): 8 (4 lag à 2)
                //  - solo-stableford: ingen øvre grense
                const atCap = isMatchplay
                  ? selectedPlayerIds.length >= 2
                  : requiresTeams && selectedPlayerIds.length >= 8;
                return (
                  <li key={p.id}>
                    <label
                      className={`flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-xl border transition-colors border-border ${atCap ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <input
                        type="checkbox"
                        checked={false}
                        disabled={atCap}
                        onChange={() => togglePlayer(p.id)}
                        aria-label={`${playerLabel(p)}${p.pending ? ' — venter på å fullføre profil' : ''}`}
                        className="h-5 w-5 rounded border-border text-primary focus:ring-accent/40"
                      />
                      <span className="flex-1 min-w-0 truncate text-sm text-text">
                        {playerLabel(p)}
                      </span>
                      {p.pending && (
                        <StatusChip tone="påmelding" label="Venter" className="shrink-0" />
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
