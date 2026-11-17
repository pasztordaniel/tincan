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

let nextId = 0;

/**
 * "Cut the line": ends the session on purpose. A single tap must not do that, so the button turns into
 * an inline two-step confirm (no browser dialog). Focus moves to the safe choice ("Keep talking") when
 * the question opens and back to the trigger when it is dismissed; Escape backs out too.
 * The host screen removes this component once the line has ended.
 */
@Component({
  selector: 'app-cut-line',
  imports: [ButtonDirective],
  template: `
    @if (confirming()) {
      <div
        class="cut"
        role="group"
        [attr.aria-labelledby]="uid + '-q'"
        [attr.aria-describedby]="uid + '-d'"
      >
        <p class="cut__q" [id]="uid + '-q'">Cut the line?</p>
        <p class="cut__d" [id]="uid + '-d'">
          This ends it for both of you. The key is dropped and nothing more is sent.
        </p>
        <div class="cut__actions">
          <button type="button" appButton="danger" (click)="confirm()">Cut it</button>
          <button #keep type="button" appButton="secondary" (click)="cancel()">Keep talking</button>
        </div>
      </div>
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
      display: grid;
      gap: var(--space-2);
      justify-items: center;
      width: 100%;
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-md);
      background: var(--color-surface-muted);
      text-align: center;
    }
    .cut__q {
      font-weight: var(--weight-bold);
    }
    .cut__d {
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }
    .cut__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      justify-content: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Document level, not on the group: right after the click focus is still on <body> (it moves in
  // afterNextRender), and the user may also have clicked elsewhere. Escape must back out either way.
  host: { '(document:keydown.escape)': 'onEscape($event)' },
})
export class CutLine {
  protected readonly uid = 'cut-line-' + nextId++;
  private readonly injector = inject(Injector);

  /** The user confirmed. */
  readonly confirmed = output<void>();

  protected readonly confirming = signal(false);
  private readonly keep = viewChild<ElementRef<HTMLButtonElement>>('keep');
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  protected arm(): void {
    this.confirming.set(true);
    afterNextRender(() => this.keep()?.nativeElement.focus(), { injector: this.injector });
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
