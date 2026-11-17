import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';
export type ThemePreference = 'system' | Theme;

export const THEME_STORAGE_KEY = 'tincan.theme';

/**
 * Light/dark theme with the OS setting as the default. The toggle flips the theme you see; picking the
 * same theme as the OS clears the stored choice, so you are back to following the system without a
 * third "auto" state to explain. The choice is reflected as data-theme on <html> (see styles.scss).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly root = inject(DOCUMENT).documentElement;
  private readonly media = queryDark(inject(DOCUMENT).defaultView);

  readonly preference = signal<ThemePreference>(readPreference());
  private readonly systemDark = signal(this.media?.matches ?? false);

  /** The theme actually on screen. */
  readonly theme = computed<Theme>(() => {
    const preference = this.preference();
    if (preference !== 'system') return preference;
    return this.systemDark() ? 'dark' : 'light';
  });

  constructor() {
    const onChange = (event: MediaQueryListEvent) => this.systemDark.set(event.matches);
    this.media?.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => this.media?.removeEventListener('change', onChange));

    effect(() => {
      const preference = this.preference();
      if (preference === 'system') this.root.removeAttribute('data-theme');
      else this.root.setAttribute('data-theme', preference);
    });
  }

  toggle(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    const system: Theme = this.systemDark() ? 'dark' : 'light';
    const preference: ThemePreference = next === system ? 'system' : next;
    this.preference.set(preference);
    writePreference(preference);
  }
}

function queryDark(view: Window | null): MediaQueryList | null {
  return typeof view?.matchMedia === 'function'
    ? view.matchMedia('(prefers-color-scheme: dark)')
    : null;
}

// localStorage holds only this UI preference (light/dark), never session data or key material.
// Every access is guarded: storage can be disabled or throw (private mode, blocked cookies).
function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function writePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Not persisted; the theme still applies for this page view.
  }
}
