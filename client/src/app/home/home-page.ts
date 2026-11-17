import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  type OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_NAME } from '@tincan/shared';
import { IlloHome } from '../illustrations';
import { ButtonDirective } from '../ui/button/button';
import { SenderSession, type StartError } from '../sender/sender-session';
import { LinkCard } from '../ui/link-card/link-card';
import { WarningBanner } from '../ui/warning-banner/warning-banner';

/**
 * Home (screen 1) and the "thread created" dialog (screen 2). "New thread" creates the key and the relay
 * session through `SenderSession`; Join opens the sender view, "Not now" drops the session again.
 */
@Component({
  selector: 'app-home-page',
  imports: [IlloHome, ButtonDirective, LinkCard, RouterLink, WarningBanner],
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
      <button
        type="button"
        appButton
        class="btn--lg"
        [disabled]="session.starting()"
        (click)="openThread()"
      >
        New thread
      </button>
      @if (error(); as message) {
        <app-warning-banner tone="warning" heading="No thread this time">
          {{ message }}
        </app-warning-banner>
      }
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

    <dialog #dialog class="dialog" aria-labelledby="thread-dialog-heading" (close)="onClose()">
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
          @if (session.link(); as link) {
            <app-link-card [link]="link" />
          }
          <div class="thread__actions">
            <a appButton [block]="true" routerLink="/s" (click)="onJoin($event)">Join</a>
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
export class HomePage implements OnDestroy {
  protected readonly appName = APP_NAME;
  protected readonly open = signal(false);
  protected readonly trustCues = [
    'End-to-end encrypted',
    'No accounts, no history',
    'One reader per link',
  ] as const;
  protected readonly session = inject(SenderSession);
  protected readonly error = signal<string | null>(null);
  /** Join was clicked: the session now belongs to the sender view, so closing the dialog must keep it. */
  protected joined = false;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // The session can end while the dialog is open (idle cut, relay shutdown): do not keep offering
    // a Join for a thread that no longer exists.
    effect(() => {
      if (this.open() && !this.session.active() && !this.session.starting()) {
        this.error.set(ERRORS.ended);
        const dialog = this.dialog().nativeElement;
        // jsdom (unit tests) lacks close(); a real browser fires `close`, which runs onClose().
        if (typeof dialog.close === 'function') dialog.close();
        else {
          dialog.removeAttribute('open');
          this.onClose();
        }
      }
    });
  }

  protected async openThread(): Promise<void> {
    this.error.set(null);
    const started = await this.session.start();
    if (!started.ok) {
      // `cancelled`: the page went away (or another start ran) meanwhile; there is nothing to report.
      if (started.error !== 'cancelled') this.error.set(ERRORS[started.error]);
      return;
    }
    this.joined = false;
    this.open.set(true);
    const dialog = this.dialog().nativeElement;
    // jsdom (unit tests) lacks showModal; real browsers get the modal with its focus trap and Escape.
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  /**
   * Hands the session to the sender view, but only for a click that RouterLink turns into an in-app
   * navigation. A modified click opens `/s` in a new tab or window (which has no session and goes
   * home), so this page still owns the session and "Not now" must still end it.
   */
  protected onJoin(event: MouseEvent): void {
    if (
      event.button === 0 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      this.joined = true;
    }
  }

  protected onClose(): void {
    this.open.set(false);
    if (!this.joined) this.session.end();
  }

  /** Leaving home without joining (or while "New thread" is still in flight) must not leave a session open. */
  ngOnDestroy(): void {
    if (!this.joined) this.session.end();
  }
}

const ERRORS: Record<Exclude<StartError, 'cancelled'> | 'ended', string> = {
  ended: 'The thread ended before anyone joined. Start a new one.',
  crypto: 'This browser cannot create an encrypted thread (it needs a secure connection).',
  busy: 'The relay is busy right now. Try again in a moment.',
  offline: 'Could not reach the relay. Check your connection and try again.',
  failed: 'Something went wrong creating the thread. Try again.',
};
