import 'server-only';
import { unstable_cache } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';

export type Intent = 'kompis' | 'klubb' | 'solo';

export type FormatForIntent = {
  slug: string;
  icon_key: string;
  is_primary: boolean;
  sort_order: number;
};

// Tag-cached fetch av aktive formats for en gitt wizard-intent.
// Returnerer alle synlige (is_visible) formats for intent-en, sortert på
// (is_primary desc, sort_order asc). UI partisjonerer selv på is_primary
// for å rendre 4 primary-kort + sekundære.
//
// Tag: `format-mapping`. Mutations call `expireFormatMappingCache()` from
// `lib/formats/expireFormatMappingCache.ts`, which expires it at once (#2336).
//
// Bruker getAdminClient() fordi cookies() ikke kan kalles inne i
// unstable_cache. RLS er allerede strengere på write-siden (admin only).
// Read er åpent for alle authenticated, så bypass via admin-client gir
// samme tilgang som en vanlig user-client ville gjort.
export const getFormatsForIntent = unstable_cache(
  async (intent: Intent): Promise<FormatForIntent[]> => {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('format_intent_mapping')
      .select(
        `format_slug,
         is_primary,
         sort_order,
         formats!inner (slug, icon_key, is_active)`,
      )
      .eq('intent', intent)
      .eq('is_visible', true)
      .eq('formats.is_active', true)
      .order('is_primary', { ascending: false })
      .order('sort_order', { ascending: true })
      // #2260: several rows share a sort_order, and the first format that
      // fits is the wizard's recommendation — the order must be stable.
      .order('format_slug', { ascending: true });

    if (error) {
      console.error('[getFormatsForIntent] query failed', { intent, error });
      throw new Error(`Failed to fetch formats for intent ${intent}`);
    }

    return (data ?? []).map((row) => {
      // `formats!inner` is a many-to-one embed, so PostgREST returns an object.
      const format = row.formats;
      return {
        slug: format.slug,
        icon_key: format.icon_key,
        is_primary: row.is_primary,
        sort_order: row.sort_order,
      };
    });
  },
  ['format-intent-mapping'],
  { tags: ['format-mapping'], revalidate: 60 * 60 * 24 },
);
