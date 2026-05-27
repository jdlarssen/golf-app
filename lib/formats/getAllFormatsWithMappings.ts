import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

export type MappingIntent = 'kompis' | 'klubb' | 'solo';

export const MAPPING_INTENTS: readonly MappingIntent[] = [
  'kompis',
  'klubb',
  'solo',
] as const;

export type MappingEntry = {
  is_visible: boolean;
  is_primary: boolean;
  sort_order: number;
};

export type FormatWithMappings = {
  slug: string;
  display_name: string;
  icon_key: string;
  short_description: string;
  is_active: boolean;
  is_cup_eligible: boolean;
  /** Mapping-rad per intent, eller null hvis ingen rad finnes (= "Ny"). */
  mappings: Record<MappingIntent, MappingEntry | null>;
};

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
 * Returnerer alfabetisk sortert på `display_name` for stabil visning.
 */
export async function getAllFormatsWithMappings(): Promise<
  FormatWithMappings[]
> {
  const supabase = getAdminClient();

  const [formatsRes, mappingsRes] = await Promise.all([
    supabase
      .from('formats')
      .select(
        'slug, display_name, icon_key, short_description, is_active, is_cup_eligible',
      )
      .order('display_name', { ascending: true }),
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
      display_name: f.display_name as string,
      icon_key: f.icon_key as string,
      short_description: f.short_description as string,
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
