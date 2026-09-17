import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildCardPayload,
  buildReceiptPayload,
  CARD_CHECK_NAME,
  CARD_LABEL,
  CI_PATHS_IGNORE,
  classifyChecks,
  classifyWithCiGate,
  expectsRealCi,
  extractFunctionalSection,
  extractPrSummary,
  shouldHandOffToRelay,
  waitForChecksToSettle,
  type CheckRun,
} from './prCard';
import { type CiRunsLookup } from './ciRuns';

describe('extractPrSummary', () => {
  it('trekker ut taglinen etter Closes-linja', () => {
    const body = 'Closes #1159\n\nDu kan nå merge enhver klar PR fra Discord.';
    expect(extractPrSummary(body)).toBe('Du kan nå merge enhver klar PR fra Discord.');
  });

  it('hopper over Part of / Refs / Fixes-linjer', () => {
    expect(extractPrSummary('Part of #1159\n\nKortet kommer av seg selv.')).toBe(
      'Kortet kommer av seg selv.',
    );
    expect(extractPrSummary('Refs #1159\nFixes #12\n\nEn ekte tagline.')).toBe('En ekte tagline.');
  });

  it('returnerer null når body kun har en issue-referanse', () => {
    expect(extractPrSummary('Closes #1158')).toBeNull();
  });

  it('returnerer null for tom/manglende body', () => {
    expect(extractPrSummary(null)).toBeNull();
    expect(extractPrSummary(undefined)).toBeNull();
    expect(extractPrSummary('')).toBeNull();
    expect(extractPrSummary('   \n\n  ')).toBeNull();
  });

  it('hopper over overskrifter, bot-markører, HTML-kommentarer og co-author', () => {
    const body = [
      'Closes #1159',
      '## Teknisk',
      '<!-- auto -->',
      '🤖 Generated with Claude Code',
      'Co-Authored-By: Claude <noreply@anthropic.com>',
      '',
      'Den ekte oppsummeringen.',
    ].join('\n');
    expect(extractPrSummary(body)).toBe('Den ekte oppsummeringen.');
  });

  it('stripper ledende list-/sitat-markør', () => {
    expect(extractPrSummary('Closes #1\n\n- En tagline i liste')).toBe('En tagline i liste');
  });

  it('kutter svært lange linjer', () => {
    const long = 'a'.repeat(400);
    const out = extractPrSummary(`Closes #1\n\n${long}`);
    expect(out).toHaveLength(298); // 297 tegn + ellipsis
    expect(out?.endsWith('…')).toBe(true);
  });
});

describe('classifyChecks', () => {
  const run = (status: string, conclusion: string | null): CheckRun => ({ status, conclusion });
  const green = (): CheckRun => run('completed', 'success');

  it('tom liste er pending (carder aldri en PR uten CI)', () => {
    expect(classifyChecks([])).toBe('pending');
  });

  it('pending når minst én check ikke er completed', () => {
    expect(classifyChecks([run('completed', 'success'), run('in_progress', null)])).toBe('pending');
    expect(classifyChecks([run('queued', null)])).toBe('pending');
  });

  it('red når en fullført check har dårlig konklusjon', () => {
    expect(classifyChecks([run('completed', 'success'), run('completed', 'failure')])).toBe('red');
    expect(classifyChecks([run('completed', 'timed_out')])).toBe('red');
    expect(classifyChecks([run('completed', 'cancelled')])).toBe('red');
    expect(classifyChecks([run('completed', 'action_required')])).toBe('red');
  });

  it('green når alle fullført uten dårlig konklusjon', () => {
    expect(classifyChecks([green(), run('completed', 'skipped'), run('completed', 'neutral')])).toBe(
      'green',
    );
  });

  // #1520: kortets EGEN check henger på PR-head-en ved pull_request-fyringer —
  // den er in_progress under hele decide, og en kansellert kortkjøring låste
  // tidligere SHA-en rød for alle senere fyringer.
  describe('kortets egen post-card-check', () => {
    const card = (status: string, conclusion: string | null): CheckRun => ({
      name: CARD_CHECK_NAME,
      status,
      conclusion,
    });

    it('in_progress post-card blokkerer ikke grønt', () => {
      expect(classifyChecks([green(), card('in_progress', null)])).toBe('green');
    });

    it('cancelled post-card gjør ikke PR-en rød', () => {
      expect(classifyChecks([green(), card('completed', 'cancelled')])).toBe('green');
    });

    it('en ekte check med cancelled er fortsatt rød', () => {
      expect(
        classifyChecks([green(), { name: 'verify', status: 'completed', conclusion: 'cancelled' }]),
      ).toBe('red');
    });

    it('kun post-card registrert → pending (ingen ekte CI å bedømme)', () => {
      expect(classifyChecks([card('completed', 'success')])).toBe('pending');
    });
  });
});

