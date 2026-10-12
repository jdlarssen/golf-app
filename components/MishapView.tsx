import type { ReactNode } from 'react';

/**
 * The layout the 404 page and the error screen share (#2287), drawn after the
 * artboard «Forslag: out of bounds» on the design canvas: the wordmark, a hole
 * scene, an optional kicker, the heading, the body and the buttons, left
 * aligned. `NotFoundView` passes the out of bounds scene, `ErrorScreen` the
 * tree.
 *
 * No hooks and no next-intl, so the server-rendered 404 and the client-side
 * error screen can both use it. The page hides the bottom nav
 * (`data-hides-bottom-nav`, as the artboard draws none), and the column fills
 * the screen, so the version footer with the privacy link lands below the fold.
 */
export function MishapView({
  scene,
  kicker,
  heading,
  body,
  note,
  children,
}: {
  scene: ReactNode;
  kicker?: string;
  heading: string;
  body: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div data-hides-bottom-nav className="flex min-h-dvh flex-col">
      {/* The artboard's wordmark: text without the ball, an inline run in a
          body-text line, so the row is as tall as the drawing's. */}
      <div className="px-5 pt-[18px] text-base leading-[normal]">
        <span className="font-serif text-xl font-semibold leading-[normal] text-primary">
          Tørny
        </span>
      </div>
      {scene}
      <div className="flex flex-col gap-2.5 px-6 pt-2">
        {kicker && (
          <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.24em] leading-[normal] text-muted">
            {kicker}
          </p>
        )}
        {/* `!` because globals.css sets `text-wrap: pretty` on every h1
            outside a layer; the artboard breaks greedily. */}
        <h1 className="font-serif text-[32px] font-medium leading-[1.1] text-text ![text-wrap:wrap]">
          {heading}
        </h1>
        <p className="font-sans text-[15px] leading-[1.5] text-text">{body}</p>
        {note}
      </div>
      <div className="flex flex-col gap-2.5 px-6 pt-[22px]">{children}</div>
    </div>
  );
}
