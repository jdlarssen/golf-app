import type { ReactNode } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppCtaLink } from '@/components/app/AppCtaLink';

/**
 * Delte presentasjons-primitiver for de offentlige markedsføringssidene
 * (#1419). De bodde lokalt nederst i `AnonLanding.tsx` til `/hvorfor-torny`
 * trengte nøyaktig de samme tre — én seksjonstittel, én pil-tekstlenke og én
 * bunnlenke. Uttrekket er ren flytting: klassene er uendret, så forsiden
 * rendres byte-likt.
 *
 * Her bor KUN biter som faktisk brukes av mer enn én side. Sidespesifikke
 * hjelpere (AnonLandings `Step`/`AudienceCard`, hvorfor-sidas tall-flis,
 * matrise-rad og chip) blir liggende lokalt i sin egen fil — en delt modul
 * som samler alt ville blitt et samlebegrep uten eier.
 *
 * Fila ligger i `app/[locale]/` uten å være en rute: bare Next-ets reserverte
 * filnavn (page/layout/route/…) blir ruter, akkurat som `AnonLanding.tsx`.
 */

/** Seksjonstittel (h2) i markedsføringssidenes serif-hierarki. */
export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-serif text-[22px] font-medium leading-snug tracking-[-0.015em] text-text">
      {children}
    </h2>
  );
}

/**
 * Tekstlenke med pil. Pilen er dekor og legges på her, ikke i katalogen.
 * `appCta` (#2562): demolenka som går rett til butikken på telefon når appen
 * er ute (`AppCtaLink`).
 */
export function TextLink({
  href,
  children,
  className = '',
  appCta = false,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  appCta?: boolean;
}) {
  const Link = appCta ? AppCtaLink : SmartLink;
  return (
    <Link
      href={href}
      className={`inline-flex min-h-[44px] items-center font-sans text-sm font-medium text-primary hover:text-primary-hover ${className}`}
    >
      {children}
      <span aria-hidden className="ml-1">
        →
      </span>
    </Link>
  );
}

/** Lenke i bunnraden. 44 px tap-mål selv om teksten er liten. `appCta` som over. */
export function FooterLink({
  href,
  children,
  appCta = false,
}: {
  href: string;
  children: ReactNode;
  appCta?: boolean;
}) {
  const Link = appCta ? AppCtaLink : SmartLink;
  return (
    <Link
      href={href}
      className="tap-extend inline-flex min-h-[44px] items-center hover:text-primary [--tap-extend:0_-5px]"
    >
      {children}
    </Link>
  );
}
