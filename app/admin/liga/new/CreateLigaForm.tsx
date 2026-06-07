'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { createLeagueDraft, type LeagueActionError } from '@/lib/league/actions';
import { generateRounds } from '@/lib/league/generateRounds';
import type { CourseOption, PlayerOption } from '@/app/admin/games/new/GameForm';

const MONTHS_ABBR = [
  'jan', 'feb', 'mar', 'apr', 'mai', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'des',
];

type Props = {
  courses: CourseOption[];
  /** Invitable people: the creator (if found) first, then friends OR club members. */
  players: PlayerOption[];
  /** The creator's own id — pre-selected so they play in their own league. */
  meId: string | null;
  /** Klubb-liga (#480): klubbens id. Tomt/undefined = frittstående liga. */
  groupId?: string;
  /** Klubb-liga: klubbens navn, vist i kontekst-banneret. */
  clubName?: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  name: 'Liganavnet må være mellom 1 og 80 tegn.',
  dates: 'Sesong-datoene er ugyldige. Sjekk at sluttdato er etter startdato.',
  standings_model: 'Velg en sesong-modell.',
  course_scope: 'Velg et bane-omfang.',
  course: 'Bane og tee må velges for dette bane-omfanget.',
  penalty: 'Straffe-slag over par må være et tall.',
  players: 'Deltakerlisten er ugyldig.',
  insert_failed: 'Klarte ikke å opprette ligaen. Prøv igjen.',
  rounds_failed: 'Ligaen ble opprettet, men noen runder feilet. Sjekk detalj-siden.',
  players_failed: 'Ligaen ble opprettet, men deltakerne feilet. Sjekk detalj-siden.',
  missing: 'Noen påkrevde felt mangler.',
};

type CourseScope = 'single_course_single_tee' | 'single_course' | 'multi_course';
type StandingsModel = 'total' | 'average';
type MissedRoundPolicy = 'penalty' | 'must_play_all';
type PenaltyKind = 'worst_plus_one' | 'fixed';
type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'custom';

function preferredName(p: PlayerOption): string {
  return p.nickname?.trim() || p.name?.trim() || 'Ukjent spiller';
}

const INITIAL_STATE: LeagueActionError = { error: '' };

