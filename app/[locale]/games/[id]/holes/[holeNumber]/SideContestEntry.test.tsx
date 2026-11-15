import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect, type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fake, resetServer, server, writeSideAs } from '@/tests/sideClaimsServer';

// #2283 (part D3) — Type B/C: the row and the sheet for closest to pin and
// longest drive. The wording is locked in the message catalog (it is the
// app's); here the wiring is: one tap saves, «Ferdig» only closes, the choice
// snaps back when a save fails, the lines are locked offline, and a screen
// reader gets roles, pressed state, a status and an alert.
//
// The card runs through the real `useSideClaims` against a fake server
// (`tests/sideClaimsServer.ts`), so every read and save goes the way it does on
// the hole page. The server is the truth (the owner's choice B, 15.11): a tap
// holds while its save runs, and until a read that started after the save has
// answered.
vi.mock('./sideClaimActions', () => ({
  recordSideClaim: (...args: Parameters<typeof fake.recordSideClaim>) => fake.recordSideClaim(...args),
  recordGirClaims: (...args: Parameters<typeof fake.recordGirClaims>) => fake.recordGirClaims(...args),
}));
vi.mock('@/lib/games/sideClaims', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/games/sideClaims')>()),
  readHoleClaims: (...args: Parameters<typeof fake.readHoleClaims>) => fake.readHoleClaims(...args),
}));
vi.mock('@/lib/supabase/client', () => ({ getBrowserClient: () => ({ fake: 'browser-client' }) }));

import { SideContestEntry } from './SideContestEntry';
import { useSideClaims } from './useSideClaims';

const PLAYERS = [
  { userId: 'jonas', label: 'Jonas Berg', shortLabel: 'Jonas', initials: 'JB' },
  { userId: 'marte', label: 'Marte Lie', shortLabel: 'Marte', initials: 'ML' },
  { userId: 'me', label: 'Deg', shortLabel: 'Deg', initials: 'ON' },
  { userId: 'tore', label: 'Tore Lunde', shortLabel: 'Tore', initials: 'TL' },
];
const NAMES: Record<string, string> = { jonas: 'Jonas', marte: 'Marte', tore: 'Tore' };

type EntryProps = ComponentProps<typeof SideContestEntry>;
type HarnessProps = Partial<Pick<EntryProps, 'contest' | 'online'>>;

/** The poll: the same read as the interval in `useSideClaims`. */
const harness: { poll: () => Promise<void> } = { poll: async () => undefined };

function Harness({ contest = { category: 'closest_to_pin', source: 'game' }, online = true }: HarnessProps) {
  const claims = useSideClaims('game-1', 7, { side: true, gir: false }, null);
  useEffect(() => {
    harness.poll = claims.refresh;
  });
  return (
    <SideContestEntry
      gameId="game-1"
      holeNumber={7}
      contest={contest}
      players={PLAYERS}
      meId="me"
      claim={claims.side === undefined ? undefined : (claims.side.find((c) => c.category === contest.category) ?? null)}
      failed={claims.failed}
      online={online}
      savedByName={(id) => NAMES[id] ?? null}
      refresh={claims.refresh}
      snapshotSeq={claims.snapshotSeq}
      startedSeq={claims.startedSeq}
    />
  );
}

const ID = 'side-contest-closest_to_pin';
const subtitle = (id = ID) => screen.getByTestId(`${id}-subtitle`);
const status = (id = ID) => screen.getByTestId(`${id}-sheet-status`);
const field = () => (screen.getByTestId(`${ID}-distance-input`) as HTMLInputElement).value;
const pressed = (who: string) => screen.getByTestId(`${ID}-line-${who}`).getAttribute('aria-pressed');
const distances = () => fake.recordSideClaim.mock.calls.map(([w]) => w.distanceM);
/** A click, and the microtasks it starts (the save goes out one tick later, then the read after it). */
const click = async (testId: string) => {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testId));
  });
};

