import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';
import {
  computeLeaderboard,
  teamMembersLabel,
  type LbHole,
  type LbPlayer,
  type LbScore,
} from '@/lib/leaderboard';

type CourseHoleRow = {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
};

type ScoreRow = {
  user_id: string;
  hole_number: number;
  strokes: number | null;
};

/**
 * CSV-eksport av leaderboard for ferdigspilte spill.
 *
 * Returnerer en UTF-8 BOM-prefikset, semikolon-separert CSV — semikolon
 * fordi norsk Excel-locale forventer det, BOM så Excel også oppdager
 * UTF-8 og rendrer æøå korrekt uten manuell encoding-velger.
 *
 * Auth-gated samme mønster som leaderboard-siden:
 *   - innlogget bruker (proxy-verifisert)
 *   - admin ELLER deltaker i spillet
 *
 * Skjer kun for `status='finished'`-spill. Andre statuser returnerer 404 —
 * en mid-runde-eksport ville være misvisende, og knappen på UI-siden
 * vises uansett ikke utenfor finished-state.
 *
 * Innhold: én rad per lag (lagnummer, medlemmer, brutto-total, netto-total,
 * vs. par-i-netto, antall hull spilt). Per-hull-breakdown er bevisst utelatt
 * fra v1 — målet er en utskrift-vennlig oppsummering for klubbhus-veggen.
 */
function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  // Eskaper semikolon, double-quote og newline med RFC-4180-style dobbel-quote.
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(fields: Array<string | number | null | undefined>): string {
  return fields.map(csvField).join(';');
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 });
  }

  const supabase = await getServerClient();

  const [gwp, profileRes] = await Promise.all([
    getGameWithPlayers(id),
    supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single<{ is_admin: boolean }>(),
  ]);

  if (!gwp) {
    return NextResponse.json({ error: 'Spillet finnes ikke' }, { status: 404 });
  }
  const game = gwp.game;

  // Bare finished-spill kan eksporteres. En mid-runde-eksport ville være
  // misvisende (delvise totaler ville se ut som ferdige), og UI-knappen
  // skjules uansett til status flipper til finished.
  if (game.status !== 'finished') {
    return NextResponse.json(
      { error: 'Eksport er bare tilgjengelig for ferdigspilte spill' },
      { status: 404 },
    );
  }

  const isAdmin = profileRes.data?.is_admin === true;
  if (!isAdmin && !gwp.players.some((p) => p.user_id === userId)) {
    return NextResponse.json({ error: 'Ingen tilgang' }, { status: 404 });
  }

  const [rawHolesRes, rawScoresRes] = await Promise.all([
    supabase
      .from('course_holes')
      .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
      .eq('course_id', game.course_id)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
    supabase
      .from('scores')
      .select('user_id, hole_number, strokes')
      .eq('game_id', id)
      .returns<ScoreRow[]>(),
  ]);

  if (rawHolesRes.error) {
    return NextResponse.json(
      { error: 'Klarte ikke å hente baneinformasjon' },
      { status: 500 },
    );
  }
  if (rawScoresRes.error) {
    return NextResponse.json(
      { error: 'Klarte ikke å hente scores' },
      { status: 500 },
    );
  }

  const players: LbPlayer[] = gwp.players
    .filter((p) => p.users != null)
    .map((p) => ({
      userId: p.user_id,
      name: p.users!.name ?? '(ukjent)',
      nickname: p.users!.nickname,
      teamNumber: p.team_number,
      courseHandicap: p.course_handicap ?? 0,
    }));

  const holes: LbHole[] = (rawHolesRes.data ?? []).map((h) => ({
    holeNumber: h.hole_number,
    par: h.par_mens,
    strokeIndex: h.stroke_index,
  }));

  const scores: LbScore[] = (rawScoresRes.data ?? []).map((s) => ({
    userId: s.user_id,
    holeNumber: s.hole_number,
    strokes: s.strokes,
  }));

  // Beregn både brutto og netto. Begge totaler er nyttige på klubbhus-veggen
  // — brutto for «hvor mange slag», netto for «hvem vant».
  const nettoLines = computeLeaderboard({
    mode: 'netto',
    players,
    holes,
    scores,
  });
  const bruttoLines = computeLeaderboard({
    mode: 'brutto',
    players,
    holes,
    scores,
  });

  const bruttoByTeam = new Map(
    bruttoLines.map((l) => [l.teamNumber, l]),
  );

  // Sortér etter netto-rank (samme rekkefølge som leaderboard-siden viser).
  const ordered = [...nettoLines].sort((a, b) => a.rank - b.rank);
  const coursePar = holes.reduce((sum, h) => sum + h.par, 0);
  const totalHoles = holes.length;

  const rows: string[] = [];

  // Header-blokk: spill-metadata over leaderboard-tabellen. Tomme rader
  // separerer seksjoner så CSV-en leser ryddig i Numbers/Excel.
  rows.push(csvRow(['Tørny - resultater']));
  rows.push(csvRow(['Spill', game.name]));
  rows.push(csvRow(['Eksportert', new Date().toISOString().slice(0, 10)]));
  rows.push(csvRow(['Par (bane)', coursePar]));
  rows.push(csvRow([]));

  // Leaderboard-tabell. Kolonner valgt for å være lesbar på utskrift:
  // rank, lag, medlemmer, brutto-total, netto-total, vs par (netto),
  // antall hull spilt.
  rows.push(
    csvRow([
      'Plass',
      'Lag',
      'Spillere',
      'Brutto',
      'Netto',
      'Mot par (netto)',
      'Hull spilt',
    ]),
  );

  for (const line of ordered) {
    const brutto = bruttoByTeam.get(line.teamNumber);
    const bruttoTotal = brutto?.total ?? '';
    const vsPar = line.total - coursePar;
    const vsParLabel = vsPar === 0 ? 'E' : vsPar > 0 ? `+${vsPar}` : String(vsPar);
    const holesPlayed = totalHoles - line.missingHoles.length;
    const tiedSuffix = line.tiedWith.length > 0 ? ' (delt)' : '';

    rows.push(
      csvRow([
        `${line.rank}.${tiedSuffix}`,
        `Lag ${line.teamNumber}`,
        teamMembersLabel(line.players),
        bruttoTotal,
        line.total,
        vsParLabel,
        `${holesPlayed} / ${totalHoles}`,
      ]),
    );
  }

  // BOM + CRLF — CRLF er standarden Excel forventer for CSV på Windows og
  // gir samtidig korrekt linjebryt i Numbers/macOS Excel.
  const bom = '﻿';
  const body = bom + rows.join('\r\n') + '\r\n';

  const exportDate = new Date().toISOString().slice(0, 10);
  // ASCII-safe filnavn — game-id (UUID) + dato. Spillnavnet kan inneholde
  // æøå/mellomrom/symboler som kan tråkle nedlastingen i enkelte nettlesere.
  const filename = `torny-${id}-${exportDate}.csv`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
