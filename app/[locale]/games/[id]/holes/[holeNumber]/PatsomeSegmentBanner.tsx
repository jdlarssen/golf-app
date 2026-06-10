/**
 * Viser aktivt Patsome-segment på gjeldende hull med en kort regelforklaring.
 * Rent presentasjonskomponent — ingen logikk, ingen API-kall.
 *
 * Segment-grenser (hardkodet som i scoring-modulen):
 *   1–6   → 4BBB
 *   7–12  → Greensome
 *   13–18 → Foursomes
 */
export function PatsomeSegmentBanner({ holeNumber }: { holeNumber: number }) {
  const segment =
    holeNumber <= 6 ? 'fourball' : holeNumber <= 12 ? 'greensome' : 'foursomes';

  const config = {
    fourball: {
      label: '4BBB · Hull 1–6',
      rule: 'Spill din egen ball. Lagets beste resultat per hull teller.',
    },
    greensome: {
      label: 'Greensome · Hull 7–12',
      rule: 'Begge slår ut, velg det beste utslaget, så annenhvert slag.',
    },
    foursomes: {
      label: 'Foursomes · Hull 13–18',
      rule: 'Én ball, annenhvert slag fra tee.',
    },
  } as const;

  const { label, rule } = config[segment];

  return (
    <div className="mb-3 rounded-md border border-border bg-bg/60 px-3 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="font-serif text-sm font-semibold text-primary">
          {label}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted">{rule}</p>
    </div>
  );
}
