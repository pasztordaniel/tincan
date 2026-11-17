import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { APP_NAME } from '@tincan/shared';
import { LineBusyScreen } from '../screens/line-busy-screen';
import { LineCutScreen } from '../screens/line-cut-screen';
import { ReceiverScreen } from '../screens/receiver-screen';
import { WarningBanner } from '../ui/warning-banner/warning-banner';
import type { RelayEndReason } from '../relay/relay.service';
import { LeaveConfirm } from '../nav/leave-confirm';
import { ReceiverSession } from './receiver-session';

const ENDED_COPY: Record<RelayEndReason | 'not_found', string> = {
  peer_left: 'The sender cut the line. Nothing more will be delivered on this line.',
  left: 'You cut the line. Nothing more will be delivered on this line.',
  peer_timeout: 'The sender lost the connection and did not come back in time.',
  grace_expired: 'The connection to the line was lost and could not be restored.',
  session_lost: 'The line could not be picked up again. It may have ended.',
  idle: 'The line was idle for too long and the thread ended.',
  shutdown: 'The relay is shutting down, so the thread ended.',
  not_found: 'This thread does not exist (any more). The link may be old or already finished.',
};

/** Route `r/:id`. Thin: the session service owns crypto and transport. */
@Component({
  selector: 'app-receiver-page',
  imports: [ReceiverScreen, LineCutScreen, LineBusyScreen, WarningBanner],
  providers: [ReceiverSession],
  template: `
    <main>
      <h1 class="sr-only">{{ appName }}</h1>
      @switch (session.stage()) {
        @case ('gate') {
          @if (session.openFailure()) {
            <app-warning-banner heading="Could not pick up">
              The line did not answer. Check your connection and try again.
            </app-warning-banner>
          }
          <app-receiver-screen phase="pickup" (pickUp)="session.open()" />
        }
        @case ('live') {
          @if (session.lineState() === 'ended' && !session.text()) {
            <app-line-cut-screen
              [takeFocus]="session.cutByYou()"
              [heading]="session.cutByYou() ? 'You cut the line' : 'Line cut'"
              [message]="endedMessage()"
            />
          } @else {
            <app-receiver-screen
              phase="live"
              [state]="session.lineState()"
              [text]="session.text()"
              [typing]="session.typing()"
              [stale]="session.stale()"
              [lastUpdate]="session.lastUpdate()"
              [integrityError]="session.integrityError()"
              [cutByYou]="session.cutByYou()"
              (cutLine)="session.cutLine()"
            />
          }
        }
        @case ('busy') {
          <app-line-busy-screen />
        }
        @case ('gone') {
          <app-line-cut-screen heading="Nothing on this line" [message]="endedMessage()" />
        }
        @case ('used') {
          <app-line-cut-screen
            heading="Link already used"
            message="This link was already used or the session has ended. Ask the sender for a new link."
          />
        }
        @case ('invalid') {
          <app-line-cut-screen
            heading="Invalid link"
            message="This link is incomplete or damaged. Ask the sender to share it again."
          />
        }
      }
    </main>
  `,
  styles: `
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReceiverPage {
  protected readonly session = inject(ReceiverSession);
  protected readonly appName = APP_NAME;

  protected readonly endedMessage = computed(
    () => ENDED_COPY[this.session.endReason() ?? 'peer_left'],
  );

  constructor() {
    // Synchronous up to the fragment read: nothing can navigate in between.
    void this.session.start(inject(ActivatedRoute).snapshot.paramMap.get('id'));
    // Only after Pick up: the gate and every terminal stage have nothing to cut.
    inject(LeaveConfirm).watch(
      computed(() => this.session.stage() === 'live' && this.session.lineState() !== 'ended'),
    );
  }
}
