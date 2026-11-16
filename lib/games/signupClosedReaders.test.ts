import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #2482: the signup closes by hand («Steng påmeldingen», `signups_closed_at`)
 * or by the organiser's deadline (`signup_deadline`). Every file in app/, lib/
 * and native/app/src that reads `signups_closed_at` is listed below with what
 * it does with it. A `gate` decides whether someone may sign up, or whether a
 * list shows the round as open, so it must see the deadline too: through
 * `isSignupClosed`/`signupClosure` or a helper built on them, or by selecting
 * `signup_deadline` for one. A `manual` site is about closing by hand itself
 * (the toggle and its state) and rightly ignores the deadline.
 *
 * A new reader turns this red: decide which it is, then list it here. The
 * cores that only call `isSignupClosed` (selfRegistration, teamRegistrationCore,
 * teamDashboardCore) no longer read the column and so are not listed.
 */
const READERS: Record<string, { kind: 'gate' | 'manual'; reason: string }> = {
  'lib/games/signupClosed.ts': { kind: 'gate', reason: 'the rule itself' },
  'lib/games/signupOffer.ts': { kind: 'gate', reason: "the page's and the app's «closed» view" },
  'lib/games/appRoundInviteView.ts': { kind: 'gate', reason: "the app's `closure` at `closed`" },
  'lib/games/bringGuest.ts': { kind: 'gate', reason: '«Ta med en gjest»' },
  'lib/games/publicSignupVisibility.ts': {
    kind: 'gate',
    reason: 'isSignupWindowOpen: the public page, the share link and the discovery lists',
  },
  'lib/games/arrangedGames.ts': { kind: 'gate', reason: "the organiser's list: open or closed" },
  'lib/games/terminliste.ts': { kind: 'gate', reason: "the club page's rounds" },
  'lib/games/signupInbox.ts': { kind: 'gate', reason: "the inbox's status line, through isOpenForSignups" },
  'lib/games/getGameByShortId.ts': { kind: 'gate', reason: 'selects both for the signup page and the cores' },
  'lib/games/getDiscoverableGames.ts': {
    kind: 'gate',
    reason: 'selects both; the per-row gate decides, the SQL filter mirrors the manual close only',
  },
  'lib/games/getPublicDiscoverableGames.ts': {
    kind: 'gate',
    reason: 'selects both; isPubliclyViewable decides, the SQL filter mirrors the manual close only',
  },
  'lib/games/getUpcomingClubGames.ts': {
    kind: 'gate',
    reason: 'selects both; its callers gate with isSignupWindowOpen or buildClubRoundEntries',
  },
  'lib/games/getArrangedRounds.ts': { kind: 'gate', reason: 'selects both for arrangedGames' },
  'lib/clubs/getClubRounds.ts': { kind: 'gate', reason: 'passes both to buildClubRoundEntries' },
  'app/[locale]/admin/games/page.tsx': { kind: 'gate', reason: 'selects both for arrangedGames' },
  'app/[locale]/admin/games/[id]/page.tsx': {
    kind: 'gate',
    reason: 'selects both for the share link on RegistrationOverviewSection',
  },
  'app/[locale]/admin/games/[id]/RegistrationOverviewSection.tsx': {
    kind: 'gate',
    reason: 'the share link: isPubliclyViewable',
  },
  'app/[locale]/admin/games/[id]/signups/page.tsx': {
    kind: 'gate',
    reason: "the inbox's status line (signupInboxState); the close/reopen button reads the manual close",
  },
  'app/[locale]/admin/games/[id]/flightActions.ts': {
    kind: 'manual',
    reason: '«Steng påmeldingen» / «Åpne påmeldingen igjen» writes the column',
  },
  'app/[locale]/games/[id]/(home)/page.tsx': { kind: 'gate', reason: 'the «Ta med en gjest» row' },
  'app/[locale]/games/[id]/ta-med-gjest/page.tsx': { kind: 'gate', reason: '«Ta med en gjest»' },
  'app/[locale]/games/[id]/ta-med-gjest/actions.ts': { kind: 'gate', reason: '«Ta med en gjest»' },
  'app/[locale]/games/[id]/klar/page.tsx': { kind: 'gate', reason: 'the share link: isPubliclyViewable' },
  'app/[locale]/games/[id]/spillere/page.tsx': { kind: 'gate', reason: 'the share link: isPubliclyViewable' },
};

const ROOT = join(__dirname, '..', '..');
const DIRS = ['app', 'lib', 'native/app/src'];
/** One of these in a gate file = it sees the deadline. */
const DEADLINE_TOKENS = ['signup_deadline', 'isSignupClosed', 'signupClosure'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ||
        entry.name === '__mocks__' ||
        entry.name === '__fixtures__' ||
        entry.name === 'testing'
        ? []
        : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

describe('signups_closed_at readers see the deadline (#2482)', () => {
  const sources = Object.fromEntries(
    DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir)))
      .map((path) => [relative(ROOT, path), readFileSync(path, 'utf8')] as const)
      .filter(([file, text]) => file !== 'lib/database.types.ts' && text.includes('signups_closed_at')),
  );

  it('every reader is listed', () => {
    expect(Object.keys(sources).sort()).toEqual(Object.keys(READERS).sort());
  });

  it('every gate also reads the deadline', () => {
    const blind = Object.entries(READERS)
      .filter(([, { kind }]) => kind === 'gate')
      .map(([file]) => file)
      .filter((file) => !DEADLINE_TOKENS.some((token) => sources[file]?.includes(token)));
    expect(blind).toEqual([]);
  });
});
