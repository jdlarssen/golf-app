// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  applyToChangelog,
  chooseBump,
  nextVersion,
  parseNote,
  readNotes,
  renderFeatureBlock,
  renderFixLine,
  renderWeekBlock,
  validateNotes,
  weekLabel,
} from './weekly-release.mjs';

const ISSUE = 'https://github.com/jdlarssen/golf-app/issues';

/** Minimal stand-in for CHANGELOG.md: one released week, then the folded history. */
const FIXTURE_CHANGELOG = [
  '# Changelog',
  '',
  'Alle bruker-synlige endringer i Tørny.',
  '',
  '---',
  '',
  '## Ukeslipp',
  '',
  '### 1.232.0 · mandag 10. august 2026',
  '',
  '<details>',
  '<summary><strong>Cupene dine samlet på ett sted</strong></summary>',
  '',
  `[#1463](${ISSUE}/1463) — Gammel brødtekst.`,
  '',
  '↳ /admin/cup · «Åpne cupene»',
  '</details>',
  '',
  '<details>',
  '<summary>2 rettinger</summary>',
  '',
  `- [#1539](${ISSUE}/1539) — Gammel retting.`,
  `- [#1500](${ISSUE}/1500) — Eldre retting.`,
  '</details>',
  '',
  '## Før ukeslippene (1.0 – 1.232)',
  '',
  '<details>',
  '<summary><strong>Versjon per endring — 1.0 til 1.232</strong></summary>',
  '',
  '### Funksjoner',
  '',
  '<details>',
  '<summary><strong>1.231 · En eldre funksjon</strong></summary>',
  '',
  `[#1400](${ISSUE}/1400) — Gammel tekst.`,
  '</details>',
  '',
  '### Feilrettinger',
  '',
  '<details>',
  '<summary><strong>Juli 2026 · 40 rettinger</strong></summary>',
  '',
  `- \`1.214.2\` · [#1344](${ISSUE}/1344) — Enda eldre retting.`,
  '</details>',
  '',
  '</details>',
  '',
].join('\n');

/** Builds a note file body (frontmatter + one-line text) the way an agent writes it. */
function noteFile(front, body) {
  const lines = Object.entries(front).map(([k, v]) => `${k}: ${v}`);
  return ['---', ...lines, '---', body, ''].join('\n');
}

function note(file, front, body) {
  return parseNote(file, noteFile(front, body));
}

const MONDAY = new Date('2026-08-17T03:00:00Z');

describe('parseNote', () => {
  it('reads a full feat note', () => {
    const n = note(
      '1463-cupliste-alle.md',
      { type: 'feat', issue: '1463', title: 'Cupene dine samlet', link: '/admin/cup', cta: 'Åpne cupene' },
      'Cup-lista viser nå alle cupene du er med i.',
    );
    expect(n.errors).toEqual([]);
    expect(n).toMatchObject({
      type: 'feat',
      issues: [1463],
      title: 'Cupene dine samlet',
      link: '/admin/cup',
      cta: 'Åpne cupene',
      body: 'Cup-lista viser nå alle cupene du er med i.',
    });
  });

  it('reads a comma list of issues, with or without the # prefix', () => {
    const n = note('1539-best-ball.md', { type: 'fix', issue: '1539, #1551' }, 'Best ball gir deg slagene du skal ha.');
    expect(n.errors).toEqual([]);
    expect(n.issues).toEqual([1539, 1551]);
  });

  it('accepts an issue-less note', () => {
    const n = note('x-tom-tilstand.md', { type: 'fix' }, 'Tomme lister sier nå hva du kan gjøre.');
    expect(n.errors).toEqual([]);
    expect(n.issues).toEqual([]);
  });

  it('collapses a wrapped body to one line', () => {
    const n = parseNote('x-brytning.md', '---\ntype: fix\n---\nFørste del\nav samme setning.\n');
    expect(n.errors).toEqual([]);
    expect(n.body).toBe('Første del av samme setning.');
  });

  it.each([
    ['missing frontmatter', 'Bare brødtekst uten frontmatter.', /frontmatter/i],
    ['unknown key', '---\ntype: fix\nfarge: rød\n---\nEn retting.\n', /farge/],
    ['unknown type', '---\ntype: chore\n---\nEn endring.\n', /type/],
    ['feat without title', '---\ntype: feat\nissue: 12\n---\nNoe nytt.\n', /title/],
    ['fix with title', '---\ntype: fix\ntitle: Tittel\n---\nEn retting.\n', /title/],
    ['cta without link', '---\ntype: feat\ntitle: T\ncta: Trykk\n---\nNoe nytt.\n', /link/],
    ['link without cta', '---\ntype: feat\ntitle: T\nlink: /admin\n---\nNoe nytt.\n', /cta/],
    ['relative link', '---\ntype: feat\ntitle: T\nlink: admin\ncta: Åpne\n---\nNoe nytt.\n', /\//],
    ['empty body', '---\ntype: fix\nissue: 12\n---\n\n', /brødtekst/i],
    ['non-numeric issue', '---\ntype: fix\nissue: abc\n---\nEn retting.\n', /issue/],
  ])('rejects %s', (_label, raw, pattern) => {
    const n = parseNote('99-ugyldig.md', raw);
    expect(n.errors.length).toBeGreaterThan(0);
    expect(n.errors.join(' ')).toMatch(pattern);
    // Every error names its file so the fail-closed alert issue is actionable.
    expect(n.errors.every((e) => e.startsWith('99-ugyldig.md:'))).toBe(true);
  });

  it('rejects a title over 120 characters', () => {
    const n = note('12-lang.md', { type: 'feat', issue: '12', title: 'A'.repeat(121) }, 'Noe nytt.');
    expect(n.errors.join(' ')).toMatch(/120/);
  });

  it('rejects a cta over 40 characters', () => {
    const n = note(
      '12-lang-cta.md',
      { type: 'feat', issue: '12', title: 'T', link: '/admin', cta: 'B'.repeat(41) },
      'Noe nytt.',
    );
    expect(n.errors.join(' ')).toMatch(/40/);
  });

  it('rejects a body over 400 characters', () => {
    const n = note('12-lang-body.md', { type: 'fix', issue: '12' }, 'C'.repeat(401));
    expect(n.errors.join(' ')).toMatch(/400/);
  });
});

describe('validateNotes', () => {
  it('gathers errors from every note', () => {
    const notes = [
      note('12-ok.md', { type: 'fix', issue: '12' }, 'En retting.'),
      parseNote('13-feil.md', '---\ntype: chore\n---\nEn endring.\n'),
    ];
    const errors = validateNotes(notes);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^13-feil\.md:/);
  });
});

