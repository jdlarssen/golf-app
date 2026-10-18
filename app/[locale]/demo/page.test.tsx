import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DemoPage, { generateMetadata } from './page';
import { DemoAppPointer } from './DemoAppPointer';
import noMessages from '@/messages/no.json';
import {
  resetLaunchAndDevice,
  setDevice,
  setLaunch,
} from '@/lib/app/__tests__/_helpers';

// The demo round itself is tested in DemoGame.test.tsx; here only which page
// /demo shows per switch state.
vi.mock('./DemoGame', () => ({
  DemoGame: () => <div data-testid="demo-game" />,
}));

function renderDemo() {
  return render(DemoPage());
}

/**
 * #2562, Type B: /demo per switch state. `off`: the demo as today. `ios`: the
 * demo, with the App Store card above it on an iPhone. `on`: a page that
 * points to the app, with both badges, and no demo round.
 */
describe('/demo', () => {
  afterEach(resetLaunchAndDevice);

  it('off: the demo round and nothing else', async () => {
    renderDemo();
    expect(screen.getByTestId('demo-game')).toBeInTheDocument();
    expect(screen.queryByTestId('get-the-app')).toBeNull();
    expect(screen.queryByTestId('demo-app-pointer')).toBeNull();
  });

  it('ios: the demo, with the App Store card above it on an iPhone', async () => {
    setLaunch('ios');
    setDevice('iphone');
    renderDemo();
    expect(screen.getByTestId('demo-game')).toBeInTheDocument();
    expect(screen.getByTestId('store-badge-appStore')).toBeInTheDocument();
    expect(screen.queryByTestId('store-badge-googlePlay')).toBeNull();
  });

  it('ios: no card on a PC', async () => {
    setLaunch('ios');
    renderDemo();
    expect(screen.getByTestId('demo-game')).toBeInTheDocument();
    expect(screen.queryByTestId('get-the-app')).toBeNull();
  });

  it('on: the page that points to the app, both badges, no demo round', async () => {
    setLaunch('on');
    // The page's only child is the pointer, an async server component, which
    // is awaited and rendered on its own.
    const page = DemoPage() as React.ReactElement<{ children: React.ReactElement }>;
    expect(page.props.children.type).toBe(DemoAppPointer);
    render(await DemoAppPointer());
    expect(screen.queryByTestId('demo-game')).toBeNull();
    expect(screen.getByTestId('demo-app-pointer')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: noMessages.demo.pointer.title }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('store-badge-appStore')).toBeInTheDocument();
    expect(screen.getByTestId('store-badge-googlePlay')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: new RegExp(noMessages.demo.pointer.webLink) }),
    ).toHaveAttribute('href', '/login');
  });

  it.each([
    [undefined, noMessages.demo.pageTitle, noMessages.demo.metaDescription],
    ['ios', noMessages.demo.pageTitle, noMessages.demo.metaDescription],
    ['on', noMessages.demo.pageTitleLaunched, noMessages.demo.metaDescriptionLaunched],
  ])('metadata with %s', async (flag, title, description) => {
    setLaunch(flag);
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: 'no' }),
    });
    expect(meta.title).toBe(title);
    expect(meta.description).toBe(description);
  });
});
