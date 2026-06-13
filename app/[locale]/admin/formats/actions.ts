'use server';

import { revalidateTag } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin/auth';
import { recordFormatMappingChange } from '@/lib/formats/audit';
import type { MappingIntent } from '@/lib/formats/getAllFormatsWithMappings';
import type { AppLocale } from '@/i18n/routing';

const REDIRECT_BASE = '/admin/formats';

function isMappingIntent(raw: string): raw is MappingIntent {
  return raw === 'kompis' || raw === 'klubb' || raw === 'solo';
}

function parseNext(raw: string | null): boolean {
  return raw === 'on';
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
  const locale = (await getLocale()) as AppLocale;
  const slug = String(formData.get('format_slug') ?? '');
  const intentRaw = String(formData.get('intent') ?? '');
  const next = parseNext(String(formData.get('next') ?? ''));

  if (!slug) redirect({ href: `${REDIRECT_BASE}?error=missing_slug`, locale });
  if (!isMappingIntent(intentRaw)) redirect({ href: `${REDIRECT_BASE}?error=bad_intent`, locale });
  const intent = intentRaw as MappingIntent;

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

    const { error } = await adminClient
      .from('format_intent_mapping')
      .update({ is_visible: next })
      .eq('format_slug', slug)
      .eq('intent', intent);
    if (error) {
      console.error('[toggleVisibility] update failed', { slug, intent, error });
      redirect({ href: `${REDIRECT_BASE}?error=db_error`, locale });
    }

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
    const { error } = await adminClient
      .from('format_intent_mapping')
      .insert({
        format_slug: slug,
        intent,
        is_visible: next,
        is_primary: false,
        sort_order: 100,
      });
    if (error) {
      console.error('[toggleVisibility] insert failed', { slug, intent, error });
      redirect({ href: `${REDIRECT_BASE}?error=db_error`, locale });
    }

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

  revalidateTag('format-mapping', 'max');
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
  const locale = (await getLocale()) as AppLocale;
  const slug = String(formData.get('format_slug') ?? '');
  const intentRaw = String(formData.get('intent') ?? '');
  const next = parseNext(String(formData.get('next') ?? ''));

  if (!slug) redirect({ href: `${REDIRECT_BASE}?error=missing_slug`, locale });
  if (!isMappingIntent(intentRaw)) redirect({ href: `${REDIRECT_BASE}?error=bad_intent`, locale });
  const intent = intentRaw as MappingIntent;

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

    const { error } = await adminClient
      .from('format_intent_mapping')
      .update(updates)
      .eq('format_slug', slug)
      .eq('intent', intent);
    if (error) {
      console.error('[togglePrimary] update failed', { slug, intent, error });
      redirect({ href: `${REDIRECT_BASE}?error=db_error`, locale });
    }

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
    const { error } = await adminClient
      .from('format_intent_mapping')
      .insert({
        format_slug: slug,
        intent,
        is_visible: next ? true : false,
        is_primary: next,
        sort_order: 100,
      });
    if (error) {
      console.error('[togglePrimary] insert failed', { slug, intent, error });
      redirect({ href: `${REDIRECT_BASE}?error=db_error`, locale });
    }

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

  revalidateTag('format-mapping', 'max');
  redirect({ href: `${REDIRECT_BASE}?status=updated`, locale });
}

/**
 * Toggle `formats.is_cup_eligible`. Per-format global flag — ikke per-intent.
 */
export async function toggleCupEligible(formData: FormData): Promise<void> {
  const locale = (await getLocale()) as AppLocale;
  const slug = String(formData.get('format_slug') ?? '');
  const next = parseNext(String(formData.get('next') ?? ''));

  if (!slug) redirect({ href: `${REDIRECT_BASE}?error=missing_slug`, locale });

  const supabase = await getServerClient();
  const admin = await requireAdmin(supabase);
  const adminClient = getAdminClient();

  const { data: existing } = await adminClient
    .from('formats')
    .select('is_cup_eligible')
    .eq('slug', slug)
    .maybeSingle<{ is_cup_eligible: boolean }>();

  if (!existing) redirect({ href: `${REDIRECT_BASE}?error=not_found`, locale });
  if (existing!.is_cup_eligible === next) {
    redirect({ href: `${REDIRECT_BASE}?status=noop`, locale });
  }

  const { error } = await adminClient
    .from('formats')
    .update({ is_cup_eligible: next })
    .eq('slug', slug);
  if (error) {
    console.error('[toggleCupEligible] update failed', { slug, error });
    redirect({ href: `${REDIRECT_BASE}?error=db_error`, locale });
  }

  await recordFormatMappingChange({
    actorId: admin.userId,
    actorName: admin.name ?? 'Ukjent admin',
    formatSlug: slug,
    intent: null,
    changeType: 'cup_eligible',
    before: { is_cup_eligible: existing!.is_cup_eligible },
    after: { is_cup_eligible: next },
  });

  revalidateTag('format-mapping', 'max');
  redirect({ href: `${REDIRECT_BASE}?status=updated`, locale });
}

/**
 * Toggle `formats.is_active`. Global flag — påvirker både wizard-flyt og
 * cup-eligibility (inaktive formats skjules selv om is_cup_eligible=true).
 * Historiske games er upåvirket (ingen FK).
 */
export async function toggleActive(formData: FormData): Promise<void> {
  const locale = (await getLocale()) as AppLocale;
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
  if (existing!.is_active === next) {
    redirect({ href: `${REDIRECT_BASE}?status=noop`, locale });
  }

  const { error } = await adminClient
    .from('formats')
    .update({ is_active: next })
    .eq('slug', slug);
  if (error) {
    console.error('[toggleActive] update failed', { slug, error });
    redirect({ href: `${REDIRECT_BASE}?error=db_error`, locale });
  }

  await recordFormatMappingChange({
    actorId: admin.userId,
    actorName: admin.name ?? 'Ukjent admin',
    formatSlug: slug,
    intent: null,
    changeType: 'active',
    before: { is_active: existing!.is_active },
    after: { is_active: next },
  });

  revalidateTag('format-mapping', 'max');
  redirect({ href: `${REDIRECT_BASE}?status=updated`, locale });
}
