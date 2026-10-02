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

/**
 * Where the picker's players come from (#2321): one rule, read by the filter
 * below and by the kicker over the cards («VENNENE DINE», «MEDLEMMENE I
 * KLUBBEN», «ALLE SPILLERE»). A club only counts when its members are known.
 */
export type PickerSource = 'friends' | 'club' | 'all';

export function pickerSource({
  intent,
  groupId,
  clubMemberIdsByClub,
}: Pick<SelectablePlayersCtx, 'intent' | 'groupId'> & {
  clubMemberIdsByClub: Readonly<Record<string, unknown>>;
}): PickerSource {
  if (intent === 'solo') return 'all';
  if (intent === 'klubb' && groupId && clubMemberIdsByClub[groupId] !== undefined) return 'club';
  return 'friends';
}

export function selectablePlayers(ctx: SelectablePlayersCtx): PlayerOption[] {
  const { groupId, selfId, players, friendIds, clubMemberIdsByClub } = ctx;

  const source = pickerSource(ctx);
  // Solo lar pickeren stå uendret (utsatt fjerning — #477/#478).
  if (source === 'all') return players;

  const allowed = source === 'club' ? clubMemberIdsByClub[groupId] : friendIds;

  return players.filter((p) => p.id === selfId || allowed.has(p.id));
}
