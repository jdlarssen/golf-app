/**
 * Tegnet bragd-merke: en liten sirkel med 1,5 hårlinje-ring og golfens eget tall
 * i Fraunces («1», «−2», «−1», «3×»; se `lib/stats/achievementMarks.ts`). Erstatter
 * emoji-ene på bragd-veggen. Merket er dekor: labelen og tallet ved siden av bærer
 * meningen, så det er skjult for skjermleseren. Opptjent får champagne-ringen
 * (`accent` er dekor) og `accent-text` på tallet (#1374); ellers dempes det.
 */
export function AchievementBadge({ mark, earned }: { mark: string; earned: boolean }) {
  return (
    <span
      aria-hidden
      className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full border-[1.5px] font-serif text-lg font-medium tabular-nums leading-none ${
        earned ? 'border-accent text-accent-text' : 'border-border text-muted'
      }`}
    >
      {mark}
    </span>
  );
}
