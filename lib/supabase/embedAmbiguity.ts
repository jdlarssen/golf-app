/**
 * PostgREST embed-ambiguity detection (#798).
 *
 * When two tables are connected by more than one foreign key, a PostgREST
 * resource embed like `users(name)` is ambiguous: PostgREST cannot pick which
 * FK to follow and returns error `PGRST201` at runtime. Untyped Supabase
 * clients (`.returns<...>()`) hide this at build time (#672), and there is no
 * `gen:types`/PostgREST-shape check in CI (#673), so these regressions ship
 * silently. The fix is always an explicit FK hint: `users!<constraint>(name)`.
 *
 * This module is the single source of truth for the rule. The co-located
 * `embedAmbiguity.test.ts` uses it both as a unit-tested classifier and as a
 * repo-wide static guard that fails if any unhinted ambiguous embed is
 * (re)introduced into app/, lib/ or components/.
 *
 * GROUND TRUTH — regenerate when the schema gains/loses a multi-FK relation:
 *
 *   SELECT tc.table_name AS src, ccu.table_name AS tgt, count(*)
 *   FROM information_schema.table_constraints tc
 *   JOIN information_schema.key_column_usage kcu USING (constraint_name, table_schema)
 *   JOIN information_schema.constraint_column_usage ccu USING (constraint_name, table_schema)
 *   WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
 *   GROUP BY 1, 2 HAVING count(*) > 1;
 *
 * As of 2026-06-29 (verified against prod `glofubopddkjhymcbaph`), the ONLY
 * multi-FK relationships in the whole public schema are between `users` and the
 * ten tables below — so `users` is the only relation that can be an ambiguous
 * embed.
 */

/**
 * Tables that hold more than one foreign key to `users`. Any embed connecting
 * one of these to `users` (in either direction, at any nesting depth) is
 * ambiguous unless it carries an explicit FK hint.
 */
export const MULTI_FK_TO_USERS: readonly string[] = [
  'game_players', // user_id, approved_by_user_id, withdrawn_by_user_id
  'games', // created_by, foursomes_side1_tee_starter_user_id, foursomes_side2_tee_starter_user_id
  'scores', // user_id, entered_by
  'friendships', // requester_id, addressee_id
  'group_join_requests', // user_id, decided_by_user_id
  'game_registration_requests', // user_id, decided_by_user_id
  'wolf_hole_choices', // wolf_user_id, partner_user_id, entered_by
  'bingo_bango_bongo_holes', // bingo_user_id, bango_user_id, bongo_user_id, entered_by
  'courses', // created_by, updated_by
  'reactions', // user_id, target_user_id
] as const;

const MULTI_FK_SET = new Set(MULTI_FK_TO_USERS);

/**
 * True when an embed between tables `a` and `b` is ambiguous (>1 connecting
 * FK), i.e. one side is `users` and the other has multiple FKs to it.
 */
export function isAmbiguousPair(a: string, b: string): boolean {
  return (
    (a === 'users' && MULTI_FK_SET.has(b)) ||
    (b === 'users' && MULTI_FK_SET.has(a))
  );
}

/** A `!modifier` that selects the join cardinality, not the FK relationship. */
const JOIN_MODIFIERS = new Set(['inner', 'left']);

export interface EmbedNode {
  /** Relation name (after any `alias:` / `...` spread, before `!` or `(`). */
  relation: string;
  /** The FK-disambiguating hint (`!<constraint>` or `!<column>`), if any. */
  hint: string | null;
  /** Nested embeds within this one. */
  children: EmbedNode[];
}

export interface AmbiguousEmbed {
  /** The `.from()` table or enclosing relation this embed hangs off. */
  parent: string;
  /** The embedded relation (always `users` or a multi-FK table in practice). */
  relation: string;
}

/**
 * Splits a PostgREST select body into its top-level, comma-separated tokens,
 * respecting parentheses (so commas inside a nested embed don't split).
 * Tokens that contain a `${...}` interpolation are returned verbatim; callers
 * skip them (dynamic strings can't be statically resolved).
 */
function splitTopLevel(body: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '(') {
      depth += 1;
      current += ch;
    } else if (ch === ')') {
      depth -= 1;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      tokens.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim() !== '') tokens.push(current);
  return tokens;
}

/**
 * Parses a PostgREST select string into the tree of embeds it declares.
 * Scalar columns are ignored; only relation embeds (`relation(...)`) appear.
 *
 * Handles: `relation(...)`, `alias:relation(...)`, `...relation(...)` (spread),
 * `relation!hint(...)`, `relation!hint!inner(...)`, and arbitrary nesting.
 */
export function parseSelectEmbeds(selectString: string): EmbedNode[] {
  const nodes: EmbedNode[] = [];
  for (const rawToken of splitTopLevel(selectString)) {
    const token = rawToken.trim();
    const parenIdx = token.indexOf('(');
    if (parenIdx === -1) continue; // scalar column, not an embed

    // Match the relation's own parentheses (the rest of the token, balanced).
    const lastParen = token.lastIndexOf(')');
    if (lastParen <= parenIdx) continue; // malformed / not a real embed

    let prefix = token.slice(0, parenIdx).trim();
    const inner = token.slice(parenIdx + 1, lastParen);

    // Strip a spread (`...users(name)`) and an alias (`alias:users(name)`).
    if (prefix.startsWith('...')) prefix = prefix.slice(3);
    const colonIdx = prefix.indexOf(':');
    if (colonIdx !== -1) prefix = prefix.slice(colonIdx + 1);

    // `relation!hint!inner` → relation + ordered modifiers.
    const segments = prefix.split('!').map((s) => s.trim());
    const relation = segments[0];
    if (!relation) continue;
    const hint =
      segments.slice(1).find((seg) => seg !== '' && !JOIN_MODIFIERS.has(seg)) ??
      null;

    nodes.push({
      relation,
      hint,
      children: parseSelectEmbeds(inner),
    });
  }
  return nodes;
}

/**
 * Returns every ambiguous, unhinted embed reachable from a `.from(fromTable)`
 * select string. Walks the full embed tree so nested embeds
 * (`games(game_players(users(...)))`) are checked at each level.
 */
export function findAmbiguousEmbeds(
  fromTable: string,
  selectString: string,
): AmbiguousEmbed[] {
  const violations: AmbiguousEmbed[] = [];
  const walk = (parent: string, nodes: EmbedNode[]): void => {
    for (const node of nodes) {
      if (isAmbiguousPair(parent, node.relation) && node.hint === null) {
        violations.push({ parent, relation: node.relation });
      }
      walk(node.relation, node.children);
    }
  };
  walk(fromTable, parseSelectEmbeds(selectString));
  return violations;
}
