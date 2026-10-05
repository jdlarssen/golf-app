import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #2207: `users.email` and `users.friend_code` are not readable through a
 * signed-in user's own session. Every read that needs them runs on the admin
 * client, for one of three reasons: (a) the caller's own row via
 * `getPrivateUserFields`, (b) an admin surface behind `requireAdmin`, (c) a
 * server-side mail/notification send. (D6) marks reads whose result is masked
 * before it leaves the server.
 *
 * The scanner flags a `users` read when its select names `email`,
 * `friend_code` or `*`, when the select has no argument (that is `select=*`,
 * also after `.update()`/`.insert()`/`.upsert()`), or when the chain filters
 * on one of the two columns. A select argument that is an identifier is
 * resolved through `const <name> =` in the same file (every string literal in
 * the initializer counts); one it cannot resolve is always flagged. For each
 * flagged read it records the receiver in front of `.from(`.
 *
 * Blind spot: a `users(...)` embed kept in a constant imported from another
 * file and used on another table (`from('game_players').select(IMPORTED)`) is
 * not seen.
 */
type Allowed = { receivers: string[]; reason: string };

const B = '(b) admin-klient bak requireAdmin';

const ALLOWED: Record<string, Allowed> = {
  'app/[locale]/admin/games/[id]/InviteToGameSection.tsx': {
    receivers: ['getAdminClient()'],
    reason: `${B}: rendres bare fra admin-spillsida`,
  },
  'app/[locale]/admin/games/[id]/avslutt-likevel/page.tsx': {
    receivers: ['getAdminClient()'],
    reason: B,
  },
  'app/[locale]/admin/games/[id]/betaling/actions.ts': {
    receivers: ['getAdminClient()'],
    reason: `${B}; (c) serverside utsending av betalingspåminnelse`,
  },
  'app/[locale]/admin/games/[id]/edit/page.tsx': {
    receivers: ['getAdminClient()'],
    reason: B,
  },
  'app/[locale]/admin/games/[id]/page.tsx': {
    receivers: ['getAdminClient()'],
    reason: B,
  },
  'app/[locale]/admin/games/[id]/signups/page.tsx': {
    receivers: ['getAdminClient()'],
    reason:
      '(b) admin-klient bak requireAdminOrCreator: e-post bare når kalleren er admin; arrangøren får navnet (#2440)',
  },
  'app/[locale]/admin/games/[id]/status/actions.ts': {
    receivers: ['getAdminClient()', 'admin'],
    reason: `${B}; (c) serverside utsending av påminnelse`,
  },
  'app/[locale]/admin/games/[id]/status/page.tsx': {
    receivers: ['getAdminClient()'],
    reason: B,
  },
  'app/[locale]/admin/games/[id]/trekk-spiller/[userId]/page.tsx': {
    receivers: ['getAdminClient()'],
    reason: B,
  },
  'app/[locale]/admin/ideer/actions.ts': {
    receivers: ['getAdminClient()'],
    reason: B,
  },
  'app/[locale]/admin/spillere/[id]/actions.ts': {
    receivers: ['getAdminClient()'],
    reason: B,
  },
  'app/[locale]/admin/spillere/[id]/page.tsx': {
    receivers: ['getAdminClient()'],
    reason: B,
  },
  'app/[locale]/admin/spillere/[id]/slett/actions.ts': {
    receivers: ['getAdminClient()'],
    reason: B,
  },
  'app/[locale]/admin/spillere/[id]/slett/page.tsx': {
    receivers: ['getAdminClient()'],
    reason: B,
  },
  'app/[locale]/admin/spillere/_components/PlayersList.tsx': {
    receivers: ['getAdminClient()'],
    reason: `${B}: gaten er admin/spillere/page.tsx`,
  },
  'app/[locale]/games/[id]/spillere/page.tsx': {
    receivers: ['getAdminClient()'],
    reason: 'gjeste-adressene arrangøren selv la inn (#1009), bak requireAdminOrCreator',
  },
  'app/[locale]/klubber/bli-med/[shortId]/actions.ts': {
    receivers: ['admin'],
    reason: '(c) serverside utsending: egen rad som avsender av klubb-forespørselen',
  },
  'app/[locale]/profile/export/route.ts': {
    receivers: ['getAdminClient()'],
    reason: '(a) egen rad, id-en er verifisert av proxy',
  },
  'app/[locale]/profile/venner/fjern/[userId]/page.tsx': {
    receivers: ['getAdminClient()'],
    reason:
      '(D6) vennens navn på bekreftelsessiden, lest først etter vennesjekken og maskert på serveren som navne-fallback (#2267)',
  },
  'app/[locale]/signup/[shortId]/actions.ts': {
    receivers: ['admin', 'admin'],
    reason: '(c) serverside utsending: egen rad som avsender, arrangørens adresse som mottaker',
  },
  'app/[locale]/signup/[shortId]/page.tsx': {
    receivers: ['admin'],
    reason: '(a) egen rad, til invitasjons-oppslaget',
  },
  'app/[locale]/signup/[shortId]/team/captainLookup.ts': {
    receivers: ['admin'],
    reason: '(c) serverside utsending: navne-fallback i varsler',
  },
  'app/[locale]/signup/[shortId]/team/page.tsx': {
    receivers: ['admin', 'admin'],
    reason: '(a) egen rad; (D6) maskeres på serveren som navne-fallback',
  },
  'app/[locale]/signup/[shortId]/teamActions.ts': {
    receivers: ['admin'],
    reason: '(a) egen rad, sammenlignes med invitasjonens adresse',
  },
  'app/[locale]/venner/legg-til/[code]/actions.ts': {
    receivers: ['admin'],
    reason: '(c) serverside utsending: egen rad som avsender av venneforespørselen',
  },
  'app/[locale]/venner/legg-til/[code]/page.tsx': {
    receivers: ['admin'],
    reason: 'oppslag på vennekoden eieren selv delte; (D6) maskeres på serveren som navne-fallback (#2271)',
  },
  'app/api/profile/route.ts': {
    receivers: ['getAdminClient()'],
    reason: '(a) egen rad, id-en kommer fra tokenet',
  },
  'lib/admin/pendingPlayerEmails.ts': {
    receivers: ['getAdminClient()'],
    reason: `${B}: kalles fra admin-spillsida og admin-rediger etter gaten`,
  },
  // #2216: flyttet fra `app/[locale]/(auth)/login/actions.ts` (`verifyCode`).
  'lib/auth/afterLogin.ts': {
    receivers: ['admin'],
    reason: '(a) oppslag på adressen brukeren selv logget inn med; bare id-en går videre',
  },
  'lib/cup/tournamentParticipants.ts': {
    receivers: ['admin'],
    reason: '(c) serverside utsending til cup-deltakere',
  },
  'lib/friends/friendActionsCore.ts': {
    receivers: ['getAdminClient()'],
    reason:
      '(c) serverside utsending: avsenderens navn i venne-varselet, maskert (D6); kjernen bak webbens handlinger og /api/friends (#2256)',
  },
  'lib/friends/getFriendData.ts': {
    receivers: ['admin'],
    reason: '(D6) maskeres på serveren før venne-sida rendres',
  },
  'lib/games/claimGuestResult.ts': {
    receivers: ['admin', 'admin'],
    reason: 'gjeste-kravet (#1009): kallerne er gatet; bare id-en går videre',
  },
  'lib/games/inviteToGame.ts': {
    receivers: ['getAdminClient()'],
    reason: 'oppslag på adressen arrangøren skrev; synligheten sjekkes med kallerens klient',
  },
  'lib/games/newGameFormData.ts': {
    receivers: ['getAdminClient()'],
    reason: `${B}: bare når includeEmail er satt og kalleren er admin`,
  },
  // #2263: moved from `app/[locale]/admin/games/[id]/signups/actions.ts`.
  'lib/games/registrationDecisionCore.ts': {
    receivers: ['admin', 'admin'],
    reason: '(c) serverside utsending av svar på påmelding',
  },
  'lib/games/remindUnsubmitted.ts': {
    receivers: ['admin'],
    reason: '(c) serverside utsending av leveringspåminnelse',
  },
  'lib/games/remindMissingScore.ts': {
    receivers: ['admin'],
    reason: '(c) serverside utsending av påminnelse om hull uten slag (#2268)',
  },
  'lib/games/withdrawSelf.ts': {
    receivers: ['admin'],
    reason: '(c) serverside utsending: egen rad som avsender av avmeldingen',
  },
  'lib/notifications/deliveryReminder.ts': {
    receivers: ['admin'],
    reason: '(c) serverside utsending',
  },
  'lib/notifications/notifyInvitedToGame.ts': {
    receivers: ['admin'],
    reason: '(c) serverside utsending: den som inviterer, som avsender',
  },
  'lib/productUpdates/digest.ts': {
    receivers: ['admin'],
    reason: '(c) serverside utsending av produktnytt',
  },
  'lib/users/getTeamCandidates.ts': {
    receivers: ['admin'],
    reason: '(D6) maskeres på serveren; full adresse bare for id-er kapteinen valgte',
  },
  'lib/users/lookupByEmail.ts': {
    receivers: ['admin'],
    reason: 'oppslag på adressen kalleren skrev; bare id-en går videre',
  },
  'lib/users/privateUserFields.ts': {
    receivers: ['getAdminClient()'],
    reason: '(a)/(c) hjelperen getPrivateUserFields',
  },
};