describe('expectsRealCi', () => {
  it.each([
    [['docs/loops/discord-pr-kort.md']],
    [['README.md']],
    [['.forge/contracts/1520-pr-card-classify.md']],
    // `**` krysser `/` i GitHubs filter: en .md hvor som helst er docs-only.
    [['.changes/1520-pr-kort.md']],
    [['e2e/notat.md']],
    [['docs/flows/opprett-fremtid.svg']],
    [['docs/x.md', '.forge/y.md', 'README.md']],
  ])('docs-only-liste %j forventer ingen ci.yml-kjøring', (files) => {
    expect(expectsRealCi(files)).toBe(false);
  });

  it.each([
    [['lib/loops/prCard.ts']],
    [['.github/workflows/ci.yml']],
    [['docs/loops/kort.md', 'lib/loops/prCard.ts']], // blandet
    [['package.json']],
  ])('kode i lista %j forventer ci.yml-kjøring', (files) => {
    expect(expectsRealCi(files)).toBe(true);
  });

  it('tom liste forventer ingen kjøring (ingenting å bygge)', () => {
    expect(expectsRealCi([])).toBe(false);
  });

  it('null (oppslaget feilet) slår gaten PÅ — fail-closed', () => {
    expect(expectsRealCi(null)).toBe(true);
  });
});

