import { Medallion } from '@/components/ui/Medallion';

/**
 * #2700: plassmerket foran en premielinje — den tegnede medaljen på 1–3, og en
 * prikk fra plass 4. Erstatter 🥇/🥈/🥉. Linja ved siden av sier selv
 * «1. plass», så merket er skjult for skjermleseren.
 */
export function RankMark({ position }: { position: number }) {
  return (
    <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center text-base">
      {position >= 1 && position <= 3 ? (
        <Medallion place={position as 1 | 2 | 3} size={22} />
      ) : (
        '•'
      )}
    </span>
  );
}