const ROOT = join(__dirname, '..', '..');
const DIRS = ['app', 'lib', 'native/app/src'];
const FILES = ['proxy.ts'];
const ADMIN_RECEIVER = /^(admin|adminClient|getAdminClient\(\))$/;
const SERVICE_ROLE_PATH = 'service-role-sti:';
const PRIVATE_COLUMN = /\b(email|friend_code)\b|\*/;
const PRIVATE_FILTER =
  /\.(eq|neq|filter|not|in|ilike|like|match|imatch|is)\(\s*['"`](email|friend_code)['"`]|\.or\(\s*['"`][^'"`]*\b(email|friend_code)\b/;

/** Blank out comments (keeping newlines and offsets) so prose never counts. */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') {
        out += ' ';
        i += 1;
      }
      continue;
    }
    if (c === '/' && next === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      out += '  ';
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const OPEN = '([{';
const CLOSE = ')]}';

/** Index just past the string literal that opens at `start`. */
function skipString(src: string, start: number): number {
  const quote = src[start];
  let i = start + 1;
  while (i < src.length && src[i] !== quote) i += src[i] === '\\' ? 2 : 1;
  return i + 1;
}

/** Index of the bracket closing the one that opens at `start`. */
function matchForward(src: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      i = skipString(src, i);
      continue;
    }
    if (OPEN.includes(c)) depth += 1;
    if (CLOSE.includes(c)) {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return src.length;
}

/** End of the expression statement a chain starting at `start` belongs to. */
function chainEnd(src: string, start: number): number {
  let i = start;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      i = skipString(src, i);
      continue;
    }
    if (OPEN.includes(c)) {
      i = matchForward(src, i) + 1;
      continue;
    }
    if (CLOSE.includes(c) || c === ';' || c === ',') return i;
    if (c === '\n' && !/^\s*[.?]/.test(src.slice(i + 1, i + 200))) return i;
    i += 1;
  }
  return src.length;
}

