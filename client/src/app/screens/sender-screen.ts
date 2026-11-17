import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { IlloLineCut, IlloLineSlack, IlloSender } from '../illustrations';
import { ButtonDirective } from '../ui/button/button';
import { StatusPill } from '../ui/status-pill/status-pill';
import type { LineState } from '../ui/status-pill/status-pill.model';
import { WarningBanner } from '../ui/warning-banner/warning-banner';

let nextId = 0;

/**
 * Sender view (docs/design.md, screen 3): the writing area and the status pill. Presentational only:
 * T08 binds `state` to the relay and reads `text` to encrypt and send.
 */
@Component({
  selector: 'app-sender-screen',
  imports: [IlloSender, IlloLineSlack, IlloLineCut, StatusPill, WarningBanner, ButtonDirective],
  template: `
    <section class="screen" [attr.aria-labelledby]="uid + '-heading'">
      @switch (state()) {
        @case ('reconnecting') {
          <app-illo-line-slack class="hero hero--screen" [width]="280" />
        }
        @case ('idle') {
          <app-illo-sender
            class="hero hero--screen"
            [width]="280"
            [snip]="true"
            label="Your tin can, open scissors closing in on its string: the line is about to be cut"
          />
        }
        @case ('ended') {
          <app-illo-line-cut class="hero hero--screen" [width]="280" />
        }
        @default {
          <app-illo-sender
            class="hero hero--screen"
            [width]="280"
            [live]="state() === 'connected'"
            [pulse]="text()"
          />
        }
      }
      <div class="screen__body">
        <h2 [id]="uid + '-heading'">Your can</h2>
        <app-status-pill [state]="state()" role="sender" />
      </div>

      <div
        class="writer screen__full"
        [class.writer--empty]="!text()"
        [class.writer--ended]="ended()"
      >
        <label class="visually-hidden" [for]="uid + '-text'">Text to send</label>
        <textarea
          [id]="uid + '-text'"
          class="writer__area"
          rows="7"
          spellcheck="false"
          [readOnly]="ended()"
          [attr.aria-describedby]="ended() ? uid + '-ended' : uid + '-hint'"
          [value]="text()"
          (input)="onInput($event)"
        ></textarea>
        @if (!ended()) {
          <span class="writer__caret" aria-hidden="true"></span>
        }
      </div>

      @if (ended()) {
        <app-warning-banner class="screen__full" tone="info" heading="The line is cut">
          <span [id]="uid + '-ended'">Nothing you type now will be sent.</span>
        </app-warning-banner>
      } @else if (state() === 'idle') {
        <!-- The pill's role="status" announces the idle state once; the countdown is a role="timer"
             (live region off), so it is visible and readable on demand but never read out every second. -->
        <app-warning-banner
          class="screen__full"
          tone="warning"
          heading="The string is about to be cut"
          [announce]="false"
        >
          <span [id]="uid + '-hint'">
            No typing for a while: the string will be cut in
            <span class="countdown" role="timer" aria-atomic="true">{{ countdown() }}</span>.
          </span>
        </app-warning-banner>
        <button type="button" appButton (click)="keepOpen.emit()">Keep the line open</button>
      } @else {
        <p [id]="uid + '-hint'" class="hint">
          Every keystroke travels live, end-to-end encrypted. The server never sees it.
        </p>
      }
    </section>
  `,
  styles: `
    .writer {
      position: relative;
    }
    .writer__area {
      display: block;
      width: 100%;
      min-height: 10rem;
      padding: var(--space-4);
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      font-size: var(--text-lg);
      line-height: var(--leading-normal);
      resize: vertical;
    }
    .writer--ended .writer__area {
      background: var(--color-surface-muted);
      color: var(--color-text-muted);
      cursor: default;
    }
    /* A visible "ready to type" cue while the box is empty and unfocused; the native caret takes over on focus. */
    .writer__caret {
      position: absolute;
      top: calc(var(--space-4) + 0.2em);
      left: calc(var(--space-4) + 1px);
      width: 2px;
      height: 1.4em;
      font-size: var(--text-lg);
      background: var(--color-primary);
      display: none;
    }
    .writer--empty:not(:focus-within) .writer__caret {
      display: block;
    }
    @media (prefers-reduced-motion: no-preference) {
      .writer__caret {
        animation: caret-blink 1.1s steps(1) infinite;
      }
    }
    @keyframes caret-blink {
      50% {
        opacity: 0;
      }
    }
    .countdown {
      font-variant-numeric: tabular-nums;
      font-weight: var(--weight-bold);
    }
    .hint {
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SenderScreen {
  /** Per-instance id prefix: several screens can share a page (see /design). */
  protected readonly uid = 'sender-' + nextId++;

  readonly state = input<LineState>('waiting');
  /** Seconds until the relay cuts an idle line; only shown in the `idle` state. */
  readonly idleSecondsLeft = input(60);
  /** The sender asked to keep an idle line open (T08 resets the idle timer). */
  readonly keepOpen = output<void>();
  /** The text being written; two-way bindable so the feature layer can observe edits. */
  readonly text = model('');

  protected readonly ended = computed(() => this.state() === 'ended');
  protected readonly countdown = computed(() => {
    const total = Math.max(0, Math.ceil(this.idleSecondsLeft()));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  });

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
  }
}
