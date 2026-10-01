import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #2209: every place in app/, lib/ and native/app/src that puts a row in
 * `game_players` — `.from('game_players').insert(`/`.upsert(` or a call to the
 * `claim_open_registration_seat` RPC — is listed below with how it sets the
 * tee category. A row without `tee_gender` silently gets the column default
 * 'mens', and a lady or a junior then plays off the men's slope, course rating
 * and par. A new insert site turns this red: decide how it sets the category,
 * then list it here.
 *
 * The count guards new sites; the token check below guards that each listed
 * file has taken a stand. That each existing site actually sets the field is
 * proven by the action tests that check the payload.
 */
const INSERT_SITES: Record<string, { count: number; reason: string }> = {
  'app/[locale]/admin/games/new/actions.ts': {
    count: 2,
    reason: "regular and guest rows, tee_gender from the form's player_<id>_gender",
  },
  'app/[locale]/admin/games/[id]/edit/actions.ts': {
    count: 3,
    reason:
      "new regular and guest rows from the form's player_<id>_gender; the compensation re-inserts removed rows verbatim",
  },
  // #2263: moved from `app/[locale]/admin/games/[id]/signups/actions.ts`, now
  // shared by the signup page and the inbox's «Godta».
  'lib/games/registrationDecisionCore.ts': {
    count: 1,
    reason: 'the approved team, joinTeeGenders per member',
  },
  'app/[locale]/signup/[shortId]/actions.ts': {
    count: 2,
    reason: 'direct insert and the seat-claim RPC (p_tee_gender), joinTeeGenders',
  },
  'app/[locale]/signup/[shortId]/teamActions.ts': {
    count: 4,
    reason:
      'captain via the seat-claim RPC, known teammate, accepted invite and attach-to-captain upserts, joinTeeGenders',
  },
  // #2216: moved from `app/[locale]/(auth)/login/actions.ts` (`verifyCode`).
  'lib/auth/afterLogin.ts': {
    count: 1,
    reason:
      "game invitation accepted at login (the website's verifyCode and the app's after-login route), joinTeeGenders per inv.game_id",
  },
  'lib/games/inviteToGame.ts': {
    count: 1,
    reason:
      'writeExistingUser: «Inviter» on the game page, the e-mail invite and the app routes (invite, players), joinTeeGenders',
  },
  'lib/games/createGuestPlayer.ts': {
    count: 1,
    reason: "the guest's own M/D/J pick (guestTeeToTeeGender)",
  },
  'lib/league/actions.ts': {
    count: 1,
    reason: 'league round, teeGenderOf (out of scope for #2209, see the PR)',
  },
  'lib/cup/insertCupMatches.ts': {
    count: 1,
    reason: 'cup matches, teeGenderOf (out of scope for #2209, see the PR)',
  },
  'lib/cup/actions.ts': {
    count: 2,
    reason: 'the compensation re-inserts removed rows verbatim; the swap-in uses teeGenderOf',
  },
  'native/app/src/data/createGame.ts': {
    count: 1,
    reason: "the app wizard's per-player teeGender (teeChoiceToDb)",
  },
};

const ROOT = join(__dirname, '..', '..');
const DIRS = ['app', 'lib', 'native/app/src'];
const INSERT = /from\(\s*['"]game_players['"]\s*\)\s*\.(insert|upsert)\(/g;
const SEAT_CLAIM = /['"]claim_open_registration_seat['"]/g;
/** One of these in a file = the file sets the tee category somewhere. */
const TEE_TOKENS = ['tee_gender', 'p_tee_gender', 'joinTeeGenders', 'profileTeeGender'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === '__mocks__' ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

/** Insert sites (insert/upsert + seat-claim RPC calls) per repo-relative file. */
function insertSites(sources: Record<string, string>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [file, text] of Object.entries(sources)) {
    const n = (text.match(INSERT)?.length ?? 0) + (text.match(SEAT_CLAIM)?.length ?? 0);
    if (n > 0) result[file] = n;
  }
  return result;
}

function repoSources(): Record<string, string> {
  return Object.fromEntries(
    DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir))).map((path) => [
      relative(ROOT, path),
      readFileSync(path, 'utf8'),
    ]),
  );
}

describe('game_players insert sites set the tee category (#2209)', () => {
  const sources = repoSources();

  it('every insert site is listed with how it sets the category', () => {
    const expected = Object.fromEntries(
      Object.entries(INSERT_SITES).map(([file, { count }]) => [file, count]),
    );

    expect(insertSites(sources)).toEqual(expected);
  });

  it('every listed file sets the tee category', () => {
    const missing = Object.keys(INSERT_SITES).filter(
      (file) => !TEE_TOKENS.some((token) => sources[file]?.includes(token)),
    );

    expect(missing).toEqual([]);
  });

  it('counts inserts and upserts across line breaks, and seat-claim calls', () => {
    expect(
      insertSites({
        'chained.ts': "await admin\n  .from('game_players')\n  .upsert(rows, { onConflict: 'x' });",
        'inline.ts': "await db.from('game_players').insert({ game_id });",
        'rpc.ts': "await admin.rpc('claim_open_registration_seat', { p_game_id });",
        'read.ts': "await db.from('game_players').select('user_id');",
      }),
    ).toEqual({ 'chained.ts': 1, 'inline.ts': 1, 'rpc.ts': 1 });
  });
});
