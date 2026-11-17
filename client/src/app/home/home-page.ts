import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_NAME } from '@tincan/shared';
import { IlloHome } from '../illustrations';
import { ButtonDirective } from '../ui/button/button';
import { LinkCard } from '../ui/link-card/link-card';

/**
 * Home (screen 1) and the "thread created" dialog (screen 2). The link is a mock until the crypto and
 * relay tasks (T04, T07, T08) generate a real one; Join goes to the design preview for now.
 */
@Component({
  selector: 'app-home-page',
  imports: [IlloHome, ButtonDirective, LinkCard, RouterLink],
  template: `
    <main class="home">
      <app-illo-home class="hero" [width]="320" />
      <div class="home__intro">
        <h1 class="wordmark">{{ appName }}</h1>
        <p class="home__lede">
          Two cans, one string. Type on one end, they read it live on the other, end-to-end
          encrypted.
        </p>
      </div>
      <button type="button" appButton class="btn--lg" (click)="openThread()">New thread</button>
      <ul class="trust" aria-label="How tincan keeps it private">
        @for (cue of trustCues; track cue) {
          <li class="trust__item">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
            </svg>
            {{ cue }}
          </li>
        }
      </ul>
    </main>

    <dialog
      #dialog
      class="dialog"
      aria-labelledby="thread-dialog-heading"
      (close)="open.set(false)"
    >
      @if (open()) {
        <div class="thread">
          <!-- The string draws itself in as the thread is created. -->
          <app-illo-home
            class="thread__illo"
            [width]="200"
            label="A fresh string between two tin cans"
          />
          <h2 id="thread-dialog-heading">Your thread is ready</h2>
          <p class="thread__lede">Send this link to the one person who should read along.</p>
          <app-link-card [link]="link" />
          <div class="thread__actions">
            <a appButton [block]="true" routerLink="/design" fragment="sender">Join</a>
            <button type="button" appButton="ghost" [block]="true" (click)="dialog.close()">
              Not now
            </button>
          </div>
        </div>
      }
    </dialog>
  `,
  styles: `
    .home {
      display: grid;
      justify-items: center;
      align-content: center;
      gap: var(--space-6);
      min-height: 100vh;
      min-height: 100svh;
      padding: var(--space-6) var(--space-4);
      text-align: center;
    }
    .home__intro {
      display: grid;
      gap: var(--space-3);
      max-width: 32rem;
    }
    .home__lede {
      color: var(--color-text-muted);
      font-size: var(--text-lead);
      line-height: var(--leading-normal);
      text-wrap: balance;
    }
    .trust {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--space-2) var(--space-5);
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }
    .trust__item {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
    }
    .trust__item svg {
      fill: none;
      stroke: var(--tone-connected-fg);
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .thread {
      display: grid;
      gap: var(--space-4);
    }
    .thread__illo {
      justify-self: center;
      margin-block: calc(-1 * var(--space-2)) calc(-1 * var(--space-3));
    }
    .thread__lede {
      color: var(--color-text-muted);
    }
    .thread__actions {
      display: grid;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  protected readonly appName = APP_NAME;
  protected readonly open = signal(false);
  protected readonly trustCues = [
    'End-to-end encrypted',
    'No accounts, no history',
    'One reader per link',
  ] as const;
  /** Mock link: the fragment is where the real key will live (it never reaches the server). */
  protected readonly link = `${inject(DOCUMENT).location.origin}/t/demo-3fK9xQ2m#k=placeholder-not-a-real-key`;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected openThread(): void {
    this.open.set(true);
    const dialog = this.dialog().nativeElement;
    // jsdom (unit tests) lacks showModal; real browsers get the modal with its focus trap and Escape.
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }
}
