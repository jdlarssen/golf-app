import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IdeaBuiltFields } from './IdeaBuiltFields';

// #2568: picking a launch fills the line and the link (owner's choice 13.10,
// «Velg fra siste lanseringer»). The cut and link rules are Type A in
// lib/notifications/ideaBuiltInput.test.ts.

const LABELS = {
  launchPickerLabel: 'picker',
  launchPickerEmpty: 'empty',
  summaryLabel: 'summary',
  summaryHint: 'summary hint',
  summaryPlaceholder: 'summary placeholder',
  linkLabel: 'link',
  linkHint: 'link hint',
};

describe('IdeaBuiltFields', () => {
  it('picking a launch fills the line and the link from it', () => {
    render(
      <IdeaBuiltFields
        rowId="r1"
        labels={LABELS}
        options={[
          { id: 'u1', label: 'Cup', summary: 'Cup', link: '/cup' },
          { id: 'u2', label: 'Spillformater', summary: 'Nye spillformater', link: '/spillformater' },
        ]}
      />,
    );

    fireEvent.change(document.getElementById('launch-r1')!, { target: { value: 'u2' } });

    expect((document.getElementById('summary-r1') as HTMLInputElement).value).toBe(
      'Nye spillformater',
    );
    expect((document.getElementById('link-r1') as HTMLInputElement).value).toBe('/spillformater');
    expect(screen.getByLabelText('picker')).toBeTruthy();
  });
});
