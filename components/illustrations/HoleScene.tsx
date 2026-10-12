import type { ReactNode } from 'react';

/**
 * The hole scenes on the mishap pages (#2287): `OutOfBoundsScene` on the 404
 * page, `TreeScene` on the error screen. The out of bounds geometry is the
 * artboard's («Forslag: out of bounds» on the design canvas), element for
 * element. The tree has no drawing; it reuses the same ground, ball and ball
 * path so the two read as one family.
 *
 * Colours are `--ob-*` tokens (app/globals.css), set as attributes like
 * `PinFlag` does, so night mode follows the theme. No hex, no animation, and no
 * `id`s: the global 404 renders the scene once per locale.
 */

function SceneSvg({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 390 300"
      aria-hidden="true"
      focusable="false"
      className={`block h-auto w-full ${className}`}
    >
      {children}
    </svg>
  );
}

/** Rough band, its wavy edge and the fairway. The sky above y 176 is the page. */
function SceneGround() {
  return (
    <>
      <rect x="0" y="176" width="390" height="124" fill="var(--ob-rough)" />
      <path
        d="M0 176 C 90 160, 170 190, 250 170 S 360 160, 390 172 L390 300 L0 300 Z"
        fill="var(--ob-rough-edge)"
      />
      <rect x="0" y="210" width="210" height="90" fill="var(--ob-fairway)" />
    </>
  );
}

function SceneBall({ cx, cy }: { cx: number; cy: number }) {
  return (
    <>
      <circle
        cx={cx}
        cy={cy}
        r="9"
        fill="var(--ob-white)"
        stroke="var(--ob-ball-line)"
        strokeWidth="1.2"
      />
      <circle cx={cx - 3} cy={cy - 3} r="1" fill="var(--ob-dimple)" />
      <circle cx={cx + 2} cy={cy + 2} r="1" fill="var(--ob-dimple)" />
      <circle cx={cx + 3} cy={cy - 4} r="1" fill="var(--ob-dimple)" />
    </>
  );
}

function SceneBallPath({ d }: { d: string }) {
  return (
    <path
      d={d}
      fill="none"
      stroke="var(--ob-ball-line)"
      strokeWidth="1.5"
      strokeDasharray="3 6"
    />
  );
}

function OutOfBoundsPin({ x, y }: { x: number; y: number }) {
  return (
    <>
      <rect
        x={x}
        y={y}
        width="10"
        height="92"
        rx="2"
        fill="var(--ob-white)"
        stroke="var(--ob-ink)"
        strokeWidth="1.5"
      />
      <rect x={x} y={y} width="10" height="16" rx="2" fill="var(--ob-ink)" />
    </>
  );
}

/** The 404: a dashed OB line, three white stakes and the ball outside them. */
export function OutOfBoundsScene({ className }: { className?: string }) {
  return (
    <SceneSvg className={className}>
      <SceneGround />
      <line
        x1="210"
        y1="150"
        x2="210"
        y2="300"
        stroke="var(--ob-white)"
        strokeWidth="2"
        strokeDasharray="6 6"
      />
      <OutOfBoundsPin x={196} y={120} />
      <OutOfBoundsPin x={100} y={140} />
      <OutOfBoundsPin x={306} y={130} />
      <SceneBall cx={262} cy={196} />
      <SceneBallPath d="M60 150 Q 150 40, 258 186" />
    </SceneSvg>
  );
}

/** The error screen: the ball flew into the crown and dropped by the trunk. */
export function TreeScene({ className }: { className?: string }) {
  return (
    <SceneSvg className={className}>
      <SceneGround />
      <rect x="300" y="120" width="12" height="68" rx="2" fill="var(--ob-ink)" />
      <ellipse
        cx="306"
        cy="104"
        rx="36"
        ry="30"
        fill="var(--ob-fairway)"
        stroke="var(--ob-ink)"
        strokeWidth="1.5"
      />
      <SceneBall cx={284} cy={196} />
      <SceneBallPath d="M60 150 Q 165 30, 271 98 Q 279 140, 283 186" />
    </SceneSvg>
  );
}
