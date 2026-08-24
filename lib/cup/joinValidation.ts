import { exceedsPersonalPlayerCap } from './limits';

/**
 * Beslutningslogikken bak selvpåmelding via delbar lenke (#1490).
 *
 * Ren funksjon uten I/O: kalleren (siden og server-actionen på
 * `/cup/bli-med/[shortId]`) samler fakta, denne avgjør. Siden trenger svaret for
 * å velge hvilken tilstand den rendrer, actionen for å avvise før den skriver —
 * to call-sites, ett regelsett (AGENTS.md-felle 4).
 */

export type CupJoinFacts = {
  /** `short_id`-oppslaget traff en cup. */
  cupExists: boolean;
  /** `tournaments.status` — kun `draft` er åpen for påmelding. */
  status: string | null;
  /** `tournaments.group_id` — satt = klubb-cup. */
  groupId: string | null;
  /**
   * Er cupens SKAPER global admin? Taket følger cupen, ikke den som melder seg
   * på: ved selvpåmelding er den handlende en vanlig spiller, så å gate på
   * henne ville capped enhver admin-cup. Bevisst avvik fra `addCupParticipant`,
   * som gater på arrangøren fordi arrangøren ER den handlende der.
   */
  creatorIsAdmin: boolean;
  /** `users.profile_completed_at IS NOT NULL` for den som melder seg på. */
  profileCompleted: boolean;
  /** Medlem i cupens klubb (kun relevant for klubb-cup). */
  isClubMember: boolean;
  /** Antall distinkte deltakere i cupen nå (før denne påmeldingen). */
  participantCount: number;
  /** Spilleren står allerede i `tournament_participants`. */
  alreadyJoined: boolean;
};

export type CupJoinDecision =
  | 'can_join'
  | 'already_joined'
  | 'not_found'
  | 'closed'
  | 'profile_incomplete'
  | 'not_member'
  | 'full';

export type CupLeaveDecision =
  | 'can_leave'
  | 'not_found'
  | 'closed'
  | 'not_joined';

/**
 * Vaktene i rekkefølge. Rekkefølgen er kontrakten:
 *
 *  1. Finnes cupen? (ukjent lenke → 404-tilstand)
 *  2. Er den åpen? En startet cup stenger alt, også for den som står i den —
 *     det finnes ingen vei videre å tilby.
 *  3. Står hun der allerede? Da er svaret avmeldingsveien, ikke «full» eller
 *     «kun for medlemmer» — hun er jo inne.
 *  4. Fullført profil? Holder invarianten generer-veiviseren hviler på: alle
 *     deltakere har handicap (`GenerateMatches.tsx:175`).
 *  5. Klubb-cup: medlemskap. Samme filter som kandidatkilden bruker, så
 *     lenke-påmeldte og arrangør-påmeldte er samme slags deltakere.
 *  6. Personlig cup: deltaker-taket (#526).
 *
 * Ingen venne-/kandidatsjekk: lenken ER gaten (eierbeslutning 2026-08-07).
 */
export function evaluateCupJoin(facts: CupJoinFacts): CupJoinDecision {
  if (!facts.cupExists) return 'not_found';
  if (facts.status !== 'draft') return 'closed';
  if (facts.alreadyJoined) return 'already_joined';
  if (!facts.profileCompleted) return 'profile_incomplete';
  if (facts.groupId && !facts.isClubMember) return 'not_member';
  if (
    !facts.groupId &&
    exceedsPersonalPlayerCap(facts.participantCount + 1, facts.creatorIsAdmin)
  ) {
    return 'full';
  }
  return 'can_join';
}

/**
 * Avmelding har færre vakter enn påmelding med vilje: profil, medlemskap og tak
 * beskytter veien INN. En spiller som står i en utkast-cup skal alltid komme
 * seg ut, uansett hva som har endret seg siden hun meldte seg på.
 */
export function evaluateCupLeave(facts: CupJoinFacts): CupLeaveDecision {
  if (!facts.cupExists) return 'not_found';
  if (facts.status !== 'draft') return 'closed';
  if (!facts.alreadyJoined) return 'not_joined';
  return 'can_leave';
}
