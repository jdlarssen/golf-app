'use client';

// Wolf-modusens hull-tilstand (#1716 — ren flytting ut av `HoleClient`):
// valg-lista holdt i takt med databasen, hvem som er Wolf på hullet,
// badge-teksten over score-kortene, og prop-bunten til `WolfChoiceModal`.
//
// #2092: a realtime payload is not applied as state. Supabase Realtime does not
// promise delivery order per subscriber, so an older choice could arrive after
// the newer one and stay on the badge. Every event, save and catch-up instead
// schedules a debounced re-read, and the sequence guard in
// `reconcileWolfChoices` drops any answer that is older than what the screen
// already shows. Same pattern as `useBingoBangoBongoHoles` (#1950).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { readWolfChoices } from '@/lib/wolf/readWolfChoices';
import {
  applyWolfLocalSave,
  applyWolfRead,
  type WolfChoicesState,
} from '@/lib/wolf/reconcileWolfChoices';
import { subscribeWolfChoices } from '@/lib/wolf/subscribeWolfChoices';
import type { WolfChoice, WolfHoleChoice } from '@/lib/scoring/modes/types';
import { determineWolfForHole } from '@/lib/wolf/wolfRotation';

/**
 * Collapses a burst of events (an INSERT and its UPDATE, or a quick change of
 * mind) into one read. Same as the Bingo Bango Bongo hole screen.
 */
const READ_DEBOUNCE_MS = 200;

export type WolfPlayer = { userId: string; teamNumber: number; name: string };

/** Visningsnavnet til en wolf-spiller, eller null når id-en mangler/ukjent. */
function wolfPlayerName(
  players: WolfPlayer[] | undefined,
  userId: string | null | undefined,
): string | null {
  if (!userId) return null;
  return players?.find((p) => p.userId === userId)?.name ?? null;
}

export type WolfModalProps = {
  isOpen: boolean;
  wolfUserId: string;
  otherPlayers: Array<{ userId: string; name: string }>;
  onClose: () => void;
  onChoiceSaved: (choice: WolfChoice, partnerUserId: string | null) => void;
};

export type WolfHoleState = {
  /** Tekst til modus-kontekstlinja over score-kortene. Null = ingen badge. */
  badgeText: string | null;
  /** Null når jeg ikke er Wolf på hullet — da rendres modalen ikke i det hele tatt. */
  modal: WolfModalProps | null;
};

