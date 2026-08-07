'use client';

import { startTransition, useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { StatusChip } from '@/components/ui/StatusChip';
import { SmartLink } from '@/components/ui/SmartLink';
import {
  addCupParticipant,
  removeCupParticipant,
  type CupPlanActionError,
} from '@/lib/cup/planActions';
import { MAX_PERSONAL_CUP_PLAYERS } from '@/lib/cup/limits';

export type ParticipantRow = {
  userId: string;
  displayName: string;
  hcpIndex: number;
};

export type AddableRow = ParticipantRow & { pending: boolean };

type Props = {
  tournamentId: string;
  participants: ParticipantRow[];
  /** Kandidater som IKKE allerede er påmeldt (pending vises ikke-valgbare). */
  addable: AddableRow[];
  /** Totalt antall kandidater — skiller «ingen kandidater» fra «alle påmeldt». */
  candidateCount: number;
  /** Deltaker-tak for personlig ikke-admin-cup; udefinert = uncapped. */
  cap?: number;
  /** Hvor «ingen kandidater»-lenken peker (spillerliste / klubb). */
  emptyCandidatesHref: string;
  emptyCandidatesLinkKey: 'emptyCandidatesLink' | 'emptyCandidatesLinkClub';
};

const INITIAL_STATE: CupPlanActionError = { error: '' };

/**
 * Spillere-rommets interaktive liste (#1472, Rom 2). Legg til / fjern deltakere.
 *
 * Ett `useActionState` deler feilbanneret på tvers av alle rad-formene — en
 * `intent`-felt i FormData router til riktig server-action. Knappe-formene har
 * ingen tekstfelt å miste, men #1397-closuren + `startTransition`-dispatchen
 * er nødvendig for at `{ error }`-resultatet skal rendres i det hele tatt
 * (en `action`-redirect ville tømt komponenten). Suksess redirecter server-
 * side og gir en fersk render med oppdatert liste + status-banner — derfor
 * remonterer server-komponenten denne på deltaker-signaturen, så et gammelt
 * feil-banner aldri henger igjen etter en vellykket handling.
 */
export function CupParticipantsList({
  tournamentId,
  participants,
  addable,
  candidateCount,
  cap,
  emptyCandidatesHref,
  emptyCandidatesLinkKey,
}: Props) {
  const t = useTranslations('cup.participants');

  const [state, dispatch, isPending] = useActionState(
    async (_prev: CupPlanActionError, formData: FormData) =>
      formData.get('intent') === 'remove'
        ? removeCupParticipant(formData)
        : addCupParticipant(formData),
    INITIAL_STATE,
  );

  const errorMessage = (() => {
    if (!state.error) return null;
    // `too_many_players`-strengen har en {cap}-plass; capet er regelens ene hjem
    // (lib/cup/limits), ikke en tekst-hardkodet 24.
    if (state.error === 'too_many_players') {
      return t('errors.too_many_players', { cap: MAX_PERSONAL_CUP_PLAYERS });
    }
    const key = `errors.${state.error}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : t('errors.unexpected', { code: state.error });
  })();

  const count = participants.length;
  const atCap = cap !== undefined && count >= cap;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => dispatch(formData));
  }

  return (
    <div className="space-y-6">
      {errorMessage && (
        <Banner tone="error" testId="cup-participants-error">
          {errorMessage}
        </Banner>
      )}

      {/* Påmeldte */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            {t('enrolledHeading')}
          </h2>
          <span
            data-testid="cup-participants-count"
            className="font-sans text-xs text-muted tabular-nums"
          >
            {cap !== undefined
              ? t('countCapped', { count, cap })
              : t('count', { count })}
          </span>
        </div>
        {count === 0 ? (
          <Card>
            <p className="text-sm text-muted">{t('emptyParticipants')}</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {participants.map((p) => (
              <Card key={p.userId} className="!p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-sans text-sm font-medium text-text truncate">
                      {p.displayName}
                    </p>
                    <p className="font-sans text-xs text-muted tabular-nums">
                      HCP {p.hcpIndex.toFixed(1)}
                    </p>
                  </div>
                  <form onSubmit={submit} className="shrink-0">
                    <input type="hidden" name="id" value={tournamentId} />
                    <input type="hidden" name="user_id" value={p.userId} />
                    <input type="hidden" name="intent" value="remove" />
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={isPending}
                      data-testid={`cup-participants-remove-${p.userId}`}
                      className="!px-3.5 text-sm"
                    >
                      {t('removeButton')}
                    </Button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Legg til */}
      <section>
        <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">
          {t('addHeading')}
        </h2>
        {candidateCount === 0 ? (
          // #752 guided empty-state: ingen kandidater i det hele tatt.
          <Card>
            <p className="text-sm text-muted mb-2">{t('emptyCandidates')}</p>
            <SmartLink
              href={emptyCandidatesHref}
              className="text-sm text-text underline hover:no-underline"
            >
              {t(emptyCandidatesLinkKey)}
            </SmartLink>
          </Card>
        ) : addable.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">{t('allAdded')}</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {addable.map((c) =>
              c.pending ? (
                // Venner uten fullført profil: ikke-valgbar rad (mirror
                // Step1Roster, #1441 F3f) — ingen handicap, ingen legg-til.
                <Card
                  key={c.userId}
                  className="!p-3 opacity-70"
                  data-testid={`cup-participants-pending-${c.userId}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-sans text-sm font-medium text-text truncate">
                        {c.displayName}
                      </p>
                      <p className="font-sans text-xs text-muted">
                        {t('pendingHelper')}
                      </p>
                    </div>
                    <StatusChip
                      tone="påmelding"
                      label={t('pendingBadge')}
                      className="shrink-0"
                    />
                  </div>
                </Card>
              ) : (
                <Card key={c.userId} className="!p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-sans text-sm font-medium text-text truncate">
                        {c.displayName}
                      </p>
                      <p className="font-sans text-xs text-muted tabular-nums">
                        HCP {c.hcpIndex.toFixed(1)}
                      </p>
                    </div>
                    <form onSubmit={submit} className="shrink-0">
                      <input type="hidden" name="id" value={tournamentId} />
                      <input type="hidden" name="user_id" value={c.userId} />
                      <input type="hidden" name="intent" value="add" />
                      <Button
                        type="submit"
                        disabled={isPending || atCap}
                        data-testid={`cup-participants-add-${c.userId}`}
                        className="!px-3.5 text-sm"
                      >
                        {t('addButton')}
                      </Button>
                    </form>
                  </div>
                </Card>
              ),
            )}
          </div>
        )}
      </section>
    </div>
  );
}
