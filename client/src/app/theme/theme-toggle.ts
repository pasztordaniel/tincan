import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ThemeService } from './theme.service';

/**
 * Small sun/moon switch pinned to a corner. A toggle button with a fixed name ("Dark theme") and
 * aria-pressed, so screen readers hear the current theme and what pressing does.
 */
@Component({
  selector: 'app-theme-toggle',
  template: `
    <button
      type="button"
      class="toggle"
      aria-label="Dark theme"
      [attr.aria-pressed]="dark()"
      [title]="dark() ? 'Switch to light theme' : 'Switch to dark theme'"
      (click)="themes.toggle()"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        @if (dark()) {
          <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />
        } @else {
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2.5V4.5M12 19.5V21.5M2.5 12H4.5M19.5 12H21.5M5.3 5.3L6.7 6.7M17.3 17.3L18.7 18.7M5.3 18.7L6.7 17.3M17.3 6.7L18.7 5.3"
          />
        }
      </svg>
    </button>
  `,
  styles: `
    :host {
      position: fixed;
      top: var(--space-3);
      right: var(--space-3);
      z-index: 10;
    }
    .toggle {
      display: grid;
      place-items: center;
      width: 2.75rem;
      height: 2.75rem;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-text);
      box-shadow: var(--shadow-sm);
      cursor: pointer;
    }
    .toggle:hover { background: var(--color-surface-muted); }
    svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeToggle {
  protected readonly themes = inject(ThemeService);
  protected readonly dark = computed(() => this.themes.theme() === 'dark');
}
