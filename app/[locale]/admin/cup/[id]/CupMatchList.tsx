import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { getRoleContext } from '@/lib/admin/auth';
import { getCupCandidatePlayers } from '@/lib/cup/getCupCandidatePlayers';
import type { CupRoster, CupRosterPlayer } from '@/lib/cup/getCupSnapshot';
import type { CupMatchSummary } from '@/lib/cup/computeCupLeaderboard';
import {
  cupMatchStatusKey,
  CUP_MATCH_STATUS_MESSAGE_KEY,
} from '@/lib/cup/cupMatchStatusLabel';
import { SwapMatchPlayer, type SwapPlayerOption } from './SwapMatchPlayer';

/**
 * Reservene arrangøren kan bytte inn i en ikke-startet match (#1473).
 *
 * Kilden er cupens KANDIDATLISTE, ikke deltakerlista: den som stiller opp
 * kvelden før rakk sjelden å melde seg på. Samme helper — og dermed samme
 * rolle-semantikk — som Spillere-rommet og generer-veiviseren bruker:
 * klubb-cup → klubbens medlemmer, personlig cup → arrangørens venner (alle
 * profil-fullførte for en global admin).
 *
 * Pending kandidater (venn uten fullført profil) filtreres bort her, akkurat
 * som de er ikke-valgbare i veiviseren. Serveren avviser dem uansett
 * (`profile_incomplete`) — lista er UX, guarden er håndhevelsen.
 */
async function fetchCupSwapCandidateOptions(
  groupId: string | null,
  unknownLabel: string,
): Promise<SwapPlayerOption[]> {
  const supabase = await getServerClient();
  const { userId, isAdmin } = await getRoleContext(supabase);
  const candidates = await getCupCandidatePlayers(supabase, {
    groupId,
    userId,
    isAdmin,
    unknownLabel,
  });

  return candidates
    .filter((c) => !c.pending)
    .map((c) => ({ userId: c.id, label: c.displayName }))
    .sort((a, b) => a.label.localeCompare(b.label, 'no'));
}

/**
 * Matches-lista på cup-styringsflata (#1473, trukket ut av `CupManagement` for
 * å holde komponentens cyclomatic complexity nede). Rendrer hvert match-kort
 * med nøytral status, admin/klubb-nedboring og «Bytt spiller»-panelet for
 * ennå ikke startede matcher.
 *
 * Variant-forskjeller: admin borer ned i full game-admin (SmartLink til
 * /admin/games/[id]) mens club-varianten lenker ferdige matcher til kampens
 * leaderboard (#1456) og viser uferdige som rene info-kort.
 */
