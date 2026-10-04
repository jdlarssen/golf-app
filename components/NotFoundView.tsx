import { BrandMark } from '@/components/ui/BrandMark';
import { ChampagneMedallion } from '@/components/ui/ChampagneMedallion';
import { PinFlag } from '@/components/icons/PinFlag';
import { LinkButton } from '@/components/ui/Button';

/**
 * The branded «page not found» content (#612, #2292) — the one home for how it
 * looks. Rendered by `app/[locale]/not-found.tsx` (inside the layout) and by
 * `app/global-not-found.tsx` (outside it, once per locale), so it takes its
 * text as props and never touches next-intl.
 */
export function NotFoundView({
  heading,
  body,
  buttonLabel,
  homeHref,
}: {
  heading: string;
  body: string;
  buttonLabel: string;
  homeHref: string;
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
          <LinkButton href={homeHref} full>
            {buttonLabel}
          </LinkButton>
        </div>
      </section>
    </>
  );
}
