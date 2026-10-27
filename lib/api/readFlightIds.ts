import { isUuid } from '@/lib/url/isUuid';

/**
 * A list of player ids from a JSON request body (`{ [field]: string[] }`), the
 * one reader for the app routes that take the other players of a flight: the
 * flightmates in `submit-team` (`alsoFor`, #2200) and the co-players in the
 * league start (`coPlayerIds`, #2638).
 *
 * `[]` without a body or without the field. `null` when the body is not JSON,
 * the field is not a list of uuids, or the list is longer than `max`: a
 * malformed body is a client error (400), never «we failed» (500). Each route
 * keeps its own cap: submit-team's wire is frozen at 20 for the app builds in
 * the stores, and the league start uses `MAX_CO_PLAYERS` (lib/league/flightRules).
 */
export async function readFlightIds(request: Request, field: string, max: number): Promise<string[] | null> {
  let parsed: unknown;
  try {
    const text = await request.text();
    if (text.trim() === '') return [];
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const ids = (parsed as Record<string, unknown>)[field];
  if (ids === undefined) return [];
  if (!Array.isArray(ids) || ids.length > max) return null;
  if (!ids.every((id) => typeof id === 'string' && isUuid(id))) return null;
  return ids;
}

/**
 * One optional uuid from a JSON request body (`{ [field]: string }`): the
 * marker in `submit-team` (#2661). `null` without a body, without the field
 * or when it is null. `undefined` when the body is not JSON or the field is
 * not a uuid: a malformed body is a client error (400).
 */
export async function readUuidField(request: Request, field: string): Promise<string | null | undefined> {
  let parsed: unknown;
  try {
    const text = await request.text();
    if (text.trim() === '') return null;
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const value = (parsed as Record<string, unknown>)[field];
  if (value === undefined || value === null) return null;
  return typeof value === 'string' && isUuid(value) ? value : undefined;
}
