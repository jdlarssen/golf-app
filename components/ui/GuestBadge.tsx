import { useTranslations } from 'next-intl';

/**
 * «Gjest»-chip (#1009) — markerer skygge-brukere (users.is_guest) på de
 * arrangør-synlige roster-/spillere-flatene. Vises IKKE på leaderboard/podium
 * (kontrakt-beslutning 4: gjesten deltar som vanlig spiller der). Samme
 * dempede pill-stil som UnconfirmedBadge.
 */
export function GuestBadge({ className }: { className?: string }) {
  const t = useTranslations('common');
  return (
    <span
      data-testid="guest-badge"
      className={`inline-block rounded-full border px-[7px] py-[2px] font-sans text-[9.5px] font-medium ${className ?? ''}`}
      style={{
        borderColor: 'var(--border)',
        background: 'transparent',
        color: 'var(--text-muted)',
      }}
    >
      {t('guestBadge')}
    </span>
  );
}
