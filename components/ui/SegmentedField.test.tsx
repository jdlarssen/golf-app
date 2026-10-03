import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { SegmentedField, UNAVAILABLE_OPTION_CLASSES } from './SegmentedField';

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

  it('piltaster flytter valg og fokus (WAI-ARIA radiogroup-mønster)', () => {
    // Kontrollert wrapper så vi kan re-rendre med oppdatert value etter keydown
    function Wrapper() {
      const [val, setVal] = useState<string | null>('mens');
      return (
        <SegmentedField
          legend="Kjønn"
          options={opts}
          value={val}
          onChange={setVal}
        />
      );
    }

    render(<Wrapper />);

    const herre = screen.getByRole('radio', { name: 'Herre' });
    const dame = screen.getByRole('radio', { name: 'Dame' });

    // Fokuser det valgte alternativet og trykk ArrowRight
    act(() => {
      herre.focus();
    });
    fireEvent.keyDown(herre, { key: 'ArrowRight' });

    // Etter ArrowRight: Dame skal være valgt og ha fokus
    expect(dame).toBeChecked();
    expect(herre).not.toBeChecked();
    expect(dame).toHaveFocus();

    // ArrowRight fra siste alternativ wrapper rundt til første
    fireEvent.keyDown(dame, { key: 'ArrowRight' });
    expect(herre).toBeChecked();
    expect(dame).not.toBeChecked();
    expect(herre).toHaveFocus();

    // ArrowLeft fra første alternativ wrapper rundt til siste
    fireEvent.keyDown(herre, { key: 'ArrowLeft' });
    expect(dame).toBeChecked();
    expect(dame).toHaveFocus();
  });

  it.each(['segments', 'pills'] as const)(
    '%s: et valg som er av kan ikke velges, og piltastene hopper over det (#2437)',
    (variant) => {
      const onChange = vi.fn();
      render(
        <SegmentedField
          legend="Tee-kategori"
          variant={variant}
          options={[
            { value: 'M', label: 'Herre' },
            { value: 'D', label: 'Dame', disabled: true, title: 'Mangler rating' },
            { value: 'J', label: 'Junior' },
          ]}
          value="M"
          onChange={onChange}
        />,
      );
      const herre = screen.getByRole('radio', { name: 'Herre' });
      const dame = screen.getByRole('radio', { name: 'Dame' });
      expect(dame).toBeDisabled();
      expect(dame).toHaveAttribute('title', 'Mangler rating');
      // One look for an option that can't be picked, in both variants and in
      // the M/D/J toggle (#2437).
      expect(dame.className).toContain(UNAVAILABLE_OPTION_CLASSES);
      expect(herre).not.toBeDisabled();

      fireEvent.click(dame);
      expect(onChange).not.toHaveBeenCalled();

      act(() => {
        herre.focus();
      });
      fireEvent.keyDown(herre, { key: 'ArrowRight' });
      expect(onChange).toHaveBeenCalledWith('J');
      expect(onChange).not.toHaveBeenCalledWith('D');
    },
  );
});
