import { isUuid } from '@/lib/url/isUuid';
import type { CupBundleFormat } from './cupPairing';
import type { CupBatchMatch } from './matchPlan';

const FORMATS: ReadonlySet<CupBundleFormat> = new Set<CupBundleFormat>([
  'foursomes_matchplay',
  'fourball_matchplay',
  'singles_matchplay',
  'greensome_matchplay',
  'chapman_matchplay',
  'gruesome_matchplay',
  'best_ball',
]);
const SEGMENTS: ReadonlySet<string> = new Set(['full', 'front9', 'back9']);
/** Over alt en klubb-cup kan trenge, og en grense for hva en kropp kan be om. */
const MAX_MATCHES = 400;
const MAX_ID_LENGTH = 100;
const MAX_LABEL_LENGTH = 200;

function playerIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 2) return null;
  return value.every((id) => typeof id === 'string' && isUuid(id)) ? (value as string[]) : null;
}

function optionalFieldsAreValid(raw: Record<string, unknown>): boolean {
  if (raw.segment !== undefined && (typeof raw.segment !== 'string' || !SEGMENTS.has(raw.segment))) return false;
  if (raw.sourceId !== undefined && (typeof raw.sourceId !== 'string' || raw.sourceId.length > MAX_ID_LENGTH)) return false;
  return raw.flightIndex === undefined || Number.isInteger(raw.flightIndex);
}

function parseMatch(value: unknown): CupBatchMatch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const side1 = playerIds(raw.side1);
  const side2 = playerIds(raw.side2);
  if (!side1 || !side2) return null;
  if (typeof raw.id !== 'string' || raw.id === '' || raw.id.length > MAX_ID_LENGTH) return null;
  if (typeof raw.label !== 'string' || raw.label.length > MAX_LABEL_LENGTH) return null;
  if (typeof raw.format !== 'string' || !FORMATS.has(raw.format as CupBundleFormat)) return null;
  if (!optionalFieldsAreValid(raw)) return null;

  // Bare feltene planen har. Tallene i `teamStrokesOverride` sjekker kjernen, som
  // nettet også går gjennom.
  const match: Record<string, unknown> = {
    id: raw.id,
    format: raw.format,
    label: raw.label,
    side1,
    side2,
  };
  if (raw.segment !== undefined) match.segment = raw.segment;
  if (raw.sourceId !== undefined) match.sourceId = raw.sourceId;
  if (raw.flightIndex !== undefined) match.flightIndex = raw.flightIndex;
  if (raw.teamStrokesOverride !== undefined) {
    const override = raw.teamStrokesOverride as { team1?: unknown; team2?: unknown } | null;
    match.teamStrokesOverride = { team1: override?.team1, team2: override?.team2 };
  }
  return match as unknown as CupBatchMatch;
}

/**
 * Kampene i kroppen på `POST /api/cup/{id}/matches`, eller `null` når noe ikke har
 * formen til en plan (#2752). Reglene (hvem som er med, tak, plan) står i kjernen. Her
 * stoppes bare det som ikke engang er kamper.
 */
export function parseCupBatchMatches(value: unknown): CupBatchMatch[] | null {
  if (!Array.isArray(value) || value.length > MAX_MATCHES) return null;
  const matches: CupBatchMatch[] = [];
  for (const item of value) {
    const match = parseMatch(item);
    if (!match) return null;
    matches.push(match);
  }
  return matches;
}
