'use client';

import { Link } from '@/i18n/navigation';
import { useActionState, useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { createLeagueDraft, type LeagueActionError } from '@/lib/league/actions';
import { generateRounds } from '@/lib/league/generateRounds';
import { shortMonthLocale } from '@/lib/i18n/format';
import { osloParts } from '@/lib/format/teeOff';
import type { AppLocale } from '@/i18n/routing';
import type { CourseOption, PlayerOption } from '@/app/[locale]/admin/games/new/GameForm';

type Props = {
  courses: CourseOption[];
  /** Invitable people: the creator (if found) first, then friends OR club members. */
  players: PlayerOption[];
  /** The creator's own id — pre-selected so they play in their own league. */
  meId: string | null;
  /** #1178: server-computed default season start (ISO `YYYY-MM-DD`). */
  defaultSeasonStart: string;
  /** #1178: server-computed default season end (ISO `YYYY-MM-DD`). */
  defaultSeasonEnd: string;
  /** Klubb-liga (#480): klubbens id. Tomt/undefined = frittstående liga. */
  groupId?: string;
  /** Klubb-liga: klubbens navn, vist i kontekst-banneret. */
  clubName?: string;
};

// #1178: total number of sections, used for the "Del N av 6" progress prefixes.
const SECTION_COUNT = 6;

// Section heading (eyebrow) style, shared by all six cards so the numbered
// "Del N av 6" prefixes stay visually consistent.
const SECTION_HEADING_CLASS =
  'font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-4';

type CourseScope = 'single_course_single_tee' | 'single_course' | 'multi_course';
type Format = 'stroke' | 'stableford' | 'modified_stableford';
type StandingsModel = 'total' | 'average' | 'best_n' | 'points';
type MissedRoundPolicy = 'penalty' | 'must_play_all';
type PenaltyKind = 'worst_plus_one' | 'fixed';
type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'custom';

function preferredName(p: PlayerOption, unknownLabel: string): string {
  return p.nickname?.trim() || p.name?.trim() || unknownLabel;
}

const INITIAL_STATE: LeagueActionError = { error: '' };

export function CreateLigaForm({
  courses,
  players,
  meId,
  defaultSeasonStart,
  defaultSeasonEnd,
  groupId,
  clubName,
}: Props) {
  const isClubLeague = Boolean(groupId);
  const t = useTranslations('liga.create');
  const locale = useLocale() as AppLocale;

  const [state, formAction] = useActionState(
    async (_prev: LeagueActionError, formData: FormData) => {
      return createLeagueDraft(formData) as Promise<LeagueActionError>;
    },
    INITIAL_STATE,
  );

  const [courseScope, setCourseScope] = useState<CourseScope>('single_course_single_tee');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [format, setFormat] = useState<Format>('stroke');
  const [standingsModel, setStandingsModel] = useState<StandingsModel>('total');
  const [missedPolicy, setMissedPolicy] = useState<MissedRoundPolicy>('penalty');
  const [penaltyKind, setPenaltyKind] = useState<PenaltyKind>('worst_plus_one');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(
    () => new Set(meId ? [meId] : []),
  );
  // #1178: seed from server-computed defaults (deterministic props → SSR and
  // client render the same value, no hydration mismatch). Admin edits freely.
  const [seasonStart, setSeasonStart] = useState(defaultSeasonStart);
  const [seasonEnd, setSeasonEnd] = useState(defaultSeasonEnd);
  const [frequency, setFrequency] = useState<Frequency>('monthly');

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);
  const availableTees = selectedCourse?.tee_boxes ?? [];
  const friendCount = players.filter((p) => p.id !== meId).length;

  // Stableford-formater rangeres på poeng (høyest best), netto-only — det styrer
  // tabell-låsen, sesong-modell-teksten og om straffescore-type vises.
  const pointsBased = format !== 'stroke';

  // Live preview of the rounds the chosen dates + frequency will generate.
  const roundPreview = useMemo(() => {
    if (frequency === 'custom') return null;
    if (!seasonStart || !seasonEnd || seasonEnd < seasonStart) return null;
    return generateRounds(seasonStart, seasonEnd, frequency);
  }, [seasonStart, seasonEnd, frequency]);

  const errorMessage = state.error
    ? state.error in {
        name: 1, dates: 1, standings_model: 1, format: 1, course_scope: 1,
        course: 1, penalty: 1, best_n: 1, players: 1,
        insert_failed: 1, rounds_failed: 1, players_failed: 1, missing: 1,
        season_over: 1,
      }
      ? t(`errors.${state.error as 'name' | 'dates' | 'standings_model' | 'format' | 'course_scope' | 'course' | 'penalty' | 'best_n' | 'players' | 'insert_failed' | 'rounds_failed' | 'players_failed' | 'missing' | 'season_over'}`)
      : t('errors.unexpected', { code: state.error })
    : null;

  function togglePlayer(id: string) {
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // #1178: numbered section eyebrow ("Del N av 6 · <label>"). Lightweight
  // progress feel — no wizard steps, no navigation, just a visible counter.
  function sectionHeading(part: number, label: string) {
    return (
      <h2 className={SECTION_HEADING_CLASS}>
        <span className="text-primary/70">
          {t('sectionProgress', { current: part, total: SECTION_COUNT })}
        </span>
        {' · '}
        {label}
      </h2>
    );
  }

  return (
    <form action={formAction} data-testid="liga-create-form" className="space-y-6">
      {/* Hidden fixed fields */}
      <input type="hidden" name="format" value={format} />
      {/* Poeng-ligaer er netto-only — lås tabell-verdien uansett radio-state. */}
      <input type="hidden" name="group_id" value={groupId ?? ''} />

      {/* Klubb-kontekst (#480): ligaen settes opp for en bestemt klubb. */}
      {isClubLeague && clubName && (
        <Banner tone="info">
          {t('clubContextBanner', { clubName })}
        </Banner>
      )}

      {/* Del 1 av 6 — Grunninfo */}
      <Card>
        {sectionHeading(1, t('grundinfoHeading'))}
        <div className="space-y-4">
          <div>
            <label
              htmlFor="liga-name"
              className="block font-sans text-[12px] font-medium text-text mb-1.5"
            >
              {t('nameLabel')}
            </label>
            <input
              id="liga-name"
              name="name"
              type="text"
              required
              maxLength={80}
              placeholder={t('namePlaceholder')}
              className="w-full rounded-xl border border-border bg-bg px-4 py-3 font-sans text-[15px] text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label
                htmlFor="liga-season-start"
                className="block font-sans text-[12px] font-medium text-text mb-1.5"
              >
                {t('seasonStartLabel')}
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
                {t('seasonEndLabel')}
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

      {/* Del 2 av 6 — Spillform */}
      <Card>
        {sectionHeading(2, t('formatHeading'))}
        <fieldset className="space-y-2">
          <legend className="sr-only">{t('formatLegend')}</legend>
          {(
            [
              {
                value: 'stroke' as Format,
                label: t('formatStrokeLabel'),
                desc: t('formatStrokeDesc'),
              },
              {
                value: 'stableford' as Format,
                label: t('formatStablefordLabel'),
                desc: t('formatStablefordDesc'),
              },
              {
                value: 'modified_stableford' as Format,
                label: t('formatModifiedLabel'),
                desc: t('formatModifiedDesc'),
              },
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                format === opt.value
                  ? 'border-primary/50 bg-primary-soft'
                  : 'border-border bg-surface hover:border-primary/30'
              }`}
            >
              <input
                type="radio"
                name="_format_radio"
                value={opt.value}
                checked={format === opt.value}
                onChange={() => setFormat(opt.value)}
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
      </Card>

      {/* Del 3 av 6 — Bane-omfang */}
      <Card>
        {sectionHeading(3, t('courseScopeHeading'))}
        <input type="hidden" name="course_scope" value={courseScope} />

        <fieldset className="space-y-2">
          <legend className="sr-only">{t('courseScopeLegend')}</legend>

          {(
            [
              {
                value: 'single_course_single_tee' as CourseScope,
                label: t('scopeFixedBothLabel'),
                desc: t('scopeFixedBothDesc'),
              },
              {
                value: 'single_course' as CourseScope,
                label: t('scopeFixedCourseLabel'),
                desc: t('scopeFixedCourseDesc'),
              },
              {
                value: 'multi_course' as CourseScope,
                label: t('scopeMultiLabel'),
                desc: t('scopeMultiDesc'),
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
                {t('courseLabel')}
              </label>
              <select
                id="liga-course"
                name="course_id"
                required
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="w-full rounded-xl border border-border bg-bg px-4 py-3 font-sans text-[15px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px]"
              >
                <option value="">{t('coursePlaceholder')}</option>
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
                  {t('teeLabel')}
                </label>
                <select
                  id="liga-tee"
                  name="tee_box_id"
                  required
                  disabled={!selectedCourseId}
                  className="w-full rounded-xl border border-border bg-bg px-4 py-3 font-sans text-[15px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px] disabled:opacity-50"
                >
                  <option value="">{t('teePlaceholder')}</option>
                  {availableTees.map((t_) => (
                    <option key={t_.id} value={t_.id}>
                      {t_.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {courseScope === 'multi_course' && (
          <p className="mt-3 font-sans text-[12px] text-muted">
            {t('multiCourseHint')}
          </p>
        )}
      </Card>

      {/* Del 4 av 6 — Oppsett */}
      <Card>
        {sectionHeading(4, t('setupHeading'))}
        <input type="hidden" name="standings_model" value={standingsModel} />
        <input
          type="hidden"
          name="missed_round_policy"
          value={standingsModel === 'best_n' ? 'penalty' : missedPolicy}
        />
        <input type="hidden" name="penalty_kind" value={penaltyKind} />

        {/* Sesong-modell */}
        <div className="space-y-2 mb-4">
          <p className="font-sans text-[12px] font-medium text-text mb-1.5">
            {t('standingsModelLabel')}
          </p>
          {(
            [
              {
                value: 'total' as StandingsModel,
                label: t('standingsModelTotalLabel'),
                desc: pointsBased
                  ? t('standingsModelTotalDescPoints')
                  : t('standingsModelTotalDescStroke'),
              },
              {
                value: 'average' as StandingsModel,
                label: t('standingsModelAverageLabel'),
                desc: pointsBased
                  ? t('standingsModelAverageDescPoints')
                  : t('standingsModelAverageDescStroke'),
              },
              {
                value: 'best_n' as StandingsModel,
                label: t('standingsModelBestNLabel'),
                desc: pointsBased
                  ? t('standingsModelBestNDescPoints')
                  : t('standingsModelBestNDescStroke'),
              },
              {
                value: 'points' as StandingsModel,
                label: t('standingsModelPointsLabel'),
                desc: t('standingsModelPointsDesc'),
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

        {/* Antall beste runder — kun for best_n */}
        {standingsModel === 'best_n' && (
          <div className="mb-4">
            <label
              htmlFor="liga-best-n"
              className="block font-sans text-[12px] font-medium text-text mb-1.5"
            >
              {t('bestNLabel')}
            </label>
            <input
              id="liga-best-n"
              name="best_n_count"
              type="number"
              min={1}
              max={99}
              required
              placeholder="5"
              className="w-full rounded-xl border border-border bg-bg px-4 py-3 font-sans text-[15px] tabular-nums text-text focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px]"
            />
          </div>
        )}

        {/* Manglende runde — kun for total */}
        {standingsModel === 'total' && (
          <div className="space-y-2 mb-4">
            <p className="font-sans text-[12px] font-medium text-text mb-1.5">
              {t('missedRoundLabel')}
            </p>
            {(
              [
                {
                  value: 'penalty' as MissedRoundPolicy,
                  label: pointsBased ? t('missedPenaltyPointsLabel') : t('missedPenaltyStrokeLabel'),
                  desc: pointsBased
                    ? t('missedPenaltyPointsDesc')
                    : t('missedPenaltyStrokeDesc'),
                },
                {
                  value: 'must_play_all' as MissedRoundPolicy,
                  label: t('missedMustPlayLabel'),
                  desc: t('missedMustPlayDesc'),
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

        {/* Straffescore-variant — kun slagspill (poeng-ligaer: uteblitt = 0 poeng).
            Vises for total+penalty og best_n (som straffefyller). */}
        {!pointsBased &&
          ((standingsModel === 'total' && missedPolicy === 'penalty') ||
            standingsModel === 'best_n') && (
          <div className="space-y-2">
            <p className="font-sans text-[12px] font-medium text-text mb-1.5">
              {t('penaltyTypeLabel')}
            </p>
            {(
              [
                {
                  value: 'worst_plus_one' as PenaltyKind,
                  label: t('penaltyWorstPlusOneLabel'),
                  desc: t('penaltyWorstPlusOneDesc'),
                },
                {
                  value: 'fixed' as PenaltyKind,
                  label: t('penaltyFixedLabel'),
                  desc: t('penaltyFixedDesc'),
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
                  {t('penaltyFixedOverParLabel')}
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

      {/* Del 5 av 6 — Frekvens */}
      <Card>
        {sectionHeading(5, t('frequencyHeading'))}
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">{t('frequencyLegend')}</legend>
          {(
            [
              { value: 'monthly' as Frequency, label: t('frequencyMonthlyLabel') },
              { value: 'biweekly' as Frequency, label: t('frequencyBiweeklyLabel') },
              { value: 'weekly' as Frequency, label: t('frequencyWeeklyLabel') },
              { value: 'custom' as Frequency, label: t('frequencyCustomLabel') },
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
            {t('frequencyCustomHint')}
          </p>
        ) : roundPreview && roundPreview.length > 0 ? (
          <p className="mt-2 font-sans text-[12px] text-muted">
            {t('frequencyPreviewRounds', { count: roundPreview.length })}
            {frequency === 'monthly'
              ? t('frequencyPreviewMonthly', {
                  months: roundPreview
                    // Oslo month, not UTC: a window opening just after Oslo
                    // midnight on the 1st must label the right month on a UTC
                    // server (#687). osloParts.month is 0-based, like getUTCMonth.
                    .map((w) => shortMonthLocale(osloParts(new Date(w.opens_at)).month, locale))
                    .join(', '),
                })
              : t('frequencyPreviewWindowed', { days: frequency === 'weekly' ? '7' : '14' })}
            {t('frequencyPreviewDot')}
          </p>
        ) : (
          <p className="mt-2 font-sans text-[12px] text-muted">
            {t('frequencyNoPreview')}
          </p>
        )}
      </Card>

      {/* Del 6 av 6 — Deltakere */}
      <Card>
        {sectionHeading(6, t('participantsHeading'))}
        {/* Hidden JSON field */}
        <input
          type="hidden"
          name="player_ids"
          value={JSON.stringify(Array.from(selectedPlayerIds))}
        />

        <p className="font-sans text-[12px] text-muted mb-3">
          {isClubLeague
            ? t('participantsClubHint')
            : t('participantsHint')}
        </p>
        {friendCount === 0 &&
          (isClubLeague ? (
            <p className="font-sans text-[12px] text-muted mb-3">
              {t('noClubMembersYet')}
            </p>
          ) : (
            <p className="font-sans text-[12px] text-muted mb-3">
              {t('noFriendsYet')}{' '}
              <Link href="/profile/venner" className="text-primary underline">
                {t('addFriendsLink')}
              </Link>{' '}
              {t('addFriendsSuffix')}
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
                      {preferredName(p, t('unknownPlayer'))}
                      {p.id === meId && (
                        <span className="ml-1.5 font-sans text-[10px] text-accent">{t('youLabel')}</span>
                      )}
                      {p.pending && (
                        <span className="ml-1.5 font-sans text-[10px] text-muted">
                          {t('pendingLabel')}
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
            {t('selectedCount', { count: selectedPlayerIds.size })}
          </p>
        )}
      </Card>

      {/* Error */}
      {errorMessage && (
        <Banner tone="error">{errorMessage}</Banner>
      )}

      <SubmitButton className="w-full" pendingLabel={t('submitPending')}>
        {t('submitButton')}
      </SubmitButton>
    </form>
  );
}