/** The receiver expression right before the `.from(` at `dot`, whitespace removed. */
function receiverBefore(src: string, dot: number): string {
  let i = dot - 1;
  while (i >= 0 && /\s/.test(src[i])) i -= 1;
  const end = i + 1;
  while (i >= 0) {
    const c = src[i];
    if (CLOSE.includes(c)) {
      let depth = 0;
      while (i >= 0) {
        if (CLOSE.includes(src[i])) depth += 1;
        if (OPEN.includes(src[i])) {
          depth -= 1;
          if (depth === 0) break;
        }
        i -= 1;
      }
      i -= 1;
      continue;
    }
    if (/[\w$.?]/.test(c)) {
      i -= 1;
      continue;
    }
    if (/\s/.test(c)) {
      let j = i;
      while (j >= 0 && /\s/.test(src[j])) j -= 1;
      if (src[j] === '.' || src[i + 1] === '.') {
        i = j;
        continue;
      }
    }
    break;
  }
  return src.slice(i + 1, end).replace(/\s+/g, '');
}

type SelectArg = { text: string } | { unresolved: string } | { none: true };

/** Every string literal in `expr`, joined (template interpolation is kept as text). */
function literals(expr: string): string[] {
  const found: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === "'" || c === '"' || c === '`') {
      const end = skipString(expr, i);
      found.push(expr.slice(i + 1, end - 1));
      i = end;
      continue;
    }
    i += 1;
  }
  return found;
}

