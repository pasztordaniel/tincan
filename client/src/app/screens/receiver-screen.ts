import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { IlloLineCut, IlloLineFrayed, IlloLineSlack, IlloReceiver } from '../illustrations';
import { ButtonDirective } from '../ui/button/button';
import { CutLine } from '../ui/cut-line/cut-line';
import { StatusPill } from '../ui/status-pill/status-pill';
import type { LineState } from '../ui/status-pill/status-pill.model';
import { WarningBanner } from '../ui/warning-banner/warning-banner';

export type ReceiverPhase = 'pickup' | 'live';

let nextId = 0;

/**
 * Receiver view (docs/design.md, screen 4 and additions 1-3). Opening the link shows only the
 * Pick up step, so link scanners never take the receiver slot; the live text appears after the click.
 * The text is rendered with interpolation only (never as HTML).
 */
@Component({
  selector: 'app-receiver-screen',
  imports: [
    ButtonDirective,
    IlloReceiver,
    IlloLineSlack,
    IlloLineCut,
    IlloLineFrayed,
    StatusPill,
    WarningBanner,
    CutLine,
  ],
  template: `
    <section class="screen" [attr.aria-labelledby]="uid + '-heading'">
      @if (phase() === 'pickup') {
        <app-illo-receiver
          class="hero hero--screen"
          [width]="280"
          [live]="false"
          label="A tin can waiting to be picked up"
        />
        <div class="screen__body">
          <h2 [id]="uid + '-heading'">Someone is on the line</h2>
          <p class="screen__lede">Pick up to start reading. Nothing is shown until you do.</p>
        </div>
        <button type="button" appButton (click)="pickUp.emit()">Pick up</button>
      } @else {
        @switch (illustration()) {
          @case ('frayed') {
            <app-illo-line-frayed class="hero hero--screen" [width]="280" />
          }
          @case ('slack') {
            <app-illo-line-slack class="hero hero--screen" [width]="280" />
          }
          @case ('cut') {
            <app-illo-line-cut class="hero hero--screen" [width]="280" />
          }
          @default {
            <app-illo-receiver
              class="hero hero--screen"
              [width]="280"
              [live]="state() === 'connected'"
              [pulse]="text()"
            />
          }
        }
        <div class="screen__body">
          <h2 [id]="uid + '-heading'">Their can</h2>
          <app-status-pill [state]="state()" role="receiver" />
        </div>

        @if (integrityError()) {
          <app-warning-banner class="screen__full" heading="Something tampered with the line.">
            The last message was not shown.
          </app-warning-banner>
        }

        <div class="reader screen__full" [class.reader--stale]="stale()" aria-live="polite">
          <!-- Text sits flush against the tags: the paragraph is pre-wrap, so template whitespace would show. -->
          @if (text()) {
            <p class="reader__text">{{ text() }}</p>
          } @else {
            <p class="reader__empty">Nothing yet. Their words appear here as they type.</p>
          }
        </div>

        @if (typing() && !stale()) {
          <p class="typing-hint screen__full">They are typing...</p>
        }

        @if (stale()) {
          <p class="stale-hint screen__full">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <circle cx="8" cy="8" r="6.5" />
              <path d="M8 4.5V8L10.5 9.5" />
            </svg>
            Last update {{ lastUpdate() }}. They may have stepped away.
          </p>
        }

        @if (state() === 'ended') {
          <app-warning-banner
            #endedBanner
            tabindex="-1"
            class="screen__full"
            tone="info"
            [heading]="cutByYou() ? 'You cut the line' : 'The line is cut'"
          >
            Nothing more will arrive. The text above is the last thing they sent.
          </app-warning-banner>
        } @else {
          <app-cut-line class="screen__full" (confirmed)="cutLine.emit()" />
        }
      }
    </section>
  `,
  styles: `
    .reader {
      min-height: 10rem;
      padding: var(--space-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
    }
    .reader__text {
      font-size: var(--text-lg);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .reader__empty {
      color: var(--color-text-muted);
      font-size: var(--text-md);
    }
    /* Stale: muted ink (still AA) on a sunken surface, plus the hint below; never color alone. */
    .reader--stale {
      background: var(--color-surface-muted);
      border-style: dashed;
      border-color: var(--color-border-strong);
    }
    .reader--stale .reader__text {
      color: var(--color-text-muted);
    }
    .typing-hint {
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }
    .stale-hint {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }
    .stale-hint svg {
      flex: none;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.6;
      stroke-linecap: round;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReceiverScreen {
  /** Per-instance id prefix: several screens can share a page (see /design). */
  protected readonly uid = 'receiver-' + nextId++;

  readonly phase = input<ReceiverPhase>('pickup');
  readonly state = input<LineState>('connected');
  readonly text = input('');
  /** No heartbeat for a while: dim the text and show `lastUpdate`. */
  readonly stale = input(false);
  /** Human-readable age of the last frame, e.g. "20 s ago". */
  readonly lastUpdate = input('a moment ago');
  /** The sender is typing right now (a `typing` message arrived recently). */
  readonly typing = input(false);
  /** A frame failed authentication or arrived out of order and was dropped. */
  readonly integrityError = input(false);

  /** This side cut the line on purpose (changes the ended message). */
  readonly cutByYou = input(false);

  readonly pickUp = output();
  /** The receiver confirmed "Cut the line". */
  readonly cutLine = output<void>();

  private readonly endedBanner = viewChild('endedBanner', { read: ElementRef });
  private sawOpenLine = false;

  constructor() {
    const injector = inject(Injector);
    // Focus follows the user's own cut: the button they pressed is gone. Only after a live -> ended
    // change, so a screen that is merely rendered as ended (see /design) never steals focus.
    effect(() => {
      const ended = this.state() === 'ended';
      if (!ended) this.sawOpenLine = true;
      else if (this.cutByYou() && this.sawOpenLine) {
        this.sawOpenLine = false;
        afterNextRender(
          () => (this.endedBanner()?.nativeElement as HTMLElement | undefined)?.focus(),
          { injector },
        );
      }
    });
  }

  protected readonly illustration = computed(() => {
    if (this.integrityError()) return 'frayed';
    if (this.state() === 'reconnecting') return 'slack';
    if (this.state() === 'ended') return 'cut';
    return 'receiver';
  });
}
