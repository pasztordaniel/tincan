import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type CanRole, type LineState, pillContent } from './status-pill.model';

/**
 * Connection status: tinted background + icon + text, so color is never the only signal.
 * role="status" makes state changes announce politely to screen readers.
 */
@Component({
  selector: 'app-status-pill',
  template: `
    <span [class]="'pill pill--' + state()" role="status" [attr.data-icon]="content().icon">
      <svg class="pill__icon" viewBox="0 0 24 12" width="24" height="12" aria-hidden="true">
        @switch (content().icon) {
          @case ('dot') {
            <circle class="pill__dot" cx="12" cy="6" r="3.5" />
          }
          @case ('taut') {
            <path d="M2 6H22" />
            <circle cx="2.5" cy="6" r="2" class="pill__end" />
            <circle cx="21.5" cy="6" r="2" class="pill__end" />
          }
          @case ('snip') {
            <path d="M2 8H22" />
            <path d="M8.5 0.5L12 5.5L15.5 0.5" class="pill__x" />
          }
          @case ('slack') {
            <path class="pill__wave" d="M2 6C6 1 8 1 12 6S18 11 22 6" />
          }
          @case ('cut') {
            <path d="M2 6H9M15 6H22" />
            <path d="M10.5 2.5L13.5 9.5M13.5 2.5L10.5 9.5" class="pill__x" />
          }
        }
      </svg>
      <span>{{ content().text }}</span>
    </span>
  `,
  styles: `
    .pill {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-1) var(--space-3);
      border-radius: var(--radius-pill);
      font-size: var(--text-sm);
      font-weight: var(--weight-medium);
      line-height: var(--leading-tight);
      background: var(--pill-bg);
      color: var(--pill-fg);
      border: 1px solid color-mix(in srgb, var(--pill-fg) 25%, transparent);
    }
    .pill--waiting {
      --pill-bg: var(--tone-waiting-bg);
      --pill-fg: var(--tone-waiting-fg);
    }
    .pill--connected {
      --pill-bg: var(--tone-connected-bg);
      --pill-fg: var(--tone-connected-fg);
    }
    .pill--idle {
      --pill-bg: var(--tone-warning-bg);
      --pill-fg: var(--tone-warning-fg);
    }
    .pill--reconnecting {
      --pill-bg: var(--tone-reconnecting-bg);
      --pill-fg: var(--tone-reconnecting-fg);
    }
    .pill--ended {
      --pill-bg: var(--tone-ended-bg);
      --pill-fg: var(--tone-ended-fg);
    }
    .pill__icon {
      flex: none;
      overflow: visible;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
    }
    .pill__dot,
    .pill__end {
      fill: currentColor;
      stroke: none;
    }
    @media (prefers-reduced-motion: no-preference) {
      .pill__dot {
        animation: pill-pulse 1.6s ease-in-out infinite;
        transform-origin: center;
        transform-box: fill-box;
      }
      .pill__wave {
        animation: pill-sway 1.8s ease-in-out infinite alternate;
        transform-origin: center;
        transform-box: fill-box;
      }
    }
    @keyframes pill-pulse {
      50% {
        opacity: 0.35;
        transform: scale(0.7);
      }
    }
    @keyframes pill-sway {
      to {
        transform: scaleY(-1);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusPill {
  readonly state = input.required<LineState>();
  readonly role = input<CanRole>('sender');

  protected readonly content = computed(() => pillContent(this.state(), this.role()));
}