describe('chooseBump', () => {
  it('picks minor when at least one note is a feat', () => {
    const notes = [
      note('12-fix.md', { type: 'fix', issue: '12' }, 'En retting.'),
      note('13-feat.md', { type: 'feat', issue: '13', title: 'Nytt' }, 'Noe nytt.'),
    ];
    expect(chooseBump(notes)).toBe('minor');
  });

  it('picks patch when only fix/perf notes exist', () => {
    const notes = [
      note('12-fix.md', { type: 'fix', issue: '12' }, 'En retting.'),
      note('13-perf.md', { type: 'perf', issue: '13' }, 'Raskere lasting.'),
    ];
    expect(chooseBump(notes)).toBe('patch');
  });

  it('throws on an empty week — an empty release must never be rendered', () => {
    expect(() => chooseBump([])).toThrow();
  });
});

describe('nextVersion', () => {
  it.each([
    ['1.231.2', 'minor', '1.232.0'],
    ['1.231.2', 'patch', '1.231.3'],
    ['1.9.9', 'minor', '1.10.0'],
  ])('%s + %s → %s', (current, bump, expected) => {
    expect(nextVersion(current, bump)).toBe(expected);
  });

  it('rejects a version it cannot parse', () => {
    expect(() => nextVersion('1.2', 'patch')).toThrow();
  });
});

describe('weekLabel', () => {
  it('names the release day in Norwegian long form', () => {
    expect(weekLabel(MONDAY)).toBe('mandag 17. august 2026');
    expect(weekLabel(new Date('2026-09-07T03:00:00Z'))).toBe('mandag 7. september 2026');
  });

  it('uses the Oslo date, not UTC, around midnight', () => {
    // 2026-08-16 22:30 UTC is already Monday 2026-08-17 in Oslo (UTC+2).
    expect(weekLabel(new Date('2026-08-16T22:30:00Z'))).toBe('mandag 17. august 2026');
  });
});

describe('renderFeatureBlock', () => {
  it('renders summary, issue-prefixed body and the launch link', () => {
    const n = note(
      '1463-cupliste.md',
      { type: 'feat', issue: '1463', title: 'Cupene dine samlet', link: '/admin/cup', cta: 'Åpne cupene' },
      'Cup-lista viser nå alle cupene du er med i.',
    );
    expect(renderFeatureBlock(n)).toBe(
      [
        '<details>',
        '<summary><strong>Cupene dine samlet</strong></summary>',
        '',
        `[#1463](${ISSUE}/1463) — Cup-lista viser nå alle cupene du er med i.`,
        '',
        '↳ /admin/cup · «Åpne cupene»',
        '</details>',
      ].join('\n'),
    );
  });

  it('drops the ↳ line when the feature has no destination', () => {
    const n = note('1464-visuelt.md', { type: 'feat', issue: '1464', title: 'Roligere farger' }, 'Fargene er dempet.');
    expect(renderFeatureBlock(n)).toBe(
      [
        '<details>',
        '<summary><strong>Roligere farger</strong></summary>',
        '',
        `[#1464](${ISSUE}/1464) — Fargene er dempet.`,
        '</details>',
      ].join('\n'),
    );
  });
});

