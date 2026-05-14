'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';

type SideTournamentConfig = {
  enabled: boolean;
  ldCount: number;
  ctpCount: number;
};

type Props = {
  // The end action arrives pre-bound with the game id; submitting empty
  // FormData is enough to trigger it.
  endAction: () => void | Promise<void>;
  gameId: string;
  disabled?: boolean;
  // When the game has LD/CTP side-tournament rows configured, the admin
  // must first record winners in the dedicated /avslutt wizard. The
  // button then becomes a navigation link instead of a direct action.
  sideTournament?: SideTournamentConfig;
};

// Pill-shape + min-height match the primary <Button> styling so the Link
// variant is visually indistinguishable from the form-action button.
const LINK_CLASSES =
  'inline-flex w-full items-center justify-center min-h-[44px] px-[18px] py-2.5 rounded-full font-medium tracking-tight transition-[background-color,transform,opacity] duration-100 bg-primary hover:bg-primary-hover hover:-translate-y-px text-white dark:text-bg shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40';

const LINK_DISABLED_CLASSES = 'opacity-50 cursor-not-allowed pointer-events-none hover:translate-y-0';

export function EndGameButton({
  endAction,
  gameId,
  disabled = false,
  sideTournament,
}: Props) {
  const needsWizard =
    !!sideTournament?.enabled &&
    sideTournament.ldCount + sideTournament.ctpCount > 0;

  if (needsWizard) {
    return (
      <Link
        href={`/admin/games/${gameId}/avslutt`}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : undefined}
        className={`${LINK_CLASSES} ${disabled ? LINK_DISABLED_CLASSES : ''}`}
      >
        Avslutt spillet
      </Link>
    );
  }

  return (
    <form
      action={endAction}
      onSubmit={(event) => {
        const ok = window.confirm(
          'Er du sikker? Alle vil se leaderboard etterpå.',
        );
        if (!ok) {
          event.preventDefault();
        }
      }}
    >
      <Button type="submit" className="w-full" disabled={disabled}>
        Avslutt spillet
      </Button>
    </form>
  );
}
