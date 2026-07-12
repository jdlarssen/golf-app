/**
 * Great-circle distance (#1210) — pure TS, no I/O (Type A, cf.
 * lib/scoring/AGENTS.md). Used to compute «~X m til green» from the player's
 * GPS position to the crowdsourced green center. Haversine on the R = 6371 km
 * sphere is accurate to well under a meter at golf scale — far inside the
 * ±5–10 m phone-GPS noise the «~» in the UI already promises.
 */

export type LatLng = {
  lat: number;
  lng: number;
};

const EARTH_RADIUS_M = 6371000;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Distance in meters between two WGS84 coordinates (haversine). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