/**
 * Resolve the first argument of the `.select(` call whose `(` is at `open` in
 * `chain`; identifiers are looked up as a `const` anywhere in `file`.
 */
function selectArgument(chain: string, open: number, file: string): SelectArg {
  const close = matchForward(chain, open);
  const inner = chain.slice(open + 1, close);
  let depth = 0;
  let cut = inner.length;
  for (let i = 0; i < inner.length; i += 1) {
    const c = inner[i];
    if (c === "'" || c === '"' || c === '`') {
      i = skipString(inner, i) - 1;
      continue;
    }
    if (OPEN.includes(c)) depth += 1;
    if (CLOSE.includes(c)) depth -= 1;
    if (c === ',' && depth === 0) {
      cut = i;
      break;
    }
  }
  const arg = inner.slice(0, cut).trim();
  if (arg === '') return { none: true };
  if (/^(['"])[\s\S]*\1$/.test(arg) || (/^`[\s\S]*`$/.test(arg) && !arg.includes('${'))) {
    return { text: arg.slice(1, -1) };
  }
  if (/^[A-Za-z_$][\w$]*$/.test(arg)) {
    const decl = new RegExp(`\\bconst\\s+${arg}\\b[^=]*=`).exec(file);
    if (!decl) return { unresolved: arg };
    const start = decl.index + decl[0].length;
    return { text: literals(file.slice(start, initializerEnd(file, start))).join(' ') };
  }
  return { unresolved: arg };
}

/** A `const` initializer ends at the first `;` outside brackets and strings. */
function initializerEnd(src: string, start: number): number {
  let i = start;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      i = skipString(src, i);
      continue;
    }
    if (OPEN.includes(c)) {
      i = matchForward(src, i) + 1;
      continue;
    }
    if (c === ';') return i;
    i += 1;
  }
  return src.length;
}

/** The `users` embeds (`users(...)`, `users!fk(...)`) inside a select string. */
function userEmbeds(select: string): string[] {
  const embeds: string[] = [];
  const re = /\busers(?:![\w]+)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(select))) {
    const open = m.index + m[0].length - 1;
    embeds.push(select.slice(open + 1, matchForward(select, open)));
  }
  return embeds;
}

/**
 * Receivers of flagged `users` reads per repo-relative file, in source order.
 * Exported shape only for the synthetic test below.
 */
