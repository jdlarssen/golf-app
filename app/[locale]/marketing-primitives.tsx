import type { ReactNode } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';

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

/** Tekstlenke med pil. Pilen er dekor og legges på her, ikke i katalogen. */
export function TextLink({
  href,
  children,
  className = '',
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <SmartLink
      href={href}
      className={`inline-flex min-h-[44px] items-center font-sans text-sm font-medium text-primary hover:text-primary-hover ${className}`}
    >
      {children}
      <span aria-hidden className="ml-1">
        →
      </span>
    </SmartLink>
  );
}

/** Lenke i bunnraden. 44 px tap-mål selv om teksten er liten. */
export function FooterLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <SmartLink
      href={href}
      className="inline-flex min-h-[44px] items-center hover:text-primary"
    >
      {children}
    </SmartLink>
  );
}
