'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin/auth';
import { recordFormatMappingChange } from '@/lib/formats/audit';
import { expireFormatMappingCache } from '@/lib/formats/expireFormatMappingCache';
import type { MappingIntent } from '@/lib/formats/getAllFormatsWithMappings';
import { compareStep2, moveWithinSection, step2SortOrder } from '@/lib/formats/step2Order';
import { expectAffected } from '@/lib/supabase/affectedRows';

const REDIRECT_BASE = '/admin/formats';

function isMappingIntent(raw: string): raw is MappingIntent {
  return raw === 'kompis' || raw === 'klubb' || raw === 'solo';
}

function parseNext(raw: string | null): boolean {
  return raw === 'on';
}

/**
 * Runs one write and reports whether it reached the row(s) (#704): an error and
 * a 0-row result both count as a failure, and so does a row count other than
 * `expected` when it is given. The caller redirects on `false`, outside this
 * try/catch, so Next's redirect signal is never swallowed.
 */
async function wrote(
  context: string,
  write: () => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  expected?: number,
): Promise<boolean> {
  try {
    const rows = expectAffected(await write(), context);
    if (expected !== undefined && rows.length !== expected) {
      throw new Error(`${context}: wrote ${rows.length} rows, expected ${expected}`);
    }
    return true;
  } catch (error) {
    console.error(`[${context}] write failed`, { error });
    return false;
  }
}

/**
 * Toggle `format_intent_mapping.is_visible`. Idempotent: ingen DB-write hvis
 * `next === current`. Server-validering: kan ikke avhuke is_visible på en
 * primary-rad (DB-CHECK `primary_implies_visible` ville rollback-et uansett,
 * men vi gir vennligere feilmelding her).
 *
 * Hvis det ikke finnes mapping-rad ennå (= "Ny" status for det intent), gjør
 * vi en upsert: rad inserted med `is_visible=next`, `is_primary=false`,
 * default sort_order. Da kan admin gi synlighet til et nytt format uten å
 * gå via migrasjon.
 */
export async function toggleVisibility(formData: FormData): Promise<void> {
  const locale = await getLocale();
  const slug = String(formData.get('format_slug') ?? '');
  const intentRaw = String(formData.get('intent') ?? '');
  const next = parseNext(String(formData.get('next') ?? ''));

  if (!slug) redirect({ href: `${REDIRECT_BASE}?error=missing_slug`, locale });
  if (!isMappingIntent(intentRaw)) redirect({ href: `${REDIRECT_BASE}?error=bad_intent`, locale });
  const intent = intentRaw;

  const supabase = await getServerClient();
  const admin = await requireAdmin(supabase);
  const adminClient = getAdminClient();

  // Hent eksisterende rad for idempotens + validation
  const { data: existing } = await adminClient
    .from('format_intent_mapping')
    .select('is_visible, is_primary')
    .eq('format_slug', slug)
    .eq('intent', intent)
    .maybeSingle<{ is_visible: boolean; is_primary: boolean }>();

  if (existing) {
    // Idempotens
    if (existing.is_visible === next) {
      redirect({ href: `${REDIRECT_BASE}?status=noop`, locale });
    }
    // Validering: primary-rad kan ikke avhukes
    if (next === false && existing.is_primary) {
      redirect({ href: `${REDIRECT_BASE}?error=demote_first`, locale });
    }

    const ok = await wrote('toggleVisibility update', () =>
      adminClient
        .from('format_intent_mapping')
        .update({ is_visible: next })
        .eq('format_slug', slug)
        .eq('intent', intent)
        .select('format_slug'),
    );
    if (!ok) redirect({ href: `${REDIRECT_BASE}?error=db_error`, locale });

    await recordFormatMappingChange({
      actorId: admin.userId,
      actorName: admin.name ?? 'Ukjent admin',
      formatSlug: slug,
      intent,
      changeType: 'visibility',
      before: { is_visible: existing.is_visible },
      after: { is_visible: next },
    });
  } else {
    // Ingen mapping-rad finnes: insert med next-verdi
    const ok = await wrote('toggleVisibility insert', () =>
      adminClient
        .from('format_intent_mapping')
        .insert({
          format_slug: slug,
          intent,
          is_visible: next,
          is_primary: false,
          sort_order: 100,
        })
        .select('format_slug'),
    );
    if (!ok) redirect({ href: `${REDIRECT_BASE}?error=db_error`, locale });

    await recordFormatMappingChange({
      actorId: admin.userId,
      actorName: admin.name ?? 'Ukjent admin',
      formatSlug: slug,
      intent,
      changeType: 'visibility',
      before: { is_visible: false, no_row: true },
      after: { is_visible: next },
    });
  }

  expireFormatMappingCache();
  redirect({ href: `${REDIRECT_BASE}?status=updated`, locale });
}

