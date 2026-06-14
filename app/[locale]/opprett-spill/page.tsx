import { first } from '@/lib/url/searchParams';
import { Suspense } from 'react';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { Skeleton } from '@/components/ui/Skeleton';
import { GameWizard } from '@/app/[locale]/admin/games/new/GameWizard';
import {
  createGameDraft,
  createAndPublishGame,
} from '@/app/[locale]/admin/games/new/actions';
import { getNewGameFormData } from '@/lib/games/newGameFormData';
import { getServerClient } from '@/lib/supabase/server';
import { getRoleContext } from '@/lib/admin/auth';
import {
  getFormatsForIntent,
  getCupEligibleFormats,
} from '@/lib/formats/getFormatsForIntent';
import { getFormatGuideEntries } from '@/lib/formats/buildFormatGuide';
import { getFriendPlayerOptions } from '@/lib/friends/getFriendPlayerOptions';
import { getClubMemberPlayerOptions } from '@/lib/clubs/getClubMemberPlayerOptions';
import { isClubAdminAnywhere } from '@/lib/clubs/isClubAdminAnywhere';

// Opprett-spill-ruten for ALLE innloggede brukere (#427 — tidligere bare
// admin/trusted per #198). Gjenbruker GameWizard fra admin-flyten, men kjører
// i AppShell (ikke AdminShell/Sekretariatet) så vanlige brukere aldri ser
// admin-shellen. createGameInternal bouncer nå validerings-/publiseringsfeil
// tilbake hit (ikke til /admin/games/new) for ikke-admins.

type SearchParams = Promise<{
  error?: string | string[];
  emails?: string | string[];
  // #442: klubb-side kan dyplenke med forhåndsvalgt klubb.
  klubb?: string | string[];
}>;

