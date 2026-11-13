'use client';

import { useId, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button, LinkButton } from '@/components/ui/Button';
import { GuestBadge } from '@/components/ui/GuestBadge';
import { SearchField } from '@/components/ui/SearchField';
import { formatHcpDisplay } from '@/lib/handicap/signFormat';
import type { TeamPickerFriend } from '@/lib/games/teamFriendPicker';

/**
 * The friend picker's parts on the web (#2840 del 5), shared by the team form
 * and the team page's «Velg en venn». The drawing v3.1 is the spec: discs,
 * one list, a filled search with «Legg til venn» always beside it, and a
 * sheet with «Kopier lenken din» and «Gå til Venner».
 */

/** Rows shown before «Vis alle N». */
export const FRIEND_LIST_LIMIT = 8;

type DiscTone = 'me' | 'other' | 'empty';

/**
 * A round disc with initials. `me` is forest, `other` pale green, `empty` a
 * dashed «+». `selected` gives the green ring and the check, `captain` the
 * «K» badge, `faded` the pale disc of someone who has not said yes.
 */
export function Disc({
  initials,
  tone = 'other',
  size = 'md',
  selected = false,
  captain = false,
  faded = false,
  ringOn = 'surface',
}: {
  initials?: string;
  tone?: DiscTone;
  size?: 'md' | 'lg';
  selected?: boolean;
  captain?: boolean;
  faded?: boolean;
  /** The surface under the ring's gap. */
  ringOn?: 'surface' | 'bg';
}) {
  const t = useTranslations('signup.friendPicker');
  const box = size === 'lg' ? 'size-[60px] text-lg' : 'size-10 text-sm';
  const fill =
    tone === 'me'
      ? 'bg-primary text-white dark:text-bg'
      : tone === 'empty'
        ? 'border-[1.5px] border-dashed border-slot-dashed text-muted font-normal'
        : 'bg-primary-soft text-primary';
  const gap = ringOn === 'bg' ? 'ring-offset-bg' : 'ring-offset-surface';
  const edge = ringOn === 'bg' ? 'ring-bg' : 'ring-surface';
  return (
    <span
      aria-hidden
      className={`relative grid shrink-0 place-items-center rounded-full font-semibold tabular-nums ${box} ${fill} ${
        selected ? `ring-2 ring-primary ring-offset-2 ${gap}` : ''
      } ${faded ? 'opacity-55' : ''}`}
    >
      {tone === 'empty' ? <span className="text-[22px] leading-none">+</span> : initials}
      {selected && (
        <span
          className={`absolute -right-[3px] -bottom-[3px] grid size-[18px] place-items-center rounded-full bg-primary text-[11px] text-white ring-2 dark:text-bg ${edge}`}
        >
          ✓
        </span>
      )}
      {captain && (
        <span
          title={t('captain')}
          className={`absolute -right-1 -bottom-0.5 grid h-4 place-items-center rounded px-[5px] bg-accent text-[10px] font-semibold text-text ring-2 dark:text-bg ${edge}`}
        >
          {t('captainBadge')}
        </span>
      )}
    </span>
  );
}

/** One place in the lineup: the disc and the name under it. */
export function LineupSlot({
  disc,
  label,
  muted = false,
}: {
  disc: ReactNode;
  label: string;
  muted?: boolean;
}) {
  return (
    <span className="grid min-h-[84px] justify-items-center gap-1.5">
      {disc}
      <span className={`max-w-full truncate text-[13px] ${muted ? 'text-muted' : 'text-text'}`}>
        {label}
      </span>
    </span>
  );
}

/** The filled search with «+ Legg til venn» beside it, always. */
export function FriendSearchBar({
  query,
  onQuery,
  onAddFriend,
}: {
  query: string;
  onQuery: (value: string) => void;
  onAddFriend: () => void;
}) {
  const t = useTranslations('signup.friendPicker');
  const id = useId();
  return (
    // #2840: at 390 px the field and «+ Legg til venn» share the card's 310 px. The chip
    // size (14 px, 14 px sides) at 48 px, a 6 px gap and the field's 8 px right pad leave
    // «Søk i vennene» room; with the 15 px medium button the placeholder was cut.
    <div className="flex items-center gap-1.5">
      <SearchField
        id={id}
        label={t('search')}
        value={query}
        onChange={onQuery}
        placeholder={t('search')}
        tone="filled"
        className="min-w-0 flex-1"
      />
      <Button
        type="button"
        variant="outline"
        size="chip"
        onClick={onAddFriend}
        data-testid="add-friend"
        className="shrink-0 !h-12"
      >
        <span aria-hidden className="mr-1.5 text-lg font-medium leading-none">
          +
        </span>
        {t('addFriend')}
      </Button>
    </div>
  );
}