export function useWolfHole(args: {
  gameId: string;
  isWolf: boolean;
  currentHole: number;
  myUserId: string;
  gameStatus: 'draft' | 'scheduled' | 'active' | 'finished';
  wolfPlayers: WolfPlayer[] | undefined;
  wolfChoicesInitial: WolfHoleChoice[] | undefined;
  wolfPointsByUser: Record<string, number> | undefined;
}): WolfHoleState {
  const {
    gameId,
    isWolf,
    currentHole,
    myUserId,
    gameStatus,
    wolfPlayers,
    wolfChoicesInitial,
    wolfPointsByUser,
  } = args;
  const t = useTranslations('holes');

  // Wolf-mode state: vi initialiserer fra server-prop og leser på nytt når
  // Supabase melder en endring. Når Wolf-spilleren velger på sin device, får
  // alle i spillet en postgres_changes-hendelse og oppdaterer badge-en uten å
  // vente på neste server-render.
  //
  // Init-fra-prop er trygt her fordi parent-wrapperen har `key={holeNumber}`
  // som remounter hele HoleClient ved hull-bytte; vi trenger ikke useEffect-
  // sync mot wolfChoicesInitial-prop-endringer innen samme hull.
  const [state, setState] = useState<WolfChoicesState>(() => ({
    holes: wolfChoicesInitial ?? [],
    appliedSeq: 0,
  }));
  const wolfChoices = state.holes;
  // Issues the sequence numbers for reads and local saves. Shared by both so a
  // read issued before a save can never be applied after it.
  const seqRef = useRef(0);
  // Set while the subscription effect is live; a no-op before mount, after
  // unmount and when the game is not Wolf.
  const scheduleReadRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!isWolf) return;
    let unmounted = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const read = async () => {
      timer = null;
      // Taken when the read goes out, not when it answers: the number has to
      // say which commits the snapshot can contain.
      const seq = ++seqRef.current;
      try {
        const rows = await readWolfChoices(gameId);
        if (unmounted) return;
        setState((s) => applyWolfRead(s, seq, rows));
      } catch (error) {
        if (unmounted) return;
        // Keep the last good choices; the next event, save or catch-up reads again.
        console.error('[wolf] reading choices failed', { gameId, error });
      }
    };

    const scheduleRead = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void read(), READ_DEBOUNCE_MS);
    };
    scheduleReadRef.current = scheduleRead;

    // The payload is only a change signal (see subscribeWolfChoices). A rejoin
    // after an outage reads too: missed events are never replayed (#2093).
    const unsubscribe = subscribeWolfChoices(gameId, scheduleRead, {
      onResubscribed: scheduleRead,
    });
    // Anything committed between the server render and the subscription.
    scheduleRead();

    // Events missed while the tab slept or the network was gone.
    const catchUp = () => {
      if (document.visibilityState !== 'visible') return;
      scheduleRead();
    };
    document.addEventListener('visibilitychange', catchUp);
    window.addEventListener('online', catchUp);

    return () => {
      unmounted = true;
      if (timer) clearTimeout(timer);
      scheduleReadRef.current = () => {};
      document.removeEventListener('visibilitychange', catchUp);
      window.removeEventListener('online', catchUp);
      unsubscribe();
    };
  }, [isWolf, gameId]);

  const pointsByUserMap = useMemo(() => {
    const m = new Map<string, number>();
    if (wolfPointsByUser) {
      for (const [userId, points] of Object.entries(wolfPointsByUser)) {
        m.set(userId, points);
      }
    }
    return m;
  }, [wolfPointsByUser]);

  const [modalDismissed, setModalDismissed] = useState(false);

  // Hvem er Wolf på dette hullet? Wolf-tabellen kan ha en eksplisitt rad
  // (f.eks. admin-override), ellers regner vi rotasjon eller trailing-wolf.
  const currentHoleWolfChoice = wolfChoices.find(
    (c) => c.holeNumber === currentHole,
  );
  const wolfUserIdForHole = isWolf
    ? determineWolfForHole(
        currentHole,
        wolfPlayers ?? [],
        pointsByUserMap,
        currentHoleWolfChoice?.wolfUserId,
      )
    : null;
  const iAmWolfForHole = isWolf && wolfUserIdForHole === myUserId;

  // Trigger modal automatisk når dette er min tur og ingen valg finnes ennå.
  // `dismissed` lar brukeren lukke modalen midt i et hull uten at den popper
  // opp igjen. Når parent remounter (hull-bytte via `key={holeNumber}` på
  // wrapper-div-en), starter dismissed på false igjen.
  const shouldShowModal =
    isWolf && iAmWolfForHole && !currentHoleWolfChoice && gameStatus === 'active';
  const modalOpen = shouldShowModal && !modalDismissed;

  // Wolf-badge tekst — vises over score-card-listen for å gi flighten
  // raskt overblikk over hvem som er Wolf og hva valget ble.
  const wolfBadgePlayerName = wolfPlayerName(wolfPlayers, wolfUserIdForHole);
  const wolfPartnerName =
    currentHoleWolfChoice?.choice === 'partner'
      ? wolfPlayerName(wolfPlayers, currentHoleWolfChoice.partnerUserId)
      : null;

  // #465: Lone-gevinst = n, blind = n+2. Vis faktiske poeng i badgen i stedet
  // for den nå-unøyaktige «2x/3x»-rammingen (gjaldt bare 4 spillere).
  const wolfPlayerCount = wolfPlayers?.length ?? 0;
  function resolveBadgeText(): string | null {
    if (!isWolf || !wolfBadgePlayerName) return null;
    if (!currentHoleWolfChoice) {
      return iAmWolfForHole
        ? t('wolf.youAreWolf')
        : t('wolf.wolfWaiting', { name: wolfBadgePlayerName });
    }
    if (currentHoleWolfChoice.choice === 'partner' && wolfPartnerName) {
      return t('wolf.wolfPartner', {
        wolfName: wolfBadgePlayerName,
        partnerName: wolfPartnerName,
      });
    }
    if (currentHoleWolfChoice.choice === 'lone') {
      return t('wolf.wolfLone', {
        name: wolfBadgePlayerName,
        points: wolfPlayerCount,
      });
    }
    if (currentHoleWolfChoice.choice === 'blind') {
      return t('wolf.wolfBlind', {
        name: wolfBadgePlayerName,
        points: wolfPlayerCount + 2,
      });
    }
    return null;
  }

  // Modal-prop: hvilke andre spillere (n-1) skal vises som partner-alternativer?
  const otherWolfPlayers = (wolfPlayers ?? [])
    .filter((p) => p.userId !== myUserId)
    .map((p) => ({ userId: p.userId, name: p.name }));

  const modal: WolfModalProps | null =
    isWolf && iAmWolfForHole && wolfUserIdForHole
      ? {
          isOpen: modalOpen,
          wolfUserId: wolfUserIdForHole,
          otherPlayers: otherWolfPlayers,
          onClose: () => setModalDismissed(true),
          onChoiceSaved: (choice: WolfChoice, partnerUserId: string | null) => {
            // The modal calls this after the save committed: show it at once,
            // then read, so the badge ends on what the database holds.
            const seq = ++seqRef.current;
            setState((s) =>
              applyWolfLocalSave(s, seq, {
                holeNumber: currentHole,
                wolfUserId: wolfUserIdForHole,
                choice,
                partnerUserId,
              }),
            );
            scheduleReadRef.current();
          },
        }
      : null;

  return { badgeText: resolveBadgeText(), modal };
}
