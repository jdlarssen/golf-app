import { LinkButton, buttonClasses } from '@/components/ui/Button';
import { MishapView } from '@/components/MishapView';
import { OutOfBoundsScene } from '@/components/illustrations/HoleScene';

/**
 * The branded «page not found» content (#612, #2292, #2287) — the one home for
 * what it says and where it leads. It shows the out of bounds hole, the text
 * and two ways out: home and the open tournament list, which work signed in
 * and signed out. The layout lives in `MishapView`, shared with the error
 * screen.
 *
 * Rendered by `app/[locale]/not-found.tsx` and the signup link's 404 (inside
 * the layout) and by `app/global-not-found.tsx` (outside it, once per locale),
 * so it takes its text as props and never touches next-intl.
 *
 * `hardNavigation`: both buttons are plain `<a>`s that load the page from
 * scratch. The global 404 needs it: it owns `<html>`/`<body>` outside the
 * `[locale]` layout, and a client-side navigation from there changed the URL
 * but left the 404 on screen (#2292).
 */
export function NotFoundView({
  kicker,
  heading,
  body,
  homeLabel,
  homeHref,
  findLabel,
  findHref,
  hardNavigation = false,
}: {
  kicker: string;
  heading: string;
  body: string;
  homeLabel: string;
  homeHref: string;
  findLabel: string;
  findHref: string;
  hardNavigation?: boolean;
}) {
  const homeClasses = 'w-full leading-[normal]';
  const findClasses = 'w-full border border-border';
  return (
    <MishapView
      scene={<OutOfBoundsScene className="mt-6" />}
      kicker={kicker}
      heading={heading}
      body={body}
    >
      {hardNavigation ? (
        // Plain <a>s, not next/link: they force a full page load.
        <>
          <a
            href={homeHref}
            data-testid="not-found-home"
            className={`${buttonClasses('primary', 'large')} ${homeClasses}`}
          >
            {homeLabel}
          </a>
          <a
            href={findHref}
            data-testid="not-found-find"
            className={`${buttonClasses('quiet', 'tall')} ${findClasses}`}
          >
            {findLabel}
          </a>
        </>
      ) : (
        <>
          <LinkButton
            href={homeHref}
            size="large"
            data-testid="not-found-home"
            className={homeClasses}
          >
            {homeLabel}
          </LinkButton>
          <LinkButton
            href={findHref}
            variant="quiet"
            size="tall"
            data-testid="not-found-find"
            className={findClasses}
          >
            {findLabel}
          </LinkButton>
        </>
      )}
    </MishapView>
  );
}