describe('renderFixLine', () => {
  it('renders issue link and sentence', () => {
    const n = note('1542-tomt-kort.md', { type: 'fix', issue: '1542' }, 'Scorekortet står ikke lenger tomt.');
    expect(renderFixLine(n)).toBe(`- [#1542](${ISSUE}/1542) — Scorekortet står ikke lenger tomt.`);
  });

  it('renders a comma list of issues as separate links', () => {
    const n = note('1539-best-ball.md', { type: 'fix', issue: '1539, 1551' }, 'Best ball gir deg slagene du skal ha.');
    expect(renderFixLine(n)).toBe(
      `- [#1539](${ISSUE}/1539), [#1551](${ISSUE}/1551) — Best ball gir deg slagene du skal ha.`,
    );
  });

  it('drops the link on an issue-less retting', () => {
    const n = note('x-gammel.md', { type: 'fix' }, 'En gammel retting.');
    expect(renderFixLine(n)).toBe('- En gammel retting.');
  });
});

const featA = () =>
  note(
    '1463-cupliste.md',
    { type: 'feat', issue: '1463', title: 'Cupene samlet', link: '/admin/cup', cta: 'Åpne cupene' },
    'Cup-lista viser nå alle cupene du er med i.',
  );
const featB = () =>
  note(
    '1470-liga.md',
    { type: 'feat', issue: '1470', title: 'Ligaen i Klubbhuset', link: '/admin/liga', cta: 'Åpne ligaen' },
    'Ligaen din ligger nå i Klubbhuset.',
  );
const fixA = () => note('1542-tomt-kort.md', { type: 'fix', issue: '1542' }, 'Scorekortet står ikke lenger tomt.');
const fixB = () => note('1545-slag.md', { type: 'perf', issue: '1545' }, 'Tabellen laster raskere.');

describe('renderWeekBlock', () => {
  it('renders the whole week: heading, feature rows, then one drawer of rettinger', () => {
    const block = renderWeekBlock({ version: '1.233.0', notes: [featB(), featA(), fixB(), fixA()], now: MONDAY });
    expect(block).toBe(
      [
        '### 1.233.0 · mandag 17. august 2026',
        '',
        '<details>',
        '<summary><strong>Cupene samlet</strong></summary>',
        '',
        `[#1463](${ISSUE}/1463) — Cup-lista viser nå alle cupene du er med i.`,
        '',
        '↳ /admin/cup · «Åpne cupene»',
        '</details>',
        '',
        '<details>',
        '<summary><strong>Ligaen i Klubbhuset</strong></summary>',
        '',
        `[#1470](${ISSUE}/1470) — Ligaen din ligger nå i Klubbhuset.`,
        '',
        '↳ /admin/liga · «Åpne ligaen»',
        '</details>',
        '',
        '<details>',
        '<summary>2 rettinger</summary>',
        '',
        `- [#1542](${ISSUE}/1542) — Scorekortet står ikke lenger tomt.`,
        `- [#1545](${ISSUE}/1545) — Tabellen laster raskere.`,
        '</details>',
      ].join('\n'),
    );
  });

  it('leaves out the drawer when the week only shipped features', () => {
    const block = renderWeekBlock({ version: '1.233.0', notes: [featA()], now: MONDAY });
    expect(block).toBe(
      [
        '### 1.233.0 · mandag 17. august 2026',
        '',
        '<details>',
        '<summary><strong>Cupene samlet</strong></summary>',
        '',
        `[#1463](${ISSUE}/1463) — Cup-lista viser nå alle cupene du er med i.`,
        '',
        '↳ /admin/cup · «Åpne cupene»',
        '</details>',
      ].join('\n'),
    );
  });

  it('counts a single retting in the singular on a fix-only week', () => {
    const block = renderWeekBlock({ version: '1.232.1', notes: [fixA()], now: MONDAY });
    expect(block).toBe(
      [
        '### 1.232.1 · mandag 17. august 2026',
        '',
        '<details>',
        '<summary>1 retting</summary>',
        '',
        `- [#1542](${ISSUE}/1542) — Scorekortet står ikke lenger tomt.`,
        '</details>',
      ].join('\n'),
    );
  });

  it('renders an issue-less retting without a link', () => {
    const n = note('x-gammel.md', { type: 'fix' }, 'En gammel retting.');
    const block = renderWeekBlock({ version: '1.232.1', notes: [n], now: MONDAY });
    expect(block.split('\n').at(-2)).toBe('- En gammel retting.');
  });
});

