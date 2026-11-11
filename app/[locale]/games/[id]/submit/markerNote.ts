/**
 * #2814: the marker line over «Lever» in a simulator league
 * (`game.submit.marker`). A flightmate kept my card and is my marker: «Ola er
 * markøren din …». I kept flightmates' cards and hand them over: «Du er
 * markør for Per …». In a flight of three or more both can hold, and then
 * both sentences stand. Undefined when neither does: no line.
 */
export type MarkerNoteKey = 'markedBy' | 'handOver' | 'handOverMany';

export function markerNote(
  t: (key: MarkerNoteKey, values: Record<string, string>) => string,
  opts: {
    /** The flightmate's name, null when unknown; undefined when nobody kept my card. */
    markedByName: string | null | undefined;
    unknownPlayer: string;
    /** The handed-over cards' names, joined («Per og Kari»), and how many. */
    handOver: { names: string; count: number } | null;
  },
): string | undefined {
  const lines: string[] = [];
  if (opts.markedByName !== undefined) {
    lines.push(t('markedBy', { name: opts.markedByName ?? opts.unknownPlayer }));
  }
  if (opts.handOver && opts.handOver.count > 0) {
    const { names, count } = opts.handOver;
    lines.push(t(count === 1 ? 'handOver' : 'handOverMany', { names }));
  }
  return lines.length > 0 ? lines.join(' ') : undefined;
}