export function CreateLigaForm({ courses, players, meId, groupId, clubName }: Props) {
  const isClubLeague = Boolean(groupId);
  const [state, formAction] = useActionState(
    async (_prev: LeagueActionError, formData: FormData) => {
      return createLeagueDraft(formData) as Promise<LeagueActionError>;
    },
    INITIAL_STATE,
  );

  const [courseScope, setCourseScope] = useState<CourseScope>('single_course_single_tee');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [standingsModel, setStandingsModel] = useState<StandingsModel>('total');
  const [missedPolicy, setMissedPolicy] = useState<MissedRoundPolicy>('penalty');
  const [penaltyKind, setPenaltyKind] = useState<PenaltyKind>('worst_plus_one');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(
    () => new Set(meId ? [meId] : []),
  );
  const [seasonStart, setSeasonStart] = useState('');
  const [seasonEnd, setSeasonEnd] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);
  const availableTees = selectedCourse?.tee_boxes ?? [];
  const friendCount = players.filter((p) => p.id !== meId).length;

  // Live preview of the rounds the chosen dates + frequency will generate.
  const roundPreview = useMemo(() => {
    if (frequency === 'custom') return null;
    if (!seasonStart || !seasonEnd || seasonEnd < seasonStart) return null;
    return generateRounds(seasonStart, seasonEnd, frequency);
  }, [seasonStart, seasonEnd, frequency]);

  const errorMessage = state.error ? ERROR_MESSAGES[state.error] ?? `Uventet feil: ${state.error}` : null;

  function togglePlayer(id: string) {
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={formAction} data-testid="liga-create-form" className="space-y-6">
      {/* Hidden fixed fields */}
      <input type="hidden" name="scoring" value="net" />
      <input type="hidden" name="group_id" value={groupId ?? ''} />

      {/* Klubb-kontekst (#480): ligaen settes opp for en bestemt klubb. */}
      {isClubLeague && clubName && (
        <Banner tone="info">
          Denne ligaen settes opp for <span className="font-medium">{clubName}</span>.
          Bare medlemmer i klubben kan være med.
        </Banner>
      )}

      {/* 1. Grunninfo */}
      <Card>
        <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-4">
          Grunninfo
        </h2>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="liga-name"
              className="block font-sans text-[12px] font-medium text-text mb-1.5"
            >
              Navn på ligaen
            </label>
            <input
              id="liga-name"
              name="name"
              type="text"
              required
              maxLength={80}
              placeholder="Månedsligaen 2026"
              className="w-full rounded-xl border border-border bg-bg px-4 py-3 font-sans text-[15px] text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label
                htmlFor="liga-season-start"
                className="block font-sans text-[12px] font-medium text-text mb-1.5"
              >
                Sesong start
              </label>
              <input
                id="liga-season-start"
                name="season_start"
                type="date"
                required
                value={seasonStart}
                onChange={(e) => setSeasonStart(e.target.value)}
                className="w-full min-w-0 appearance-none rounded-xl border border-border bg-bg px-3 py-3 font-sans text-[15px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px]"
              />
            </div>
            <div className="min-w-0">
              <label
                htmlFor="liga-season-end"
                className="block font-sans text-[12px] font-medium text-text mb-1.5"
              >
                Sesong slutt
              </label>
              <input
                id="liga-season-end"
                name="season_end"
                type="date"
                required
                value={seasonEnd}
                onChange={(e) => setSeasonEnd(e.target.value)}
                className="w-full min-w-0 appearance-none rounded-xl border border-border bg-bg px-3 py-3 font-sans text-[15px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px]"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* 2. Bane-omfang */}
      <Card>
        <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-4">
          Bane-omfang
        </h2>
        <input type="hidden" name="course_scope" value={courseScope} />

        <fieldset className="space-y-2">
          <legend className="sr-only">Bane-omfang</legend>

          {(
            [
              {
                value: 'single_course_single_tee' as CourseScope,
                label: 'Fast bane og tee',
                desc: 'Alle runder spilles på samme bane og tee.',
              },
              {
                value: 'single_course' as CourseScope,
                label: 'Fast bane, tee per runde',
                desc: 'Bane er låst, men tee velges for hver runde.',
              },
              {
                value: 'multi_course' as CourseScope,
                label: 'Valgfri bane og tee',
                desc: 'Bane og tee velges per runde etterpå.',
              },
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                courseScope === opt.value
                  ? 'border-primary/50 bg-primary-soft'
                  : 'border-border bg-surface hover:border-primary/30'
              }`}
            >
              <input
                type="radio"
                name="_course_scope_radio"
                value={opt.value}
                checked={courseScope === opt.value}
                onChange={() => {
                  setCourseScope(opt.value);
                  if (opt.value === 'multi_course') {
                    setSelectedCourseId('');
                  }
                }}
                className="mt-0.5 accent-primary"
              />
              <span>
                <span className="block font-sans text-[14px] font-medium text-text">
                  {opt.label}
                </span>
                <span className="block font-sans text-[12px] text-muted mt-0.5">
                  {opt.desc}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        {/* Course picker — shown when scope !== multi_course */}
        {courseScope !== 'multi_course' && (
          <div className="mt-4 space-y-3">
            <div>
              <label
                htmlFor="liga-course"
                className="block font-sans text-[12px] font-medium text-text mb-1.5"
              >
                Bane
              </label>
              <select
                id="liga-course"
                name="course_id"
                required
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="w-full rounded-xl border border-border bg-bg px-4 py-3 font-sans text-[15px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px]"
              >
                <option value="">Velg bane …</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Tee picker — shown only for single_course_single_tee */}
            {courseScope === 'single_course_single_tee' && (
              <div>
                <label
                  htmlFor="liga-tee"
                  className="block font-sans text-[12px] font-medium text-text mb-1.5"
                >
                  Tee
                </label>
                <select
                  id="liga-tee"
                  name="tee_box_id"
                  required
                  disabled={!selectedCourseId}
                  className="w-full rounded-xl border border-border bg-bg px-4 py-3 font-sans text-[15px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px] disabled:opacity-50"
                >
                  <option value="">Velg tee …</option>
                  {availableTees.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {courseScope === 'multi_course' && (
          <p className="mt-3 font-sans text-[12px] text-muted">
            Bane og tee velges per runde etterpå.
          </p>
        )}
      </Card>

      {/* 3. Oppsett */}
      <Card>
        <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-4">
          Oppsett
        </h2>
        <input type="hidden" name="standings_model" value={standingsModel} />
        <input type="hidden" name="missed_round_policy" value={missedPolicy} />
        <input type="hidden" name="penalty_kind" value={penaltyKind} />

        {/* Sesong-modell */}
        <div className="space-y-2 mb-4">
          <p className="font-sans text-[12px] font-medium text-text mb-1.5">
            Sesong-modell
          </p>
          {(
            [
              {
                value: 'total' as StandingsModel,
                label: 'Total',
                desc: 'Sum mot par over alle runder.',
              },
              {
                value: 'average' as StandingsModel,
                label: 'Snitt per runde',
                desc: 'Gjennomsnittlig netto mot par. Ingen straff for uteblitte runder.',
              },
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                standingsModel === opt.value
                  ? 'border-primary/50 bg-primary-soft'
                  : 'border-border bg-surface hover:border-primary/30'
              }`}
            >
              <input
                type="radio"
                name="_standings_model_radio"
                value={opt.value}
                checked={standingsModel === opt.value}
                onChange={() => setStandingsModel(opt.value)}
                className="mt-0.5 accent-primary"
              />
              <span>
                <span className="block font-sans text-[14px] font-medium text-text">
                  {opt.label}
                </span>
                <span className="block font-sans text-[12px] text-muted mt-0.5">
                  {opt.desc}
                </span>
              </span>
            </label>
          ))}
        </div>

        {/* Manglende runde — kun for total */}
        {standingsModel === 'total' && (
          <div className="space-y-2 mb-4">
            <p className="font-sans text-[12px] font-medium text-text mb-1.5">
              Manglende runde
            </p>
            {(
              [
                {
                  value: 'penalty' as MissedRoundPolicy,
                  label: 'Straffescore',
                  desc: 'Spillere som ikke leverer en runde får en straffe-score.',
                },
                {
                  value: 'must_play_all' as MissedRoundPolicy,
                  label: 'Må spille alle',
                  desc: 'Spillere uten komplett historikk rangeres ikke i tabellen.',
                },
              ] as const
            ).map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                  missedPolicy === opt.value
                    ? 'border-primary/50 bg-primary-soft'
                    : 'border-border bg-surface hover:border-primary/30'
                }`}
              >
                <input
                  type="radio"
                  name="_missed_policy_radio"
                  value={opt.value}
                  checked={missedPolicy === opt.value}
                  onChange={() => setMissedPolicy(opt.value)}
                  className="mt-0.5 accent-primary"
                />
                <span>
                  <span className="block font-sans text-[14px] font-medium text-text">
                    {opt.label}
                  </span>
                  <span className="block font-sans text-[12px] text-muted mt-0.5">
                    {opt.desc}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}

        {/* Straffescore-variant — kun for total + penalty */}
        {standingsModel === 'total' && missedPolicy === 'penalty' && (
          <div className="space-y-2">
            <p className="font-sans text-[12px] font-medium text-text mb-1.5">
              Straffescore-type
            </p>
            {(
              [
                {
                  value: 'worst_plus_one' as PenaltyKind,
                  label: 'Dårligste + 1 slag',
                  desc: 'Dårligste resultat i runden pluss ett ekstra slag over par.',
                },
                {
                  value: 'fixed' as PenaltyKind,
                  label: 'Fast straffe-score',
                  desc: 'Et fast antall slag over par for uteblitte runder.',
                },
              ] as const
            ).map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                  penaltyKind === opt.value
                    ? 'border-primary/50 bg-primary-soft'
                    : 'border-border bg-surface hover:border-primary/30'
                }`}
              >
                <input
                  type="radio"
                  name="_penalty_kind_radio"
                  value={opt.value}
                  checked={penaltyKind === opt.value}
                  onChange={() => setPenaltyKind(opt.value)}
                  className="mt-0.5 accent-primary"
                />
                <span>
                  <span className="block font-sans text-[14px] font-medium text-text">
                    {opt.label}
                  </span>
                  <span className="block font-sans text-[12px] text-muted mt-0.5">
                    {opt.desc}
                  </span>
                </span>
              </label>
            ))}

            {penaltyKind === 'fixed' && (
              <div className="mt-2">
                <label
                  htmlFor="liga-penalty-fixed"
                  className="block font-sans text-[12px] font-medium text-text mb-1.5"
                >
                  Slag over par
                </label>
                <input
                  id="liga-penalty-fixed"
                  name="penalty_fixed_over_par"
                  type="number"
                  min={0}
                  max={99}
                  required
                  placeholder="10"
                  className="w-full rounded-xl border border-border bg-bg px-4 py-3 font-sans text-[15px] tabular-nums text-text focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px]"
                />
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 4. Frekvens */}
      <Card>
        <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-4">
          Frekvens
        </h2>
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">Runde-frekvens</legend>
          {(
            [
              { value: 'monthly' as Frequency, label: 'Månedlig' },
              { value: 'biweekly' as Frequency, label: 'Annenhver uke' },
              { value: 'weekly' as Frequency, label: 'Ukentlig' },
              { value: 'custom' as Frequency, label: 'Egendefinert' },
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 hover:border-primary/30 has-[:checked]:border-primary/50 has-[:checked]:bg-primary-soft min-h-[44px]"
            >
              <input
                type="radio"
                name="frequency"
                value={opt.value}
                checked={frequency === opt.value}
                onChange={() => setFrequency(opt.value)}
                className="accent-primary"
              />
              <span className="font-sans text-[14px] font-medium text-text">
                {opt.label}
              </span>
            </label>
          ))}
        </fieldset>
        {frequency === 'custom' ? (
          <p className="mt-2 font-sans text-[12px] text-muted">
            Egendefinert: du legger til rundene manuelt etterpå.
          </p>
        ) : roundPreview && roundPreview.length > 0 ? (
          <p className="mt-2 font-sans text-[12px] text-muted">
            Dette gir{' '}
            <span className="font-medium text-text tabular-nums">{roundPreview.length}</span>{' '}
            {roundPreview.length === 1 ? 'runde' : 'runder'}
            {frequency === 'monthly'
              ? `: ${roundPreview.map((w) => MONTHS_ABBR[new Date(w.opens_at).getUTCMonth()]).join(', ')}`
              : ` (${frequency === 'weekly' ? '7' : '14'}-dagers vinduer)`}
            .
          </p>
        ) : (
          <p className="mt-2 font-sans text-[12px] text-muted">
            Sett sesong-datoene over, så viser vi hvor mange runder det blir.
          </p>
        )}
      </Card>

      {/* 5. Deltakere */}
      <Card>
        <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-4">
          Deltakere
        </h2>
        {/* Hidden JSON field */}
        <input
          type="hidden"
          name="player_ids"
          value={JSON.stringify(Array.from(selectedPlayerIds))}
        />

        <p className="font-sans text-[12px] text-muted mb-3">
          {isClubLeague
            ? 'Velg medlemmene som skal være med i ligaen.'
            : 'Inviter vennene dine til ligaen. Du kan legge til flere etterpå.'}
        </p>
        {friendCount === 0 &&
          (isClubLeague ? (
            <p className="font-sans text-[12px] text-muted mb-3">
              Ingen andre medlemmer i klubben ennå.
            </p>
          ) : (
            <p className="font-sans text-[12px] text-muted mb-3">
              Du har ingen venner på Tørny ennå.{' '}
              <Link href="/profile/venner" className="text-primary underline">
                Legg til venner
              </Link>{' '}
              for å invitere dem hit.
            </p>
          ))}
        {players.length > 0 && (
          <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {players.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-transparent px-3 py-2 hover:border-border hover:bg-surface min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={selectedPlayerIds.has(p.id)}
                    onChange={() => togglePlayer(p.id)}
                    className="accent-primary"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block font-sans text-[14px] text-text truncate">
                      {preferredName(p)}
                      {p.id === meId && (
                        <span className="ml-1.5 font-sans text-[10px] text-accent">(deg)</span>
                      )}
                      {p.pending && (
                        <span className="ml-1.5 font-sans text-[10px] text-muted">
                          (venter)
                        </span>
                      )}
                    </span>
                    <span className="block font-sans text-[11px] tabular-nums text-muted">
                      hcp {Number(p.hcp_index).toFixed(1)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {selectedPlayerIds.size > 0 && (
          <p className="mt-2 font-sans text-[12px] text-muted">
            <span className="tabular-nums font-medium text-text">{selectedPlayerIds.size}</span>{' '}
            {selectedPlayerIds.size === 1 ? 'deltaker' : 'deltakere'} valgt
          </p>
        )}
      </Card>

      {/* Error */}
      {errorMessage && (
        <Banner tone="error">{errorMessage}</Banner>
      )}

      <SubmitButton className="w-full" pendingLabel="Oppretter …">
        Opprett liga
      </SubmitButton>
    </form>
  );
}
