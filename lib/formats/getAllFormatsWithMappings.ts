import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
// Types lever i client-safe lib/formats/types.ts fordi `import 'server-only'`
// her ville ellers blokkere client-komponenter fra å importere typer derfra
// (Turbopack inspiserer module-imports før type-elision). Re-eksport så
// eksisterende server-side call-sites fortsatt kan importere herfra.
import type {
  MappingIntent,
  MappingEntry,
  FormatWithMappings,
} from './types';

export {
  MAPPING_INTENTS,
} from './types';
export type { MappingIntent, MappingEntry, FormatWithMappings };

/**
 * Admin-view-helper: henter ALLE formats sammen med ALLE mapping-rader (inkl.
 * is_visible=false og is_active=false). I motsetning til F1's
 * `getFormatsForIntent` er denne IKKE cachet — admin-view skal alltid se
 * fersk state etter mutasjon.
 *
 * Bruker `getAdminClient()` siden RLS på `formats` og `format_intent_mapping`
 * ikke skiller mellom aktiv og inaktiv på read-policy, men vi unngår
 * cookies-baserte feller (kan ikke kalles inne i unstable_cache).
 *
 * Returnerer sortert på `slug` for stabil visning; FormatsManager rendrer
 * lokaliserte navn via `modes.*`-katalogen (i18n Fase D, #592).
 */
export async function getAllFormatsWithMappings(): Promise<
  FormatWithMappings[]
> {
  const supabase = getAdminClient();

  const [formatsRes, mappingsRes] = await Promise.all([
    supabase
      .from('formats')
      .select('slug, icon_key, is_active, is_cup_eligible')
      .order('slug', { ascending: true }),
    supabase
      .from('format_intent_mapping')
      .select('format_slug, intent, is_visible, is_primary, sort_order'),
  ]);

  if (formatsRes.error) {
    console.error('[getAllFormatsWithMappings] formats query failed', {
      error: formatsRes.error,
    });
    throw new Error('Failed to fetch formats');
  }
  if (mappingsRes.error) {
    console.error('[getAllFormatsWithMappings] mappings query failed', {
      error: mappingsRes.error,
    });
    throw new Error('Failed to fetch format mappings');
  }

  // Bygg lookup map: { slug → { intent → mapping } }
  const byFormat = new Map<string, Partial<Record<MappingIntent, MappingEntry>>>();
  for (const row of mappingsRes.data ?? []) {
    const intent = row.intent as MappingIntent;
    if (intent !== 'kompis' && intent !== 'klubb' && intent !== 'solo') continue;
    const slug = row.format_slug as string;
    const existing = byFormat.get(slug) ?? {};
    existing[intent] = {
      is_visible: row.is_visible as boolean,
      is_primary: row.is_primary as boolean,
      sort_order: row.sort_order as number,
    };
    byFormat.set(slug, existing);
  }

  return (formatsRes.data ?? []).map((f) => {
    const mappings = byFormat.get(f.slug as string) ?? {};
    return {
      slug: f.slug as string,
      icon_key: f.icon_key as string,
      is_active: f.is_active as boolean,
      is_cup_eligible: f.is_cup_eligible as boolean,
      mappings: {
        kompis: mappings.kompis ?? null,
        klubb: mappings.klubb ?? null,
        solo: mappings.solo ?? null,
      },
    };
  });
}
