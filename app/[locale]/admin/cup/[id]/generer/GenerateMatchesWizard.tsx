'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { StatusChip } from '@/components/ui/StatusChip';
import {
  CUP_PRESETS,
  buildSessions,
  type CupSessionFormat,
  type CupPreset,
  type SessionPlan,
} from '@/lib/cup/cupTemplates';
import {
  generateCupPlan,
  generateSplitDayPlan,
  type PlannedMatch,
  type PlannedBundleMatch,
  type CupBundleFormat,
  type CupPlayer,
  type PairingStrategy,
} from '@/lib/cup/cupPairing';
import {
  groupBundleMatchesByFlight,
  swapFlightPlayer,
  getFlightMatchupRows,
  splitDayTotalMatches,
  type FlightTeamSide,
} from '@/lib/cup/splitDayLineup';
import { createCupMatchesFromPlan, type CupBatchMatch } from './actions';
import {
  MAX_PERSONAL_CUP_MATCHES,
  MAX_PERSONAL_CUP_PLAYERS,
} from '@/lib/cup/limits';
// #1441 (F3c): regnehjelp for greensomens manuelle lag-slag (D10) — samme
// rating-oppslag + CH-formel som resten av appen bruker, ikke en ny formel.
// Ren lesing (ingen skriving) fra lib/games/- og lib/scoring/-filer utenfor
// F3c sitt skrive-forbud (begge er off-limits å ENDRE, ikke å importere
// fra). `greensomeTeamHandicap` (owner-QA-runde, F3d) er selve 60/40-
// motor-formelen — gjenbrukt EKSAKT for prefill-forslaget, ikke reimplementert.
import { getRatingForGender, type TeeBoxRatings } from '@/lib/games/teeRating';
import { teeGenderOf } from '@/lib/games/teeGender';
import { calculateCourseHandicap } from '@/lib/scoring/courseHandicap';
import { greensomeTeamHandicap } from '@/lib/scoring/modes/greensomeMatchplay';
import type { WizardPlayer, WizardTeeBox } from './GenerateMatches';

// #1441 (F3c): matchen wizarden holder i steg 2 er enten en av de tre eldre
// presetenes `PlannedMatch` eller splittet-cup-dagens `PlannedBundleMatch` —
// aldri en blanding innen samme genererte plan (styrt av `presetId`).
// `teamStrokesOverride` (D10) lever IKKE på denne typen — se
// `teamStrokesInputs`-state i hovedkomponenten for hvorfor.
type WizardMatch = PlannedMatch | PlannedBundleMatch;

/** Bygger `TeeBoxRatings` (lib/games/teeRating) fra en `WizardTeeBox` — feltene
 * er valgfrie på wizard-typen (kun splittet-cup-dagen bryr seg), men
 * `getRatingForGender` vil ha dem som `number | null` (ikke `undefined`). */
function teeRatingsFrom(tee: WizardTeeBox): TeeBoxRatings {
  return {
    slope_mens: tee.slope_mens ?? null,
    course_rating_mens: tee.course_rating_mens ?? null,
    par_total_mens: tee.par_total_mens ?? null,
    slope_ladies: tee.slope_ladies ?? null,
    course_rating_ladies: tee.course_rating_ladies ?? null,
    par_total_ladies: tee.par_total_ladies ?? null,
    slope_juniors: tee.slope_juniors ?? null,
    course_rating_juniors: tee.course_rating_juniors ?? null,
    par_total_juniors: tee.par_total_juniors ?? null,
  };
}

/**
 * Spillehandicap-regnehjelp for greensomens manuelle lag-slag (#1441, D10):
 * arrangørens egen formel (40 % av høyeste spillers spillehandicap) trenger
 * hver spillers FULLE spillehandicap på valgt tee som utgangspunkt — ikke en
 * allowance-redusert versjon (allowance-feltet er irrelevant når
 * team_strokes_override erstatter formelen helt). Returnerer `null` når
 * valgt tee mangler ratingsett for spillerens kjønn — kalleren faller da
 * tilbake til å vise rå HCP-indeks i stedet.
 */
function computeSpillehandicap(player: WizardPlayer, tee: WizardTeeBox | undefined): number | null {
  if (!tee) return null;
  const gender = teeGenderOf(player.gender ?? null);
  const rating = getRatingForGender(teeRatingsFrom(tee), gender);
  if (!rating) return null;
  return calculateCourseHandicap({
    hcpIndex: player.hcpIndex,
    slope: rating.slope,
    courseRating: rating.courseRating,
    par: rating.par,
  });
}

/**
 * Standardforslag for greensomens manuelle lag-slag (#1441 owner-QA: «bør
 * være ferdigplottet inn hvor mange slag de ulike har. Ikke at de står
 * tomme.»). Samme 60/40-formel motoren selv bruker for greensome
 * (`greensomeTeamHandicap`, lib/scoring/modes/greensomeMatchplay.ts) —
 * KALT VIDERE her, aldri reimplementert (avrunding inkludert). Hver spillers
 * verdi er spillehandicapet på valgt tee, eller rå HCP-indeks som fallback
 * når tee mangler ratingsett for spillerens kjønn (samme fallback som
 * `computeSpillehandicap`/`regnehjelpText` allerede bruker under feltet).
 *
 * KUN et forslag: feltet i UI-en forblir fritt redigerbart, og en
 * arrangørs egen formel (f.eks. 40 % av høyeste) skriver rett over denne
 * verdien uten noen ekstra bekreftelse (D10 — «manual strokes override»).
 */
