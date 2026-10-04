import { BrandMark } from '@/components/ui/BrandMark';
import { ChampagneMedallion } from '@/components/ui/ChampagneMedallion';
import { PinFlag } from '@/components/icons/PinFlag';
import { LinkButton, buttonClasses } from '@/components/ui/Button';

/**
 * The branded «page not found» content (#612, #2292) — the one home for how it
 * looks. Rendered by `app/[locale]/not-found.tsx` (inside the layout) and by
 * `app/global-not-found.tsx` (outside it, once per locale), so it takes its
 * text as props and never touches next-intl.
 *
 * `hardNavigation`: the home button is a plain `<a>` that loads the page
 * from scratch. The global 404 needs it: it owns `<html>`/`<body>` outside the
 * `[locale]` layout, and a client-side navigation from there changed the URL
 * but left the 404 on screen (#2292).
 */
export function NotFoundView({
  heading,
  body,
  buttonLabel,
  homeHref,
  hardNavigation = false,
}: {
  heading: string;
  body: string;
  buttonLabel: string;
  homeHref: string;
  hardNavigation?: boolean;
}) {
  return (
    <>
      <BrandMark className="mt-2" />
      <section className="mt-10 flex flex-col items-center text-center">
        <ChampagneMedallion className="mb-7">
          <PinFlag size={72} className="text-primary dark:text-text" />
        </ChampagneMedallion>
        <h1 className="font-serif text-[30px] font-medium tracking-[-0.02em] leading-tight text-text">
          {heading}
        </h1>
        <p className="mt-3 max-w-[280px] font-sans text-sm leading-relaxed text-muted">
          {body}
        </p>
        <div className="mt-8 w-full max-w-[280px]">
          {hardNavigation ? (
            // A plain <a>, not next/link: it forces a full page load.
            <a href={homeHref} className={`${buttonClasses('primary', 'default')} w-full`}>
              {buttonLabel}
            </a>
          ) : (
            <LinkButton href={homeHref} full>
              {buttonLabel}
            </LinkButton>
          )}
        </div>
      </section>
    </>
  );
}
