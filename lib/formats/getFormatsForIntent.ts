import 'server-only';
import { unstable_cache } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';

export type Intent = 'kompis' | 'klubb' | 'solo';

export type FormatForIntent = {
  slug: string;
  display_name: string;
  icon_key: string;
  short_description: string;
  is_primary: boolean;
  sort_order: number;
};

export type CupEligibleFormat = Pick<
  FormatForIntent,
  'slug' | 'display_name' | 'icon_key' | 'short_description'
>;

// Tag-cached fetch av aktive formats for en gitt wizard-intent.
// Returnerer alle synlige (is_visible) formats for intent-en, sortert på
// (is_primary desc, sort_order asc). UI partisjonerer selv på is_primary
// for å rendre 4 primary-kort + sekundære.
//
// Tag: `format-mapping`. Mutasjons-server-actions i F3 må kalle
// `revalidateTag('format-mapping', 'max')` etter endring.
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
         formats!inner (slug, display_name, icon_key, short_description, is_active)`,
      )
      .eq('intent', intent)
      .eq('is_visible', true)
      .eq('formats.is_active', true)
      .order('is_primary', { ascending: false })
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[getFormatsForIntent] query failed', { intent, error });
      throw new Error(`Failed to fetch formats for intent ${intent}`);
    }

    return (data ?? []).map((row) => {
      // PostgREST returns nested relations as an object (or array) depending on
      // cardinality. With !inner on a single-row FK, it's an object.
      const format = Array.isArray(row.formats) ? row.formats[0] : row.formats;
      return {
        slug: format.slug,
        display_name: format.display_name,
        icon_key: format.icon_key,
        short_description: format.short_description,
        is_primary: row.is_primary,
        sort_order: row.sort_order,
      };
    });
  },
  ['format-intent-mapping'],
  { tags: ['format-mapping'], revalidate: 60 * 60 * 24 },
);

// Returnerer alle aktive formats som er cup_eligible. Brukes av Cup-step 2
// for multi-select av tillatte match-formats.
export const getCupEligibleFormats = unstable_cache(
  async (): Promise<CupEligibleFormat[]> => {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('formats')
      .select('slug, display_name, icon_key, short_description')
      .eq('is_active', true)
      .eq('is_cup_eligible', true)
      .order('display_name', { ascending: true });

    if (error) {
      console.error('[getCupEligibleFormats] query failed', { error });
      throw new Error('Failed to fetch cup-eligible formats');
    }
    return data ?? [];
  },
  ['cup-eligible-formats'],
  { tags: ['format-mapping'], revalidate: 60 * 60 * 24 },
);
