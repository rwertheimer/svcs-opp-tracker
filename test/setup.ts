import '@testing-library/jest-dom';

// MSW (optional: no handlers by default; tests may opt-in if needed)
import { setupServer } from 'msw/node';
export const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Polyfills for JSDOM
if (!('IntersectionObserver' in globalThis)) {
  // Minimal polyfill adequate for most component effects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).IntersectionObserver = class {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(callback: any, options?: any) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
// Avoid errors when code calls smooth scroll
if (!('scrollTo' in window)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).scrollTo = () => {};
}
