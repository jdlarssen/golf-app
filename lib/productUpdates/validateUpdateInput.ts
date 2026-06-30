/**
 * Felles inndata-validering for lanseringer (#993). Både publiser- og rediger-
 * server-actionen kjører nøyaktig samme regler, så de bor ett sted (AGENTS.md
 * trap #4 — én regel, ett hjem). Reglene speiler `productUpdateSchema` i
 * `lib/notifications/types.ts`: lenke må være intern (starter med «/»), og
 * knappe-tekst er meningsløs uten lenke.
 *
 * Returnerer en diskriminert union så call-site kan redirecte med feilkoden
 * (som mapper til en i18n-nøkkel under `admin.launches.errors`).
 */
export type ProductUpdateInputError =
  | 'title_required'
  | 'body_required'
  | 'link_must_be_internal'
  | 'cta_without_link';

export type ValidatedProductUpdateInput = {
  title: string;
  body: string;
  link: string | null;
  cta_label: string | null;
};

export type ProductUpdateValidation =
  | { ok: true; value: ValidatedProductUpdateInput }
  | { ok: false; error: ProductUpdateInputError };

export function validateProductUpdateInput(raw: {
  title: string;
  body: string;
  link: string;
  cta_label: string;
}): ProductUpdateValidation {
  const title = raw.title.trim();
  const body = raw.body.trim();
  const link = raw.link.trim();
  const cta = raw.cta_label.trim();

  if (!title) return { ok: false, error: 'title_required' };
  if (!body) return { ok: false, error: 'body_required' };
  // Link, if present, must be internal (starts with '/').
  if (link && !link.startsWith('/')) {
    return { ok: false, error: 'link_must_be_internal' };
  }
  // cta_label only meaningful with a link.
  if (cta && !link) return { ok: false, error: 'cta_without_link' };

  return {
    ok: true,
    value: { title, body, link: link || null, cta_label: cta || null },
  };
}