// Lockstep mot workflow-filene: helperen speiler ci.yml sin paths-ignore, og
// selv-check-filteret speiler jobnavnet i kort-workflowen. Drifter noen av dem,
// feiler denne testen i stedet for at gaten stille slutter å virke (#1520).
describe('lockstep mot .github/workflows', () => {
  const workflow = (file: string) =>
    fs.readFileSync(path.resolve(__dirname, '../../.github/workflows', file), 'utf-8');

  it('CI_PATHS_IGNORE er nøyaktig paths-ignore-lista i ci.yml', () => {
    const block = /paths-ignore:\n((?:\s*-\s*'[^']+'\n)+)/.exec(workflow('ci.yml'));
    expect(block, 'fant ingen paths-ignore-blokk i ci.yml').not.toBeNull();
    const patterns = [...block![1].matchAll(/-\s*'([^']+)'/g)].map((m) => m[1]);
    expect(patterns).toEqual([...CI_PATHS_IGNORE]);
  });

  it('CARD_CHECK_NAME er jobnavnet i discord-pr-card.yml', () => {
    expect(workflow('discord-pr-card.yml')).toContain(`\n  ${CARD_CHECK_NAME}:\n`);
  });
});

describe('classifyWithCiGate', () => {
  const green: CheckRun[] = [{ name: 'verify', status: 'completed', conclusion: 'success' }];
  const found: CiRunsLookup = { ok: true, runs: [{ id: 9, status: 'completed', conclusion: 'success' }] };
  const none: CiRunsLookup = { ok: true, runs: [] };

  function gate(lookup: CiRunsLookup, opts: { runs?: CheckRun[]; expectsCi?: boolean } = {}) {
    const fetchCiRuns = vi.fn(async () => lookup);
    return {
      fetchCiRuns,
      run: () =>
        classifyWithCiGate({
          runs: opts.runs ?? green,
          expectsCi: opts.expectsCi ?? true,
          fetchCiRuns,
        }),
    };
  }

  it('grønne checks + registrert ci.yml-kjøring → green', async () => {
    const g = gate(found);
    await expect(g.run()).resolves.toBe('green');
    expect(g.fetchCiRuns).toHaveBeenCalledTimes(1);
  });

  it('grønne checks uten registrert ci.yml-kjøring → pending (tvilling-vinduet)', async () => {
    const g = gate(none);
    await expect(g.run()).resolves.toBe('pending');
  });

  it('feilet run-oppslag → pending (fail-closed, aldri stille gate-av)', async () => {
    const g = gate({ ok: false, status: 502 });
    await expect(g.run()).resolves.toBe('pending');
  });

  it('docs-only (expectsCi=false) slipper grønt gjennom uten oppslag', async () => {
    const g = gate(none, { expectsCi: false });
    await expect(g.run()).resolves.toBe('green');
    expect(g.fetchCiRuns).not.toHaveBeenCalled();
  });

  it('ikke-grønne checks avgjøres uten oppslag (billig guard sist)', async () => {
    const pendingRuns: CheckRun[] = [{ status: 'in_progress', conclusion: null }];
    const redRuns: CheckRun[] = [{ status: 'completed', conclusion: 'failure' }];
    const p = gate(found, { runs: pendingRuns });
    await expect(p.run()).resolves.toBe('pending');
    expect(p.fetchCiRuns).not.toHaveBeenCalled();
    const r = gate(found, { runs: redRuns });
    await expect(r.run()).resolves.toBe('red');
    expect(r.fetchCiRuns).not.toHaveBeenCalled();
  });
});

describe('shouldHandOffToRelay', () => {
  const running: CiRunsLookup = { ok: true, runs: [{ id: 1, status: 'in_progress', conclusion: null }] };
  const queued: CiRunsLookup = { ok: true, runs: [{ id: 1, status: 'queued', conclusion: null }] };
  const done: CiRunsLookup = { ok: true, runs: [{ id: 1, status: 'completed', conclusion: 'success' }] };
  const none: CiRunsLookup = { ok: true, runs: [] };

  it('pull_request + ci.yml in_progress → overlever til relékjøringen', () => {
    expect(shouldHandOffToRelay({ event: 'pull_request', expectsCi: true, ciRuns: running })).toBe(true);
  });

  it('pull_request + ci.yml queued → overlever (workflow_run fyrer når den lander)', () => {
    expect(shouldHandOffToRelay({ event: 'pull_request', expectsCi: true, ciRuns: queued })).toBe(true);
  });

  it('pull_request + ci.yml completed → vent (ingen ny workflow_run kommer)', () => {
    expect(shouldHandOffToRelay({ event: 'pull_request', expectsCi: true, ciRuns: done })).toBe(false);
  });

  it('pull_request + én fullført og én re-kjøring i gang → overlever', () => {
    const mixed: CiRunsLookup = {
      ok: true,
      runs: [
        { id: 1, status: 'completed', conclusion: 'success' },
        { id: 2, status: 'in_progress', conclusion: null },
      ],
    };
    expect(shouldHandOffToRelay({ event: 'pull_request', expectsCi: true, ciRuns: mixed })).toBe(true);
  });

  it('pull_request + ingen registrert ci.yml-kjøring → vent', () => {
    expect(shouldHandOffToRelay({ event: 'pull_request', expectsCi: true, ciRuns: none })).toBe(false);
  });

  it('pull_request + feilet oppslag (ok: false) → vent (fail-closed)', () => {
    expect(
      shouldHandOffToRelay({ event: 'pull_request', expectsCi: true, ciRuns: { ok: false, status: 502 } }),
    ).toBe(false);
  });

  it('workflow_dispatch + ci.yml in_progress → vent (re-post-verktøyet venter alltid)', () => {
    expect(shouldHandOffToRelay({ event: 'workflow_dispatch', expectsCi: true, ciRuns: running })).toBe(false);
  });

  it('workflow_run (tvillingen) + ci.yml in_progress → vent', () => {
    expect(shouldHandOffToRelay({ event: 'workflow_run', expectsCi: true, ciRuns: running })).toBe(false);
  });

  it('docs-only-diff (expectsCi=false) → vent, også med en kjøring i gang', () => {
    expect(shouldHandOffToRelay({ event: 'pull_request', expectsCi: false, ciRuns: running })).toBe(false);
  });

  it('manglende event (lokal kjøring) → vent', () => {
    expect(shouldHandOffToRelay({ event: undefined, expectsCi: true, ciRuns: running })).toBe(false);
  });
});

describe('waitForChecksToSettle', () => {
  const green: CheckRun[] = [{ status: 'completed', conclusion: 'success' }];
  const pending: CheckRun[] = [{ status: 'in_progress', conclusion: null }];
  const red: CheckRun[] = [{ status: 'completed', conclusion: 'failure' }];

  // Fake fetcher/sleep: leverer sekvensen én og én, teller kall.
  function harness(sequence: CheckRun[][]) {
    let fetches = 0;
    let sleeps = 0;
    return {
      fetchRuns: async () => sequence[Math.min(fetches++, sequence.length - 1)],
      sleep: async () => {
        sleeps++;
      },
      counts: () => ({ fetches, sleeps }),
    };
  }

  it('returnerer green uten å sove når første henting er grønn', async () => {
    const h = harness([green]);
    await expect(
      waitForChecksToSettle({ fetchRuns: h.fetchRuns, maxAttempts: 5, sleep: h.sleep }),
    ).resolves.toBe('green');
    expect(h.counts()).toEqual({ fetches: 1, sleeps: 0 });
  });

  it('poller forbi tom liste og pending til sjekkene lander grønt', async () => {
    const h = harness([[], pending, green]);
    await expect(
      waitForChecksToSettle({ fetchRuns: h.fetchRuns, maxAttempts: 5, sleep: h.sleep }),
    ).resolves.toBe('green');
    expect(h.counts()).toEqual({ fetches: 3, sleeps: 2 });
  });

  it('returnerer red straks en fullført sjekk er rød', async () => {
    const h = harness([pending, red]);
    await expect(
      waitForChecksToSettle({ fetchRuns: h.fetchRuns, maxAttempts: 5, sleep: h.sleep }),
    ).resolves.toBe('red');
    expect(h.counts()).toEqual({ fetches: 2, sleeps: 1 });
  });

  it('gir opp som pending når forsøkene er brukt opp', async () => {
    const h = harness([pending]);
    await expect(
      waitForChecksToSettle({ fetchRuns: h.fetchRuns, maxAttempts: 3, sleep: h.sleep }),
    ).resolves.toBe('pending');
    expect(h.counts()).toEqual({ fetches: 3, sleeps: 2 });
  });

  // Sømmen ci.yml-gaten henger på (#1520): den kjøres per forsøk, ikke bare
  // på det siste — grønne check-runs kan holdes tilbake mens vi venter på at
  // ci.yml-kjøringen registreres.
  it('bruker en injisert classify på hvert forsøk', async () => {
    const h = harness([green]);
    const classify = vi
      .fn<(runs: CheckRun[]) => 'pending' | 'green'>()
      .mockReturnValueOnce('pending')
      .mockReturnValueOnce('green');
    await expect(
      waitForChecksToSettle({ fetchRuns: h.fetchRuns, maxAttempts: 5, sleep: h.sleep, classify }),
    ).resolves.toBe('green');
    expect(classify).toHaveBeenCalledTimes(2);
    expect(classify).toHaveBeenLastCalledWith(green);
    expect(h.counts()).toEqual({ fetches: 2, sleeps: 1 });
  });
});

describe('extractFunctionalSection', () => {
  it('henter seksjonsteksten og fjerner arbeiderens «Kan merges»-linje', () => {
    const body = [
      'Closes #2147',
      '',
      '## Funksjonelt',
      '',
      'Du ser nå hva PR-en gjør rett i Discord.',
      '',
      'Kan merges: ja',
    ].join('\n');
    expect(extractFunctionalSection(body)).toBe('Du ser nå hva PR-en gjør rett i Discord.');
  });

  it('fjerner også «Venter på deg:»-linja og slår sammen blanke linjer', () => {
    const body = '### funksjonelt\n\nFørste setning.\n\n\n\nAndre setning.\nVenter på deg: prod-migrasjon\n';
    expect(extractFunctionalSection(body)).toBe('Første setning.\n\nAndre setning.');
  });

  it('fjerner også en punktmerket eller fet arbeider-linje', () => {
    const body = '## Funksjonelt\nSpillerne ser X.\n- Kan merges: ja\n**Venter på deg:** prod-migrasjon';
    expect(extractFunctionalSection(body)).toBe('Spillerne ser X.');
  });

  it('deler ikke en emoji ved kuttet', () => {
    // 598 + 5 emoji = 603 tegn; et kutt i UTF-16-enheter ville delt emoji nr. 1.
    const out = extractFunctionalSection(`## Funksjonelt\n${'a'.repeat(598)}${'😀'.repeat(5)}`);
    expect(Array.from(out ?? '')).toHaveLength(600);
    expect(out).not.toMatch(/[\uD800-\uDBFF]…$/);
  });

  it('slutter ved neste heading', () => {
    const body = '## Funksjonelt\nSpillerne ser X.\n## Teknisk\nFil a.ts endret.';
    expect(extractFunctionalSection(body)).toBe('Spillerne ser X.');
  });

  it('kutter til 600 tegn med «…» til slutt', () => {
    const body = `## Funksjonelt\n${'a'.repeat(900)}`;
    const out = extractFunctionalSection(body);
    expect(out).toHaveLength(600);
    expect(out?.endsWith('…')).toBe(true);
  });

  it('mangler seksjonen → null', () => {
    expect(extractFunctionalSection('Closes #1\n\nEn tagline.\n## Teknisk\nx')).toBeNull();
    expect(extractFunctionalSection(null)).toBeNull();
  });

  it('tom seksjon (bare «Kan merges»-linja) → null', () => {
    expect(extractFunctionalSection('## Funksjonelt\n\nKan merges: ja\n## Teknisk')).toBeNull();
  });
});

describe('buildCardPayload', () => {
  const basePr = {
    number: 1159,
    title: 'Discord merge-kort for alle PR-er',
    html_url: 'https://github.com/jdlarssen/golf-app/pull/1159',
    draft: false,
  };
  const base = {
    pr: basePr,
    summary: 'En oppsummering.',
    functional: 'Du kan nå merge fra Discord.',
    waitReasons: ['rører merge-porten/verktøyene'],
  };

  it('lager grønn merge-knapp med custom_id merge_pr:<N>', () => {
    const msg = buildCardPayload(base);
    const row = msg.components[0];
    expect(row.type).toBe(1);
    const mergeBtn = row.components[0];
    expect(mergeBtn).toMatchObject({
      type: 2,
      style: 3,
      label: '✅ Merge PR #1159',
      custom_id: 'merge_pr:1159',
    });
  });

  it('legger til en lenke-knapp til PR-en', () => {
    const msg = buildCardPayload({ ...base, summary: null });
    const linkBtn = msg.components[0].components[1];
    expect(linkBtn).toMatchObject({ type: 2, style: 5, url: basePr.html_url });
  });

  it('viser draft-merkelapp kun for draft-PR-er', () => {
    expect(buildCardPayload({ ...base, pr: { ...basePr, draft: true } }).content).toContain('📝 Draft');
    expect(buildCardPayload(base).content).not.toContain('📝 Draft');
  });

  it('tittel → Funksjonelt → venter-linje → lenke (summary vises ikke når seksjonen finnes)', () => {
    const msg = buildCardPayload({
      ...base,
      waitReasons: ['rører innlogging/konto', 'mangler staging-bevis'],
    });
    expect(msg.content.split('\n')).toEqual([
      `**PR #1159** — ${basePr.title}`,
      'Du kan nå merge fra Discord.',
      '⏳ Venter på deg: rører innlogging/konto, mangler staging-bevis',
      basePr.html_url,
    ]);
  });

  it('uten Funksjonelt → fallback-tekst pluss summary', () => {
    const msg = buildCardPayload({ ...base, functional: null });
    expect(msg.content.split('\n')).toEqual([
      `**PR #1159** — ${basePr.title}`,
      '_(ingen funksjonell beskrivelse i PR-en)_',
      'En oppsummering.',
      '⏳ Venter på deg: rører merge-porten/verktøyene',
      basePr.html_url,
    ]);
  });

  it('uten Funksjonelt og uten summary → bare fallback-teksten', () => {
    const msg = buildCardPayload({ ...base, functional: null, summary: null });
    expect(msg.content.split('\n')).toHaveLength(4);
    expect(msg.content).toContain('_(ingen funksjonell beskrivelse i PR-en)_');
  });

  it('tom grunn-liste → «automatisk merge gikk ikke»', () => {
    const msg = buildCardPayload({ ...base, waitReasons: [] });
    expect(msg.content).toContain('⏳ Venter på deg: automatisk merge gikk ikke');
  });

  it('holder seg under Discords 2000-tegnsgrense', () => {
    const msg = buildCardPayload({ ...base, pr: { ...basePr, title: 'x'.repeat(2500) } });
    expect(msg.content.length).toBeLessThanOrEqual(2000);
  });
});

describe('buildReceiptPayload', () => {
  const basePr = {
    number: 1406,
    title: 'Auto-merge PR-kortet',
    html_url: 'https://github.com/jdlarssen/golf-app/pull/1406',
    draft: false,
  };

  it('har KUN lenke-knappen — ingen merge_pr-knapp', () => {
    const msg = buildReceiptPayload({ pr: basePr, summary: 'En oppsummering.' });
    const row = msg.components[0];
    expect(row.components).toHaveLength(1);
    const btn = row.components[0];
    expect(btn).toMatchObject({ type: 2, style: 5, label: 'Åpne PR', url: basePr.html_url });
    expect(JSON.stringify(msg)).not.toContain('merge_pr');
  });

  it('melder «Merget» + tittel + oppsummering + lenke', () => {
    const msg = buildReceiptPayload({ pr: basePr, summary: 'Du kan nå merge fra Discord.' });
    expect(msg.content).toContain('✅ **Merget**');
    expect(msg.content).toContain('PR #1406');
    expect(msg.content).toContain(basePr.title);
    expect(msg.content).toContain('Du kan nå merge fra Discord.');
    expect(msg.content).toContain(basePr.html_url);
  });

  it('faller tilbake til tittelen som funksjonell-setning når summary er null', () => {
    const msg = buildReceiptPayload({ pr: basePr, summary: null });
    const lines = msg.content.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe(basePr.title);
  });
});

describe('CARD_LABEL', () => {
  it('er en stabil dedup-label', () => {
    expect(CARD_LABEL).toBe('discord:merge-kort');
  });
});
