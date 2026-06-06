'use server';

import { deleteLeague } from '@/lib/league/actions';

/** Thin void wrapper so <form action={…}> is satisfied (deleteLeague returns LeagueActionError on err, redirects on ok). */
export async function handleDeleteLeague(formData: FormData): Promise<void> {
  await deleteLeague(formData);
}
