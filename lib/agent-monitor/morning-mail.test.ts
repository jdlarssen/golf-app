import { describe, it, expect } from 'vitest';
import { renderMorningMail, type MorningMailInput } from './morning-mail';

const baseInput: MorningMailInput = {
  fixed: [],
  pending: [],
  needsJudgment: [],
  totalErrorsLogged: 0,
  totalUsersAffected: 0,
};

describe('renderMorningMail', () => {
  it('returns null when there are no findings (quiet night)', () => {
    expect(renderMorningMail(baseInput)).toBeNull();
  });

  it('renders subject with fixed and pending counts', () => {
    const mail = renderMorningMail({
      ...baseInput,
      fixed: [{ time: '02:14', summary: 'Resend retry tweak', ref: 'abc123', refType: 'commit' }],
      pending: [{ time: '04:22', summary: 'Crash in /admin/avslutt', ref: '42', refType: 'pr' }],
    });
    expect(mail?.subject).toBe('Nattlig oppsummering — 1 fixet, 1 venter på deg');
  });

  it('omits sections that are empty', () => {
    const mail = renderMorningMail({
      ...baseInput,
      fixed: [{ time: '02:14', summary: 'Typo fixed', ref: 'def456', refType: 'commit' }],
    });
    expect(mail?.html).toContain('Jeg fikset');
    expect(mail?.html).not.toContain('Venter på din godkjenning');
    expect(mail?.html).not.toContain('Trenger din vurdering');
  });

  it('renders commit links to github.com/jdlarssen/golf-app', () => {
    const mail = renderMorningMail({
      ...baseInput,
      fixed: [{ time: '02:14', summary: 'X', ref: 'abc123', refType: 'commit' }],
    });
    expect(mail?.html).toContain('https://github.com/jdlarssen/golf-app/commit/abc123');
  });

  it('renders PR links to github.com/jdlarssen/golf-app/pull/N', () => {
    const mail = renderMorningMail({
      ...baseInput,
      pending: [{ time: '04:22', summary: 'X', ref: '42', refType: 'pr' }],
    });
    expect(mail?.html).toContain('https://github.com/jdlarssen/golf-app/pull/42');
  });

  it('escapes HTML in summaries', () => {
    const mail = renderMorningMail({
      ...baseInput,
      fixed: [{ time: '02:14', summary: 'Fixed <script>alert(1)</script>', ref: 'a', refType: 'commit' }],
    });
    expect(mail?.html).not.toContain('<script>alert(1)</script>');
    expect(mail?.html).toContain('&lt;script&gt;');
  });

  it('escapes HTML in commit refs', () => {
    const mail = renderMorningMail({
      ...baseInput,
      fixed: [{ time: '02:14', summary: 'X', ref: '"><img src=x onerror=alert(1)>', refType: 'commit' }],
    });
    expect(mail?.html).not.toContain('<img src=x onerror=alert(1)>');
    expect(mail?.html).toContain('&quot;&gt;&lt;img');
  });

  it('includes the impact footer', () => {
    const mail = renderMorningMail({
      ...baseInput,
      fixed: [{ time: '02:14', summary: 'X', ref: 'a', refType: 'commit' }],
      totalErrorsLogged: 15,
      totalUsersAffected: 0,
    });
    expect(mail?.text).toContain('15 errors logget');
    expect(mail?.text).toContain('0 brukere påvirket');
  });
});
