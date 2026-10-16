// #2580: den ene render-testen (Type C) for boksen og den sperrede
// leverknappen på scorekortet. Setningene er Type A i teeShotsCopy.test.ts.
// Her er koblingen: knappen er sperret for skjermleseren uten å være tatt ut av
// fokusrekkefølgen, og et trykk flytter fokus til boksen.
import { createRef } from 'react';
import { AccessibilityInfo, type View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TeeShotLockedSubmit, TeeShotShortBox } from './TeeShotShortBox';

describe('TeeShotShortBox', () => {
  it('den sperrede knappen flytter fokus til boksen', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => undefined);
    const boxRef = createRef<View>();
    await render(
      <>
        <TeeShotShortBox
          ref={boxRef}
          title="Per mangler 2 utslag"
          body="Alle må ha minst 4 utslag før lagets kort kan leveres."
          players={[
            { userId: 'marte', name: 'Marte', countText: 'har 7', short: false },
            { userId: 'per', name: 'Per', countText: '2 av 4', short: true },
          ]}
        />
        <TeeShotLockedSubmit label="Lever lagets kort" boxRef={boxRef} testID="submit-team-card" />
      </>,
    );

    const button = screen.getByTestId('submit-team-card');
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByRole('button', { name: 'Lever lagets kort' })).toBeTruthy();

    await fireEvent.press(button);
    expect(focus).toHaveBeenCalledWith(boxRef.current, 'focus');
    expect(boxRef.current).not.toBeNull();
    focus.mockRestore();
  });
});