export async function CupMatchList({
  tournamentId,
  isClub,
  groupId,
  matches,
  roster,
  team1Name,
  team2Name,
}: {
  tournamentId: string;
  isClub: boolean;
  groupId: string | null;
  matches: CupMatchSummary[];
  roster: CupRoster;
  team1Name: string;
  team2Name: string;
}) {
  const t = await getTranslations('cup');
  const unknownLabel = t('manage.unknownPlayer');

  function preferredName(p: CupRosterPlayer): string {
    return p.nickname?.trim() || p.name?.trim() || unknownLabel;
  }

  // #1473: «Bytt spiller» finnes kun på matcher som ennå ikke er startet, så
  // kandidatlista hentes bare når det faktisk står en slik match på lista.
  const hasScheduledMatch = matches.some((m) => m.status === 'scheduled');
  const swapCandidates = hasScheduledMatch
    ? await fetchCupSwapCandidateOptions(groupId, unknownLabel)
    : [];

  // Navn på alle som allerede står i en match — rosteret dekker dem, også
  // spillere som ikke ligger i `tournament_participants` (eldre cuper der
  // matchene ble generert rett fra pickeren).
  const matchPlayerNames = new Map<string, string>(
    [...roster.team1, ...roster.team2].map((p) => [p.userId, preferredName(p)]),
  );

  /**
   * Valgene for ett match-kort. Bunten (host + avledede, #1441 D3) løses fra
   * snapshotet — arrangøren skal kunne bytte fra hvilket som helst kort i
   * bunten, og reserven må ikke allerede stå i NOEN av buntens matcher.
   */
  function swapOptionsFor(match: CupMatchSummary): {
    outOptions: SwapPlayerOption[];
    inOptions: SwapPlayerOption[];
  } {
    const root = match.sourceGameId ?? match.gameId;
    const bundle = matches.filter(
      (x) => (x.sourceGameId ?? x.gameId) === root,
    );
    const team1Ids = new Set(bundle.flatMap((x) => x.team1UserIds ?? []));
    const bundleIds: string[] = [];
    for (const x of bundle) {
      for (const uid of [...(x.team1UserIds ?? []), ...(x.team2UserIds ?? [])]) {
        if (!bundleIds.includes(uid)) bundleIds.push(uid);
      }
    }
    return {
      outOptions: bundleIds.map((uid) => ({
        userId: uid,
        label: `${matchPlayerNames.get(uid) ?? unknownLabel} (${
          team1Ids.has(uid) ? team1Name : team2Name
        })`,
      })),
      inOptions: swapCandidates.filter((c) => !bundleIds.includes(c.userId)),
    };
  }

  return (
    <section className="mb-5">
      <div className="mb-2">
        <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          {t('manage.matchesHeading')}
        </h2>
      </div>
      {matches.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            {t('manage.emptyMatches')}
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {matches.map((m) => {
            // Resultater bor på resultatsiden (#1468) — her kun kampene og en
            // nøytral status. Ferdig match viser «Spilt», ikke poeng. #1502:
            // delt status-label gir «Scorekort levert» når alt er levert.
            // #1488 (K9): `data-status` bærer den språk-uavhengige status-
            // nøkkelen så e2e kan asserte avledet-arven uten norsk copy.
            const statusKey = cupMatchStatusKey({
              status: m.status,
              allScorecardsSubmitted: m.allScorecardsSubmitted ?? false,
            });
            const statusLabel = t(CUP_MATCH_STATUS_MESSAGE_KEY[statusKey]);
            const card = (
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                      {m.matchLabel ?? t('matchFallback')}
                    </p>
                    <p className="font-serif text-base text-text mt-1">
                      {m.team1PlayerName}{' '}
                      <span className="text-muted">{t('manage.mot')}</span>{' '}
                      {m.team2PlayerName}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className="text-xs text-muted"
                      data-testid={`cup-match-status-${m.gameId}`}
                      data-status={statusKey}
                    >
                      {statusLabel}
                    </p>
                  </div>
                </div>
              </Card>
            );
            // Admin borer ned i full game-admin; klubb-varianten lenker
            // FERDIGE matcher til kampens leaderboard (#1456) — ruta er åpen
            // for alle innloggede først etter finish, så uferdige matcher
            // forblir rene info-kort (ellers 404 for klubb-styrere utenfor
            // kampen).
            const href = isClub
              ? m.status === 'finished'
                ? `/games/${m.gameId}/leaderboard?from=/klubber/${groupId}/cup/${tournamentId}`
                : null
              : `/admin/games/${m.gameId}`;
            // #1473: bytte-panelet ligger UTENFOR kort-lenken — en knapp inne
            // i en <a> ville navigert i stedet for å åpne panelet.
            const swap =
              m.status === 'scheduled' ? swapOptionsFor(m) : null;
            return (
              <li key={m.gameId}>
                {href ? <SmartLink href={href}>{card}</SmartLink> : card}
                {swap && (
                  <SwapMatchPlayer
                    tournamentId={tournamentId}
                    gameId={m.gameId}
                    outOptions={swap.outOptions}
                    inOptions={swap.inOptions}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
