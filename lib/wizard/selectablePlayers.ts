import type { Intent } from '@/lib/wizard/intent';
import type { PlayerOption } from '@/app/[locale]/admin/games/new/GameForm';

/**
 * Hvilke spillere som er valgbare i «legg til spiller»-pickeren, gitt
 * kontekst (#464). Plukk-lista skal aldri vise hele brukerbasen:
 *
 * - **kompis / cup** → venne-relasjonene dine (aksepterte venner + folk du har
 *   en pending venneforespørsel med, begge retninger)
 * - **klubb** m/ valgt klubb → den klubbens medlemmer
 * - **klubb** uten valgt klubb (eller ukjent klubb) → venner (trygt fallback,
 *   aldri hele basen)
 * - **solo** → uendret (hele rosteren) — solo-intentens framtid er egne saker
 *   (#477/#478); #464 rører den ikke.
 *
 * Du selv (`selfId`) er alltid med i ikke-solo-kontekster: du er ikke din egen
 * venn, og er ikke nødvendigvis i klubb-medlems-settet, men arrangøren må alltid
 * kunne legge til seg selv. Filtreringen skjer innenfor `players`-supersettet og
 * bevarer rekkefølgen — separate lister trengs ikke siden intent kan byttes
 * klient-side.
 */
export type SelectablePlayersCtx = {
  /** `undefined` (intent ikke valgt ennå) behandles som venne-kontekst. */
  intent: Intent | undefined;
  /** Valgt klubb-id ('' = «Ingen klubb»). */
  groupId: string;
  /** Innlogget brukers id — alltid valgbar i ikke-solo-kontekster. */
  selfId: string;
  /** Full/merget roster (superset det filtreres innenfor). */
  players: PlayerOption[];
  /** Venne-relasjoners ids — aksepterte + pending, uten self. */
  friendIds: ReadonlySet<string>;
  /** clubId → medlemmenes user-ids. */
  clubMemberIdsByClub: Record<string, ReadonlySet<string>>;
};

export function selectablePlayers(ctx: SelectablePlayersCtx): PlayerOption[] {
  const { intent, groupId, selfId, players, friendIds, clubMemberIdsByClub } = ctx;

  // Solo lar pickeren stå uendret (utsatt fjerning — #477/#478).
  if (intent === 'solo') return players;

  const clubMembers =
    intent === 'klubb' && groupId ? clubMemberIdsByClub[groupId] : undefined;
  const allowed = clubMembers ?? friendIds;

  return players.filter((p) => p.id === selfId || allowed.has(p.id));
}
