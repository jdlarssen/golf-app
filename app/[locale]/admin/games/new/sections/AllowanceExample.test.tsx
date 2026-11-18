import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AllowanceExample } from './AllowanceExample';

// Type C (#2455): the box draws what `allowanceExample` hands it. The numbers
// themselves are Type A (lib/games/allowanceExample.test.ts).
describe('AllowanceExample', () => {
  it('draws the tee heading and one line per player; «i stedet for» only when the share moves the strokes', () => {
    render(
      <AllowanceExample
        example={{
          teeName: 'Gul',
          rows: [
            { playerId: 'm', name: 'Marte', hcpIndex: 18.4, strokes: 19, strokesAtFull: 22 },
            { playerId: 'j', name: 'Jonas', hcpIndex: 9.4, strokes: 10, strokesAtFull: 10 },
          ],
        }}
      />,
    );
    const lines = Array.from(
      screen.getByTestId('allowance-example').querySelectorAll('p'),
      (p) => p.textContent,
    );
    expect(lines).toEqual([
      'Slik blir det på Gul tee',
      'Marte (HCP 18,4) 19 slag i stedet for 22',
      'Jonas (HCP 9,4) 10 slag',
    ]);
  });
});
