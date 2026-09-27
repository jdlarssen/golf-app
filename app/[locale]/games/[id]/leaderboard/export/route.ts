import { NextResponse } from 'next/server';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { getServerClient } from '@/lib/supabase/server';
import { COURSE_HOLES_SELECT, SCORES_SELECT } from '@/lib/supabase/queryFragments';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';
import { holeNumbersForSegment } from '@/lib/games/holeScope';
import { computeLeaderboard, teamMembersLabel } from '@/lib/leaderboard';
import { bestBallBoardInput } from '@/lib/leaderboard/bestBallInput';
import { teamLineVsPar } from '@/lib/leaderboard/vsPar';
import { teamHolesPlayed } from '@/lib/leaderboard/holesColumn';
import { selectAllRowsResult } from '@/lib/supabase/selectAllRows';
import { getResultReadClient } from '../leaderboardContext';

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
 * Auth-gated samme synlighet som leaderboard-siden (#1468/#1500): innlogget
 * bruker (proxy-verifisert). Ruta KUN serverer finished-spill (sjekken under),
 * så den trenger ingen deltaker/admin-gate i tillegg. RLS åpner IKKE ferdige
 * spill for andre enn deltakerne (#1542): slagene leses derfor med
 * `getResultReadClient`, samme klient som tavla, og gaten her er håndhevelsen
 * (#2217). Uten den fikk cup-publikum og klubbmedlemmer 0 rader og en CSV der
 * alle lag sto delt først med 0 slag.
 *
 * Bare best ball: lenken står bare på best ball-tavla (`State4View`), og
 * summene under er best ball-tall. Andre format svarer 404, så en skrevet eller
 * gammel URL aldri gir feil tall (#2217).
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
  ctx: { params: Promise<{ locale: string; id: string }> },
) {
  const { locale: rawLocale, id } = await ctx.params;
  const locale = hasLocale(routing.locales, rawLocale)
    ? rawLocale
    : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'leaderboard.export' });

  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    return NextResponse.json({ error: t('errors.notLoggedIn') }, { status: 401 });
  }

  const supabase = await getServerClient();

  const gwp = await getGameWithPlayers(id);

  if (!gwp) {
    return NextResponse.json({ error: t('errors.gameNotFound') }, { status: 404 });
  }
  const game = gwp.game;

  // Bare finished-spill kan eksporteres. En mid-runde-eksport ville være
  // misvisende (delvise totaler ville se ut som ferdige), og UI-knappen
  // skjules uansett til status flipper til finished.
  if (game.status !== 'finished') {
    return NextResponse.json(
      { error: t('errors.finishedOnly') },
      { status: 404 },
    );
  }

  if (game.game_mode !== 'best_ball') {
    return NextResponse.json({ error: t('errors.gameNotFound') }, { status: 404 });
  }

  // #1441 (D3): a derived game (source_game_id set) owns no scores of its
  // own — read from the host game instead. Same `?? id` no-op as the
  // leaderboard-page fetch for host games (source_game_id null).
  const scoresGameId = game.source_game_id ?? id;
  // Service-role for a finished game, like the board (#1542/#1632): the
  // viewer's own client gets 0 rows unless they played this match.
  const scoresClient = await getResultReadClient(game.status, supabase);

  const [rawHolesRes, rawScoresRes] = await Promise.all([
    supabase
      .from('course_holes')
      .select(COURSE_HOLES_SELECT)
      .eq('course_id', game.course_id)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
    selectAllRowsResult(
      (from, to) =>
        scoresClient
          .from('scores')
          .select(SCORES_SELECT)
          .eq('game_id', scoresGameId)
          .order('id')
          .range(from, to)
          .returns<ScoreRow[]>(),
      'leaderboard export scores',
    ),
  ]);

  if (rawHolesRes.error) {
    return NextResponse.json(
      { error: t('errors.courseFetchFailed') },
      { status: 500 },
    );
  }
  if (rawScoresRes.error) {
    return NextResponse.json(
      { error: t('errors.scoresFetchFailed') },
      { status: 500 },
    );
  }

  // #1441 (D1/D2): scope both rows down to the game's hole_segment before
  // computing anything — 'full' is a no-op (every hole 1-18, byte-identical
  // to pre-#1441 exports), front9/back9 narrow to their 9 hole numbers so
  // coursePar/totalHoles below sum the segment, not the whole round.
  const scopedHoleNumbers = new Set(holeNumbersForSegment(game.hole_segment));
  const scopedHolesRows = (rawHolesRes.data ?? []).filter((h) =>
    scopedHoleNumbers.has(h.hole_number),
  );
  const scopedScoresRows = (rawScoresRes.data ?? []).filter((s) =>
    scopedHoleNumbers.has(s.hole_number),
  );

  // WD (#386, #2217): same input as the board — a withdrawn player is out of
  // the member list and their strokes out of the team's best ball.
  const { players, holes, scores } = bestBallBoardInput({
    gameMode: game.game_mode,
    modeConfig: game.mode_config,
    roster: gwp.players,
    holeRows: scopedHolesRows,
    scoreRows: scopedScoresRows,
    unknownPlayer: t('unknownPlayer'),
  });

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
  rows.push(csvRow([t('title')]));
  rows.push(csvRow([t('gameLabel'), game.name]));
  rows.push(csvRow([t('exportedLabel'), new Date().toISOString().slice(0, 10)]));
  rows.push(csvRow([t('courseParLabel'), coursePar]));
  rows.push(csvRow([]));

  // Leaderboard-tabell. Kolonner valgt for å være lesbar på utskrift:
  // rank, lag, medlemmer, brutto-total, netto-total, vs par (netto),
  // antall hull spilt.
  rows.push(
    csvRow([
      t('colRank'),
      t('colTeam'),
      t('colPlayers'),
      t('colGross'),
      t('colNet'),
      t('colVsPar'),
      t('colHolesPlayed'),
    ]),
  );

  for (const line of ordered) {
    const brutto = bruttoByTeam.get(line.teamNumber);
    const bruttoTotal = brutto?.total ?? '';
    // #2217: over the holes the team played, like the board; '—' without one.
    const vsPar = teamLineVsPar(line, coursePar);
    const vsParLabel =
      vsPar === null ? '—' : vsPar === 0 ? 'E' : vsPar > 0 ? `+${vsPar}` : String(vsPar);
    const holesPlayed = teamHolesPlayed(line);
    const tiedSuffix = line.tiedWith.length > 0 ? ` ${t('tiedSuffix')}` : '';

    rows.push(
      csvRow([
        `${line.rank}.${tiedSuffix}`,
        t('teamRow', { n: line.teamNumber }),
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
