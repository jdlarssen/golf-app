'use client';

import type { ComponentProps } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { appLaunchFlag, deviceStoreUrl } from '@/lib/app/appLaunch';
import { useStorePlatform } from '@/hooks/useStorePlatform';

type Props = Omit<ComponentProps<'a'>, 'href'> & { href: string };

/**
 * The link behind a demo button (#2562, owner's answer 1). With
 * `NEXT_PUBLIC_APP_LAUNCH=on` it goes straight to the store on an iPhone/iPad
 * or an Android phone once the page has hydrated. The server render, the
 * first render and a PC keep `href` (`/demo`, the page with both badges).
 * With `off` and `ios` it is the plain SmartLink it replaces.
 *
 * The store link is a plain `<a>`: it leaves the site, so there is nothing
 * for the router to prefetch.
 */
export function AppCtaLink({ href, ...rest }: Props) {
  const platform = useStorePlatform();
  const storeUrl = deviceStoreUrl(appLaunchFlag(), platform);
  if (storeUrl) return <a href={storeUrl} {...rest} />;
  return <SmartLink href={href} {...rest} />;
}
