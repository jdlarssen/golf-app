import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Stub next/navigation so components that call useRouter / usePathname /
// useSearchParams (e.g. SmartLink) don't throw "invariant: app router not
// mounted" during unit tests.
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    pathname: '/',
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
