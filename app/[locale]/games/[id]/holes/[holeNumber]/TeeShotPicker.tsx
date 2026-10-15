'use client';

import { useId } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import type { GameMode } from '@/lib/scoring/modes/types';
import { deliveryCoversWholeTeam } from '@/lib/games/teamDelivery';
import type { LocalTeeShot } from '@/lib/sync/db';
import { writeTeeShot } from '@/lib/sync/writeTeeShot';
import { drainQueue } from '@/lib/sync/syncWorker';
import {
  selectableOnHole,
  teamTeeShotDelivery,
  teeShotHoleLine,
  teeShotStatus,
  type TeeShotStatusInput,
} from '@/lib/games/teeShots';
import { teeShotCountText, teeShotHoleLineText } from '@/components/games/teeShotCopy';
import { TeeShotCheck } from '@/components/games/TeeShotCheck';
import { useTeamTeeShots } from './holeLiveQueries';

export interface TeeShotPickerMember {
  userId: string;
  /** Short name: nickname, else first name (full name when two share it). */
  name: string;
  submittedAt: string | null;
  withdrawnAt: string | null;
}

export interface TeeShotPickerTeam {
  teamNumber: number;
  /** Every member of the team in team order, withdrawn ones included. */
  members: TeeShotPickerMember[];
}

interface TeeShotPickerProps {
  gameId: string;
  holeNumber: number;
  gameMode: GameMode;
  minimum: number;
  /** The teams in the flight: one block each in scramble, one in shamble. */
  teams: TeeShotPickerTeam[];
  myUserId: string;
  disabled: boolean;
}

/**
 * «Hvem sitt utslag ble brukt?» on the web hole page (#2580), as
 * `Utslag-forslag-hull`, `-hull-laast` and `-shamble-hull` draw it. One tap
 * writes the team's choice for the hole to `team_tee_shots` (local first, then
 * the queue); a tap on the chosen name clears it. Who can be picked, the lock
 * near the end, the delivery lock and the line under the buttons all come from
 * lib/games/teeShots.ts; the sentences from `teeShots.*`.
 */
