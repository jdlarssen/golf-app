import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormSection } from './FormSection';
import { ChoiceCardGrid, RadioChoiceCard } from './ChoiceCard';

// One Type C render test for the wizard's shared section frame and choice
// cards (#2426): the kicker stays the fieldset's legend (so it names the
// group), the cards are real radios in a named radiogroup, and a click reports
// the choice. Looks are checked against the artboards on staging, not here.
describe('FormSection + RadioChoiceCard', () => {
  it('names the group by its kicker and reports the picked card', () => {
    const onNet = vi.fn();
    const onGross = vi.fn();
    render(
      <FormSection legend="Skins setup">
        <ChoiceCardGrid columns={2} label="Skins scoring">
          <RadioChoiceCard name="s" value="net" checked onChange={onNet} title="Net" hint="Handicap" />
          <RadioChoiceCard name="s" value="gross" checked={false} onChange={onGross} title="Gross" />
        </ChoiceCardGrid>
      </FormSection>,
    );

    expect(screen.getByRole('group', { name: 'Skins setup' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Skins scoring' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /net/i })).toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: /gross/i }));
    expect(onGross).toHaveBeenCalledTimes(1);
    expect(onNet).not.toHaveBeenCalled();
  });
});
