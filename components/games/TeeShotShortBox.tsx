import type { ReactNode } from 'react';
import { TeeShotCheck } from './TeeShotCheck';

export const TEE_SHOT_SHORT_BOX_ID = 'tee-shot-short';

export interface TeeShotShortBoxPlayer {
  userId: string;
  name: string;
  /** «har 7» or «2 av 4». */
  countText: string;
  short: boolean;
}

/**
 * The box over the delivery button when someone on the team lacks tee shots
 * (#2580, `Utslag-forslag-levering`): warning title, the rule and what to do,
 * and the count per player with the short ones framed. `tabIndex={-1}` so a
 * tap on the locked button can move focus here; no `role="status"`, as it is
 * there from the start.
 */
export function TeeShotShortBox({
  title,
  body,
  players,
  action,
}: {
  title: string;
  body: string;
  players: readonly TeeShotShortBoxPlayer[];
  /** The way to the holes («Rediger hullene»). */
  action?: ReactNode;
}) {
  return (
    <div
      id={TEE_SHOT_SHORT_BOX_ID}
      tabIndex={-1}
      data-testid="tee-shot-short-box"
      className="flex flex-col gap-2 rounded-[14px] bg-warning-soft p-3.5 outline-offset-2"
    >
      <div className="flex items-center gap-2 text-warning-text">
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3l9.5 17h-19z" />
          <path d="M12 10v4M12 17.5v.01" />
        </svg>
        <span className="font-sans text-[15px] font-semibold leading-[normal]">{title}</span>
      </div>
      <p className="font-sans text-[13px] leading-[1.45] text-text">{body}</p>
      <div
        className="grid gap-1.5 tabular-nums"
        style={{ gridTemplateColumns: `repeat(${Math.max(players.length, 1)}, minmax(0, 1fr))` }}
      >
        {players.map((p) => (
          <div
            key={p.userId}
            className={`flex min-w-0 flex-col gap-px rounded-[10px] bg-surface ${
              p.short ? 'border-[1.5px] border-warning-text px-[7px] py-[5px]' : 'px-2 py-1.5'
            }`}
          >
            <span className="truncate font-sans text-xs font-semibold leading-[normal] text-text">{p.name}</span>
            <span
              className={`flex items-center gap-[3px] font-sans text-xs leading-[normal] ${
                p.short ? 'font-semibold text-warning-text' : 'text-muted'
              }`}
            >
              {!p.short && <TeeShotCheck />}
              {p.countText}
            </span>
          </div>
        ))}
      </div>
      {action}
    </div>
  );
}
