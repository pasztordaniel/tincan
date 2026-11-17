import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

/** How long the "Copied" confirmation stays visible. */
export const COPIED_FEEDBACK_MS = 2500;

let nextId = 0;

/**
 * The thread link with a copy button and the trust reminder (docs/design.md, screen 2 and addition 5).
 * The input is read-only so the link cannot be edited by accident, but it stays selectable for manual copy.
 */
@Component({
  selector: 'app-link-card',
  template: `
    <div class="link">
      <label class="link__label" [for]="inputId">Thread link</label>
      <div class="link__row">
        <input
          #field
          class="link__input"
          [id]="inputId"
          type="text"
          readonly
          spellcheck="false"
          autocomplete="off"
          [value]="link()"
          (focus)="field.select()"
        />
        <button
          type="button"
          class="link__copy"
          [attr.aria-label]="copied() ? 'Link copied' : 'Copy link'"
          (click)="copy()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            @if (copied()) {
              <path class="link__check" pathLength="1" d="M5 12.5L10 17.5L19 7.5" />
            } @else {
              <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
              <path
                d="M15.5 5.5V5A1.5 1.5 0 0 0 14 3.5H6A1.5 1.5 0 0 0 4.5 5V13A1.5 1.5 0 0 0 6 14.5H6.5"
              />
            }
          </svg>
        </button>
      </div>
      <p class="link__feedback" role="status">
        @if (copied()) {
          <span class="link__msg">Copied</span>
        } @else if (failed()) {
          <span class="link__msg">Could not copy. Select the link and copy it by hand.</span>
        }
      </p>
      <p class="link__trust">
        Anyone with this link can read along. Send it over a channel you trust.
      </p>
    </div>
  `,
  styles: `
    .link {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-2);
    }
    .link__label {
      font-size: var(--text-sm);
      font-weight: var(--weight-medium);
    }
    .link__row {
      display: flex;
      gap: var(--space-2);
    }
    .link__input {
      flex: 1;
      min-width: 0;
      min-height: 2.75rem;
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-md);
      background: var(--color-surface-muted);
      font-family: var(--font-mono);
      font-size: var(--text-sm);
      text-overflow: ellipsis;
    }
    .link__copy {
      flex: none;
      display: grid;
      place-items: center;
      width: 2.75rem;
      height: 2.75rem;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-text);
      cursor: pointer;
    }
    .link__copy:hover {
      background: var(--color-primary-soft);
    }
    @media (prefers-reduced-motion: no-preference) {
      .link__copy {
        transition:
          background-color var(--motion-fast) var(--ease-out),
          transform var(--motion-base) var(--ease-spring);
      }
      .link__copy:active {
        transform: scale(0.92);
      }
      /* The check mark draws itself when the copy succeeds. */
      .link__check {
        stroke-dasharray: 1 2;
        animation: link-check 0.4s var(--ease-out) both;
      }
      .link__msg {
        display: inline-block;
        animation: link-feedback 0.3s var(--ease-out);
      }
    }
    @keyframes link-check {
      from {
        stroke-dashoffset: 1;
      }
      to {
        stroke-dashoffset: 0;
      }
    }
    @keyframes link-feedback {
      from {
        opacity: 0;
        transform: translateY(4px);
      }
    }
    .link__copy svg {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .link__feedback {
      min-height: 1.25rem;
      font-size: var(--text-sm);
      font-weight: var(--weight-medium);
      color: var(--tone-connected-fg);
    }
    .link__trust {
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinkCard {
  readonly link = input.required<string>();

  protected readonly inputId = `link-card-input-${nextId++}`;
  protected readonly copied = signal(false);
  protected readonly failed = signal(false);

  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  async copy(): Promise<void> {
    clearTimeout(this.timer);
    try {
      await navigator.clipboard.writeText(this.link());
      this.failed.set(false);
      this.copied.set(true);
      this.timer = setTimeout(() => this.copied.set(false), COPIED_FEEDBACK_MS);
    } catch {
      // Clipboard API missing (insecure context) or denied: select the text so a manual copy is one keystroke.
      this.copied.set(false);
      this.failed.set(true);
      this.field().nativeElement.select();
    }
  }
}
