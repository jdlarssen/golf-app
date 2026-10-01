import { useId, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import { socialProofForm, type GameSocialProof } from '@/lib/games/socialProof';
import {
  formatDisplayLabelKey,
  resolveFormatContentKey,
} from '@/lib/games/formatLabel';
import { invitationWhen } from '@/lib/games/invitationCard';
import { SocialProofText } from '@/components/games/SocialProofText';

export type InvitationCardVariant = 'invite' | 'public' | 'member';

/** Wolf and Round Robin are `team_size: 1`, but you play with a partner. */
const NO_PLAY_STYLE: ReadonlySet<GameMode> = new Set(['wolf', 'round_robin']);

const TERM =
  'text-[10px] leading-[normal] font-semibold tracking-[0.18em] text-muted uppercase';
const VALUE = 'font-serif text-[22px] leading-[normal] font-semibold';

const AVATAR_DOTS = [
  'bg-[var(--invitation-avatar-1)]',
  '-ml-[7px] bg-[var(--invitation-avatar-2)]',
  '-ml-[7px] bg-[var(--invitation-avatar-3)]',
];

/**
 * The invitation as a paper card (#2266, artboard «Forslag: invitasjonskortet»):
 * light paper, a double forest hairline, tilted a little. Pure presentation —
 * every value arrives as a prop, so the card can never show more than its
 * props allow.
 *
 * - `invite`: `/login?invite=…`. Kicker «Invitasjon», who invited you, `h2`.
 * - `public`: the signup link logged out. Kicker «Påmelding», `h2`; payment,
 *   prizes, names and «Bli med» come in as `children`.
 * - `member`: the signup link logged in. No kicker (the TopBar has it), `h1`.
 *
 * Privacy (#1193): `invite` and `public` are anonymous visitors, so the social
 * line is always a count — friend names are dropped here even if passed in.
 */
export function InvitationCard({
  variant,
  inviterName = null,
  gameName,
  gameMode,
  modeConfig,
  teeOffAt,
  courseName,
  teeName,
  socialProof,
  expiresLine,
  children,
}: {
  variant: InvitationCardVariant;
  inviterName?: string | null;
  /** Ready to show, from `localizeGameName`. */
  gameName: string;
  gameMode: GameMode;
  modeConfig: GameModeConfig;
  teeOffAt: string | null;
  courseName: string | null;
  teeName: string | null;
  socialProof: GameSocialProof;
  /** «Invitasjonen utløper om 3 dager» under the paper; `null` → no line. */
  expiresLine: string | null;
  children?: ReactNode;
}) {
  const t = useTranslations('invitationCard');
  const headingId = useId();
  const Heading = variant === 'member' ? 'h1' : 'h2';

  return (
    <article
      aria-labelledby={headingId}
      data-testid="invitation-card"
      data-variant={variant}
    >
      <div
        data-testid="invitation-paper"
        className="rounded-[6px] bg-[var(--invitation-paper)] p-2 shadow-[0_14px_30px_rgba(26,46,31,0.16)] -rotate-[1.2deg]"
      >
        <div className="rounded-[3px] border border-primary p-1">
          <div className="flex flex-col items-center gap-2.5 rounded-[2px] border border-primary/35 px-[18px] pt-5 pb-[18px] text-center">
            {variant !== 'member' && (
              <p className="text-[10px] leading-[normal] font-semibold tracking-[0.32em] text-muted uppercase">
                {t(variant === 'invite' ? 'kicker.invite' : 'kicker.public')}
              </p>
            )}
            {variant === 'invite' && (
              <p className="text-[14px] leading-[normal] text-muted">
                {inviterName
                  ? t('invitedBy', { name: inviterName })
                  : t('invitedByFallback')}
              </p>
            )}
            <Heading
              id={headingId}
              className="font-serif text-[34px] leading-[1.05] font-medium ![text-wrap:wrap]"
            >
              {gameName}
            </Heading>
            <div aria-hidden="true" className="h-px w-16 bg-primary" />
            <WhenFields teeOffAt={teeOffAt} />
            <GameLines
              gameMode={gameMode}
              modeConfig={modeConfig}
              courseName={courseName}
              teeName={teeName}
            />
            <JoinedRow
              socialProof={
                // Anonymous visitors never get names into the card at all.
                variant === 'member'
                  ? socialProof
                  : {
                      joinedCount: socialProof.joinedCount,
                      knownFriendNames: [],
                      knownFriendOverflow: 0,
                    }
              }
            />
            {children && <div className="w-full">{children}</div>}
          </div>
        </div>
      </div>
      {expiresLine && (
        <p
          data-testid="invite-expiry"
          className="mt-3 text-center text-[12px] leading-[normal] text-muted"
        >
          {expiresLine}
        </p>
      )}
    </article>
  );
}

/** Weekday over date, and the tee-off — Oslo wall clock. None without a tee-off. */
function WhenFields({ teeOffAt }: { teeOffAt: string | null }) {
  const t = useTranslations('invitationCard');
  const locale = useLocale() as AppLocale;
  const when = invitationWhen(teeOffAt, locale);
  if (!when || !teeOffAt) return null;
  return (
    <dl className="mt-0.5 grid w-full grid-cols-2">
      <div className="border-r border-border px-2 py-0.5">
        <dt className={TERM}>{when.weekday}</dt>
        <dd className={VALUE}>
          <time dateTime={teeOffAt}>{when.date}</time>
        </dd>
      </div>
      <div className="px-2 py-0.5">
        <dt className={TERM}>{t('teeOff')}</dt>
        <dd className={VALUE}>
          <time dateTime={teeOffAt}>{when.time}</time>
        </dd>
      </div>
    </dl>
  );
}

/**
 * «{bane} · {tee} tee», «{format} · hver for seg» and the format's rule in
 * italics. The rule has the same source as ModeGuideCard on the game page.
 */
function GameLines({
  gameMode,
  modeConfig,
  courseName,
  teeName,
}: {
  gameMode: GameMode;
  modeConfig: GameModeConfig;
  courseName: string | null;
  teeName: string | null;
}) {
  const t = useTranslations('invitationCard');
  const tModes = useTranslations('modes');
  const tGuide = useTranslations('formatGuide');
  const teamSize = modeConfig.team_size ?? 1;

  const courseLine =
    courseName && teeName
      ? `${courseName} · ${t('tee', { name: teeName })}`
      : courseName;

  const modeKey = formatDisplayLabelKey(gameMode, modeConfig) as Parameters<
    typeof tModes
  >[0];
  const modeName = tModes.has(modeKey) ? tModes(modeKey) : null;
  const playStyle = NO_PLAY_STYLE.has(gameMode)
    ? null
    : t(teamSize === 1 ? 'playStyle.solo' : 'playStyle.team');
  const formatLine =
    modeName && playStyle ? `${modeName} · ${playStyle}` : modeName;

  const ruleKey = `content.${resolveFormatContentKey(gameMode, teamSize)}.summary` as Parameters<
    typeof tGuide
  >[0];
  const rule = tGuide.has(ruleKey) ? tGuide(ruleKey) : null;

  return (
    <>
      {(courseLine || formatLine) && (
        <p className="text-[14px] leading-[1.5]">
          {courseLine}
          {courseLine && formatLine && <br />}
          {formatLine}
        </p>
      )}
      {rule && (
        <p className="text-[12px] leading-[normal] text-muted italic">{rule}</p>
      )}
    </>
  );
}

/**
 * Up to three dots and «{n} er med allerede» — or, for a member with friends
 * on the roster, the friend wording from SocialProofText. Nothing at 0.
 */
function JoinedRow({ socialProof }: { socialProof: GameSocialProof }) {
  const t = useTranslations('invitationCard');
  const form = socialProofForm(socialProof);
  if (form == null) return null;
  const { joinedCount } = socialProof;
  return (
    <div className="mt-1 flex items-center gap-2">
      <span aria-hidden="true" className="flex">
        {AVATAR_DOTS.slice(0, Math.min(joinedCount, 3)).map((dot) => (
          <span
            key={dot}
            data-testid="invitation-avatar"
            className={`size-[26px] rounded-full shadow-[0_0_0_2px_var(--invitation-paper)] ${dot}`}
          />
        ))}
      </span>
      <span
        data-testid="social-proof-line"
        className="text-[13px] leading-[normal] font-semibold"
      >
        {form.kind === 'count' ? (
          t('joined', { count: joinedCount })
        ) : (
          <SocialProofText form={form} />
        )}
      </span>
    </div>
  );
}
