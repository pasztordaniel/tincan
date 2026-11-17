import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  input,
  output,
  viewChild,
} from '@angular/core';
import { ButtonDirective } from '../button/button';

let nextId = 0;

/**
 * The inline two-step question used before anything that ends the line ("Cut the line?", "Leave and
 * cut the line?"): a labelled group with a danger action and a safe one, never a browser dialog.
 * Focus lands on the safe choice when it appears. Escape is handled by the host, because the host
 * exists before this group renders and must catch a keypress in that same frame.
 */
@Component({
  selector: 'app-inline-confirm',
  imports: [ButtonDirective],
  template: `
    <div
      class="confirm"
      role="group"
      [attr.aria-labelledby]="uid + '-q'"
      [attr.aria-describedby]="uid + '-d'"
    >
      <p class="confirm__q" [id]="uid + '-q'">{{ question() }}</p>
      <p class="confirm__d" [id]="uid + '-d'">{{ detail() }}</p>
      <div class="confirm__actions">
        <button type="button" appButton="danger" (click)="confirmed.emit()">
          {{ confirmLabel() }}
        </button>
        <button #safe type="button" appButton="secondary" (click)="cancelled.emit()">
          {{ cancelLabel() }}
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .confirm {
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
    .confirm__q {
      font-weight: var(--weight-bold);
    }
    .confirm__d {
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }
    .confirm__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      justify-content: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InlineConfirm {
  protected readonly uid = 'confirm-' + nextId++;

  readonly question = input.required<string>();
  readonly detail = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly cancelLabel = input.required<string>();
  /** Off only on /design, where a pre-opened sample must not pull focus on page load. */
  readonly takeFocus = input(true);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private readonly safe = viewChild.required<ElementRef<HTMLButtonElement>>('safe');

  constructor() {
    afterNextRender(() => {
      if (this.takeFocus()) this.safe().nativeElement.focus();
    });
  }
}
