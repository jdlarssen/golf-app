'use client';

/**
 * PlayersSection — GameForm's player picker (Rediger spill): the selected
 * players as chips, a search field and the list of everyone else.
 *
 * #2321: the wizard's step 4 is `PlayerPickerGrid` now; this list is GameForm's
 * only, drawn as `Nyttspill-4-spillere` without the hint box and «Neste» (owner
 * 01.10: «Det må gå igjen over hele greia, for alle spill»). Inside the
 * Disclosure panel: the VALGTE row (always, with the mode-aware counter), the
 * chips, the 50 px search, the «Alle spillere» list card and «Legg til gjest».
 * Teams, sides and flights are TeamsAssignmentSection's.
 */

import { useLocale, useTranslations } from 'next-intl';
import type { PlayerOption } from '../GameForm';
import type { GameFormState } from '../useGameFormState';
import { FormSection } from '@/components/ui/FormSection';
import { GuestBadge } from '@/components/ui/GuestBadge';
import { MiniChip } from '@/components/ui/MiniChip';
import { SearchField } from '@/components/ui/SearchField';
import { formatHcpDisplay } from '@/lib/handicap/signFormat';
import { pickerCap } from '@/lib/wizard/playerTarget';
import { GuestPlayerAdd } from './GuestPlayerAdd';
import { playerOptionLabel, playerOptionShortName } from './playerLabels';

export function PlayersSection({
  state,
  players,
}: {
  state: GameFormState;
  /** The full roster, so a selected player's chip is always found. */
  players: PlayerOption[];
}) {
  const t = useTranslations('wizard.sections.players');
  const locale = useLocale();
  const pendingLabel = t('pendingLabel');
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
    teamSize,
  } = state;

  const count = selectedPlayerIds.length;
  // The cap has one home (`pickerCap`): the fixed count, the fixed-count
  // formats' ceiling, the team grid's cap or the solo cap (#2009, #2148, #2321).
  const cap = pickerCap({
    gameMode: state.gameMode,
    requiresTeams: state.requiresTeams,
    isSolo: state.isSolo,
    teamSize,
  });
  const atCap = cap !== null && count >= cap;

  // Counter er mode-aware: matchplay «X av 2 spillere valgt», ellers
  // «X spillere valgt» med partall-/lagstørrelse-hint der modusen krever det.
  const counter = isMatchplay ? (
    t('counterMatchplay', { count })
  ) : (
    <>
      {count === 1 ? t('counterSingular', { count }) : t('counterPlural', { count })}
      {(isBestBall || isParStableford) && count >= 2 && count % 2 !== 0 && (
        <span className="ml-1">{t('teamHintPair')}</span>
      )}
      {(isTexas || isAmbrose || isFlorida) && count >= teamSize && count % teamSize !== 0 && (
        <span className="ml-1">{t('teamHintSize', { size: teamSize })}</span>
      )}
    </>
  );

  return (
    <div>
      <FormSection variant="bare" legend={t('selectedKicker')} aside={counter}>
        {/* Chips for valgte spillere — over søkefeltet så admin ikke mister
            oversikten når søket filtrerer lista. Avvelg via trykk. */}
        {count > 0 && (
          <ul aria-label={t('selectedPlayersAriaLabel')} className="flex flex-wrap gap-2">
            {selectedPlayerIds.map((pid) => {
              const p = players.find((x) => x.id === pid);
              if (!p) return null;
              const name = playerOptionShortName(p, pendingLabel);
              return (
                <li key={pid}>
                  <button
                    type="button"
                    onClick={() => togglePlayer(pid)}
                    aria-label={t('removePlayerAriaLabel', { name })}
                    className="inline-flex h-[46px] items-center gap-1.5 rounded-full border border-primary bg-primary-soft pl-3.5 pr-1.5 font-sans text-sm font-semibold leading-[normal] text-text transition-colors hover:bg-primary/15"
                  >
                    <span className="max-w-[14ch] truncate">{name}</span>
                    {p.isGuest && <GuestBadge className="shrink-0" />}
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 items-center justify-center rounded-full leading-none text-muted"
                    >
                      ×
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </FormSection>

      {/* Søkefelt — substring-match på navn/kallenavn/e-post
          (`playerMatchesSearch`). Enter sender ikke skjemaet. */}
      <SearchField
        id="player_search"
        className="mt-3.5"
        size="large"
        label={t('searchLabel')}
        value={playerSearch}
        onChange={setPlayerSearch}
        placeholder={t('searchPlaceholder')}
      />

      <FormSection variant={filteredPlayers.length === 0 ? 'bare' : 'list'} legend={t('listKicker')}>
        {players.length === 0 ? (
          <p className="px-1 font-sans text-sm text-muted">{t('noPlayersYet')}</p>
        ) : filteredPlayers.length === 0 ? (
          <p className="px-1 font-sans text-sm text-muted">
            {playerSearch.trim() === '' ? t('allSelectedEmpty') : t('noSearchResults')}
          </p>
        ) : (
          filteredPlayers.map((p) => (
            <label
              key={p.id}
              className={`flex min-h-[52px] items-center gap-3 px-3.5 py-2 ${
                atCap ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                checked={false}
                disabled={atCap}
                onChange={() => togglePlayer(p.id)}
                aria-label={`${playerOptionLabel(p, pendingLabel, locale)}${p.pending ? t('pendingPlayerAriaNote') : ''}`}
                className="h-6 w-6 shrink-0 appearance-none rounded-md border-[1.5px] border-field-border bg-surface checked:border-primary checked:bg-primary"
              />
              <span className="min-w-0 flex-1 truncate font-sans text-[15px] leading-[normal] text-text">
                {p.pending ? (
                  playerOptionShortName(p, pendingLabel)
                ) : (
                  <>
                    {playerOptionShortName(p, pendingLabel)}{' '}
                    <span className="text-muted">
                      — HCP {formatHcpDisplay(p.hcp_index, locale)}
                    </span>
                  </>
                )}
              </span>
              {p.pending && <MiniChip tone="waiting">{t('waitingChip')}</MiniChip>}
              {p.isGuest && <GuestBadge className="shrink-0" />}
            </label>
          ))
        )}
      </FormSection>

      {/* #1009: gjest uten konto — også når kandidatlista er tom. Taket
          speiler radene (`atCap`). */}
      <div className="mt-3">
        <GuestPlayerAdd state={state} disabled={atCap} />
      </div>
    </div>
  );
}
