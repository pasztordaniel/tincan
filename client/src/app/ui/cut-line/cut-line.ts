import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ButtonDirective } from '../button/button';
import { InlineConfirm } from '../inline-confirm/inline-confirm';

/**
 * "Cut the line": ends the session on purpose. A single tap must not do that, so the button turns into
 * an inline two-step confirm (no browser dialog). Focus moves to the safe choice ("Keep talking") when
 * the question opens and back to the trigger when it is dismissed; Escape backs out too.
 * The host screen removes this component once the line has ended.
 */
@Component({
  selector: 'app-cut-line',
  imports: [ButtonDirective, InlineConfirm],
  template: `
    @if (confirming()) {
      <app-inline-confirm
        class="cut"
        question="Cut the line?"
        detail="This ends it for both of you. The key is dropped and nothing more is sent."
        confirmLabel="Cut it"
        cancelLabel="Keep talking"
        (confirmed)="confirm()"
        (cancelled)="cancel()"
      />
    } @else {
      <button #trigger type="button" appButton="ghost" (click)="arm()">Cut the line</button>
    }
  `,
  styles: `
    :host {
      display: flex;
      justify-content: center;
    }
    .cut {
      width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Document level, not on the group: right after the click focus is still on <body> (it moves in
  // afterNextRender), and the user may also have clicked elsewhere. Escape must back out either way.
  host: { '(document:keydown.escape)': 'onEscape($event)' },
})
export class CutLine {
  private readonly injector = inject(Injector);

  /** The user confirmed. */
  readonly confirmed = output<void>();

  protected readonly confirming = signal(false);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  protected arm(): void {
    this.confirming.set(true);
  }

  protected onEscape(event: Event): void {
    if (!this.confirming()) return;
    event.preventDefault();
    this.cancel();
  }

  protected cancel(): void {
    this.confirming.set(false);
    afterNextRender(() => this.trigger()?.nativeElement.focus(), { injector: this.injector });
  }

  protected confirm(): void {
    this.confirmed.emit();
  }
}
