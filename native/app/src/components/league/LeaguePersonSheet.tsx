// native/app/src/components/league/LeaguePersonSheet.tsx
// #2878: arket som åpnes når du trykker på et navn i sesongtabellen. Det er
// venne-arket (`FriendSheet`) med en bunn som følger forholdet til personen:
// «Legg til venn», «Venneforespørsel sendt.», «Godta» eller ingen knapp.
//
// Forholdet og tallene kommer fra `fetchFriends()` (som Venner), hentet én
// gang når arket åpnes, så ligaskjermen ikke blir tregere. Handicapet er
// ligavisningens (`hcpIndex`, bare for en som er med i ligaen). Står personen
// ikke i noen liste, eller mangler tallene, står det en strek, som i Venner.
//
// Handlingene har ingen kø: uten nett står linja og knappen igjen, så du kan
// prøve på nytt. Knappen er låst mens handlingen går.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchFriends,
  respondToFriendRequest,
  sendFriendRequest,
  type FriendActionResult,
  type FriendsData,
} from '../../data/friends';
import type { WebApiFailure } from '../../data/webApi';
import { friendRelationFor } from '../../lib/friendRelation';
import {
  FRIENDS_TEXT,
  friendSheetValues,
  friendStatusLine,
  friendsFailureLine,
} from '../../lib/friendsCopy';
import type { FriendStatus } from '../../../../../lib/friends/friendStatus';
import { FriendSheet, type AvatarTone, type SheetBottom } from '../friends/FriendSheet';

export interface LeaguePerson {
  userId: string;
  /** Navnet som tabellen skriver det (`participantLabel`). */
  name: string;
  fullName: string | null;
  hcpIndex: number | null;
}

type LoadState =
  | { state: 'loading' }
  | { state: 'ready'; data: FriendsData }
  | { state: 'failed'; reason: WebApiFailure | 'load_failed' };

/** Det arket viser etter en handling, før lista er hentet på nytt. */
type Outcome = 'sent' | 'friend' | null;

/**
 * Modal-en står montert og får `open` false ved lukking, som i Venner, og
 * siste person blir stående mens arket glir ned. Hver gang arket åpnes (eller
 * åpnes for en annen) er det en ny økt: nøkkelen nullstiller henting,
 * handling, linje og lås, så et nytt åpent ark henter lista på nytt.
 */
export function LeaguePersonSheet({ person, onClose }: { person: LeaguePerson | null; onClose: () => void }) {
  const isOpen = person !== null;
  const [shown, setShown] = useState<{ last: LeaguePerson | null; session: number; open: boolean }>({
    last: person,
    session: 0,
    open: isOpen,
  });
  if (isOpen !== shown.open || (person !== null && person.userId !== shown.last?.userId)) {
    // Avledet tilstand, satt under rendringen (React tegner på nytt med en gang).
    setShown({
      last: person ?? shown.last,
      session: isOpen && (!shown.open || person.userId !== shown.last?.userId) ? shown.session + 1 : shown.session,
      open: isOpen,
    });
  }
  return <PersonSheetBody key={shown.session} person={shown.last} open={isOpen} onClose={onClose} />;
}

function PersonSheetBody({
  person,
  open,
  onClose,
}: {
  person: LeaguePerson | null;
  open: boolean;
  onClose: () => void;
}) {
  const userId = person?.userId ?? null;
  const [load, setLoad] = useState<LoadState>({ state: 'loading' });
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  // `busy` er først låst når den er tegnet; refen stopper trykk nummer to før det.
  const inFlight = useRef(false);

  useEffect(() => {
    if (userId === null) return;
    let cancelled = false;
    void fetchFriends().then((result) => {
      if (cancelled) return;
      setLoad(result.ok ? { state: 'ready', data: result.data } : { state: 'failed', reason: result.reason });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  /** Lista på nytt etter en handling. Feiler den, står det arket alt viser. */
  const reload = useCallback(async () => {
    const result = await fetchFriends();
    if (result.ok) setLoad({ state: 'ready', data: result.data });
  }, []);

  const run = useCallback(
    async (act: () => Promise<FriendActionResult<FriendStatus>>) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setLine(null);
      const result = await act();
      if (!result.ok) {
        setLine(friendsFailureLine(result.reason));
      } else if (result.status === 'requested' || result.status === 'already_pending') {
        setOutcome('sent');
        await reload();
      } else if (result.status === 'accepted' || result.status === 'already_friends') {
        setOutcome('friend');
        await reload();
      } else {
        // `already_decided` og `not_found` har ingen linje: lista viser hvordan det står.
        const status = friendStatusLine(result.status);
        setLine(status ? status.text : null);
        await reload();
      }
      inFlight.current = false;
      setBusy(false);
    },
    [reload],
  );

  if (!person || userId === null) {
    return <FriendSheet person={null} bottom={{ kind: 'none' }} onClose={onClose} />;
  }

  const ready = load.state === 'ready' ? load.data : null;
  const relation = ready ? friendRelationFor(ready, userId) : null;
  const kind = outcome ?? relation?.kind ?? null;
  const stats = relation?.person?.stats ?? null;
  const now = new Date();

  let bottom: SheetBottom = { kind: 'none' };
  let subline: string | null = null;
  let tone: AvatarTone = 'warm';
  if (kind === 'none') {
    bottom = {
      kind: 'action',
      label: FRIENDS_TEXT.addFriendLabel,
      pendingLabel: FRIENDS_TEXT.addFriendPending,
      busy,
      onPress: () => void run(() => sendFriendRequest(userId)),
      testID: 'league-person-add',
    };
  } else if (kind === 'incoming') {
    const requestId = relation?.kind === 'incoming' ? relation.requestId : null;
    tone = 'soft';
    subline = FRIENDS_TEXT.incomingSection;
    bottom = requestId
      ? {
          kind: 'action',
          label: FRIENDS_TEXT.acceptLabel,
          pendingLabel: FRIENDS_TEXT.acceptPending,
          busy,
          onPress: () => void run(() => respondToFriendRequest(requestId, true)),
          testID: 'league-person-accept',
        }
      : { kind: 'none' };
  } else if (kind === 'sent' || kind === 'outgoing') {
    tone = 'soft';
    bottom = { kind: 'sent' };
  } else if (kind === 'friend') {
    tone = 'strong';
    subline = FRIENDS_TEXT.friendsLine;
  }

  const loadLine =
    load.state === 'failed'
      ? load.reason === 'load_failed'
        ? FRIENDS_TEXT.loadFailed
        : friendsFailureLine(load.reason)
      : null;

  return (
    <FriendSheet
      open={open}
      person={{
        id: userId,
        name: person.fullName ?? person.name,
        subline,
        avatarTone: tone,
        rows: friendSheetValues({ hcp: person.hcpIndex, stats }, now),
      }}
      bottom={bottom}
      errorLine={line ?? loadLine}
      loading={load.state === 'loading'}
      onClose={onClose}
    />
  );
}