function greensomeTeamStrokesDefault(
  playerA: WizardPlayer,
  playerB: WizardPlayer,
  tee: WizardTeeBox | undefined,
): number {
  const a = computeSpillehandicap(playerA, tee) ?? playerA.hcpIndex;
  const b = computeSpillehandicap(playerB, tee) ?? playerB.hcpIndex;
  return greensomeTeamHandicap(a, b);
}

/** Defensivt fallback (0) når paret ikke har nøyaktig to spillere — kan ikke
 * skje med gyldig bunt-output (`generateSplitDayPlan` gir alltid par av 2),
 * men holder komponenten fra å krasje på malformed data. */
function greensomeDefaultOrFallback(pair: WizardPlayer[], tee: WizardTeeBox | undefined): number {
  if (pair.length !== 2) return 0;
  return greensomeTeamStrokesDefault(pair[0], pair[1], tee);
}

/**
 * Effektiv verdi for ETT lags manuelle lag-slag-felt (#1441 owner-QA, D10):
 * `raw === undefined` betyr feltet aldri er rørt av organisatoren → viser
 * (og sender) det live-utledede forslaget fra `greensomeDefaultOrFallback`,
 * som oppdaterer seg selv når spillerne i flighten endres (oppstillings-
 * editoren, `swapFlightPlayer`). Tomt eller ugyldig innhold ETTER at feltet
 * ER rørt faller ALLEREDE tilbake til samme forslag — «what you see is what
 * the engine uses» skal aldri kunne divergere fra hva som faktisk sendes inn.
 */
