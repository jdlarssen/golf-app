/**
 * #2814: the marker line over «Lever» in a simulator league
 * (`game.submit.marker`). The card's marker is fixed (`fixedMarker`):
 *  - handed over, a flightmate kept my card: «Ola er markøren din …»;
 *  - returned, my marker sent it back: «Per sendte kortet tilbake …» (the
 *    owner 11.11);
 *  - assigned, reopened or a delivery that failed: «Kortet går til Per …».
 * I kept flightmates' cards and hand them over: «Du er markør for Per …».
 * In a flight of three or more both can hold, and then both sentences
 * stand. Undefined when none holds: no line.
 */
export type MarkerNoteKey = 'markedBy' | 'returnedBy' | 'assignedTo' | 'handOver' | 'handOverMany';

const FIXED_KEY = { handedOver: 'markedBy', returned: 'returnedBy', assigned: 'assignedTo' } as const;

export function markerNote(
  t: (key: MarkerNoteKey, values: Record<string, string>) => string,
  opts: {
    /** The card's fixed marker and why, or null when the deliverer names one. */
    fixed: { reason: keyof typeof FIXED_KEY; name: string | null } | null;
    unknownPlayer: string;
    /** The handed-over cards' names, joined («Per og Kari»), and how many. */
    handOver: { names: string; count: number } | null;
  },
): string | undefined {
  const lines: string[] = [];
  if (opts.fixed) {
    lines.push(t(FIXED_KEY[opts.fixed.reason], { name: opts.fixed.name ?? opts.unknownPlayer }));
  }
  if (opts.handOver && opts.handOver.count > 0) {
    const { names, count } = opts.handOver;
    lines.push(t(count === 1 ? 'handOver' : 'handOverMany', { names }));
  }
  return lines.length > 0 ? lines.join(' ') : undefined;
}