describe('applyToChangelog', () => {
  it('puts the new week straight under the heading, above last week', () => {
    const { text } = applyToChangelog(FIXTURE_CHANGELOG, {
      version: '1.233.0',
      notes: [featA(), fixA()],
      now: MONDAY,
    });
    const lines = text.split('\n');
    const heading = lines.indexOf('## Ukeslipp');
    expect(lines.slice(heading + 1, heading + 6)).toEqual([
      '',
      '### 1.233.0 · mandag 17. august 2026',
      '',
      '<details>',
      '<summary><strong>Cupene samlet</strong></summary>',
    ]);
    // Last week's block survives untouched, below the new one.
    expect(text).toContain('### 1.232.0 · mandag 10. august 2026');
    expect(text.indexOf('### 1.233.0 ·')).toBeLessThan(text.indexOf('### 1.232.0 ·'));
    expect(text).toContain('<summary>2 rettinger</summary>');
  });

  it('reports exactly one edit — the week is a single block', () => {
    const { edits } = applyToChangelog(FIXTURE_CHANGELOG, {
      version: '1.233.0',
      notes: [featA(), featB(), fixA(), fixB()],
      now: MONDAY,
    });
    expect(edits).toHaveLength(1);
  });

  it('touches nothing but the insertion point', () => {
    const before = FIXTURE_CHANGELOG.split('\n');
    const { text } = applyToChangelog(FIXTURE_CHANGELOG, {
      version: '1.233.0',
      notes: [featA()],
      now: MONDAY,
    });
    const after = text.split('\n');
    const heading = after.indexOf('## Ukeslipp');
    // Everything above the anchor, and everything from last week's block down, is byte-identical.
    expect(after.slice(0, heading + 2)).toEqual(before.slice(0, heading + 2));
    const tail = (arr) => arr.slice(arr.indexOf('### 1.232.0 · mandag 10. august 2026'));
    expect(tail(after)).toEqual(tail(before));
  });

  it('fails closed when the Ukeslipp heading is missing', () => {
    expect(() =>
      applyToChangelog('# Changelog\n\n## Feilrettinger\n\n', { version: '1.233.0', notes: [fixA()], now: MONDAY }),
    ).toThrow(/Ukeslipp/);
  });

  it('fails closed when the version already has a block — one week, one entry', () => {
    expect(() =>
      applyToChangelog(FIXTURE_CHANGELOG, { version: '1.232.0', notes: [fixA()], now: MONDAY }),
    ).toThrow(/1\.232\.0/);
  });
});

describe('readNotes', () => {
  it('reads every note but skips README.md', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'weekly-release-'));
    try {
      mkdirSync(path.join(dir, '.changes'));
      writeFileSync(path.join(dir, '.changes', 'README.md'), '# Slik skriver du et notat\n');
      writeFileSync(
        path.join(dir, '.changes', '1542-tomt-kort.md'),
        noteFile({ type: 'fix', issue: '1542' }, 'Scorekortet står ikke lenger tomt.'),
      );
      const { notes, errors } = readNotes(path.join(dir, '.changes'));
      expect(errors).toEqual([]);
      expect(notes.map((n) => n.file)).toEqual(['1542-tomt-kort.md']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns nothing when the directory does not exist', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'weekly-release-'));
    try {
      expect(readNotes(path.join(dir, '.changes'))).toEqual({ notes: [], errors: [] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags a stray non-markdown file instead of ignoring it', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'weekly-release-'));
    try {
      mkdirSync(path.join(dir, '.changes'));
      writeFileSync(path.join(dir, '.changes', 'notat.txt'), 'glemt filending');
      const { notes, errors } = readNotes(path.join(dir, '.changes'));
      expect(notes).toEqual([]);
      expect(errors.join(' ')).toMatch(/notat\.txt/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sorts notes by filename so multi-note weeks render deterministically', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'weekly-release-'));
    try {
      mkdirSync(path.join(dir, '.changes'));
      for (const name of ['1545-b.md', '1542-a.md', 'x-c.md']) {
        writeFileSync(path.join(dir, '.changes', name), noteFile({ type: 'fix' }, 'En retting.'));
      }
      const { notes } = readNotes(path.join(dir, '.changes'));
      expect(notes.map((n) => n.file)).toEqual(['1542-a.md', '1545-b.md', 'x-c.md']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
