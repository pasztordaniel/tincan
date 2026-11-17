import { TestBed } from '@angular/core/testing';
import { THEME_STORAGE_KEY, ThemeService } from './theme.service';

let systemDark = false;
let listeners: ((event: MediaQueryListEvent) => void)[] = [];

function stubMatchMedia(): void {
  listeners = [];
  window.matchMedia = ((query: string) => ({
    matches: systemDark,
    media: query,
    addEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) => listeners.push(cb),
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

function create(): ThemeService {
  stubMatchMedia();
  const service = TestBed.inject(ThemeService);
  TestBed.tick();
  return service;
}

const html = () => document.documentElement;

describe('ThemeService', () => {
  beforeEach(() => {
    systemDark = false;
    localStorage.clear();
    html().removeAttribute('data-theme');
  });
  afterEach(() => vi.restoreAllMocks());

  it('follows the system theme by default and leaves <html> unforced', () => {
    systemDark = true;
    const themes = create();
    expect(themes.preference()).toBe('system');
    expect(themes.theme()).toBe('dark');
    expect(html().hasAttribute('data-theme')).toBe(false);
  });

  it('tracks live changes of the system theme', () => {
    const themes = create();
    expect(themes.theme()).toBe('light');
    listeners.forEach((cb) => cb({ matches: true } as MediaQueryListEvent));
    expect(themes.theme()).toBe('dark');
  });

  it('resolves a stored preference over the system theme', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const themes = create();
    expect(themes.theme()).toBe('dark');
    expect(html().getAttribute('data-theme')).toBe('dark');
  });

  it('ignores junk in storage', () => {
    localStorage.setItem(THEME_STORAGE_KEY, '<script>');
    expect(create().preference()).toBe('system');
  });

  it('toggles away from the system theme, then back to following it', () => {
    const themes = create();

    themes.toggle();
    TestBed.tick();
    expect(themes.theme()).toBe('dark');
    expect(html().getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    themes.toggle();
    TestBed.tick();
    expect(themes.preference()).toBe('system');
    expect(themes.theme()).toBe('light');
    expect(html().hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('defaults to system and still toggles when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const themes = create();
    expect(themes.preference()).toBe('system');

    expect(() => themes.toggle()).not.toThrow();
    TestBed.tick();
    expect(html().getAttribute('data-theme')).toBe('dark');
  });
});
