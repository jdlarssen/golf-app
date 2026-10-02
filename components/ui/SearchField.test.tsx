import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SearchField } from './SearchField';

// One Type C test (#2321): the field is named by its label, reports what is
// typed, and Enter is swallowed — inside the wizard's one form it would
// otherwise submit everything. jsdom does no implicit submission, so the
// assertion is on the prevented default.
describe('SearchField', () => {
  it('names the field, reports the text and swallows Enter', () => {
    const onChange = vi.fn();
    render(
      <form>
        <SearchField id="s" label="Søk i spillere" value="" onChange={onChange} placeholder="Søk etter navn" />
      </form>,
    );
    const field = screen.getByRole('searchbox', { name: 'Søk i spillere' });
    fireEvent.change(field, { target: { value: 'Ma' } });
    expect(onChange).toHaveBeenCalledWith('Ma');
    // fireEvent returns false when a handler called preventDefault().
    expect(fireEvent.keyDown(field, { key: 'Enter' })).toBe(false);
    expect(fireEvent.keyDown(field, { key: 'a' })).toBe(true);
  });
});
