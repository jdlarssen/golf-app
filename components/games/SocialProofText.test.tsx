import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SocialProofText } from './SocialProofText';

/**
 * One render test for the social-proof wording (#1193, #2266): each form puts
 * its names and counts into the sentence. Asserts on the interpolated values,
 * never on the Norwegian copy (Type C discipline). Which form applies is the
 * `socialProofForm` Type A suite's job.
 */
describe('SocialProofText', () => {
  it('interpolates names and counts for every form', () => {
    const text = (form: Parameters<typeof SocialProofText>[0]['form']) =>
      render(<SocialProofText form={form} />).container.textContent;

    const overflow = text({ kind: 'friendsOverflow', name: 'Jonas', count: 2 });
    expect(overflow).toContain('Jonas');
    expect(overflow).toContain('2');

    const two = text({ kind: 'friendsTwo', name1: 'Jonas', name2: 'Kari' });
    expect(two).toContain('Jonas');
    expect(two).toContain('Kari');

    expect(text({ kind: 'friendsOne', name: 'Jonas' })).toContain('Jonas');
    expect(text({ kind: 'count', count: 3 })).toContain('3');
  });
});
