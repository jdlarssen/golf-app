/**
 * Ren kjerne for join-funnelens sosiale-bevis-signal (#1193). Holdes fri for
 * I/O (samme mønster som `friendGraph` ↔ `getFriendIds`) slik at ekskluderings-,
 * skjærings- og cap-reglene kan testes uten å mocke Supabase. Resolveren
 * `getGameSocialProof` er et tynt skall rundt denne.
 *
 * Personvern-grensen bor her: den innloggede besøkende ser NAVN kun på
 * gjensidige venner som faktisk er påmeldt; alle andre (og anonyme) ser bare et
 * ekte antall. Spilleren selv teller aldri med, og 0 påmeldte gir en linje som
 * ikke rendrer noe.
 */

export type GameSocialProof = {
  /** Ekte antall ikke-trukne påmeldte, EKSKLUDERT den besøkende selv. */
  joinedCount: number;
  /**
   * Visningsnavn på gjensidige venner som er påmeldt — kun for en innlogget
   * besøkende, kappet til {@link NAME_CAP}. Aldri navn til anonyme.
   */
  knownFriendNames: string[];
  /** Hvor mange venner som ikke fikk plass i `knownFriendNames` («+N andre»). */
  knownFriendOverflow: number;
};

/**
 * Maks antall venne-navn før resten kollapser til et overflow-tall. To gir de
 * to kontrakt-formene «Jonas og Kari er med» (nøyaktig to) og «Jonas og N andre
 * du kjenner er med» (tre+, ett navn + rest).
 */
const NAME_CAP = 2;

const EMPTY: GameSocialProof = {
  joinedCount: 0,
  knownFriendNames: [],
  knownFriendOverflow: 0,
};

/**
 * Form et sosialt-bevis-signal fra roster-brukere + den besøkendes venne-sett.
 *
 * @param rosterUserIds ikke-trukne påmeldtes bruker-ider (kan ha duplikater)
 * @param friendIds     gjensidige (accepted) venne-ider for den besøkende
 * @param viewerUserId  den innloggede besøkende, eller `null` for anonym
 * @param nameOf        oppslag id → ferdig personvern-formatert navn (el. null)
 */
export function buildSocialProof(
  rosterUserIds: readonly string[],
  friendIds: Iterable<string>,
  viewerUserId: string | null,
  nameOf: (userId: string) => string | null,
): GameSocialProof {
  // Dedup + fjern den besøkende selv før alt annet — teller og navn hviler på
  // samme «andre enn meg»-mengde.
  const joined = [...new Set(rosterUserIds)].filter((id) => id !== viewerUserId);
  const joinedCount = joined.length;
  if (joinedCount === 0) return EMPTY;

  // Navn kun for en innlogget besøkende; anonyme får aldri venne-navn.
  const friendSet =
    friendIds instanceof Set ? friendIds : new Set(friendIds);
  const friendNames =
    viewerUserId == null
      ? []
      : joined
          .filter((id) => friendSet.has(id))
          .map(nameOf)
          .filter((n): n is string => n != null && n.trim().length > 0)
          .sort((a, b) => a.localeCompare(b, 'nb'));

  if (friendNames.length <= NAME_CAP) {
    return { joinedCount, knownFriendNames: friendNames, knownFriendOverflow: 0 };
  }
  // Tre+ venner: vis ett navn, resten som «+N andre du kjenner».
  return {
    joinedCount,
    knownFriendNames: [friendNames[0]],
    knownFriendOverflow: friendNames.length - 1,
  };
}

/**
 * Which form the social-proof line takes (#2258): friends by name — one, two,
 * or one plus the rest — else a plain count, else nothing. One home for the
 * choice, shared by `SocialProofLine` (full public names, «Jonas B.») and the
 * terminliste row (first names). `mapName` only changes how a name reads; it
 * never adds one, so the privacy boundary stays in `buildSocialProof`.
 */
export type SocialProofForm =
  | { kind: 'friendsOverflow'; name: string; count: number }
  | { kind: 'friendsTwo'; name1: string; name2: string }
  | { kind: 'friendsOne'; name: string }
  | { kind: 'count'; count: number };

export function socialProofForm(
  proof: GameSocialProof,
  mapName: (name: string) => string = (name) => name,
): SocialProofForm | null {
  const { joinedCount, knownFriendNames, knownFriendOverflow } = proof;
  if (knownFriendNames.length > 0) {
    if (knownFriendOverflow > 0) {
      return {
        kind: 'friendsOverflow',
        name: mapName(knownFriendNames[0]),
        count: knownFriendOverflow,
      };
    }
    if (knownFriendNames.length >= 2) {
      return {
        kind: 'friendsTwo',
        name1: mapName(knownFriendNames[0]),
        name2: mapName(knownFriendNames[1]),
      };
    }
    return { kind: 'friendsOne', name: mapName(knownFriendNames[0]) };
  }
  if (joinedCount > 0) return { kind: 'count', count: joinedCount };
  return null;
}

/**
 * The first word of a public name: «Jonas B.» → «Jonas» (#2258). The
 * terminliste row names friends by first name only, as the design does. It
 * shows less than the public name, never more.
 */
export function firstName(publicName: string): string {
  return publicName.trim().split(/\s+/)[0] ?? '';
}
