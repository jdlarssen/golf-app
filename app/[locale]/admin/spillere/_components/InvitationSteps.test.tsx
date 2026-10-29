import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { InvitationSteps } from './InvitationSteps';

describe('InvitationSteps', () => {
  it('lists three steps and marks the second as the current one', () => {
    render(
      <InvitationSteps
        label="Hvor langt"
        sentLabel="Sendt"
        requestedLabel="Ba om kode i går"
        insideLabel="Inne"
      />,
    );
    const items = within(screen.getByRole('list', { name: 'Hvor langt' })).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items.map((li) => li.getAttribute('aria-current'))).toEqual([null, 'step', null]);
    expect(items[1]).toHaveTextContent('Ba om kode i går');
  });
});
