import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SegmentedField } from './SegmentedField';

beforeEach(() => {
  cleanup();
});

const opts = [
  { value: 'mens', label: 'Herre' },
  { value: 'ladies', label: 'Dame' },
];

describe('SegmentedField', () => {
  it('markerer valgt segment med aria-checked', () => {
    render(
      <SegmentedField
        legend="Kjønn"
        options={opts}
        value="mens"
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Herre' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dame' })).not.toBeChecked();
  });

  it('kaller onChange med valgt verdi ved klikk', () => {
    const onChange = vi.fn();
    render(
      <SegmentedField
        legend="Kjønn"
        options={opts}
        value="mens"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Dame' }));
    expect(onChange).toHaveBeenCalledWith('ladies');
  });

  it('rendrer ingen valgt når value er null', () => {
    render(
      <SegmentedField
        legend="Kjønn"
        options={opts}
        value={null}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Herre' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dame' })).not.toBeChecked();
  });
});