function effectiveStrokes(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (trimmed === '') return fallback;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TeamAssignment = 'team1' | 'team2' | 'unassigned';

type WizardProps = {
  tournamentId: string;
  team1Name: string;
  team2Name: string;
  // #1472: rosteren er nå cupens PÅMELDTE deltakere (fra Spillere-rommet),
  // ikke lenger kandidat-kilden. Deltakere er alltid profil-fullførte ved
  // add-time, så ingen `pending`-rader her.
  players: WizardPlayer[];
  // #526: maks antall matcher for personlig cup (ikke-admin). undefined =
  // uncapped (admin/klubb-cup).
  matchCap?: number;
  // #1472: bane/tee/format kommer fra den lagrede planen (Oppsett-rommet),
  // ikke lenger wizard-steg. Navn til recap-visning; `selectedTee` bærer
  // rating-settet greensomens regnehjelp (D10) trenger.
  planCourseName: string;
  planTeeName: string;
  selectedTee: WizardTeeBox | undefined;
  presetId: string;
  customSessions: CupSessionFormat[];
  strategy: PairingStrategy;
};

type Step = 1 | 2;

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({
  current,
  total,
  t,
}: {
  current: number;
  total: number;
  t: ReturnType<typeof useTranslations<'cup'>>;
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <p className="font-sans text-xs text-muted">
        {t('generate.stepIndicator', { current, total })}
      </p>
      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 w-6 rounded-full transition-colors ${
              i + 1 <= current ? 'bg-primary' : 'bg-border'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-3">
      {children}
    </h2>
  );
}

// ─── Step 1: Roster assignment ────────────────────────────────────────────────

function Step1Roster({
  players,
  team1Name,
  team2Name,
  assignments,
  onChange,
  t,
}: {
  players: WizardPlayer[];
  team1Name: string;
  team2Name: string;
  assignments: Record<string, TeamAssignment>;
  onChange: (id: string, val: TeamAssignment) => void;
  t: ReturnType<typeof useTranslations<'cup'>>;
}) {
  const team1Count = Object.values(assignments).filter((v) => v === 'team1').length;
  const team2Count = Object.values(assignments).filter((v) => v === 'team2').length;
  const diff = Math.abs(team1Count - team2Count);

  return (
    <div data-testid="cup-wizard-step1">
      <SectionHeading>{t('generate.step1Heading')}</SectionHeading>
      {diff >= 2 && team1Count > 0 && team2Count > 0 && (
        <div className="mb-4">
          <Banner tone="warning">
            {t('generate.unevenTeamsWarning', { count1: team1Count, count2: team2Count })}
          </Banner>
        </div>
      )}
      <div className="space-y-2">
        {players.map((p) => {
          // #1441 (owner-QA, F3f): venner uten fullført profil rendres som en
          // IKKE-valgbar rad. Deltakerlista (#1472) er alltid profil-fullført,
          // så grenen fyrer ikke lenger i praksis — beholdt defensivt siden
          // `WizardPlayer.pending` fortsatt finnes i typen.
          if (p.pending) {
            return (
              <Card
                key={p.id}
                className="!p-3 opacity-70"
                data-testid={`cup-wizard-pending-${p.id}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-sans text-sm font-medium text-text truncate">
                      {p.displayName}
                    </p>
                    <p className="font-sans text-xs text-muted">
                      {t('generate.pendingHelper')}
                    </p>
                  </div>
                  <StatusChip
                    tone="påmelding"
                    label={t('generate.pendingBadge')}
                    className="shrink-0"
                  />
                </div>
              </Card>
            );
          }
          const val = assignments[p.id] ?? 'unassigned';
          return (
            <Card key={p.id} className="!p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-sans text-sm font-medium text-text truncate">
                    {p.displayName}
                  </p>
                  <p className="font-sans text-xs text-muted tabular-nums">
                    HCP {p.hcpIndex.toFixed(1)}
                  </p>
                </div>
                {/* data-focus-inset: segmentert pill-gruppe — `overflow-hidden`
                    klipper en outline med positiv offset helt bort (#1402). */}
                <div
                  data-focus-inset
                  className="flex shrink-0 rounded-lg border border-border overflow-hidden text-xs font-medium"
                >
                  {([
                    ['team1', team1Name],
                    ['unassigned', '—'],
                    ['team2', team2Name],
                  ] as [TeamAssignment, string][]).map(([opt, label]) => (
                    <button
                      key={opt}
                      type="button"
                      data-testid={`cup-wizard-assign-${p.id}-${opt}`}
                      onClick={() => onChange(p.id, opt)}
                      className={`min-h-[36px] px-2.5 py-1 transition-colors ${
                        val === opt
                          ? 'bg-primary text-white'
                          : 'bg-surface text-text hover:bg-primary-soft'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-center">
        <div className="rounded-xl border border-border p-3">
          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            {team1Name}
          </p>
          <p className="font-serif text-3xl tabular-nums text-primary mt-1">{team1Count}</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            {team2Name}
          </p>
          <p className="font-serif text-3xl tabular-nums text-primary mt-1">{team2Count}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Preview + adjust ─────────────────────────────────────────────────

function Step2Preview({
  matches,
  team1Players,
  team2Players,
  team1Name,
  team2Name,
  onRegenerate,
  onMatchChange,
  t,
}: {
  matches: PlannedMatch[];
  team1Players: WizardPlayer[];
  team2Players: WizardPlayer[];
  team1Name: string;
  team2Name: string;
  onRegenerate: () => void;
  onMatchChange: (matchId: string, side: 'side1' | 'side2', idx: number, userId: string) => void;
  t: ReturnType<typeof useTranslations<'cup'>>;
}) {
  // Group by format for display
  const byFormat = new Map<CupSessionFormat, PlannedMatch[]>();
  for (const m of matches) {
    const arr = byFormat.get(m.format) ?? [];
    arr.push(m);
    byFormat.set(m.format, arr);
  }

  const FORMAT_LABELS: Record<CupSessionFormat, string> = {
    foursomes_matchplay: t('generate.formatFoursomes'),
    fourball_matchplay: t('generate.formatFourball'),
    singles_matchplay: t('generate.formatSingles'),
    greensome_matchplay: t('generate.formatGreensome'),
    chapman_matchplay: t('generate.formatChapman'),
    gruesome_matchplay: t('generate.formatGruesome'),
  };

  function usedIdsInSide(match: PlannedMatch, side: 'side1' | 'side2'): Set<string> {
    const arr = side === 'side1' ? match.side1 : match.side2;
    return new Set(arr);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionHeading>{t('generate.step4Heading')}</SectionHeading>
        <button
          type="button"
          onClick={onRegenerate}
          className="font-sans text-xs text-primary underline-offset-2 hover:underline min-h-[36px] px-1"
        >
          {t('generate.regenerateButton')}
        </button>
      </div>

      <div className="space-y-5">
        {Array.from(byFormat.entries()).map(([format, formatMatches]) => (
          <div key={format}>
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">
              {FORMAT_LABELS[format]}
            </p>
            <div className="space-y-3">
              {formatMatches.map((match) => {
                return (
                  <Card key={match.id} className="!p-4">
                    <p className="font-sans text-xs font-semibold text-muted mb-2">
                      {match.label}
                    </p>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      {/* Side 1 */}
                      <div className="space-y-1.5">
                        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                          {team1Name}
                        </p>
                        {match.side1.map((uid, idx) => (
                          <select
                            key={idx}
                            value={uid}
                            onChange={(e) =>
                              onMatchChange(match.id, 'side1', idx, e.target.value)
                            }
                            className="w-full rounded-lg border border-border px-2 py-1.5 bg-surface text-text text-xs"
                          >
                            {team1Players.map((p) => {
                              const usedIds = usedIdsInSide(match, 'side1');
                              const isCurrentSlot = p.id === uid;
                              const isUsedElsewhere = !isCurrentSlot && usedIds.has(p.id);
                              return (
                                <option key={p.id} value={p.id} disabled={isUsedElsewhere}>
                                  {p.displayName}
                                </option>
                              );
                            })}
                          </select>
                        ))}
                      </div>

                      <span className="font-sans text-xs font-bold text-muted">
                        {t('generate.mot')}
                      </span>

                      {/* Side 2 */}
                      <div className="space-y-1.5">
                        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                          {team2Name}
                        </p>
                        {match.side2.map((uid, idx) => (
                          <select
                            key={idx}
                            value={uid}
                            onChange={(e) =>
                              onMatchChange(match.id, 'side2', idx, e.target.value)
                            }
                            className="w-full rounded-lg border border-border px-2 py-1.5 bg-surface text-text text-xs"
                          >
                            {team2Players.map((p) => {
                              const usedIds = usedIdsInSide(match, 'side2');
                              const isCurrentSlot = p.id === uid;
                              const isUsedElsewhere = !isCurrentSlot && usedIds.has(p.id);
                              return (
                                <option key={p.id} value={p.id} disabled={isUsedElsewhere}>
                                  {p.displayName}
                                </option>
                              );
                            })}
                          </select>
                        ))}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 2: Confirm (recap + generate) ───────────────────────────────────────
//
// #1472: bane·tee-recapen rendres nå fra den lagrede planen (planCourseName/
// planTeeName-props), og selve genereringen leser bane/tee/tee-off/best-ball
// server-side fra planen — klienten sender kun `tournamentId` + fordelte
// matcher (med greensomens `teamStrokesOverride`).

function Step2Confirm({
  matches,
  planCourseName,
  planTeeName,
  tournamentId,
  onError,
  t,
}: {
  matches: CupBatchMatch[];
  planCourseName: string;
  planTeeName: string;
  tournamentId: string;
  onError: (msg: string) => void;
  t: ReturnType<typeof useTranslations<'cup'>>;
}) {
  const [isPending, startTransition] = useTransition();

  const FORMAT_LABELS: Record<CupBundleFormat, string> = {
    foursomes_matchplay: t('generate.formatFoursomes'),
    fourball_matchplay: t('generate.formatFourball'),
    singles_matchplay: t('generate.formatSingles'),
    greensome_matchplay: t('generate.formatGreensome'),
    chapman_matchplay: t('generate.formatChapman'),
    gruesome_matchplay: t('generate.formatGruesome'),
    best_ball: t('generate.formatBestBall'),
  };

  function handleConfirm() {
    startTransition(async () => {
      // Ved suksess redirecter actionen (kaster NEXT_REDIRECT som propagerer og
      // navigerer bort) — ingen draft-rydding lenger (#1472: ingen localStorage).
      const result = await createCupMatchesFromPlan({ tournamentId, matches });
      if (result?.error) {
        const errorMap: Record<string, string> = {
          not_draft: t('generate.errors.not_draft'),
          missing_plan: t('generate.errors.missing_plan'),
          plan_tee: t('generate.errors.plan_tee'),
          no_matches: t('generate.errors.no_matches'),
          insert_failed: t('generate.errors.insert_failed'),
          too_many_matches: t('generate.errors.too_many_matches', { max: MAX_PERSONAL_CUP_MATCHES }),
          too_many_players: t('generate.errors.too_many_players', { max: MAX_PERSONAL_CUP_PLAYERS }),
          tee_off_in_past: t('generate.errors.tee_off_in_past'),
        };
        onError(errorMap[result.error] ?? t('generate.errors.insert_failed'));
      }
    });
  }

  // Group by format for summary
  const byFormat = new Map<CupBundleFormat, number>();
  for (const m of matches) {
    byFormat.set(m.format, (byFormat.get(m.format) ?? 0) + 1);
  }

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading>{t('generate.step4RecapHeading')}</SectionHeading>
        <Card>
          <div className="space-y-3">
            <div>
              <p className="font-sans text-xs text-muted">{t('generate.courseTeeLabel')}</p>
              <p className="font-sans text-sm font-medium text-text mt-0.5">
                {planCourseName} · {planTeeName}
              </p>
            </div>
            <div>
              <p className="font-sans text-xs text-muted">{t('generate.matchesLabel')}</p>
              <div className="mt-1 space-y-0.5">
                {Array.from(byFormat.entries()).map(([format, count]) => (
                  <p key={format} className="font-sans text-sm text-text">
                    {count} {FORMAT_LABELS[format]}
                  </p>
                ))}
                <p className="font-serif text-base font-medium text-primary mt-1">
                  {t('generate.matchesTotalLabel', { count: matches.length })}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Button
        type="button"
        className="w-full"
        data-testid="cup-wizard-generate"
        onClick={handleConfirm}
        pending={isPending}
        pendingLabel={t('generate.confirmPending')}
      >
        {t('generate.confirmButton', { count: matches.length })}
      </Button>
    </div>
  );
}

// ─── Step 2 (bundle): splittet-cup-dag lineup-editor ──────────────────────────
//
// #1441 (F3c): egen preview-komponent for splittet-cup-dag-bunten i stedet
// for å utvide `Step2Preview` — bunten har en fundamentalt annen redigerings-
// modell (flight-grupperte kort, singles-bytte begrenset til flightens egne
// fire spillere, greensomens manuelle lag-slag) enn den frie per-slot-
// dropdownen `Step2Preview` tilbyr på tvers av HELE laget. Gjenbruker
// `groupBundleMatchesByFlight`/`getFlightMatchupRows`/`swapFlightPlayer`
// (lib/cup/splitDayLineup.ts) for gruppering/bytte — «extend, don't rebuild»
// gjelder disse rene hjelperne, ikke UI-komponenten selv (som IKKE fantes
// før F3c).
//
// #1441 (owner-QA rebuild, F3e): flight-kortet var TO separate ting fram til
// dette — en fri firfelts-oppstillings-editor øverst («hvem er i flighten»)
// og en singel-rad med egen «Bytt paring»-knapp under (`swapFlightSinglesPairing`,
// nå fjernet). Eieren ba om ETT kort med to MATCHUP-RADER: venstre kolonne
// er lag 1s par (stablet), høyre er lag 2s par, «mot» mellom — og de to
// spillerne på SAMME rad ER singles-motstanderne. Alle fire dropdownene er
// samme `onSwapPlayer`/`swapFlightPlayer`-bytte som før; det som endret seg
// er UTELUKKENDE layouten (radene ER paringen, ingen egen bytte-knapp
// trengs — å velge lagkameraten i den andre raden ER «bytt paring»).

function playerLookup(team1Players: WizardPlayer[], team2Players: WizardPlayer[]) {
  const byId = new Map<string, WizardPlayer>();
  for (const p of [...team1Players, ...team2Players]) byId.set(p.id, p);
  return (userId: string) => byId.get(userId);
}

/** Regnehjelp-tekst for én spiller: spillehandicap når valgt tee har
 * ratingsett for spillerens kjønn, ellers rå HCP-indeks (#1441, D10). */
function regnehjelpText(
  player: WizardPlayer,
  tee: WizardTeeBox | undefined,
  t: ReturnType<typeof useTranslations<'cup'>>,
): string {
  const sh = computeSpillehandicap(player, tee);
  return sh !== null
    ? t('generate.spillehandicapShort', { n: sh })
    : t('generate.hcpIndexShort', { n: player.hcpIndex.toFixed(1) });
}

function GreensomeCard({
  match,
  team1Name,
  team2Name,
  players,
  selectedTee,
  teamStrokesInputs,
  onTeamStrokesChange,
  t,
}: {
  match: PlannedBundleMatch;
  team1Name: string;
  team2Name: string;
  players: (userId: string) => WizardPlayer | undefined;
  selectedTee: WizardTeeBox | undefined;
  teamStrokesInputs: Record<string, { team1?: string; team2?: string }>;
  onTeamStrokesChange: (matchId: string, side: 'team1' | 'team2', value: string) => void;
  t: ReturnType<typeof useTranslations<'cup'>>;
}) {
  const raw = teamStrokesInputs[match.id];
  const side1Players = match.side1.map(players).filter((p): p is WizardPlayer => Boolean(p));
  const side2Players = match.side2.map(players).filter((p): p is WizardPlayer => Boolean(p));
  // #1441 (owner-QA, D10): live-utledet forslag — oppdaterer seg selv når
  // spillerne i flighten endres via oppstillings-editoren (`swapFlightPlayer`)
  // SÅ LENGE organisatoren ikke selv har tastet noe i feltet (`raw === undefined`).
  const team1Default = greensomeDefaultOrFallback(side1Players, selectedTee);
  const team2Default = greensomeDefaultOrFallback(side2Players, selectedTee);
  const team1Value = raw?.team1 ?? String(team1Default);
  const team2Value = raw?.team2 ?? String(team2Default);

  return (
    <Card className="!p-4">
      <p className="font-sans text-xs font-semibold text-muted mb-1">
        {t('generate.formatGreensome')} · {t('generate.segmentFront9')}
      </p>
      <p className="font-serif text-sm text-text mb-3">
        {side1Players.map((p) => p.displayName).join(' / ')}{' '}
        <span className="text-muted">{t('generate.mot')}</span>{' '}
        {side2Players.map((p) => p.displayName).join(' / ')}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor={`strokes-${match.id}-team1`}
            className="block text-xs font-medium text-text mb-1"
          >
            {t('generate.teamStrokesLabel', { team: team1Name })}
          </label>
          <input
            id={`strokes-${match.id}-team1`}
            type="number"
            min={0}
            value={team1Value}
            onChange={(e) => onTeamStrokesChange(match.id, 'team1', e.target.value)}
            className="w-full rounded-lg border border-border px-2.5 py-2 bg-surface text-text text-sm tabular-nums"
          />
          <p className="text-[11px] text-muted mt-1 tabular-nums">
            {side1Players.map((p) => `${p.displayName}: ${regnehjelpText(p, selectedTee, t)}`).join(' · ')}
          </p>
        </div>
        <div>
          <label
            htmlFor={`strokes-${match.id}-team2`}
            className="block text-xs font-medium text-text mb-1"
          >
            {t('generate.teamStrokesLabel', { team: team2Name })}
          </label>
          <input
            id={`strokes-${match.id}-team2`}
            type="number"
            min={0}
            value={team2Value}
            onChange={(e) => onTeamStrokesChange(match.id, 'team2', e.target.value)}
            className="w-full rounded-lg border border-border px-2.5 py-2 bg-surface text-text text-sm tabular-nums"
          />
          <p className="text-[11px] text-muted mt-1 tabular-nums">
            {side2Players.map((p) => `${p.displayName}: ${regnehjelpText(p, selectedTee, t)}`).join(' · ')}
          </p>
        </div>
      </div>
      <p className="text-[11px] text-muted mt-2">{t('generate.teamStrokesPrefillHint')}</p>
    </Card>
  );
}

function Step2BundlePreview({
  matches,
  team1Players,
  team2Players,
  team1Name,
  team2Name,
  selectedTee,
  teamStrokesInputs,
  onTeamStrokesChange,
  onSwapPlayer,
  onRegenerate,
  t,
}: {
  matches: PlannedBundleMatch[];
  team1Players: WizardPlayer[];
  team2Players: WizardPlayer[];
  team1Name: string;
  team2Name: string;
  selectedTee: WizardTeeBox | undefined;
  teamStrokesInputs: Record<string, { team1?: string; team2?: string }>;
  onTeamStrokesChange: (matchId: string, side: 'team1' | 'team2', value: string) => void;
  // #1441 (owner-QA rebuild, F3e): «hvem som skal være i flight» OG «hvem
  // møter hvem i singles» — begge uttrykt via det SAMME slot-valget nå, se
  // `swapFlightPlayer`s docstring (lib/cup/splitDayLineup.ts) for
  // bytte-semantikken.
  onSwapPlayer: (
    flightIndex: number,
    side: FlightTeamSide,
    slotIndex: 0 | 1,
    playerId: string,
  ) => void;
  onRegenerate: () => void;
  t: ReturnType<typeof useTranslations<'cup'>>;
}) {
  const players = playerLookup(team1Players, team2Players);
  const flights = groupBundleMatchesByFlight(matches);

  return (
    <div data-testid="cup-wizard-step2-bundle">
      <div className="flex items-center justify-between mb-4">
        <SectionHeading>{t('generate.step4Heading')}</SectionHeading>
        <button
          type="button"
          onClick={onRegenerate}
          className="font-sans text-xs text-primary underline-offset-2 hover:underline min-h-[36px] px-1"
        >
          {t('generate.regenerateButton')}
        </button>
      </div>

      {/* #1451 (D6/F5): irish greensome-varianten navngis der greensome-
          matchene settes opp — én gang over flight-listen, ikke per kort.
          Kun copy: appen fører lagballen uansett variant. */}
      <p className="font-sans text-xs text-muted mb-4" data-testid="cup-wizard-irish-hint">
        {t('generate.irishGreensomeHint')}
      </p>

      <div className="space-y-5">
        {flights.map((flight) => {
          const rows = getFlightMatchupRows(flight);
          const bestBallSide1 = flight.bestBall.side1.map(players).filter((p): p is WizardPlayer => Boolean(p));
          const bestBallSide2 = flight.bestBall.side2.map(players).filter((p): p is WizardPlayer => Boolean(p));

          return (
            <div key={flight.flightIndex}>
              <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">
                {t('generate.flightHeading', { n: flight.flightIndex })}
              </p>
              <div className="space-y-3">
                {/* #1441 (owner-QA rebuild, F3e): to matchup-rader — venstre
                    kolonne lag 1s par, høyre lag 2s par, «mot» mellom. De to
                    spillerne på SAMME rad er singles-motstanderne, så å velge
                    lagkameraten fra den ANDRE raden i en av de fire
                    dropdownene ER «bytt paring» — ingen egen knapp trengs. */}
                <Card className="!p-4" data-testid={`cup-wizard-lineup-${flight.flightIndex}`}>
                  <p className="font-sans text-xs font-semibold text-muted mb-1">
                    {t('generate.lineupHeading')}
                  </p>
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-2 mb-1.5">
                    <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                      {team1Name}
                    </p>
                    <span />
                    <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-muted text-right">
                      {team2Name}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {rows.map((row) => (
                      <div
                        key={row.slotIndex}
                        data-testid={`cup-wizard-lineup-${flight.flightIndex}-row-${row.slotIndex}`}
                        className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"
                      >
                        <select
                          data-testid={`cup-wizard-lineup-${flight.flightIndex}-side1-${row.slotIndex}`}
                          value={row.side1PlayerId ?? ''}
                          onChange={(e) =>
                            onSwapPlayer(flight.flightIndex, 'side1', row.slotIndex, e.target.value)
                          }
                          className="w-full rounded-lg border border-border px-2 py-1.5 bg-surface text-text text-xs"
                        >
                          {team1Players.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.displayName}
                            </option>
                          ))}
                        </select>
                        <span className="font-sans text-xs font-bold text-muted">
                          {t('generate.mot')}
                        </span>
                        <select
                          data-testid={`cup-wizard-lineup-${flight.flightIndex}-side2-${row.slotIndex}`}
                          value={row.side2PlayerId ?? ''}
                          onChange={(e) =>
                            onSwapPlayer(flight.flightIndex, 'side2', row.slotIndex, e.target.value)
                          }
                          className="w-full rounded-lg border border-border px-2 py-1.5 bg-surface text-text text-xs"
                        >
                          {team2Players.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.displayName}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted mt-2">{t('generate.lineupHint')}</p>
                </Card>

                <GreensomeCard
                  match={flight.greensome}
                  team1Name={team1Name}
                  team2Name={team2Name}
                  players={players}
                  selectedTee={selectedTee}
                  teamStrokesInputs={teamStrokesInputs}
                  onTeamStrokesChange={onTeamStrokesChange}
                  t={t}
                />

                <Card className="!p-4">
                  <p className="font-sans text-xs font-semibold text-muted mb-1">
                    {t('generate.formatBestBall')} · {t('generate.segmentBack9')}
                  </p>
                  <p className="font-serif text-sm text-text">
                    {bestBallSide1.map((p) => p.displayName).join(' / ')}{' '}
                    <span className="text-muted">{t('generate.mot')}</span>{' '}
                    {bestBallSide2.map((p) => p.displayName).join(' / ')}
                  </p>
                </Card>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function GenerateMatchesWizard({
  tournamentId,
  team1Name,
  team2Name,
  players,
  matchCap,
  planCourseName,
  planTeeName,
  selectedTee,
  presetId,
  customSessions,
  strategy,
}: WizardProps) {
  const t = useTranslations('cup');
  const TOTAL_STEPS = 2;

  // Step
  const [step, setStep] = useState<Step>(1);

  // Step 1: roster assignments
  const [assignments, setAssignments] = useState<Record<string, TeamAssignment>>(() => {
    const init: Record<string, TeamAssignment> = {};
    for (const p of players) init[p.id] = 'unassigned';
    return init;
  });

  // Step 2: generated matches
  const [matches, setMatches] = useState<WizardMatch[]>([]);
  // #1441 (D10, owner-QA F3d): greensomens manuelle lag-slag holdes som RÅ
  // tekst-input per match-id OG per lag, adskilt fra `matches`. Et felt som
  // aldri er rørt av organisatoren mangler helt fra kartet/objektet
  // (`undefined`, IKKE `''`) — det skillet er det som lar `GreensomeCard`
  // vise et LIVE-utledet 60/40-forslag (`greensomeTeamStrokesDefault`) helt
  // til organisatoren faktisk taster noe, i stedet for å fryse forslaget ved
  // generering (som ville blitt stående feil etter et oppstillings-bytte,
  // `swapFlightPlayer`). Effektiv verdi (vist OG sendt inn) via
  // `effectiveStrokes` — «what you see is what the engine uses», D10.
  const [teamStrokesInputs, setTeamStrokesInputs] = useState<
    Record<string, { team1?: string; team2?: string }>
  >({});

  // Feil fra createCupMatchesFromPlan (steg 2)
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // #1472: bane/tee/preset/strategi kommer fra den lagrede planen (props), ikke
  // lenger wizard-steg + localStorage-utkast. Ett lagringslag (server) i stedet
  // for to (server + localStorage) unngår splitt-hjerne.
  const isSplitDay = presetId === 'splittet-cup-dag';

  // Derived
  const team1Players = players.filter((p) => assignments[p.id] === 'team1');
  const team2Players = players.filter((p) => assignments[p.id] === 'team2');
  const team1Count = team1Players.length;
  const team2Count = team2Players.length;

  function getSelectedPreset(): CupPreset | null {
    return CUP_PRESETS.find((p) => p.id === presetId) ?? null;
  }

  function getEffectiveSessions(): CupSessionFormat[] {
    if (presetId === 'tilpasset') return customSessions;
    return getSelectedPreset()?.sessions ?? [];
  }

  function getSessionPlan(): SessionPlan[] {
    const teamSize = Math.min(team1Count, team2Count);
    return buildSessions(getEffectiveSessions(), teamSize);
  }

  // Antall matcher oppsettet gir med gjeldende lag-fordeling — brukt til både
  // cap-varselet og «Neste»-gaten på steg 1 (#1472: gatingen som lå på det gamle
  // steg 3 flyttet hit, siden format-valget nå er gjort på forhånd i planen).
  const plannedTotal = isSplitDay
    ? splitDayTotalMatches(team1Count, team2Count)
    : getSessionPlan().reduce((sum, s) => sum + s.matchCount, 0);
  const overCap = matchCap !== undefined && plannedTotal > matchCap;

  function runGenerate() {
    const cupTeam1: CupPlayer[] = team1Players.map((p) => ({
      userId: p.id,
      name: p.displayName,
      hcpIndex: p.hcpIndex,
    }));
    const cupTeam2: CupPlayer[] = team2Players.map((p) => ({
      userId: p.id,
      name: p.displayName,
      hcpIndex: p.hcpIndex,
    }));
    // Regenerering nullstiller manuelt tastede lag-slag — de var tastet mot
    // FORRIGE spiller-oppstilling, som ikke lenger stemmer etter regenerering.
    setTeamStrokesInputs({});
    if (isSplitDay) {
      setMatches(generateSplitDayPlan({ team1: cupTeam1, team2: cupTeam2, strategy }));
      return;
    }
    setMatches(
      generateCupPlan({
        team1: cupTeam1,
        team2: cupTeam2,
        sessions: getSessionPlan(),
        strategy,
      }),
    );
  }

  /**
   * Bygger den faktiske innsendings-payload-en (#1441, D10 + owner-QA F3d):
   * matchene fra `matches` (rene struktur — side1/side2/segment/sourceId)
   * pluss `teamStrokesOverride` på hver greensome-match — ALLTID satt nå
   * (D10-oppdatering): «what you see is what the engine uses» betyr feltet
   * sender akkurat den effektive verdien `GreensomeCard` viste (typet
   * forslag ELLER organisatorens eget tall — `effectiveStrokes` er samme
   * logikk begge steder, se dens docstring), aldri lenger «ingen override,
   * la motoren regne selv ved runde-start».
   */
  function buildSubmissionMatches(): CupBatchMatch[] {
    if (!isSplitDay) return matches as CupBatchMatch[];
    const lookup = playerLookup(team1Players, team2Players);
    return (matches as PlannedBundleMatch[]).map((m) => {
      if (m.format !== 'greensome_matchplay') return m;
      const side1Players = m.side1.map(lookup).filter((p): p is WizardPlayer => Boolean(p));
      const side2Players = m.side2.map(lookup).filter((p): p is WizardPlayer => Boolean(p));
      const default1 = greensomeDefaultOrFallback(side1Players, selectedTee);
      const default2 = greensomeDefaultOrFallback(side2Players, selectedTee);
      const raw = teamStrokesInputs[m.id];
      const team1 = effectiveStrokes(raw?.team1, default1);
      const team2 = effectiveStrokes(raw?.team2, default2);
      return { ...m, teamStrokesOverride: { team1, team2 } };
    });
  }

  // Validation for step 1: minst `minPerTeam` per lag (fra planens preset),
  // minst én match, og — for personlig cup — under match-taket.
  function canAdvance(): boolean {
    if (step === 1) {
      const preset = getSelectedPreset();
      const minPerTeam = preset?.minPerTeam ?? 1;
      if (team1Count < minPerTeam || team2Count < minPerTeam) return false;
      if (plannedTotal === 0) return false;
      if (matchCap !== undefined && plannedTotal > matchCap) return false;
      return true;
    }
    // Steg 2 er terminalt (ingen «Neste»), så det trenger ingen gate her.
    return true;
  }

  function handleNext() {
    if (!canAdvance()) return;
    if (step === 1) {
      // Generate matches when entering step 2
      runGenerate();
    }
    setStep((s) => Math.min(s + 1, TOTAL_STEPS) as Step);
  }

  function handleBack() {
    if (step === 1) return;
    setStep((s) => Math.max(s - 1, 1) as Step);
  }

  function handleAssignmentChange(id: string, val: TeamAssignment) {
    setAssignments((prev) => ({ ...prev, [id]: val }));
  }

  function handleMatchChange(
    matchId: string,
    side: 'side1' | 'side2',
    idx: number,
    userId: string,
  ) {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id !== matchId) return m;
        const arr = side === 'side1' ? [...m.side1] : [...m.side2];
        arr[idx] = userId;
        return side === 'side1' ? { ...m, side1: arr } : { ...m, side2: arr };
      }),
    );
  }

  // #1441 (owner-QA rebuild, F3e): «hvem som skal være i flight» OG «hvem
  // møter hvem i singles» — samme frie spiller-velger per slot dekker begge
  // nå (radene ER paringen), se `swapFlightPlayer`s docstring (lib/cup/
  // splitDayLineup.ts) for bytte-semantikken (kryss-flight vs. innad-i-paret).
  // Den tidligere `handleSwapSingles`/`swapFlightSinglesPairing`-knappen ble
  // fjernet — å velge lagkameraten fra den andre raden gir samme resultat.
  function handleSwapPlayer(
    flightIndex: number,
    side: FlightTeamSide,
    slotIndex: 0 | 1,
    playerId: string,
  ) {
    setMatches((prev) =>
      swapFlightPlayer(prev as PlannedBundleMatch[], flightIndex, side, slotIndex, playerId),
    );
  }

  function handleTeamStrokesChange(matchId: string, side: 'team1' | 'team2', value: string) {
    setTeamStrokesInputs((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], [side]: value },
    }));
  }

  // Validation message for step 1: show why "Neste" is disabled instead of
  // leaving users with a silently-greyed button (#663). Min-per-team først, så
  // «for få matcher» (den gamle step3ZeroMatchesMsg-en, flyttet hit i #1472).
  const step1ValidationMsg: string | null = (() => {
    if (step !== 1) return null;
    const preset = CUP_PRESETS.find((p) => p.id === presetId);
    const minPerTeam = preset?.minPerTeam ?? 1;
    if (team1Count < minPerTeam)
      return t('generate.step1ValidationMin', { team: team1Name, minPerTeam });
    if (team2Count < minPerTeam)
      return t('generate.step1ValidationMin', { team: team2Name, minPerTeam });
    if (plannedTotal === 0) return t('generate.step3ZeroMatchesMsg');
    return null;
  })();

  return (
    <div className="space-y-6">
      {errorMsg && (
        <Banner tone="error">{errorMsg}</Banner>
      )}

      <Card>
        <StepIndicator current={step} total={TOTAL_STEPS} t={t} />

        {step === 1 && (
          <div className="space-y-4">
            {matchCap !== undefined && (
              <Banner tone={overCap ? 'warning' : 'info'}>
                {overCap
                  ? t('generate.overCapWarning', { totalMatches: plannedTotal, matchCap })
                  : t('generate.capInfoBanner', { matchCap })}
              </Banner>
            )}
            <Step1Roster
              players={players}
              team1Name={team1Name}
              team2Name={team2Name}
              assignments={assignments}
              onChange={handleAssignmentChange}
              t={t}
            />
          </div>
        )}
        {step === 2 && (
          <div className="space-y-6" data-testid="cup-wizard-step2">
            {isSplitDay ? (
              <Step2BundlePreview
                matches={matches as PlannedBundleMatch[]}
                team1Players={team1Players}
                team2Players={team2Players}
                team1Name={team1Name}
                team2Name={team2Name}
                selectedTee={selectedTee}
                teamStrokesInputs={teamStrokesInputs}
                onTeamStrokesChange={handleTeamStrokesChange}
                onSwapPlayer={handleSwapPlayer}
                onRegenerate={runGenerate}
                t={t}
              />
            ) : (
              <Step2Preview
                matches={matches as PlannedMatch[]}
                team1Players={team1Players}
                team2Players={team2Players}
                team1Name={team1Name}
                team2Name={team2Name}
                onRegenerate={runGenerate}
                onMatchChange={handleMatchChange}
                t={t}
              />
            )}
            <Step2Confirm
              matches={buildSubmissionMatches()}
              planCourseName={planCourseName}
              planTeeName={planTeeName}
              tournamentId={tournamentId}
              t={t}
              onError={setErrorMsg}
            />
          </div>
        )}

        {/* Navigation. Steg 2 er terminalt — generer-knappen i Step2Confirm er
            primær-handlingen der, så bare «Tilbake» blir med videre. */}
        <div className="mt-6 space-y-3">
          {step1ValidationMsg && (
            <p className="text-xs text-warning text-center">{step1ValidationMsg}</p>
          )}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              data-testid="cup-wizard-prev"
              onClick={handleBack}
              disabled={step === 1}
            >
              {t('generate.prevButton')}
            </Button>
            {step < 2 && (
              <Button
                type="button"
                className="flex-1"
                data-testid="cup-wizard-next"
                onClick={handleNext}
                disabled={!canAdvance()}
              >
                {t('generate.nextButton')}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
