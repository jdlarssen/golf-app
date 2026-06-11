'use client';

/**
 * PlayersSection — spiller-velgeren med chips, søk og filtrert liste.
 *
 * Ansvar: mode-aware spiller-counter, chips for valgte spillere, søk på
 * navn/nickname/email, og filtrert liste med checkbox-rader. Lag/sider/
 * flighter ligger ikke her — det er TeamsAssignmentSection sitt domene.
 */

import { useTranslations } from 'next-intl';
import type { PlayerOption } from '../GameForm';
import type { GameFormState } from '../useGameFormState';
import { PENDING_PLAYER_LABEL } from '../playerDisplay';
import { StatusChip } from '@/components/ui/StatusChip';

type Props = {
  state: GameFormState;
  players: PlayerOption[];
  /**
   * Heading-tekst. Default «2. Spillere». Wizard-en overstyrer per steg
   * (f.eks. «Hvem skal spille?»).
   */
  heading?: string;
  /**
   * #464: begrenser den valgbare checkbox-lista til disse id-ene (picker-kilden
   * per kontekst — venner/klubbmedlemmer). `players` forblir full roster så
   * allerede-valgte chips alltid slås opp. `undefined` = ingen begrensning
   * (full-form-escape-hatchen viser hele rosteren som før).
   */
  selectableIds?: ReadonlySet<string>;
};

function playerLabel(p: PlayerOption): string {
  if (p.pending) {
    return p.email ?? PENDING_PLAYER_LABEL;
  }
  const displayName = p.name ?? p.email ?? PENDING_PLAYER_LABEL; // defensive — non-pending should always have name
  const hcp = p.hcp_index.toFixed(1);
  if (p.nickname) return `${displayName} «${p.nickname}» — HCP ${hcp}`;
  return `${displayName} — HCP ${hcp}`;
}

function shortName(p: PlayerOption): string {
  if (p.pending) return p.email ?? PENDING_PLAYER_LABEL;
  const displayName = p.name ?? p.email ?? PENDING_PLAYER_LABEL;
  return p.nickname ? `${displayName} «${p.nickname}»` : displayName;
}

export function PlayersSection({
  state,
  players,
  heading,
  selectableIds,
}: Props) {
  const t = useTranslations('wizard.sections.players');
  const resolvedHeading = heading ?? t('headingDefault');
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
  } = state;

  // #464: den valgbare lista er roster-en (minus valgte/søk, via filteredPlayers)
  // skåret ned til kontekst-kilden. Uten `selectableIds` (full-form) er den hele
  // filteredPlayers. Chips og roster-oppslag bruker fortsatt full `players`-prop.
  const visiblePlayers = selectableIds
    ? filteredPlayers.filter((p) => selectableIds.has(p.id))
    : filteredPlayers;

  const count = selectedPlayerIds.length;

  // Build the counter string for best-ball / generic modes.
  function genericCounter(): string {
    const base = count === 1 ? t('counterSingular', { count }) : t('counterPlural', { count });
    return base;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-text">{resolvedHeading}</h2>
        {/* Counter er mode-aware:
            - best-ball: «X spillere valgt» med partall-hint (#374 — ikke lenger
              fast 8-krav; 2/4/6/8 er gyldige antall)
            - par-stableford: «X spillere valgt» med subtilt hint om
              partall-krav for å hjelpe admin før publish-feilen treffer
            - matchplay: «X av 2 spillere valgt» (fast 2-krav) — grønn
              farge når akkurat 2 er valgt, ellers muted
            - solo: «X spillere valgt», ingen øvre tak */}
        {isBestBall ? (
          <span
            className={`text-xs font-medium tabular-nums ${count >= 2 && count % 2 === 0 ? 'text-primary' : 'text-muted'}`}
          >
            {genericCounter()}
            {count >= 2 && count % 2 !== 0 && (
              <span className="ml-1 text-muted/80">{t('teamHintPair')}</span>
            )}
          </span>
        ) : isMatchplay ? (
          <span
            className={`text-xs font-medium tabular-nums ${count === 2 ? 'text-primary' : 'text-muted'}`}
          >
            {t('counterMatchplay', { count })}
          </span>
        ) : (
          <span
            className={`text-xs font-medium tabular-nums ${count > 0 ? 'text-primary' : 'text-muted'}`}
          >
            {genericCounter()}
            {isParStableford && count >= 2 && count % 2 !== 0 && (
              <span className="ml-1 text-muted/80">{t('teamHintPair')}</span>
            )}
            {(isTexas || isAmbrose || isFlorida) &&
              count >= teamSize &&
              count % teamSize !== 0 && (
              <span className="ml-1 text-muted/80">
                {t('teamHintSize', { size: teamSize })}
              </span>
            )}
          </span>
        )}
      </div>
      {players.length === 0 ? (
        <p className="text-sm text-muted">
          {t('noPlayersYet')}
        </p>
      ) : (
        <>
          {/* Chips for valgte spillere — alltid synlig ABOVE søkefeltet
              slik at admin ikke mister oversikten når søk filtrerer
              listen under. Tab-rekkefølge: chips først (ÆØÅ-disiplin:
              avvelg via trykk), så søkefeltet, så filtrert liste. */}
          {count > 0 && (
            <ul
              aria-label={t('selectedPlayersAriaLabel')}
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
                      aria-label={t('removePlayerAriaLabel', { name: shortName(p) })}
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
              {t('searchLabel')}
            </label>
            <input
              id="player_search"
              type="search"
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchLabel')}
              autoComplete="off"
              className="w-full min-h-[44px] rounded-xl border px-3.5 py-2.5 bg-surface text-text border-border focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150"
            />
          </div>

          {visiblePlayers.length === 0 ? (
            <p className="text-sm text-muted px-1">
              {playerSearch.trim() === ''
                ? t('allSelectedEmpty')
                : t('noSearchResults')}
            </p>
          ) : (
            <ul className="space-y-2">
              {visiblePlayers.map((p) => {
                // Cap-en avhenger av modus:
                //  - matchplay: 2 spillere (1v1, strengt)
                //  - team-modi (best-ball/par-stableford): 8 (4 lag à 2)
                //  - solo-stableford: ingen øvre grense
                const atCap = isMatchplay
                  ? count >= 2
                  : requiresTeams && count >= 8;
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
                        aria-label={`${playerLabel(p)}${p.pending ? t('pendingPlayerAriaNote') : ''}`}
                        className="h-5 w-5 rounded border-border text-primary focus:ring-accent/40"
                      />
                      <span className="flex-1 min-w-0 truncate text-sm text-text">
                        {playerLabel(p)}
                      </span>
                      {p.pending && (
                        <StatusChip tone="påmelding" label={t('waitingChip')} className="shrink-0" />
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
