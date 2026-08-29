'use client';

// Wolf-modusens hull-tilstand (#1716 — ren flytting ut av `HoleClient`):
// realtime-merget valg-liste, hvem som er Wolf på hullet, badge-teksten over
// score-kortene, og prop-bunten til `WolfChoiceModal`.

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { subscribeWolfChoices } from '@/lib/wolf/subscribeWolfChoices';
import type { WolfChoice, WolfHoleChoice } from '@/lib/scoring/modes/types';
import { determineWolfForHole } from './wolfRotation';

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

  // Wolf-mode state: vi initialiserer fra server-prop og merger inn realtime-
  // endringer. Når Wolf-spilleren velger på sin device, broadcaster Supabase
  // postgres_changes til alle 4 — vi merger den nye raden inn slik at alle
  // sine UI-er oppdaterer badge-en uten å vente på neste server-render.
  //
  // Init-fra-prop er trygt her fordi parent-wrapperen har `key={holeNumber}`
  // som remounter hele HoleClient ved hull-bytte; vi trenger ikke useEffect-
  // sync mot wolfChoicesInitial-prop-endringer innen samme hull.
  const [wolfChoices, setWolfChoices] = useState<WolfHoleChoice[]>(
    wolfChoicesInitial ?? [],
  );

  useEffect(() => {
    if (!isWolf) return;
    const unsubscribe = subscribeWolfChoices(gameId, (change) => {
      setWolfChoices((prev) => {
        const next = prev.filter((c) => c.holeNumber !== change.holeNumber);
        next.push({
          holeNumber: change.holeNumber,
          wolfUserId: change.wolfUserId,
          choice: change.choice,
          partnerUserId: change.partnerUserId,
        });
        next.sort((a, b) => a.holeNumber - b.holeNumber);
        return next;
      });
    });
    return unsubscribe;
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
            // Optimistic merge — vi venter ikke på realtime-broadcast.
            setWolfChoices((prev) => {
              const next = prev.filter((c) => c.holeNumber !== currentHole);
              next.push({
                holeNumber: currentHole,
                wolfUserId: wolfUserIdForHole,
                choice,
                partnerUserId,
              });
              next.sort((a, b) => a.holeNumber - b.holeNumber);
              return next;
            });
          },
        }
      : null;

  return { badgeText: resolveBadgeText(), modal };
}
