// Client-safe types for format-mapping. Lever separat fra
// `getAllFormatsWithMappings.ts` fordi den filen importerer 'server-only';
// type-only-imports fra `'use client'`-komponenter til en server-only-modul
// trigger Turbopack-builderror selv om typene egentlig blir eliminert i
// emit-fasen.
//
// Server-side consumers (page.tsx, audit.ts, actions.ts) kan importere
// herfra OG fra getAllFormatsWithMappings — typene re-eksporteres derfra
// for bakoverkompatibilitet.

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
  icon_key: string;
  is_active: boolean;
  is_cup_eligible: boolean;
  /** Mapping-rad per intent, eller null hvis ingen rad finnes (= "Ny"). */
  mappings: Record<MappingIntent, MappingEntry | null>;
};