export function TeeShotPicker({
  gameId,
  holeNumber,
  gameMode,
  minimum,
  teams,
  myUserId,
  disabled,
}: TeeShotPickerProps) {
  const rows = useTeamTeeShots(gameId);
  // Until Dexie has answered, counts and locks would be wrong; show nothing.
  if (rows === undefined) return null;
  return (
    <div data-testid="tee-shot-picker" className="flex flex-col gap-3">
      {teams.map((team) => (
        <TeamBlock
          key={team.teamNumber}
          gameId={gameId}
          holeNumber={holeNumber}
          gameMode={gameMode}
          minimum={minimum}
          team={team}
          rows={rows}
          showTeamLabel={teams.length > 1}
          myUserId={myUserId}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function TeamBlock({
  gameId,
  holeNumber,
  gameMode,
  minimum,
  team,
  rows,
  showTeamLabel,
  myUserId,
  disabled,
}: {
  gameId: string;
  holeNumber: number;
  gameMode: GameMode;
  minimum: number;
  team: TeeShotPickerTeam;
  rows: LocalTeeShot[];
  showTeamLabel: boolean;
  myUserId: string;
  disabled: boolean;
}) {
  const t = useTranslations('teeShots');
  const locale = useLocale() as AppLocale;
  const headingId = useId();
  const lineId = useId();

  const active = team.members.filter((m) => !m.withdrawnAt);
  const nameById = new Map(team.members.map((m) => [m.userId, m.name]));
  const nameOf = (userId: string) => nameById.get(userId) ?? '';
  const input: TeeShotStatusInput = {
    minimum,
    memberIds: active.map((m) => m.userId),
    picks: rows
      .filter((r) => r.teamNumber === team.teamNumber)
      .map((r) => ({ holeNumber: r.holeNumber, teeShotBy: r.teeShotBy })),
  };
  const status = teeShotStatus(input);
  const delivery = teamTeeShotDelivery(gameMode, team.members);
  const selectable = new Set(selectableOnHole(status, input, holeNumber, delivery));
  const current = rows.find((r) => r.teamNumber === team.teamNumber && r.holeNumber === holeNumber)?.teeShotBy ?? null;
  const lockInEffect = active.some((m) => !selectable.has(m.userId));
  const line = teeShotHoleLineText(teeShotHoleLine(status, delivery), nameOf, t, locale);
  // The artboards: 56 px under a team card, 52 px under the shamble rows.
  const minHeight = deliveryCoversWholeTeam(gameMode) ? 'min-h-[56px]' : 'min-h-[52px]';

  const onTap = (userId: string) => {
    if (disabled || !selectable.has(userId)) return;
    void writeTeeShot({
      gameId,
      teamNumber: team.teamNumber,
      holeNumber,
      teeShotBy: userId === current ? null : userId,
      enteredBy: myUserId,
    }).then(() => drainQueue());
  };

  return (
    <div data-testid={`tee-shot-team-${team.teamNumber}`}>
      <div className="flex items-baseline justify-between gap-3 px-1.5 pt-1.5 pb-2">
        <span id={headingId} className="font-sans text-sm font-semibold leading-[normal] text-text">
          {showTeamLabel ? `${t('teamLabel', { team: team.teamNumber })} · ` : ''}
          {t('question')}
        </span>
        <span className="whitespace-nowrap font-sans text-xs leading-[normal] text-muted">
          {t('minimum', { min: minimum })}
        </span>
      </div>
      <div
        role="group"
        aria-labelledby={headingId}
        aria-describedby={line ? lineId : undefined}
        className="grid gap-2 px-0.5"
        style={{ gridTemplateColumns: `repeat(${Math.max(active.length, 1)}, minmax(0, 1fr))` }}
      >
        {status.players.map((player) => {
          const name = nameOf(player.userId);
          const chosen = player.userId === current;
          const canTap = !disabled && selectable.has(player.userId);
          const reached = player.missing === 0;
          const label = reached
            ? t('a11yReached', { name, count: player.count })
            : t('a11yShort', { name, count: player.count, min: minimum });
          const state = !canTap
            ? 'border border-dashed border-score-unset-fg bg-bg text-muted'
            : chosen
              ? 'border-2 border-primary bg-primary text-white dark:text-bg [--focus-ring:var(--bg)]'
              : lockInEffect
                ? 'border-2 border-primary bg-surface text-text'
                : 'border border-border bg-surface text-text';
          const countClass = !canTap
            ? ''
            : chosen
              ? 'font-semibold'
              : lockInEffect
                ? 'font-semibold text-primary'
                : 'text-muted';
          return (
            <button
              key={player.userId}
              type="button"
              aria-pressed={chosen}
              aria-label={canTap ? label : t('a11yLockedSuffix', { label })}
              disabled={!canTap}
              onClick={() => onTap(player.userId)}
              data-testid={`tee-shot-${player.userId}`}
              className={`flex ${minHeight} flex-col items-center justify-center gap-0.5 rounded-[14px] px-1 py-1.5 disabled:cursor-not-allowed ${state}`}
            >
              <span className={`max-w-full truncate font-sans text-sm leading-[normal] ${canTap ? 'font-semibold' : 'font-medium'}`}>
                {name}
              </span>
              <span className={`flex items-center gap-[3px] font-sans text-[11px] leading-[normal] tabular-nums ${countClass}`}>
                {reached && <TeeShotCheck />}
                {teeShotCountText(player, minimum, t)}
              </span>
            </button>
          );
        })}
      </div>
      {line && (
        <p id={lineId} className="px-1.5 pt-2 font-sans text-xs leading-[normal] text-muted">
          {line}
        </p>
      )}
    </div>
  );
}
