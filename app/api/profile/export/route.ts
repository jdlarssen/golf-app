import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';
import { buildUserExport } from '@/lib/profile/exportCore';

// «Last ned dataene dine» for native-appen (#2332).
//
// Nettsiden laster ned fila fra `/profile/export` med cookie-sesjonen; appen har
// ingen cookies og spør her med Bearer-tokenet sitt. Ruta er bare transport
// foran `buildUserExport` i `lib/profile/exportCore.ts`: hvilke tabeller fila
// har og hvordan hver leses, har ett hjem der, så nettsiden og appen gir samme
// fil (AGENTS trap 4).
//
// AUTH: `authenticatedUserId` i `lib/api/appAuth.ts` — den delte adgangssjekken
// for app→server-rutene (#1891). Bruker-id-en kommer KUN fra det validerte
// tokenet. Ruta leser ingen id fra query, body eller header, så det finnes ingen
// vei til en annens data. Lesingene som ikke går med service-rollen, går
// gjennom `callerScopedClient`: anon-nøkkelen og kallerens token, så RLS gjelder
// som for spilleren selv.
//
// WIRE (frosset — appen speiler den, se `native/app/src/data/dataExport.ts`):
//   GET 200 <eksportobjektet som JSON: exported_at, user, game_players, …>
//       401 { error: 'unauthorized' }
//       500 { error: 'export_failed' }
//
// Feil-bodyene er faste, ugjennomsiktige koder. Endepunktet er offentlig
// eksponert, så `err.message` (Postgres-detaljer, env-navn) skal aldri ut.

// Eksporten er mange rundturer (token-validering og en lesing per tabell, noen
// av dem i sider). Eneste segment-eksporten repoet bruker; `dynamic`/
// `revalidate`/`runtime` er inkompatible med `cacheComponents` (next.config.ts).
export const maxDuration = 60;

const LOG_PREFIX = 'api/profile/export';

function exportFailed() {
  return NextResponse.json({ error: 'export_failed' }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // Tokenet er validert over, så `null` her betyr manglende anon-nøkkel eller
    // adresse i miljøet — en feil hos oss, ikke hos kalleren.
    const rlsClient = callerScopedClient(request);
    if (!rlsClient) {
      console.error(`[${LOG_PREFIX}] caller client missing`);
      return exportFailed();
    }

    const result = await buildUserExport(userId, rlsClient);
    if (!result.ok) {
      console.error(`[${LOG_PREFIX}] ${result.read} failed`, result.error);
      return exportFailed();
    }
    return NextResponse.json(result.payload);
  } catch (err) {
    console.error(`[${LOG_PREFIX}] export threw`, err);
    return exportFailed();
  }
}