export default async function OpprettSpillPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Gate FØR vi rendrer noe — enhver innlogget bruker slipper inn (#427).
  const locale = await getLocale();
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });
  const currentUserId = (user as NonNullable<typeof user>).id;
  // #477: «Solo / Test»-arrangementet vises kun for admin i veiviseren.
  const { isAdmin } = await getRoleContext(supabase);

  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: 'wizard' });

  function buildErrorMessage(
    errorCode: string | undefined,
    emails: string | undefined,
  ): string | undefined {
    if (!errorCode) return undefined;
    const key = `errors.${errorCode}` as Parameters<typeof t>[0];
    // Unknown codes render no banner (mirrors the legacy map-lookup miss).
    if (!t.has(key)) return undefined;
    // Only pending_players uses {list}; extra values are ignored elsewhere.
    return t(key, { list: emails ? `: ${emails}` : '' });
  }

  const errorMessage = buildErrorMessage(first(sp.error), first(sp.emails));

  return (
    <AppShell>
      <TopBar backHref="/" kicker={t('createDoor.kicker')} />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {t('createDoor.heading')}
        </h1>
        <p className="font-sans text-[11.5px] text-muted">
          {t('createDoor.subtitle')}
        </p>
      </div>

      {errorMessage && (
        <div className="mt-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <Suspense fallback={null}>
        <PlayerShortageBanner />
      </Suspense>

      <div className="mt-5">
        <Card>
          <Suspense fallback={<GameFormSkeleton />}>
            <GameFormBody
              defaultGroupId={first(sp.klubb)}
              userId={currentUserId}
              isAdmin={isAdmin}
            />
          </Suspense>
        </Card>
      </div>
    </AppShell>
  );
}

async function PlayerShortageBanner() {
  // includeEmail=false (#435): non-admin create must not leak co-players'
  // e-postadresser into the page payload. Same `(false)` arg here and in
  // GameFormBody so React `cache` dedupes the two Suspense reads.
  const { players } = await getNewGameFormData(false);
  if (players.length >= 8) return null;
  const t = await getTranslations('wizard');
  const isSingular = players.length === 1;
  const bannerText =
    players.length === 0
      ? t('createDoor.shortageBannerZero')
      : t('createDoor.shortageBannerSome', {
          count: players.length,
          suffix: isSingular ? '' : 'e',
          plural: isSingular ? '' : 'e',
        });
  return (
    <div className="mt-4">
      <Banner tone="info">
        {bannerText}{' '}
        {t('createDoor.shortageBannerNote')}{' '}
        <SmartLink href="/" className="underline hover:no-underline">
          {t('createDoor.shortageBannerLink')}
        </SmartLink>
        {t('createDoor.shortageBannerSuffix')}
      </Banner>
    </div>
  );
}

async function GameFormBody({
  defaultGroupId,
  userId,
  isAdmin,
}: {
  defaultGroupId: string | undefined;
  userId: string;
  isAdmin: boolean;
}) {
  // F2 (#272): pre-fetch format-katalog parallelt med courses/players.
  const [
    kompisFormats,
    klubbFormats,
    soloFormats,
    cupEligibleFormats,
    formatGuide,
  ] = await Promise.all([
    getFormatsForIntent('kompis'),
    getFormatsForIntent('klubb'),
    getFormatsForIntent('solo'),
    getCupEligibleFormats(),
    getFormatGuideEntries(),
  ]);
  const [{ courses, players, clubs }, friendPlayers, clubMembers, isClubAdmin] =
    await Promise.all([
      getNewGameFormData(false),
      // #464: vennene til brukeren — picker-kilde for kompis/cup. Hentes som hele
      // PlayerOption-rader fordi users-RLS skjuler venner du aldri har spilt med.
      getFriendPlayerOptions(userId).catch(() => []),
      // #464: klubbmedlemmer — picker-kilde for klubb-intent. Må merges inn (under)
      // fordi medlemmer som ikke er co-players ellers ville forsvinne fra rosteren.
      getClubMemberPlayerOptions(userId).catch(() => ({
        memberIdsByClub: {},
        options: [],
      })),
      // #525: er brukeren klubb-admin? Styrer om «Klubb-turnering»-flisen vises.
      isClubAdminAnywhere(userId),
    ]);
  // Union venner + klubbmedlemmer inn i spiller-lista (dedup på id) så picker-
  // kilden har rad-data for alle, uansett om du har delt et spill med dem (#464).
  // Co-players ligger allerede i `players`.
  const seen = new Set(players.map((p) => p.id));
  const mergedPlayers = [...players];
  for (const extra of [...friendPlayers, ...clubMembers.options]) {
    if (!seen.has(extra.id)) {
      seen.add(extra.id);
      mergedPlayers.push(extra);
    }
  }
  const friendPlayerIds = friendPlayers.map((f) => f.id);
  return (
    <GameWizard
      courses={courses}
      players={mergedPlayers}
      mode={{
        kind: 'create',
        createDraftAction: createGameDraft,
        createAndPublishAction: createAndPublishGame,
      }}
      formatsByIntent={{
        kompis: kompisFormats,
        klubb: klubbFormats,
        solo: soloFormats,
      }}
      cupEligibleFormats={cupEligibleFormats}
      clubs={clubs}
      defaultGroupId={defaultGroupId}
      // En ?klubb=-dyplenke er en klubb-arrangement-flyt → pre-velg klubb-intent
      // så ClubPicker (kun for klubb-intent) viser den forhåndsvalgte klubben (#50-fix).
      initialIntent={defaultGroupId ? 'klubb' : undefined}
      friendPlayerIds={friendPlayerIds}
      clubMemberIdsByClub={clubMembers.memberIdsByClub}
      currentUserId={userId}
      isAdmin={isAdmin}
      isClubAdmin={isClubAdmin}
      formatGuide={formatGuide}
    />
  );
}

function GameFormSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" delay={60} />
      <Skeleton className="h-32 w-full rounded-lg" delay={120} />
      <Skeleton className="h-32 w-full rounded-lg" delay={180} />
      <Skeleton className="h-12 w-full rounded-full" delay={240} />
    </div>
  );
}
