'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { KavalkadeCardView } from './KavalkadeCardView';
import type {
  KavalkadeCardId,
  KavalkadeDeck as Deck,
  KavalkadeTab,
} from '@/lib/kavalkade/kavalkadeCards';
import type { AppLocale } from '@/i18n/routing';

type Props = {
  deck: Deck;
  locale: AppLocale;
  /**
   * Handling per kort, slått opp på kort-ID. K4 (#2130) sender deleknappene inn
   * her — kortet og kortstokken slipper å vite hva deling er.
   */
  actions?: Partial<Record<KavalkadeCardId, ReactNode>>;
};

/**
 * Kavalkaden som bla-bar kortstokk (#2129).
 *
 * To faner («Ditt år» / «Gjengen») og én vannrett skinne per fane. Kortene
 * ligger på `snap-center` i en `snap-mandatory`-skinne, så en sveip lander
 * alltid midt på ett kort og aldri mellom to. Kortet er smalere enn skjermen
 * slik at nabokortet titter fram i kanten — den eneste affordansen som sier «det
 * er mer her» uten en indikator som må holdes i sync med rullingen.
 *
 * `-mx-5 px-5` opphever `AppShell`-paddingen så skinnen blør ut til skjermkanten,
 * samme grep som `TopBar`. Klient-komponent kun fordi fane-valget er lokal
 * state; kortene er rene.
 */
export function KavalkadeDeck({ deck, locale, actions }: Props) {
  const t = useTranslations('kavalkade');
  const [active, setActive] = useState<KavalkadeTab>(deck.defaultTab);
  const cards = active === 'personal' ? deck.personal : deck.gang;

  return (
    <div>
      <div
        className="mb-4 flex border-b border-border"
        role="tablist"
        aria-label={t('tabsAriaLabel')}
      >
        <TabButton
          label={t('tabPersonal')}
          testId="kavalkade-tab-personal"
          active={active === 'personal'}
          onSelect={() => setActive('personal')}
        />
        <TabButton
          label={t('tabGang')}
          testId="kavalkade-tab-gang"
          active={active === 'gang'}
          onSelect={() => setActive('gang')}
        />
      </div>

      {cards.length === 0 ? (
        <p
          className="font-sans text-sm leading-relaxed text-muted"
          data-testid="kavalkade-tab-empty"
        >
          {t('tabEmpty')}
        </p>
      ) : (
        <ol
          role="tabpanel"
          aria-label={active === 'personal' ? t('tabPersonal') : t('tabGang')}
          data-testid="kavalkade-rail"
          // `overscroll-x-contain` stopper sveipen fra å dra hele siden (og
          // dermed iOS-tilbake-gesten) når man blar forbi siste kort.
          className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {cards.map((card, index) => (
            <li
              key={card.id}
              className="w-[88%] shrink-0 snap-center"
              aria-label={t('cardPosition', {
                index: index + 1,
                total: cards.length,
              })}
            >
              <KavalkadeCardView
                card={card}
                locale={locale}
                action={actions?.[card.id]}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Fane-knapp med 44 px tap-target, samme form som «Min historikk» (#940). */
function TabButton({
  label,
  testId,
  active,
  onSelect,
}: {
  label: string;
  testId: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-testid={testId}
      onClick={onSelect}
      className={`min-h-[44px] flex-1 py-3 font-serif text-base transition-colors ${
        active
          ? 'border-b-2 border-primary text-text'
          : 'text-muted hover:text-text'
      }`}
    >
      {label}
    </button>
  );
}
