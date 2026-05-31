import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Kicker } from '@/components/ui/Kicker';
import { PageHeader } from '@/components/ui/PageHeader';
import { getModeContentMap, mergeModeContent } from '@/lib/formats/getModeContent';
import { MODE_LABELS, type GameMode } from '@/lib/scoring/modes/types';

type Params = Promise<{ slug: string }>;

// Gyldige slugs = alle GameMode-verdier, avledet fra MODE_LABELS-nøklene.
// Avledet (ikke hardkodet liste) så en ny modus automatisk får detaljside —
// unngår «glemte å legge til modus»-driften.
const VALID_MODES = new Set<string>(Object.keys(MODE_LABELS));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  if (!VALID_MODES.has(slug)) return { title: 'Spillform' };
  const mode = slug as GameMode;
  return { title: MODE_LABELS[mode] ?? slug };
}

/**
 * Detaljside per spillform (#308). Viser sammendrag + punkter (fra ModeGuideCard-
 * innholdet) + regler_lang (prosa) + regler_eksempel (konkret eksempel i en
 * markert boks). Innhold er DB-drevet via getModeContentMap, med kode-fallback
 * for summary/points. Detaljsiden er per-slug (én per GameMode) — 4BBB-varianten
 * har ingen egen slug og viser stableford-innholdet.
 *
 * 404 for ugyldig slug. Dynamisk (ingen generateStaticParams) — innhold er
 * admin-redigerbart og skal reflektere revalidateTag-oppdateringer umiddelbart.
 */
export default async function SpillformDetailPage({ params }: { params: Params }) {
  const { slug } = await params;

  if (!VALID_MODES.has(slug)) {
    notFound();
  }

  const mode = slug as GameMode;
  const modeContentMap = await getModeContentMap();

  // Detail page always uses team_size 1 (slug-based, no variant config)
  const merged = mergeModeContent(
    modeContentMap[mode] ?? null,
    mode,
    1,
  );

  const label = MODE_LABELS[mode] ?? slug;

  return (
    <AppShell>
      <header className="mb-6 flex items-center gap-3">
        <BackLink href="/spillformer">← Alle spillformer</BackLink>
      </header>

      <Kicker tone="accent" className="mb-2">
        SPILLFORM
      </Kicker>
      <PageHeader title={label} />

      {/* Summary + points */}
      <div className="space-y-3 mt-4">
        <p className="text-[15px] text-muted leading-relaxed">{merged.summary}</p>

        <ul className="space-y-2">
          {merged.points.map((point) => (
            <li key={point} className="flex gap-2 text-sm text-text">
              <span aria-hidden className="mt-[2px] text-primary shrink-0">
                ›
              </span>
              <span className="min-w-0 flex-1">{point}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Long prose — only rendered when seeded in DB */}
      {merged.long && (
        <div className="mt-6">
          <h2 className="font-serif text-[18px] font-medium tracking-[-0.01em] text-text mb-3">
            Slik fungerer det
          </h2>
          <div className="text-[15px] text-text leading-relaxed whitespace-pre-line">
            {merged.long}
          </div>
        </div>
      )}

      {/* Example callout — only rendered when seeded in DB */}
      {merged.example && (
        <div className="mt-6">
          <h2 className="font-serif text-[18px] font-medium tracking-[-0.01em] text-text mb-3">
            Konkret eksempel
          </h2>
          <div className="rounded-2xl border border-border bg-surface px-4 py-4">
            <p className="text-[14px] text-text leading-relaxed whitespace-pre-line">
              {merged.example}
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}
