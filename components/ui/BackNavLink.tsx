'use client';

import type { ComponentProps } from 'react';
import { useBackNavigation } from '@/lib/nav/useBackNavigation';
import { SmartLink } from './SmartLink';

/**
 * The one link every back arrow on the web is drawn with (#2746,
 * `docs/user-flows.md` §Tilbake). It looks like nothing on its own, so each
 * arrow keeps its box and glyph. A click goes where you came from; `href` is the
 * fallback and the target of a long press.
 */
export function BackNavLink(props: Omit<ComponentProps<typeof SmartLink>, 'onClick'>) {
  const onClick = useBackNavigation();
  return <SmartLink {...props} onClick={onClick} />;
}