/**
 * Toggle `format_intent_mapping.is_primary`. Idempotent. Validering:
 * - Hvis next='off': må ikke være siste primary for intent (≥2 primarys
 *   kreves før man kan demote-e en).
 * - Hvis next='on': raden må enten finnes med is_visible=true ELLER vi
 *   atomically setter is_visible=true samtidig. Aldri brudd på CHECK.
 */
export async function togglePrimary(formData: FormData): Promise<void> {
  const locale = await getLocale();
  const slug = String(formData.get('format_slug') ?? '');
  const intentRaw = String(formData.get('intent') ?? '');
  const next = parseNext(String(formData.get('next') ?? ''));

  if (!slug) redirect({ href: `${REDIRECT_BASE}?error=missing_slug`, locale });
  if (!isMappingIntent(intentRaw)) redirect({ href: `${REDIRECT_BASE}?error=bad_intent`, locale });
  const intent = intentRaw;

  const supabase = await getServerClient();
  const admin = await requireAdmin(supabase);
  const adminClient = getAdminClient();

  const { data: existing } = await adminClient
    .from('format_intent_mapping')
    .select('is_visible, is_primary')
    .eq('format_slug', slug)
    .eq('intent', intent)
    .maybeSingle<{ is_visible: boolean; is_primary: boolean }>();

  // Validering: siste primary kan ikke fjernes
  if (next === false) {
    const { count } = await adminClient
      .from('format_intent_mapping')
      .select('format_slug', { head: true, count: 'exact' })
      .eq('intent', intent)
      .eq('is_primary', true);
    if ((count ?? 0) <= 1) {
      redirect({ href: `${REDIRECT_BASE}?error=last_primary`, locale });
    }
  }

  if (existing) {
    if (existing.is_primary === next) {
      redirect({ href: `${REDIRECT_BASE}?status=noop`, locale });
    }
    // Hvis next='on' og raden ikke er synlig: sett is_visible=true samtidig
    // (CHECK `primary_implies_visible` ville ellers rollback-et).
    const updates: { is_primary: boolean; is_visible?: boolean } = {
      is_primary: next,
    };
    if (next === true && !existing.is_visible) {
      updates.is_visible = true;
    }

    const ok = await wrote('togglePrimary update', () =>
      adminClient
        .from('format_intent_mapping')
        .update(updates)
        .eq('format_slug', slug)
        .eq('intent', intent)
        .select('format_slug'),
    );
    if (!ok) redirect({ href: `${REDIRECT_BASE}?error=db_error`, locale });

    await recordFormatMappingChange({
      actorId: admin.userId,
      actorName: admin.name ?? 'Ukjent admin',
      formatSlug: slug,
      intent,
      changeType: 'primary',
      before: existing,
      after: { ...existing, ...updates },
    });
  } else {
    // Ingen rad: insert med is_primary=next (og is_visible=true hvis next='on')
    const ok = await wrote('togglePrimary insert', () =>
      adminClient
        .from('format_intent_mapping')
        .insert({
          format_slug: slug,
          intent,
          is_visible: next ? true : false,
          is_primary: next,
          sort_order: 100,
        })
        .select('format_slug'),
    );
    if (!ok) redirect({ href: `${REDIRECT_BASE}?error=db_error`, locale });

    await recordFormatMappingChange({
      actorId: admin.userId,
      actorName: admin.name ?? 'Ukjent admin',
      formatSlug: slug,
      intent,
      changeType: 'primary',
      before: { is_primary: false, no_row: true },
      after: { is_primary: next, is_visible: next },
    });
  }

  expireFormatMappingCache();
  redirect({ href: `${REDIRECT_BASE}?status=updated`, locale });
}

/**
 * Toggle `formats.is_active`. Global flag: an inactive format is hidden from
 * the wizard. Historical games are unaffected (no FK).
 */
