import { describe, it, expect } from 'vitest';
import { validateProductUpdateInput } from './validateUpdateInput';

describe('validateProductUpdateInput', () => {
  it('rejects a blank title', () => {
    expect(
      validateProductUpdateInput({ title: '   ', body: 'b', link: '', cta_label: '' }),
    ).toEqual({ ok: false, error: 'title_required' });
  });

  it('rejects a blank body', () => {
    expect(
      validateProductUpdateInput({ title: 't', body: '', link: '', cta_label: '' }),
    ).toEqual({ ok: false, error: 'body_required' });
  });

  it('rejects an external link', () => {
    expect(
      validateProductUpdateInput({
        title: 't',
        body: 'b',
        link: 'https://evil.example.com',
        cta_label: '',
      }),
    ).toEqual({ ok: false, error: 'link_must_be_internal' });
  });

  it('rejects a cta_label without a link', () => {
    expect(
      validateProductUpdateInput({ title: 't', body: 'b', link: '', cta_label: 'Prøv det' }),
    ).toEqual({ ok: false, error: 'cta_without_link' });
  });

  it('accepts a minimal input, trimming and nulling empty link/cta', () => {
    expect(
      validateProductUpdateInput({ title: ' t ', body: ' b ', link: '', cta_label: '' }),
    ).toEqual({ ok: true, value: { title: 't', body: 'b', link: null, cta_label: null } });
  });

  it('accepts an internal link + cta and trims them', () => {
    expect(
      validateProductUpdateInput({
        title: 't',
        body: 'b',
        link: ' /admin/games/new ',
        cta_label: ' Se mer ',
      }),
    ).toEqual({
      ok: true,
      value: { title: 't', body: 'b', link: '/admin/games/new', cta_label: 'Se mer' },
    });
  });
});
