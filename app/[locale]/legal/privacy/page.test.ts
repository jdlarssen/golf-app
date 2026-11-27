// Type A: the privacy page shows every s1 item and every s3 paragraph that the
// message files define, in both languages. A string that exists in no.json but is
// not rendered (or only in one language) is a promise the page does not keep.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import no from '../../../../messages/no.json';
import en from '../../../../messages/en.json';

const source = readFileSync(join(__dirname, 'page.tsx'), 'utf8');
const keysOf = (messages: typeof no, prefix: RegExp) =>
  Object.keys(messages.legal.privacy).filter((k) => prefix.test(k)).sort();

describe.each([
  ['s1 items', /^s1Item\d+$/],
  ['s3 paragraphs', /^s3Para\d+$/],
])('legal.privacy %s', (_name, prefix) => {
  it('exist in Norwegian and English', () => {
    expect(keysOf(en as typeof no, prefix)).toEqual(keysOf(no, prefix));
  });

  it('are all rendered by the page', () => {
    for (const key of keysOf(no, prefix)) {
      expect(source, key).toContain(`t('${key}')`);
    }
  });
});

describe('legal.privacy who-sees-it paragraphs', () => {
  it('name the audiences the code lets in', () => {
    const text = Object.entries(no.legal.privacy)
      .filter(([k]) => /^s3Para\d+$/.test(k))
      .map(([, v]) => v)
      .join(' ');
    for (const audience of ['live-lenken', 'Venner', 'klubbmedlemmer', 'Reaksjonene', 'Ideene', 'Æreslista']) {
      expect(text, audience).toContain(audience);
    }
  });

  it('says the entry fee is paid outside Tørny, with the agreement as legal basis, and who sees it', () => {
    for (const [lang, m] of [['no', no], ['en', en]] as const) {
      const p = m.legal.privacy as Record<string, string>;
      expect(p.legalBasisPayment, lang).toMatch(/6/);
      expect(p.s3Para8, lang).toMatch(/Vipps/);
    }
    expect(source).toContain("'legalBasisPayment'");
    expect(no.legal.privacy.s3Para8).toContain('uten å logge inn');
  });

  it('says that ideas are published openly on GitHub without the name', () => {
    expect(no.legal.privacy.s3Para5).toMatch(/GitHub.*uten navnet ditt/);
    expect(en.legal.privacy.s3Para5).toMatch(/GitHub.*without your name/);
    expect(no.legal.privacy.s1Item13).toContain('GitHub');
    expect(en.legal.privacy.s1Item13).toContain('GitHub');
  });

  it('lists GitHub as a processor outside the EEA, with a legal basis for publishing ideas', () => {
    for (const [lang, m] of [['no', no], ['en', en]] as const) {
      const p = m.legal.privacy as Record<string, string>;
      expect(p.processorGithub, lang).toContain('GitHub');
      expect(p.processorsOutsideEea, lang).toContain('GitHub');
      expect(p.legalBasisIdeas, lang).toContain('GitHub');
      expect(p.legalBasisIdeas, lang).toMatch(/6/);
    }
    for (const key of ['processorGithub', 'legalBasisIdeas']) {
      expect(source, key).toContain(`'${key}'`);
    }
  });

  it('says on the deletion page that the GitHub copy stays, and no longer says it in the deleted list', () => {
    const slett = readFileSync(join(__dirname, '../slett-konto/page.tsx'), 'utf8');
    expect(slett).toContain("'keptItem6'");
    for (const m of [no, en]) {
      expect(m.legal.deleteAccount.keptItem6).toContain('GitHub');
      expect(m.legal.deleteAccount.deletedItem3).not.toContain('GitHub');
    }
  });
});
