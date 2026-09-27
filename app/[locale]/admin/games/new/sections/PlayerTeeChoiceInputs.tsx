'use client';

import type { GameFormState } from '../useGameFormState';

/**
 * #2209: one hidden `player_${pid}_gender` per selected player — the only
 * source of that field, in the wizard and in GameForm alike (#1011: one source
 * per field). Mount it where it is always rendered, outside every `Disclosure`
 * panel and step: the M/D/J toggle only exists in some formats, and a field
 * that is not mounted never reaches FormData, so the server fell back to 'M'.
 */
export function PlayerTeeChoiceInputs({
  state,
}: {
  state: Pick<GameFormState, 'selectedPlayerIds' | 'teeChoiceFor'>;
}) {
  return (
    <>
      {state.selectedPlayerIds.map((pid) => (
        <input
          key={pid}
          type="hidden"
          name={`player_${pid}_gender`}
          value={state.teeChoiceFor(pid)}
        />
      ))}
    </>
  );
}
