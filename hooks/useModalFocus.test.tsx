import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { useState } from 'react';
import { useModalFocus } from './useModalFocus';

beforeEach(() => {
  cleanup();
});

/** Minimal dialog: tre knapper, akkurat nok til å se fella slå til. */
function Dialog({
  open,
  disabled = false,
}: {
  open: boolean;
  disabled?: boolean;
}) {
  const { containerRef } = useModalFocus<HTMLDivElement>(open);
  if (!open) return null;
  return (
    <div ref={containerRef} tabIndex={-1} role="dialog" data-testid="dialog">
      <button type="button" data-testid="first" disabled={disabled}>
        Første
      </button>
      <button type="button" data-testid="middle" disabled={disabled}>
        Midt
      </button>
      <button type="button" data-testid="last" disabled={disabled}>
        Siste
      </button>
    </div>
  );
}

function App({ open, disabled }: { open: boolean; disabled?: boolean }) {
  return (
    <>
      <button type="button" data-testid="trigger-a">
        Åpne A
      </button>
      <button type="button" data-testid="trigger-b">
        Åpne B
      </button>
      <Dialog open={open} disabled={disabled} />
    </>
  );
}

/** Avvis-dialogens form: honeypot-felt først, ekte kontroller etterpå. */
function DialogWithHoneypot({ open }: { open: boolean }) {
  const { containerRef } = useModalFocus<HTMLDivElement>(open);
  if (!open) return null;
  return (
    <div ref={containerRef} tabIndex={-1} role="dialog">
      <div aria-hidden="true" style={{ display: 'none' }}>
        <input name="website" data-testid="honeypot" tabIndex={-1} />
      </div>
      <button type="button" data-testid="real-first">
        Ekte
      </button>
    </div>
  );
}

describe('useModalFocus', () => {
  it('flytter fokus til første fokuserbare element når dialogen åpnes', () => {
    const { rerender } = render(<App open={false} />);
    act(() => screen.getByTestId('trigger-a').focus());

    rerender(<App open={true} />);

    expect(screen.getByTestId('first')).toHaveFocus();
  });

  it('holder Tab og Shift+Tab innenfor dialogen', () => {
    render(<App open={true} />);
    const first = screen.getByTestId('first');
    const last = screen.getByTestId('last');

    // Tab fra siste knapp wrapper til første i stedet for å gå ut i bakgrunnen.
    act(() => last.focus());
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();

    // Shift+Tab fra første wrapper til siste.
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();

    // Midt i dialogen overtar vi ikke — nettleseren flytter selv.
    act(() => screen.getByTestId('middle').focus());
    const notCancelled = fireEvent.keyDown(document, { key: 'Tab' });
    expect(notCancelled).toBe(true);
    expect(screen.getByTestId('middle')).toHaveFocus();
  });

  it('henter fokus tilbake i dialogen hvis det har havnet utenfor', () => {
    render(<App open={true} />);
    act(() => screen.getByTestId('trigger-a').focus());

    fireEvent.keyDown(document, { key: 'Tab' });

    expect(screen.getByTestId('first')).toHaveFocus();
  });

  it('legger fokus tilbake på utløseren når dialogen lukkes — også ved ny åpning', () => {
    const { rerender } = render(<App open={false} />);

    act(() => screen.getByTestId('trigger-a').focus());
    rerender(<App open={true} />);
    // Samme kodevei som unmount: effekt-cleanup kjører når `open` går til false.
    rerender(<App open={false} />);
    expect(screen.getByTestId('trigger-a')).toHaveFocus();

    // Ny åpning fanger det NYE aktive elementet, ikke det gamle.
    act(() => screen.getByTestId('trigger-b').focus());
    rerender(<App open={true} />);
    rerender(<App open={false} />);
    expect(screen.getByTestId('trigger-b')).toHaveFocus();
  });

  it('rører ikke fokus når forelderen re-rendrer med dialogen åpen', () => {
    // Deps-vakten (#1357): HoleClient re-rendres av realtime- og sync-oppdateringer
    // mens arket står åpent. Kjørte effekten på nytt for hver render, ville
    // cleanup ha revet fokus ut av dialogen midt i tastaturnavigasjonen.
    function Rerenderer() {
      const [tick, setTick] = useState(0);
      return (
        <>
          <button
            type="button"
            data-testid="tick"
            onClick={() => setTick((n) => n + 1)}
          >
            {tick}
          </button>
          <Dialog open={true} />
        </>
      );
    }
    render(<Rerenderer />);
    const middle = screen.getByTestId('middle');
    act(() => middle.focus());

    fireEvent.click(screen.getByTestId('tick'));
    fireEvent.click(screen.getByTestId('tick'));

    expect(screen.getByTestId('tick').textContent).toBe('2');
    expect(middle).toHaveFocus();
  });

  it('hopper over felt som står utenfor tab-rekkefølgen (tabindex=-1)', () => {
    // Honeypot-feltet i avvis-dialogen er display:none med tabindex=-1. Tar
    // fella det med, får det initial-fokus — og i en ekte nettleser nekter
    // fokus å flytte seg dit, så både åpningen og hver Tab blir spist.
    render(<DialogWithHoneypot open={true} />);

    expect(screen.getByTestId('real-first')).toHaveFocus();
  });

  it('slipper ikke fokus ut når alt i dialogen er disabled', () => {
    // Wolf-modalen disabler hver knapp mens server-kallet står på.
    render(<App open={true} disabled={true} />);
    const dialog = screen.getByTestId('dialog');
    expect(dialog).toHaveFocus();

    const notCancelled = fireEvent.keyDown(document, { key: 'Tab' });

    expect(notCancelled).toBe(false);
    expect(dialog).toHaveFocus();
  });
});