/** «HCP 18,0 · 6 runder sammen», «Ingen runder sammen ennå», or nothing. */
export function useFriendLine(): (friend: Pick<TeamPickerFriend, 'hcp' | 'stats'>) => string | null {
  const tFriends = useTranslations('friends');
  const locale = useLocale() as AppLocale;
  return ({ hcp, stats }) => {
    const parts: string[] = [];
    if (hcp !== null) parts.push(tFriends('hcpLine', { hcp: formatHcpDisplay(hcp, locale) }));
    if (stats) {
      parts.push(
        stats.roundsTogether > 0
          ? tFriends('roundsTogether', { count: stats.roundsTogether })
          : tFriends('noRoundsYet'),
      );
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  };
}

/** The friends whose name, nickname or masked address holds the query. */
export function filterFriends(friends: readonly TeamPickerFriend[], query: string): TeamPickerFriend[] {
  const q = query.trim().toLocaleLowerCase('nb');
  if (q.length === 0) return [...friends];
  return friends.filter((f) => f.label.toLocaleLowerCase('nb').includes(q));
}

/**
 * The list: one surface, a disc per friend, the whole row is the button.
 * `reasonFor` returns the grey line of a friend who cannot be picked (in the
 * round already, on the team), `blocked` greys a friend without a line (the
 * team is full). Search misses say so, and a long list folds at
 * `FRIEND_LIST_LIMIT` behind «Vis alle N».
 */
export function FriendList({
  friends,
  query,
  isSelected,
  reasonFor,
  blocked = () => false,
  onToggle,
}: {
  friends: readonly TeamPickerFriend[];
  query: string;
  isSelected: (id: string) => boolean;
  reasonFor: (friend: TeamPickerFriend) => string | null;
  blocked?: (friend: TeamPickerFriend) => boolean;
  onToggle: (friend: TeamPickerFriend) => void;
}) {
  const t = useTranslations('signup.friendPicker');
  const friendLine = useFriendLine();
  const [showAll, setShowAll] = useState(false);

  const hits = filterFriends(friends, query);
  if (hits.length === 0) {
    return (
      <p className="px-1 pt-1 text-[15px] text-muted" data-testid="friend-no-hit">
        {t('noHit', { query: query.trim() })}
      </p>
    );
  }
  const folded = !showAll && query.trim().length === 0 && hits.length > FRIEND_LIST_LIMIT;
  const shown = folded ? hits.slice(0, FRIEND_LIST_LIMIT) : hits;

  return (
    <div>
      <ul aria-label={t('listLabel')} className="-mx-2 grid gap-0.5" data-focus-inset>
        {shown.map((friend) => {
          const reason = reasonFor(friend);
          const selected = isSelected(friend.id);
          const disabled = reason !== null || (!selected && blocked(friend));
          const line = reason ?? friendLine(friend);
          return (
            <li key={friend.id}>
              <button
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => onToggle(friend)}
                data-testid={`friend-row-${friend.id}`}
                className="flex min-h-[60px] w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Disc initials={friend.initials} selected={selected} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-base font-medium text-text">{friend.label}</span>
                    {friend.isGuest && <GuestBadge className="shrink-0" />}
                  </span>
                  {line && (
                    <span className="mt-0.5 block text-[13px] text-muted tabular-nums">{line}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {folded && (
        <Button
          type="button"
          variant="quiet"
          size="chip"
          onClick={() => setShowAll(true)}
          className="mt-1"
        >
          {t('showAll', { count: hits.length })}
        </Button>
      )}
    </div>
  );
}

/**
 * «Legg til en venn» (#2840): no QR code on the web. The sheet copies the
 * captain's own friend link, or goes to the friends page. Without a link (the
 * code could not be read) it says so and keeps the way to the friends page.
 */
export function AddFriendSheet({
  open,
  onClose,
  linkPath,
}: {
  open: boolean;
  onClose: () => void;
  linkPath: string | null;
}) {
  const t = useTranslations('signup.friendPicker');
  const tFriends = useTranslations('friends');
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!linkPath) return;
    const url = `${window.location.origin}${linkPath}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (older Safari, a setting): show the link to copy by hand.
      window.prompt(tFriends('copyPromptFallback'), url);
    }
  }

  return (
    <BottomSheet
      open={open}
      title={t('sheetTitle')}
      onClose={onClose}
      doneLabel={t('sheetClose')}
      closeLabel={t('sheetClose')}
    >
      <p className="text-sm leading-snug text-muted">
        {linkPath ? t('sheetBody') : t('sheetNoLink')}
      </p>
      {/* The label swap alone is silent to screen readers; this announces it. */}
      <span role="status" className="sr-only">
        {copied ? tFriends('copiedLabel') : ''}
      </span>
      {linkPath && (
        <Button type="button" size="large" onClick={copy} className="w-full" data-testid="copy-friend-link">
          {copied ? tFriends('copiedLabel') : t('sheetCopy')}
        </Button>
      )}
      <LinkButton href="/profile/venner" variant="outline" size="large" full>
        {t('sheetGoToFriends')}
      </LinkButton>
    </BottomSheet>
  );
}
