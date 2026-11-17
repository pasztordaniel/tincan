import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { InlineConfirm } from '../ui/inline-confirm/inline-confirm';

/**
 * The way back home, pinned top-left as the theme toggle's mirror image: a small can and the
 * wordmark in the same 2.75rem pill. A real link; whether following it needs a confirm is decided by
 * the route guard (`confirmLeave`), which sets `confirming` through the shell. This component only
 * draws the link and the question under it.
 */
@Component({
  selector: 'app-home-link',
  imports: [RouterLink, InlineConfirm],
  template: `
    <a #link class="home" routerLink="/" aria-label="tincan home" title="Back to home">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <ellipse cx="10" cy="6" rx="6" ry="2.2" />
        <path d="M4 6v12c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V6" />
        <path d="M16 12.5c2.4 0 3.2 1.6 4.5 1.6" />
      </svg>
      <span class="home__word" aria-hidden="true">tincan</span>
    </a>
    @if (confirming()) {
      <app-inline-confirm
        #question
        class="home__confirm"
        question="Leave and cut the line?"
        detail="Going home ends this line for both of you. The key is dropped and nothing more is sent."
        confirmLabel="Leave"
        cancelLabel="Stay"
        [takeFocus]="takeFocus()"
        (confirmed)="leave.emit()"
        (cancelled)="stayHere()"
      />
    }
  `,
  styles: `
    :host {
      position: fixed;
      top: var(--space-3);
      left: var(--space-3);
      z-index: 10;
      display: grid;
      justify-items: start;
      gap: var(--space-2);
      /* Never wider than the screen minus both gutters and the theme toggle's corner. */
      max-width: min(22rem, calc(100vw - 2 * var(--space-3)));
    }
    :host(.home-link--inline) {
      position: static;
    }
    .home {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      height: 2.75rem;
      padding-inline: var(--space-3) var(--space-4);
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-text);
      box-shadow: var(--shadow-sm);
      text-decoration: none;
    }
    .home:hover {
      background: var(--color-surface-muted);
    }
    .home__word {
      font-family: var(--font-display);
      font-weight: var(--weight-display);
      font-synthesis: none;
      font-size: var(--text-md);
      line-height: 1;
    }
    svg {
      flex: none;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .home__confirm {
      box-shadow: var(--shadow-md);
      border-radius: var(--radius-md);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Same reason as CutLine: Escape must work before focus has reached the question.
  host: { '(document:keydown.escape)': 'onEscape($event)' },
})
export class HomeLink {
  private readonly injector = inject(Injector);

  /** "Leave and cut the line?" is up. */
  readonly confirming = input(false);
  /** Off only on /design, so a pre-opened sample does not pull focus on load. */
  readonly takeFocus = input(true);

  /** Leave: let the held navigation through. */
  readonly leave = output<void>();
  /** Stay (button or Escape): drop the navigation. */
  readonly stay = output<void>();

  private readonly link = viewChild.required<ElementRef<HTMLAnchorElement>>('link');
  private readonly question = viewChild('question', { read: ElementRef<HTMLElement> });

  constructor() {
    // The question can also close without the user (the line ended, the navigation was superseded).
    // If focus was in it, it would drop to <body> with the removed buttons; hand it to the link.
    let wasConfirming = false;
    effect(() => {
      const confirming = this.confirming();
      if (wasConfirming && !confirming && this.focusInQuestion()) this.focusLink();
      wasConfirming = confirming;
    });
  }

  protected onEscape(event: Event): void {
    if (!this.confirming()) return;
    event.preventDefault();
    this.stayHere();
  }

  protected stayHere(): void {
    this.stay.emit();
    this.focusLink();
  }

  private focusInQuestion(): boolean {
    const question = this.question()?.nativeElement;
    return !!question && question.contains(document.activeElement);
  }

  private focusLink(): void {
    afterNextRender(() => this.link().nativeElement.focus(), { injector: this.injector });
  }
}