async function renderLoaded(props: HarnessProps = {}) {
  const view = render(<Harness {...props} />);
  await waitFor(() => expect(fake.readHoleClaims).toHaveBeenCalled());
  await act(async () => undefined);
  return view;
}

async function openSheet(id = ID) {
  await click(id);
}

beforeEach(() => {
  resetServer();
});

describe('SideContestEntry', () => {
  it('the row opens the sheet, one tap saves for the flight, and «Ferdig» only closes', async () => {
    await renderLoaded();
    expect(screen.getByText('Meld inn')).toBeInTheDocument();
    expect(subtitle()).toHaveTextContent('Sidekonkurranse');

    const readsBefore = fake.readHoleClaims.mock.calls.length;
    await openSheet();
    // The sheet reads again when it opens: the flight key can change mid-round (#2891).
    expect(fake.readHoleClaims.mock.calls.length).toBe(readsBefore + 1);
    expect(screen.getByText('Sidekonkurranse · hull 7')).toBeInTheDocument();
    expect(screen.getByText('Hvem i flighten lå nærmest på green etter utslaget?')).toBeInTheDocument();
    // The kicker is outside the heading: the dialog is named by the title alone.
    expect(screen.getByRole('dialog', { name: 'Nærmest pinnen' })).toBeInTheDocument();

    const marte = screen.getByTestId(`${ID}-line-marte`);
    expect(marte).toHaveAttribute('aria-pressed', 'false');
    expect(marte).not.toBeDisabled();

    await click(`${ID}-line-marte`);
    expect(fake.recordSideClaim).toHaveBeenCalledWith({
      gameId: 'game-1',
      category: 'closest_to_pin',
      holeNumber: 7,
      winnerUserId: 'marte',
      distanceM: null,
    });
    expect(pressed('marte')).toBe('true');
    expect(status()).toHaveTextContent('Lagret av deg. Alle i flighten kan endre.');

    // The distance stands only when a player is chosen. + from an empty field is half a metre.
    await click(`${ID}-distance-plus`);
    expect(fake.recordSideClaim).toHaveBeenLastCalledWith(
      expect.objectContaining({ winnerUserId: 'marte', distanceM: 0.5 }),
    );

    // The number can be typed, with a comma, and is saved when the field is left.
    const input = screen.getByTestId(`${ID}-distance-input`);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '2,4' } });
    await act(async () => {
      fireEvent.blur(input);
    });
    expect(fake.recordSideClaim).toHaveBeenLastCalledWith(
      expect.objectContaining({ winnerUserId: 'marte', distanceM: 2.4 }),
    );
    expect(field()).toBe('2,4');
    // So can a point («2.4») ...
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '3.1' } });
    await act(async () => {
      fireEvent.blur(input);
    });
    expect(fake.recordSideClaim).toHaveBeenLastCalledWith(
      expect.objectContaining({ winnerUserId: 'marte', distanceM: 3.1 }),
    );
    // ... but a number off the grid is not saved.
    const saves = fake.recordSideClaim.mock.calls.length;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '120' } });
    await act(async () => {
      fireEvent.blur(input);
    });
    expect(fake.recordSideClaim.mock.calls.length).toBe(saves);

    // «Ferdig» closes and saves nothing more; the row shows the answer.
    fireEvent.click(screen.getByRole('button', { name: 'Ferdig' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fake.recordSideClaim.mock.calls.length).toBe(saves);
    expect(subtitle()).toHaveTextContent('Marte · 3,1 m');
  });

  it('shows what the flight has reported, and who saved it', async () => {
    writeSideAs('tore', { category: 'closest_to_pin', holeNumber: 7, winnerUserId: 'marte', distanceM: 2.5 });
    await renderLoaded();
    expect(subtitle()).toHaveTextContent('Marte · 2,5 m');
    expect(screen.queryByText('Meld inn')).toBeNull();

    await openSheet();
    expect(pressed('marte')).toBe('true');
    expect(field()).toBe('2,5');
    expect(status()).toHaveTextContent('Lagret av Tore. Alle i flighten kan endre.');

    // «Ingen på green» takes the distance away.
    await click(`${ID}-line-none`);
    expect(fake.recordSideClaim).toHaveBeenCalledWith(expect.objectContaining({ winnerUserId: null, distanceM: null }));
    expect(screen.queryByTestId(`${ID}-distance`)).toBeNull();
    expect(pressed('none')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Ferdig' }));
    expect(subtitle()).toHaveTextContent('Ingen på green');
  });

  it('the choice snaps back when the save fails, and the error is an alert in the sheet', async () => {
    server.holdWrites = true;
    await renderLoaded();
    await openSheet();
    await click(`${ID}-line-jonas`);
    expect(pressed('jonas')).toBe('true');
    await act(async () => server.heldWrites[0].release({ ok: false, error: 'db_error' }));

    expect(pressed('jonas')).toBe('false');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Fikk ikke lagret. Sjekk nettet og prøv igjen.');
    expect(alert).toBe(screen.getByTestId(`${ID}-sheet-notice`));
    expect(status()).toHaveTextContent('Svaret deles med hele flighten. Arrangøren kårer vinneren til slutt.');
  });

  it('a save that rejects (the network is gone) is a failed save, and the next tap still goes through', async () => {
    await renderLoaded();
    await openSheet();
    server.rejectWrites = 1;
    await click(`${ID}-line-jonas`);
    expect(pressed('jonas')).toBe('false');
    expect(screen.getByRole('alert')).toHaveTextContent('Fikk ikke lagret. Sjekk nettet og prøv igjen.');

    // The chain of saves was not broken by the rejection.
    await click(`${ID}-line-marte`);
    expect(pressed('marte')).toBe('true');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fake.recordSideClaim).toHaveBeenCalledTimes(2);
  });

  it('says why when the server refuses: the round has ended', async () => {
    server.holdWrites = true;
    await renderLoaded();
    await openSheet();
    await click(`${ID}-line-jonas`);
    await act(async () => server.heldWrites[0].release({ ok: false, error: 'not_active' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Runden er avsluttet. Nå kan ingenting registreres mer.');
  });

  it('offline the row and the lines are locked, with an explanation', async () => {
    const view = await renderLoaded();
    await openSheet();
    view.rerender(<Harness online={false} />);
    expect(screen.getByTestId(`${ID}-sheet-notice`)).toHaveTextContent(
      'Du er uten nett. Kom tilbake til dette hullet og meld inn når du har dekning.',
    );
    // «You are offline» is a status, not an alert.
    expect(screen.getByTestId(`${ID}-sheet-notice`)).toHaveAttribute('role', 'status');
    const line = screen.getByTestId(`${ID}-line-marte`);
    expect(line).toBeDisabled();
    fireEvent.click(line);
    expect(fake.recordSideClaim).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Lukk' }));
    expect(subtitle()).toHaveTextContent('Uten nett. Meld inn senere.');
    expect(screen.getByTestId(ID)).toBeDisabled();
  });

  it('when no read has succeeded, the row says so and cannot be opened', async () => {
    server.failReads = 1;
    await renderLoaded();
    expect(subtitle()).toHaveTextContent('Fikk ikke hentet. Prøver igjen.');
    expect(screen.getByTestId(ID)).toBeDisabled();
    fireEvent.click(screen.getByTestId(ID));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('quick taps (S1): the choice stands until the last save is done, and each tap counts from the one before', async () => {
    server.holdWrites = true;
    await renderLoaded();
    await openSheet();
    await click(`${ID}-line-marte`);
    await click(`${ID}-distance-plus`);
    await click(`${ID}-distance-plus`);
    expect(field()).toBe('1,0');
    // The first save lands, and the read after it shows Marte without a distance.
    await act(async () => server.heldWrites[0].release());
    expect(field()).toBe('1,0');
    expect(subtitle()).toHaveTextContent('Marte · 1,0 m');
    await click(`${ID}-distance-plus`);
    for (let i = 1; i < 4; i++) await act(async () => server.heldWrites[i]?.release());
    expect(distances()).toEqual([null, 0.5, 1, 1.5]);
    expect(field()).toBe('1,5');
  });

  it('a read that fails right after the save (S6): the tap stands until the next read, without flicker', async () => {
    server.holdWrites = true;
    await renderLoaded();
    await openSheet();
    await click(`${ID}-line-marte`);
    await click(`${ID}-distance-plus`);
    await click(`${ID}-distance-plus`);
    await act(async () => server.heldWrites[0].release());
    await act(async () => server.heldWrites[1].release());
    server.failReads = 1;
    await act(async () => server.heldWrites[2].release());
    // Saved 1,0 m, but the read after it failed: the field shows 1,0, not 0,5.
    expect(field()).toBe('1,0');
    await act(() => harness.poll());
    expect(field()).toBe('1,0');
    expect(subtitle()).toHaveTextContent('Marte · 1,0 m');
  });

  it('a flight-mate writes between your save and the read (S8): their answer stands, and the next tap builds on it', async () => {
    server.holdWrites = true;
    await renderLoaded();
    await openSheet();
    await click(`${ID}-line-marte`);
    await act(async () => {
      server.heldWrites[0].release();
      // Tore saves Jonas at 2 m before your read goes out.
      writeSideAs('tore', { category: 'closest_to_pin', holeNumber: 7, winnerUserId: 'jonas', distanceM: 2 });
    });
    expect(pressed('jonas')).toBe('true');
    expect(field()).toBe('2,0');
    expect(status()).toHaveTextContent('Lagret av Tore. Alle i flighten kan endre.');
    await act(() => harness.poll());
    expect(pressed('jonas')).toBe('true');

    await click(`${ID}-distance-plus`);
    expect(fake.recordSideClaim).toHaveBeenLastCalledWith(
      expect.objectContaining({ winnerUserId: 'jonas', distanceM: 2.5 }),
    );
  });

  it('the read after the save hangs, a poll fetches the mate’s answer, then the hung read fails (S9): the mate’s answer stands', async () => {
    await renderLoaded();
    await openSheet();
    server.holdReads = true;
    await click(`${ID}-line-marte`);
    await act(async () => undefined);
    expect(server.heldReads).toHaveLength(1);
    writeSideAs('tore', { category: 'closest_to_pin', holeNumber: 7, winnerUserId: 'jonas', distanceM: 2 });
    server.holdReads = false;
    await act(() => harness.poll());
    expect(pressed('jonas')).toBe('true');
    await act(async () => server.heldReads[0].fail());
    expect(pressed('jonas')).toBe('true');
    expect(subtitle()).toHaveTextContent('Jonas · 2,0 m');
  });

  it('the latest unsaved tap wins over an earlier one that is still saving', async () => {
    server.holdWrites = true;
    await renderLoaded();
    await openSheet();
    await click(`${ID}-line-jonas`);
    await click(`${ID}-line-marte`);
    // Both are in flight; the screen shows the latest.
    expect(pressed('marte')).toBe('true');
    expect(pressed('jonas')).toBe('false');
    await act(async () => server.heldWrites[0].release());
    expect(pressed('marte')).toBe('true');
    await act(async () => server.heldWrites[1].release());
    expect(pressed('marte')).toBe('true');
    expect(server.side.map((c) => c.winnerUserId)).toEqual(['marte']);
  });

  it('an error from an earlier tap goes away when a later save goes through', async () => {
    server.holdWrites = true;
    await renderLoaded();
    await openSheet();
    await click(`${ID}-line-jonas`);
    // Marte is tapped while Jonas is still saving. Jonas fails, Marte goes through.
    await click(`${ID}-line-marte`);
    await act(async () => server.heldWrites[0].release({ ok: false, error: 'db_error' }));
    expect(pressed('marte')).toBe('true');
    await act(async () => server.heldWrites[1].release());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(pressed('marte')).toBe('true');
  });

  it('the answer in the row is in the text colour, the points line in the muted one, and offline in the warning colour', async () => {
    const view = await renderLoaded();
    expect(subtitle().className).toContain('text-muted');
    writeSideAs('tore', { category: 'closest_to_pin', holeNumber: 7, winnerUserId: 'marte', distanceM: 2.5 });
    await act(() => harness.poll());
    expect(subtitle().className).toContain('text-text');
    view.rerender(<Harness online={false} />);
    expect(subtitle().className).toContain('text-warning-text');
  });

  it('the lines are buttons with pressed state; the sheet is a section named by its question', async () => {
    await renderLoaded();
    await openSheet();
    const section = screen.getByRole('region', { name: 'Hvem i flighten lå nærmest på green etter utslaget?' });
    // One line per player, «Ingen på green» last.
    const lines = within(section).getAllByRole('button');
    expect(lines.map((b) => b.textContent)).toEqual([
      'JBJonas Berg',
      'MLMarte Lie',
      'ONDeg',
      'TLTore Lunde',
      'Ingen på green',
    ]);
    for (const line of lines) expect(line).toHaveAttribute('aria-pressed', 'false');
    // The status is a live region, present from the start.
    expect(status()).toHaveAttribute('role', 'status');
    expect(status()).toHaveTextContent('Svaret deles med hele flighten. Arrangøren kårer vinneren til slutt.');
  });

  it('the row’s icon and pill are decorative: the row is named by its title and subtitle', async () => {
    await renderLoaded();
    expect(screen.getByRole('button', { name: /^Nærmest pinnen\s*Sidekonkurranse/ })).toBeInTheDocument();
  });

  it('longest drive in a cup: the match, the points and no distance', async () => {
    await renderLoaded({ contest: { category: 'longest_drive', source: 'cup', points: 2 } });
    const id = 'side-contest-longest_drive';
    expect(subtitle(id)).toHaveTextContent('+2 p til laget');
    await openSheet(id);
    expect(screen.getByText('Sidepoeng · hull 7 · +2 p til laget')).toBeInTheDocument();
    expect(screen.getByText('Hvem i kampen slo lengst ut på fairway?')).toBeInTheDocument();
    expect(status(id)).toHaveTextContent('Svaret deles med kampen. Arrangøren kårer vinneren til slutt.');
    await click(`${id}-line-tore`);
    expect(screen.queryByTestId(`${id}-distance`)).toBeNull();
    expect(screen.getByText('Ingen på fairway')).toBeInTheDocument();
    expect(status(id)).toHaveTextContent('Lagret av deg. Alle i kampen kan endre.');
  });

  it('a cup counts half points with a decimal comma', async () => {
    await renderLoaded({ contest: { category: 'closest_to_pin', source: 'cup', points: 1.5 } });
    expect(subtitle()).toHaveTextContent('+1,5 p til laget');
  });

  it('a winner who has left the flight still has a name in the row, from the name lookup', async () => {
    writeSideAs('tore', { category: 'closest_to_pin', holeNumber: 7, winnerUserId: 'gone', distanceM: null });
    // `gone` is not on a line (withdrawn), but `savedByName` resolves them.
    function WithLookup() {
      const claims = useSideClaims('game-1', 7, { side: true, gir: false }, null);
      return (
        <SideContestEntry
          gameId="game-1"
          holeNumber={7}
          contest={{ category: 'closest_to_pin', source: 'game' }}
          players={PLAYERS}
          meId="me"
          claim={claims.side === undefined ? undefined : (claims.side[0] ?? null)}
          failed={claims.failed}
          online
          savedByName={(id) => (id === 'gone' ? 'Kari' : null)}
          refresh={claims.refresh}
          snapshotSeq={claims.snapshotSeq}
          startedSeq={claims.startedSeq}
        />
      );
    }
    render(<WithLookup />);
    await waitFor(() => expect(subtitle()).toHaveTextContent('Kari'));
  });
});
