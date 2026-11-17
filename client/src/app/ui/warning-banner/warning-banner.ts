import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BannerTone = 'warning' | 'info';

/**
 * Inline banner for things the user must not miss (integrity failures, the sender's "nothing will be
 * sent" note). Warnings use role="alert" so they are announced immediately; info uses role="status".
 * A leading glyph and a bold title carry the meaning, not just the tint.
 */
@Component({
  selector: 'app-warning-banner',
  template: `
    <div [class]="'banner banner--' + tone()" [attr.role]="role()">
      <svg class="banner__icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        @if (tone() === 'warning') {
          <path d="M12 3L22 20H2Z" class="banner__shape" />
          <path d="M12 9.5V14M12 17V17.2" class="banner__mark" />
        } @else {
          <circle cx="12" cy="12" r="9.5" class="banner__shape" />
          <path d="M12 11V16.5M12 7.5V7.7" class="banner__mark" />
        }
      </svg>
      <div class="banner__body">
        @if (heading()) {
          <p class="banner__title">{{ heading() }}</p>
        }
        <div class="banner__text"><ng-content /></div>
      </div>
    </div>
  `,
  styles: `
    .banner {
      display: flex;
      gap: var(--space-3);
      align-items: flex-start;
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      border: 1px solid var(--banner-border);
      border-left-width: 4px;
      background: var(--banner-bg);
      color: var(--banner-fg);
      font-size: var(--text-sm);
    }
    .banner--warning {
      --banner-bg: var(--tone-warning-bg);
      --banner-fg: var(--tone-warning-fg);
      --banner-border: var(--tone-warning-border);
    }
    .banner--info {
      --banner-bg: var(--tone-info-bg);
      --banner-fg: var(--tone-info-fg);
      --banner-border: var(--tone-info-fg);
    }
    .banner__icon {
      flex: none;
      margin-top: -1px;
    }
    .banner__shape {
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linejoin: round;
    }
    .banner__mark {
      stroke: currentColor;
      stroke-width: 2.4;
      stroke-linecap: round;
    }
    .banner__title {
      font-weight: var(--weight-bold);
      margin-bottom: var(--space-1);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WarningBanner {
  readonly tone = input<BannerTone>('warning');
  readonly heading = input('');
  /**
   * Off when something else already announces the change (the sender's idle warning lets the status
   * pill speak once, so a ticking countdown inside the banner is never read out every second).
   */
  readonly announce = input(true);

  protected readonly role = computed(() =>
    !this.announce() ? null : this.tone() === 'warning' ? 'alert' : 'status',
  );
}
