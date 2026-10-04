import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { OnboardingFields } from './OnboardingFields';

// Type C — one render test for «Slik ser de andre deg» (#2350): the preview
// follows what is typed, and the demo name (#1173) the name field prefills
// shows up there too. The validity rule itself is Type A in
// profilePreview.test.ts.

const DEMO_KEY = 'torny-demo-name';

describe('OnboardingFields', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows the typed name and handicap, and the demo name, in the preview', () => {
    window.localStorage.setItem(DEMO_KEY, 'Kari Nordmann');
    render(<OnboardingFields initialName="" initialMagnitude="" initialPlus={false} />);

    const name = screen.getByTestId('onboarding-preview-name');
    const hcp = screen.getByTestId('onboarding-preview-hcp');
    expect(name).toHaveTextContent('Kari Nordmann');
    expect(hcp).toHaveTextContent('HCP –');

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Ida Berg' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '18.4' } });
    expect(name).toHaveTextContent('Ida Berg');
    expect(hcp).toHaveTextContent('HCP 18,4');
  });
});
