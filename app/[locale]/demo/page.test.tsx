import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DemoPage, { generateMetadata } from './page';
import { DemoAppPointer } from './DemoAppPointer';
import noMessages from '@/messages/no.json';

// The demo round itself is tested in DemoGame.test.tsx; here only which page
// /demo shows per switch state.
vi.mock('./DemoGame', () => ({
  DemoGame: () => <div data-testid="demo-game" />,
}));

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

function renderDemo() {
  return render(DemoPage());
}

/**
 * #2562, Type B: /demo per switch state. `off`: the demo as today. `ios`: the
 * demo, with the App Store card above it on an iPhone. `on`: a page that
 * points to the app, with both badges, and no demo round.
 */
describe('/demo', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('off: the demo round and nothing else', async () => {
    renderDemo();
    expect(screen.getByTestId('demo-game')).toBeInTheDocument();
    expect(screen.queryByTestId('get-the-app')).toBeNull();
    expect(screen.queryByTestId('demo-app-pointer')).toBeNull();
  });

  it('ios: the demo, with the App Store card above it on an iPhone', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_LAUNCH', 'ios');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE);
    renderDemo();
    expect(screen.getByTestId('demo-game')).toBeInTheDocument();
    expect(screen.getByTestId('store-badge-appStore')).toBeInTheDocument();
    expect(screen.queryByTestId('store-badge-googlePlay')).toBeNull();
  });

  it('ios: no card on a PC', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_LAUNCH', 'ios');
    renderDemo();
    expect(screen.getByTestId('demo-game')).toBeInTheDocument();
    expect(screen.queryByTestId('get-the-app')).toBeNull();
  });

  it('on: the page that points to the app, both badges, no demo round', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_LAUNCH', 'on');
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
    vi.stubEnv('NEXT_PUBLIC_APP_LAUNCH', flag);
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: 'no' }),
    });
    expect(meta.title).toBe(title);
    expect(meta.description).toBe(description);
  });
});
