import type { RegistrationTypeView } from './registrationTypeView';

/**
 * Skal base-signup-siden peke en allerede-invitert spiller mot laget sitt?
 *
 * En spiller som er invitert til et lag per e-post har en ventende
 * `invitations`-rad, og selve «Bli med på lag»-knappen bor på
 * `/signup/[shortId]/team`. Base-siden viser lag-skjemaet «Registrer laget»,
 * som oppretter et NYTT lag — kommer den inviterte hit (typisk etter en runde
 * innom /complete-profile), er et duplikat-lag ett trykk unna (#1344).
 * Pekeren gir dem veien til laget uten å stenge skjemaet: invitasjonen kan
 * være foreldet, og en invitert spiller kan legitimt ville stille eget lag.
 *
 * Ren beslutnings-logikk (Type-A-testbar) skilt ut av `page.tsx`-`renderBody`
 * etter samme mønster som `registrationTypeView.ts` — `renderBody` er
 * ueksportert, så dette er eneste vei til en unit-test.
 *
 * Kjent, akseptert hull: `registration_type = 'both'` på en modus UTEN
 * lag-konsept gir `solo_form`, og da får en lag-scopet invitert ingen peker.
 * Lag-teksten ville vært feil for et spill uten lag, og konfigurasjonen er
 * semi-korrupt i utgangspunktet.
 *
 * #1425: kravet er et SIKKERT lag-treff (`resolveCertainTeamInvitation`), ikke
 * bare «det finnes en invitasjon». En invitasjon fra arrangøren sier ingenting
 * om hvilket lag du hører til, og `/team` svarer da med stopp-skjermen «spør
 * kapteinen, eller registrer eget lag» — som sender deg hit igjen. Pekeren
 * ville altså vært en ring. Vi skjuler den i stedet: lag-skjemaet under er den
 * riktige handlingen når laget er ukjent.
 */
export function shouldShowTeamInvitePointer({
  typeViewKind,
  hasCertainTeamInvitation,
}: {
  typeViewKind: RegistrationTypeView['kind'];
  hasCertainTeamInvitation: boolean;
}): boolean {
  return typeViewKind === 'team_form' && hasCertainTeamInvitation;
}
