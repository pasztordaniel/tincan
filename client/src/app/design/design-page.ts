import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IlloHome,
  IlloLineBusy,
  IlloLineCut,
  IlloLineFrayed,
  IlloLineSlack,
  IlloReceiver,
  IlloSender,
} from '../illustrations';
import { LineBusyScreen } from '../screens/line-busy-screen';
import { LineCutScreen } from '../screens/line-cut-screen';
import { ReceiverScreen, type ReceiverPhase } from '../screens/receiver-screen';
import { SenderScreen } from '../screens/sender-screen';
import { ButtonDirective } from '../ui/button/button';
import { LinkCard } from '../ui/link-card/link-card';
import { StatusPill } from '../ui/status-pill/status-pill';
import type { LineState } from '../ui/status-pill/status-pill.model';
import { WarningBanner } from '../ui/warning-banner/warning-banner';

const SAMPLE =
  'Meet at the north gate at 7.\nBring the blue notebook, and do not tell anyone else about the plan.';

/**
 * Living style guide: every screen and state from docs/design.md side by side, with mocked data.
 * Nothing here talks to the network.
 */
@Component({
  selector: 'app-design-page',
  imports: [
    RouterLink,
    ButtonDirective,
    LinkCard,
    StatusPill,
    WarningBanner,
    SenderScreen,
    ReceiverScreen,
    LineBusyScreen,
    LineCutScreen,
    IlloHome,
    IlloSender,
    IlloReceiver,
    IlloLineBusy,
    IlloLineCut,
    IlloLineSlack,
    IlloLineFrayed,
  ],
  template: `
    <main class="guide">
      <header class="guide__head">
        <h1>tincan design preview</h1>
        <p>Every screen and state with mocked data. <a routerLink="/">Back to home</a></p>
      </header>

      <section aria-labelledby="g-start">
        <h2 id="g-start">Start</h2>
        <div class="grid">
          <figure class="frame card">
            <figcaption>1. Home</figcaption>
            <div class="screen">
              <app-illo-home [width]="280" />
              <h3>tincan</h3>
              <button type="button" appButton>New thread</button>
            </div>
          </figure>
          <figure class="frame card">
            <figcaption>2. Thread created (dialog)</figcaption>
            <div class="stack">
              <h3>Your thread is ready</h3>
              <app-link-card [link]="demoLink" />
              <button type="button" appButton [block]="true">Join</button>
            </div>
          </figure>
        </div>
      </section>

      <section id="sender" aria-labelledby="g-sender">
        <h2 id="g-sender">3. Sender</h2>
        <div class="grid">
          @for (s of senderStates; track s.state) {
            <figure class="frame card">
              <figcaption>{{ s.caption }}</figcaption>
              <app-sender-screen [state]="s.state" [text]="s.text" />
            </figure>
          }
        </div>
      </section>

      <section aria-labelledby="g-receiver">
        <h2 id="g-receiver">4. Receiver</h2>
        <div class="grid">
          <figure class="frame card">
            <figcaption>Pick up (interactive: click it)</figcaption>
            <app-receiver-screen
              [phase]="pickupPhase()"
              [text]="sample"
              (pickUp)="pickupPhase.set('live')"
            />
            @if (pickupPhase() === 'live') {
              <button type="button" appButton="ghost" (click)="pickupPhase.set('pickup')">
                Reset demo
              </button>
            }
          </figure>
          <figure class="frame card">
            <figcaption>Connected, live text</figcaption>
            <app-receiver-screen phase="live" [text]="sample" />
          </figure>
          <figure class="frame card">
            <figcaption>Reconnecting</figcaption>
            <app-receiver-screen phase="live" state="reconnecting" [text]="sample" />
          </figure>
          <figure class="frame card">
            <figcaption>Stale (no heartbeat for 15 s)</figcaption>
            <app-receiver-screen
              phase="live"
              [text]="sample"
              [stale]="true"
              lastUpdate="20 s ago"
            />
          </figure>
          <figure class="frame card">
            <figcaption>Integrity warning</figcaption>
            <app-receiver-screen phase="live" [text]="sample" [integrityError]="true" />
          </figure>
          <figure class="frame card">
            <figcaption>Line cut</figcaption>
            <app-receiver-screen phase="live" state="ended" [text]="sample" />
          </figure>
        </div>
      </section>

      <section aria-labelledby="g-terminal">
        <h2 id="g-terminal">Terminal states</h2>
        <div class="grid">
          <figure class="frame card">
            <figcaption>5. Line busy</figcaption>
            <app-line-busy-screen />
          </figure>
          <figure class="frame card">
            <figcaption>6. Disconnected / ended</figcaption>
            <app-line-cut-screen />
          </figure>
        </div>
      </section>

      <section aria-labelledby="g-type">
        <h2 id="g-type">Type</h2>
        <div class="grid">
          <figure class="frame card">
            <figcaption>In use: Caveat 600 (headings, wordmark)</figcaption>
            <div class="stack">
              <p class="sample sample--caveat">tincan</p>
              <p class="sample sample--caveat sample--h2">Your thread is ready</p>
              <p>
                Body, buttons, the pill and the live text stay in the system sans: Anyone with this
                link can read along.
              </p>
              <code>--font-display: 'Caveat', var(--font-sans);</code>
            </div>
          </figure>
          @for (alt of fontAlternatives; track alt.family) {
            <figure class="frame card">
              <figcaption>Alternative: {{ alt.caption }}</figcaption>
              <div class="stack">
                <p class="sample" [style.font-family]="alt.stack">tincan</p>
                <p class="sample sample--h2" [style.font-family]="alt.stack">
                  Your thread is ready
                </p>
                <code>--font-display: '{{ alt.family }}', var(--font-sans);</code>
              </div>
            </figure>
          }
        </div>
      </section>

      <section aria-labelledby="g-parts">
        <h2 id="g-parts">Parts</h2>
        <div class="grid">
          <figure class="frame card">
            <figcaption>Status pill</figcaption>
            <div class="stack">
              @for (state of pillStates; track state) {
                <app-status-pill [state]="state" role="sender" />
                <app-status-pill [state]="state" role="receiver" />
              }
            </div>
          </figure>
          <figure class="frame card">
            <figcaption>Banners and buttons</figcaption>
            <div class="stack">
              <app-warning-banner heading="Something tampered with the line.">
                The last message was not shown.
              </app-warning-banner>
              <app-warning-banner tone="info" heading="The line is cut">
                Nothing you type now will be sent.
              </app-warning-banner>
              <div class="row">
                <button type="button" appButton>Primary</button>
                <button type="button" appButton="secondary">Secondary</button>
                <button type="button" appButton="ghost">Ghost</button>
                <button type="button" appButton disabled>Disabled</button>
              </div>
            </div>
          </figure>
          <figure class="frame card">
            <figcaption>Illustrations (placeholders)</figcaption>
            <div class="illos">
              <app-illo-home [width]="140" />
              <app-illo-sender [width]="140" />
              <app-illo-receiver [width]="140" />
              <app-illo-line-busy [width]="140" />
              <app-illo-line-cut [width]="140" />
              <app-illo-line-slack [width]="140" />
              <app-illo-line-frayed [width]="140" />
            </div>
          </figure>
        </div>
      </section>
    </main>
  `,
  styles: `
    .guide {
      display: grid;
      gap: var(--space-7);
      max-width: 90rem;
      margin-inline: auto;
      padding: var(--space-6) var(--space-4) var(--space-8);
    }
    /* Leaves room for the theme toggle pinned to the top-right corner. */
    .guide__head {
      display: grid;
      gap: var(--space-2);
      padding-inline-end: var(--space-7);
    }
    .guide__head p {
      color: var(--color-text-muted);
    }
    .sample {
      font-size: var(--text-2xl);
      line-height: var(--leading-tight);
      font-weight: var(--weight-display);
      font-synthesis: none;
    }
    .sample--caveat {
      font-family: var(--font-display);
    }
    .sample--h2 {
      font-size: var(--text-xl);
    }
    code {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--color-text-muted);
      overflow-wrap: anywhere;
    }
    section {
      display: grid;
      gap: var(--space-4);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
      gap: var(--space-5);
      align-items: start;
    }
    .frame {
      display: grid;
      justify-items: center;
      gap: var(--space-2);
      margin: 0;
      padding: var(--space-3) var(--space-3) var(--space-4);
      min-width: 0;
    }
    figcaption {
      justify-self: stretch;
      padding-bottom: var(--space-2);
      border-bottom: 1px solid var(--color-border);
      font-size: var(--text-xs);
      font-weight: var(--weight-medium);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }
    .stack {
      display: grid;
      gap: var(--space-3);
      justify-items: start;
      width: 100%;
      padding: var(--space-3);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    .illos {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--space-3);
      padding: var(--space-3);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesignPage {
  protected readonly sample = SAMPLE;
  protected readonly demoLink =
    'https://tincan.example/t/demo-3fK9xQ2m#k=placeholder-not-a-real-key';
  /** Declared in styles.scss; switching is a one-line change to --font-display. */
  protected readonly fontAlternatives = [
    {
      family: 'Kalam',
      caption: 'Kalam 700 (felt-pen print)',
      stack: "'Kalam', system-ui, sans-serif",
    },
    {
      family: 'Patrick Hand',
      caption: 'Patrick Hand 400 (neat marker)',
      stack: "'Patrick Hand', system-ui, sans-serif",
    },
  ];
  protected readonly pickupPhase = signal<ReceiverPhase>('pickup');
  protected readonly pillStates: LineState[] = ['waiting', 'connected', 'reconnecting', 'ended'];
  protected readonly senderStates: { state: LineState; caption: string; text: string }[] = [
    { state: 'waiting', caption: 'Waiting, ready to type', text: '' },
    { state: 'connected', caption: 'Connected, writing', text: SAMPLE },
    { state: 'reconnecting', caption: 'Reconnecting', text: SAMPLE },
    { state: 'ended', caption: 'Line cut (read-only)', text: SAMPLE },
  ];
}
