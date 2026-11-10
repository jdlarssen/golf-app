import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #2813: which name a player is shown with has one home, `lib/names/playerName.ts`.
 * The rule used to live in some sixty places that disagreed: most put the
 * nickname in the name's place, a few the other way round, and two styles put
 * it next to the name. This scan turns red when a file outside `lib/names/`
 * chooses between `nickname` and `name` on its own, or writes one of the two
 * nickname-next-to-the-name styles by hand. Call `playerName`,
 * `playerFirstName`, `playerShortName`, `playerNameWithNickname` or
 * `playerNameWithNicknameAfter` instead.
 *
 * Searching in the nickname (`${c.name ?? ''} ${c.nickname ?? ''}`) is not a
 * choice and does not match. A file that has to match anyway goes in ALLOWED
 * with its reason.
 */
const ROOTS = ['app', 'components', 'lib', 'native/app/src', 'e2e'];

const ALLOWED: Record<string, string> = {
  // The profile forms edit the nickname itself; nothing is shown in its place.
  'app/[locale]/profile/ProfileFormBody.tsx': 'the profile form compares the edited nickname with the saved one',
  'native/app/src/screens/EditProfile.tsx': "the app's profile form compares the edited nickname with the saved one",
  'app/[locale]/admin/spillere/[id]/actions.ts': "the admin's player form stores an empty nickname as null",
};

// A property path ending in the name or the nickname: `name`, `u?.name`,
// `p.users?.name`, `row.users!.nickname`.
const NAME = String.raw`(?:[\w!]+\??\.)*name\b`;
const NICK = String.raw`(?:[\w!]+\??\.)*\w*[nN]ick(?:name)?\b`;
const TRIM = String.raw`(?:\??\.trim\(\))?`;

const PATTERNS: { label: string; rx: RegExp }[] = [
  { label: 'nickname ?? name', rx: new RegExp(String.raw`${NICK}${TRIM}\s*\?\?\s*${NAME}`) },
  { label: 'nickname || …', rx: new RegExp(String.raw`${NICK}${TRIM}\s*\|\|`) },
  { label: 'name before nickname (?? / ||)', rx: new RegExp(String.raw`\bname${TRIM}\s*(?:\?\?|\|\|)\s*${NICK}`) },
  { label: 'a ternary that yields the nickname', rx: new RegExp(String.raw`\?\s+${NICK}${TRIM}\s*:`) },
  { label: 'if (nickname) return', rx: new RegExp(String.raw`if\s*\(\s*${NICK}${TRIM}\s*\)\s*return\b`) },
  { label: 'the «nickname» style by hand', rx: new RegExp(String.raw`«\$\{\s*${NICK}${TRIM}\s*\}»`) },
  { label: 'the "nickname" style by hand', rx: new RegExp(String.raw`"\$\{\s*${NICK}${TRIM}\s*\}"`) },
];

function breaches(source: string): string[] {
  return PATTERNS.filter(({ rx }) => rx.test(source)).map(({ label }) => label);
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe('the name rule has one home (#2813)', () => {
  it('every pattern catches the forms the rule used to live in', () => {
    const known = [
      'return p.nickname?.trim() || p.name?.trim() || unknownLabel;',
      'name: p.nickname ?? p.name,',
      'return firstName(approver.nickname ?? approver.name);',
      'u?.name?.trim() || u?.nickname?.trim() || null',
      'nameInitials(p.name ?? p.nickname)',
      "p.nickname && p.nickname.length > 0 ? p.nickname : p.name.split(' ')[0]",
      'if (nick) return nick;',
      'return u.nickname ? `${base} «${u.nickname}»` : base;',
      'return `${first} "${trimmedNick}" ${last}`;',
    ];
    for (const line of known) expect(breaches(line), line).not.toEqual([]);
  });

  it('searching in the nickname and showing it as its own field are not a choice', () => {
    const fine = [
      "const hay = `${c.name ?? ''} ${c.nickname ?? ''} ${c.maskedEmail}`.toLowerCase();",
      "return [p.name ?? '', p.nickname ?? '', p.email ?? ''].some((h) =>",
      'nickname: u.nickname ?? null,',
      "defaultValue={target.nickname ?? ''}",
      'if (person.nickname) phrases.push(words(person.nickname));',
      'return playerName(p) ?? unknownLabel;',
    ];
    for (const line of fine) expect(breaches(line), line).toEqual([]);
  });

  it('no file outside lib/names/ chooses between nickname and name', () => {
    const root = process.cwd();
    const offenders: string[] = [];
    for (const dir of ROOTS) {
      for (const file of sourceFiles(join(root, dir))) {
        const rel = relative(root, file);
        if (rel.startsWith('lib/names/') || rel in ALLOWED) continue;
        const hits = breaches(readFileSync(file, 'utf8'));
        if (hits.length > 0) offenders.push(`${rel}: ${hits.join(', ')}`);
      }
    }
    expect(offenders, 'call lib/names/playerName.ts instead').toEqual([]);
  });

  it('every allowed file still exists', () => {
    const root = process.cwd();
    for (const rel of Object.keys(ALLOWED)) {
      expect(() => readFileSync(join(root, rel)), rel).not.toThrow();
    }
  });
});