export async function toggleActive(formData: FormData): Promise<void> {
  const locale = await getLocale();
  const slug = String(formData.get('format_slug') ?? '');
  const next = parseNext(String(formData.get('next') ?? ''));

  if (!slug) redirect({ href: `${REDIRECT_BASE}?error=missing_slug`, locale });

  const supabase = await getServerClient();
  const admin = await requireAdmin(supabase);
  const adminClient = getAdminClient();

  const { data: existing } = await adminClient
    .from('formats')
    .select('is_active')
    .eq('slug', slug)
    .maybeSingle<{ is_active: boolean }>();

  if (!existing) redirect({ href: `${REDIRECT_BASE}?error=not_found`, locale });
  if (existing.is_active === next) {
    redirect({ href: `${REDIRECT_BASE}?status=noop`, locale });
  }

  const ok = await wrote('toggleActive update', () =>
    adminClient
      .from('formats')
      .update({ is_active: next })
      .eq('slug', slug)
      .select('slug'),
  );
  if (!ok) redirect({ href: `${REDIRECT_BASE}?error=db_error`, locale });

  await recordFormatMappingChange({
    actorId: admin.userId,
    actorName: admin.name ?? 'Ukjent admin',
    formatSlug: slug,
    intent: null,
    changeType: 'active',
    before: { is_active: existing.is_active },
    after: { is_active: next },
  });

  expireFormatMappingCache();
  redirect({ href: `${REDIRECT_BASE}?status=updated`, locale });
}

/**
 * Moves a format one place up or down within its step-2 group («Vanligst» or
 * «Flere muligheter») for one intent (#2347). Reads and writes with the
 * owner's session, so RLS (`format_intent_mapping_admin_update` /
 * `_admin_insert`, both `is_admin()`) is the authz.
 *
 * The whole group is renumbered (i+1)*10 in one upsert, so equal `sort_order`
 * values are gone after the first move. The app never deletes mapping rows, so
 * the upsert always takes its conflict branch and only touches `sort_order`.
 */
export async function moveFormat(formData: FormData): Promise<void> {
  const locale = await getLocale();
  const slug = String(formData.get('format_slug') ?? '');
  const intentRaw = String(formData.get('intent') ?? '');
  const direction = String(formData.get('direction') ?? '');

  if (!slug) redirect({ href: `${REDIRECT_BASE}?error=missing_slug`, locale });
  if (!isMappingIntent(intentRaw)) redirect({ href: `${REDIRECT_BASE}?error=bad_intent`, locale });
  if (direction !== 'up' && direction !== 'down') {
    redirect({ href: `${REDIRECT_BASE}?error=bad_direction`, locale });
  }
  const intent = intentRaw;
  const dir = direction as 'up' | 'down';

  const supabase = await getServerClient();
  const admin = await requireAdmin(supabase);

  const { data: rows, error: readError } = await supabase
    .from('format_intent_mapping')
    .select('format_slug, is_primary, sort_order, formats!inner(is_active)')
    .eq('intent', intent)
    .eq('is_visible', true)
    .eq('formats.is_active', true);
  if (readError || !rows) {
    console.error('[moveFormat] read failed', { slug, intent, error: readError });
    redirect({ href: `${REDIRECT_BASE}?error=db_error`, locale });
  }

  const own = rows.find((r) => r.format_slug === slug);
  if (!own) redirect({ href: `${REDIRECT_BASE}?error=not_found`, locale });
  const group = rows
    .filter((r) => r.is_primary === own.is_primary)
    .map((r) => ({ slug: r.format_slug, is_primary: r.is_primary, sort_order: r.sort_order }))
    .sort(compareStep2)
    .map((r) => r.slug);

  const moved = moveWithinSection(group, slug, dir);
  if (!moved) redirect({ href: `${REDIRECT_BASE}?status=noop`, locale });

  const payload = moved.slugs.map((s, i) => ({
    format_slug: s,
    intent,
    sort_order: step2SortOrder(i),
  }));
  const ok = await wrote(
    'moveFormat upsert',
    () =>
      supabase
        .from('format_intent_mapping')
        .upsert(payload, { onConflict: 'format_slug,intent' })
        .select('format_slug'),
    payload.length,
  );
  if (!ok) redirect({ href: `${REDIRECT_BASE}?error=db_error`, locale });

  await recordFormatMappingChange({
    actorId: admin.userId,
    actorName: admin.name ?? 'Ukjent admin',
    formatSlug: slug,
    intent,
    changeType: 'sort_order',
    before: { position: moved.from + 1 },
    after: { position: moved.to + 1 },
  });

  expireFormatMappingCache();
  redirect({ href: `${REDIRECT_BASE}?status=updated`, locale });
}
