/**
 * Ren graf-logikk for venne-relasjonen (#369). Holdes fri for I/O slik at
 * partisjonering/dedup/forslag-filtrering kan testes uten å mocke Supabase —
 * resolverne (`getFriendIds`, `getFriendData`) er tynne skall rundt disse.
 *
 * `friendships` er rettede rader (requester → addressee). «Venner» = accepted
 * uansett retning; pending der DU er addressee = innkommende forespørsel,
 * pending der du er requester = utgående.
 */

export type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted';
};

/** Den andre parten i en relasjon sett fra `userId`. */
export function otherParty(row: FriendshipRow, userId: string): string {
  return row.requester_id === userId ? row.addressee_id : row.requester_id;
}

/** Deduplikerte bruker-ider for aksepterte venner (begge retninger). */
export function friendIdsFromRows(rows: FriendshipRow[], userId: string): string[] {
  const ids = rows
    .filter((r) => r.status === 'accepted')
    .map((r) => otherParty(r, userId));
  return [...new Set(ids)];
}

/**
 * Deduplikerte bruker-ider for alle relasjoner — aksepterte OG pending, begge
 * retninger. Picker-kilden i opprett-veiviseren bruker denne (ikke kun
 * accepted) så folk du har sendt/mottatt en venneforespørsel til kan legges
 * til i et spill før forespørselen er besvart. Discovery/signup-gaten holder
 * seg til `friendIdsFromRows` (kun ekte venner).
 */
export function connectedIdsFromRows(rows: FriendshipRow[], userId: string): string[] {
  return [...new Set(rows.map((r) => otherParty(r, userId)))];
}

export type Partitioned = {
  friends: { otherId: string }[];
  /** pending der `userId` er addressee — krever svar. */
  incoming: { id: string; otherId: string }[];
  /** pending der `userId` er requester — venter på svar. */
  outgoing: { id: string; otherId: string }[];
  /** alle parter `userId` allerede har en relasjon (pending el. accepted) til. */
  relatedIds: Set<string>;
};

export function partitionFriendships(
  rows: FriendshipRow[],
  userId: string,
): Partitioned {
  const friends: { otherId: string }[] = [];
  const incoming: { id: string; otherId: string }[] = [];
  const outgoing: { id: string; otherId: string }[] = [];
  const relatedIds = new Set<string>();
  for (const r of rows) {
    const other = otherParty(r, userId);
    relatedIds.add(other);
    if (r.status === 'accepted') {
      friends.push({ otherId: other });
    } else if (r.addressee_id === userId) {
      incoming.push({ id: r.id, otherId: other });
    } else {
      outgoing.push({ id: r.id, otherId: other });
    }
  }
  return { friends, incoming, outgoing, relatedIds };
}

/**
 * Forslag = co-players (`getCoPlayerIds`) man ikke allerede har en relasjon
 * til, og aldri seg selv. Deduplikert.
 */
export function suggestionIds(
  coPlayerIds: string[],
  relatedIds: ReadonlySet<string>,
  userId: string,
): string[] {
  return [...new Set(coPlayerIds)].filter(
    (id) => id !== userId && !relatedIds.has(id),
  );
}

/**
 * #481, #2212: Distinct inviter ids to auto-befriend from a set of accepted
 * invitations. Every invitation counts, game-less ones included: «Legg til
 * venn på e-post» and the admin door create invitations without a game, and
 * they give friendship just like a game invitation. Drops the invitee
 * themselves and dedupes, so several invitations from one person give one
 * friendship. Pure function so the `verifyCode` wiring can be tested without
 * a DB.
 *
 * `invitations.invited_by` is NOT NULL (0001), so there is no «unknown
 * inviter» case to filter out (#1767).
 */
export function distinctInviterIds(
  invites: ReadonlyArray<{ invited_by: string }>,
  selfUserId: string,
): string[] {
  const ids = new Set<string>();
  for (const inv of invites) {
    if (inv.invited_by === selfUserId) continue;
    ids.add(inv.invited_by);
  }
  return [...ids];
}
