import { getLocale, getTranslations } from 'next-intl/server';
import { SmartLink } from '@/components/ui/SmartLink';
import { Kicker } from '@/components/ui/Kicker';
import type { AppLocale } from '@/i18n/routing';
import { localizeGameName } from '@/lib/games/autoGameName';
import { formatTeeOffLongDate } from '@/lib/format/teeOff';
import {
  joinNames,
  lastRoundHrefs,
  lastRoundPeople,
  type LastRoundPerson,
} from '@/lib/wizard/lastRoundOffer';

/** What the card shows of the newest round «Revansje?» would accept. */
export type LastRoundOffer = {
  gameId: string;
  name: string;
  courseName: string;
  teeName: string;
  /** `formatDisplayLabelKey`, resolved under `modes`. */
  formatKey: string;
  /** The players who did not withdraw. */
  players: LastRoundPerson[];
};

/**
 * «Som sist» above the arrangement tiles on step 1 of /opprett-spill (#2446),
 * after `Nyttspill-forslag-samme-som-sist-*`: the kicker, the green card with
 * the last round and its new time, and the «Eller start på nytt» kicker over
 * the tiles. The page starts the read and passes the promise, so it runs
 * alongside the wizard's own data; no round, no card, and step 1 is as before.
 */
export async function LastRoundCard({
  offer,
  teeOffDefault,
}: {
  offer: Promise<LastRoundOffer | null>;
  /** `defaultTeeOffAt`, the time «Bruk samme oppsett» gives the new round. */
  teeOffDefault: string;
}) {
  const round = await offer;
  if (!round) return null;

  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('wizard');
  const tModes = await getTranslations('modes');

  const name = localizeGameName(round.name, round.courseName, locale);
  const people = lastRoundPeople(round.players);
  const names = joinNames(
    people.others > 0
      ? [...people.firstNames, t('createDoor.lastRound.others', { count: people.others })]
      : people.firstNames,
    locale,
  );
  const newTime = formatTeeOffLongDate(teeOffDefault, locale);
  const hrefs = lastRoundHrefs(round.gameId);

  return (
    <>
      <Kicker tone="accent" className="pt-[18px] pb-2 leading-[normal]">
        {t('createDoor.lastRound.kicker')}
      </Kicker>
      <section
        data-testid="last-round-card"
        data-focus-surface="strong"
        aria-label={t('createDoor.lastRound.ariaLabel', { name })}
        className="-mx-1 flex flex-col gap-3 rounded-[18px] bg-surface-strong p-4 text-bg-tint"
      >
        <div>
          <h2 className="font-serif text-[22px] font-semibold leading-[normal]">{name}</h2>
          <p className="mt-0.5 text-[13px] leading-[normal] opacity-[0.85]">
            {t('createDoor.lastRound.summary', {
              course: round.courseName,
              tee: round.teeName,
              format: tModes(round.formatKey as Parameters<typeof tModes>[0]),
            })}
          </p>
        </div>
        {people.initials.length > 0 && (
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="flex shrink-0">
              {people.initials.map((initials, i) => (
                <Avatar key={i} first={i === 0}>
                  {initials}
                </Avatar>
              ))}
              {people.others > 0 && <Avatar first={false}>{`+${people.others}`}</Avatar>}
            </span>
            <span className="text-[13px] leading-[normal]">{names}</span>
          </div>
        )}
        {newTime && (
          <p className="text-[13px] leading-[normal] opacity-[0.85]">
            {t('createDoor.lastRound.newTime', { date: newTime })}
          </p>
        )}
        <div className="flex gap-2">
          <SmartLink
            href={hrefs.use}
            data-testid="last-round-use"
            className="flex h-12 grow items-center justify-center rounded-full bg-bg-tint text-[15px] font-semibold leading-[normal] text-surface-strong"
          >
            {t('createDoor.lastRound.use')}
          </SmartLink>
          <SmartLink
            href={hrefs.edit}
            data-testid="last-round-edit"
            className="flex h-12 items-center justify-center rounded-full border border-bg-tint/40 px-4 text-[14px] font-semibold leading-[normal] text-bg-tint"
          >
            {t('createDoor.lastRound.edit')}
          </SmartLink>
        </div>
      </section>
      <Kicker className="pt-[18px] pb-2 leading-[normal]">
        {t('createDoor.lastRound.restartKicker')}
      </Kicker>
    </>
  );
}

/** 32 px, initials in forest on linen, each overlapping the one before by 4 px. */
function Avatar({ first, children }: { first: boolean; children: string }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-tint text-[11px] font-semibold leading-[normal] text-surface-strong shadow-[0_0_0_2px_var(--surface-strong)] ${first ? '' : '-ml-1'}`}
    >
      {children}
    </span>
  );
}
