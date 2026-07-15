/**
 * #1052: nedskalerings-matte for sponsorlogoer — ren logikk skilt fra
 * canvas-koden så den kan testes uten browser-API-er.
 */

/**
 * Skaler (w, h) proporsjonalt så lengste kant er ≤ max. Skalerer aldri OPP.
 * Dimensjonsløs input (0 eller negativ side — typisk SVG uten width/height)
 * faller tilbake til max × max; rasteret tegnes da kvadratisk.
 */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: max, height: max };
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
