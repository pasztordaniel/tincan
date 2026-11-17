import { ChangeDetectionStrategy, Component, inject, type OnDestroy } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { LinkCard } from '../ui/link-card/link-card';
import { SenderScreen } from '../screens/sender-screen';
import { SenderSession } from './sender-session';

/** The sender's key lives in memory only (ADR 0004): without a live session there is nothing to show. */
export const hasSenderSession: CanActivateFn = () =>
  inject(SenderSession).active() || inject(Router).createUrlTree(['/']);

/** Thin wrapper: binds `SenderScreen` to `SenderSession`. Leaving the page ends the session. */
@Component({
  selector: 'app-sender-page',
  imports: [SenderScreen, LinkCard],
  template: `
    <main class="sender">
      <app-sender-screen
        [state]="session.state()"
        [text]="session.text()"
        [idleSecondsLeft]="session.idleSecondsLeft()"
        (textChange)="session.edit($event)"
        (keepOpen)="session.keepOpen()"
      />
      @if (session.link(); as link) {
        @if (session.state() === 'waiting') {
          <app-link-card class="sender__link" [link]="link" />
        }
      }
    </main>
  `,
  styles: `
    .sender {
      display: grid;
      gap: var(--space-4);
      max-width: var(--content-width);
      margin-inline: auto;
      padding-bottom: var(--space-5);
    }
    .sender__link {
      padding-inline: var(--space-4);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SenderPage implements OnDestroy {
  protected readonly session = inject(SenderSession);

  ngOnDestroy(): void {
    this.session.end();
  }
}
