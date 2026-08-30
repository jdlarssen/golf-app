// Supabase client for the native spike (#1818), per the official React Native
// setup: AsyncStorage as session store, auto-refresh tied to AppState.
// detectSessionInUrl must be off — there is no URL to detect in an app.
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
// Same generated schema the web app uses (#1823) — type-only, so nothing from
// the web graph ends up in the bundle. It is what types the RPC arguments and
// the row that comes back from `upsert_score_if_newer`.
import type { Database } from '../../../lib/database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Mangler EXPO_PUBLIC_SUPABASE_URL/_ANON_KEY — kopier staging-verdiene inn i native/app/.env.local (se docs/native/app-spike.md).'
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/**
 * Who is logged in on THIS device (#1368) — mirror of `lib/sync/currentUser.ts`.
 *
 * Every path that may overwrite a local number needs it, and a sync path must
 * never break on the lookup: `getSession` reads local storage and resolves
 * offline (which is exactly when the queue fills up), and any failure returns
 * null so `conflictRecordFor` falls back to its pre-#1368 proxy.
 */
export async function currentDeviceUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
