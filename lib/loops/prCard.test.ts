import { describe, expect, it } from 'vitest';
import {
  buildCardPayload,
  CARD_LABEL,
  classifyChecks,
  extractPrSummary,
  waitForChecksToSettle,
  type CheckRun,
} from './prCard';

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
});

describe('buildCardPayload', () => {
  const basePr = {
    number: 1159,
    title: 'Discord merge-kort for alle PR-er',
    html_url: 'https://github.com/jdlarssen/golf-app/pull/1159',
    draft: false,
  };

  it('lager grønn merge-knapp med custom_id merge_pr:<N>', () => {
    const msg = buildCardPayload({ pr: basePr, summary: 'En oppsummering.' });
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
    const msg = buildCardPayload({ pr: basePr, summary: null });
    const linkBtn = msg.components[0].components[1];
    expect(linkBtn).toMatchObject({ type: 2, style: 5, url: basePr.html_url });
  });

  it('inkluderer tittel, oppsummering og lenke i teksten', () => {
    const msg = buildCardPayload({ pr: basePr, summary: 'En oppsummering.' });
    expect(msg.content).toContain('PR #1159');
    expect(msg.content).toContain(basePr.title);
    expect(msg.content).toContain('En oppsummering.');
    expect(msg.content).toContain(basePr.html_url);
  });

  it('viser draft-merkelapp kun for draft-PR-er', () => {
    expect(buildCardPayload({ pr: { ...basePr, draft: true }, summary: null }).content).toContain(
      '📝 Draft',
    );
    expect(buildCardPayload({ pr: basePr, summary: null }).content).not.toContain('📝 Draft');
  });

  it('utelater oppsummeringslinja når summary er null', () => {
    const msg = buildCardPayload({ pr: basePr, summary: null });
    // Kun tittel-linje + lenke-linje.
    expect(msg.content.split('\n')).toHaveLength(2);
  });
});

describe('CARD_LABEL', () => {
  it('er en stabil dedup-label', () => {
    expect(CARD_LABEL).toBe('discord:merge-kort');
  });
});
