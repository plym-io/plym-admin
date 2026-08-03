import '@testing-library/jest-dom/vitest';

// jsdom implements no layout, so it ships neither of these. cmdk observes its
// list to size the popover, and the theme store asks matchMedia what the OS
// prefers — both would throw on mount and take the component under test with
// them.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Same reason: scrolling the active item into view is a no-op without layout.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