function privateUserReads(sources: Record<string, string>): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [file, raw] of Object.entries(sources)) {
    const src = stripComments(raw);
    const hits: { at: number; receiver: string }[] = [];
    const fromRe = /\.from\(\s*(['"`])(\w+)\1\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = fromRe.exec(src))) {
      const table = m[2];
      const chainStart = m.index + m[0].length;
      const chain = src.slice(chainStart, chainEnd(src, chainStart));
      const selects: SelectArg[] = [];
      const selectRe = /\.select\(/g;
      let s: RegExpExecArray | null;
      while ((s = selectRe.exec(chain))) {
        selects.push(selectArgument(chain, s.index + s[0].length - 1, src));
      }
      let flagged = false;
      if (table === 'users') {
        flagged =
          selects.some(
            (arg) =>
              'none' in arg ||
              'unresolved' in arg ||
              ('text' in arg && PRIVATE_COLUMN.test(arg.text)),
          ) || PRIVATE_FILTER.test(chain);
      } else {
        flagged = selects.some(
          (arg) =>
            'text' in arg && userEmbeds(arg.text).some((embed) => PRIVATE_COLUMN.test(embed)),
        );
      }
      if (flagged) hits.push({ at: m.index, receiver: receiverBefore(src, m.index) });
    }
    if (hits.length > 0) result[file] = hits.map((h) => h.receiver);
  }
  return result;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === 'testing' ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

function repoSources(): Record<string, string> {
  const paths = [...DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir))), ...FILES.map((f) => join(ROOT, f))];
  return Object.fromEntries(paths.map((path) => [relative(ROOT, path), readFileSync(path, 'utf8')]));
}

describe('users.email / users.friend_code reads (#2207)', () => {
  const sources = repoSources();

  it('reads the private columns only on the admin client, at the listed sites', () => {
    const expected = Object.fromEntries(
      Object.entries(ALLOWED).map(([file, { receivers }]) => [file, receivers]),
    );

    expect(privateUserReads(sources)).toEqual(expected);
  });

  it('lists only admin-client receivers, or a named service-role path', () => {
    const offenders = Object.entries(ALLOWED).flatMap(([file, { receivers, reason }]) =>
      reason.startsWith(SERVICE_ROLE_PATH)
        ? []
        : receivers.filter((r) => !ADMIN_RECEIVER.test(r)).map((r) => `${file}: ${r}`),
    );

    expect(offenders).toEqual([]);
  });

  it("never matches e-post with ilike, where _ and % are wildcards", () => {
    const hits = Object.entries(sources).flatMap(([file, text]) =>
      stripComments(text)
        .split('\n')
        .flatMap((line, i) => (/\.ilike\(\s*['"`]email['"`]/.test(line) ? [`${file}:${i + 1}`] : [])),
    );

    expect(hits).toEqual([]);
  });

  it('sees private columns, bare selects, filters and local constants, with their receiver', () => {
    expect(
      privateUserReads({
        'userClient.ts': "const { data } = await supabase.from('users').select('id, email');",
        'embed.ts':
          "await getAdminClient()\n  .from('game_players')\n  .select('user_id, users!game_players_user_id_fkey(name, email)');",
        'bareUpdate.ts':
          "await supabase.from('users').update({ name }).eq('id', x).select();",
        'star.ts': "await ctx.supabase.from('users').select('*').eq('id', x);",
        'filter.ts': "await admin.from('users').select('id').filter('email', 'imatch', p);",
        'constant.ts':
          "const cols = flag ? 'id, email' : 'id';\nawait supabase.from('users').select(cols);",
        'imported.ts': "await supabase.from('users').select(IMPORTED_COLUMNS);",
        'safe.ts':
          "await supabase.from('users').select('id, name').eq('id', x);\n// supabase.from('users').select('email')",
        'returning.ts': "await supabase.from('users').update({ name }).eq('id', x).select('id');",
      }),
    ).toEqual({
      'userClient.ts': ['supabase'],
      'embed.ts': ['getAdminClient()'],
      'bareUpdate.ts': ['supabase'],
      'star.ts': ['ctx.supabase'],
      'filter.ts': ['admin'],
      'constant.ts': ['supabase'],
      'imported.ts': ['supabase'],
    });
  });
});
