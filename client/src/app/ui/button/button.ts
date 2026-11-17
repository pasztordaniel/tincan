import { Directive, computed, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/**
 * Styles a native <button> or <a> as a tincan button. A directive rather than a wrapper component, so
 * the element keeps its native semantics (type, disabled, form submission, focus) without re-plumbing.
 *
 * Usage: <button type="button" appButton>New thread</button>
 *        <button type="button" appButton="secondary" [block]="true">Close</button>
 */
@Directive({
  selector: 'button[appButton], a[appButton]',
  host: { '[class]': 'classes()' },
})
export class ButtonDirective {
  /** Visual variant; an empty attribute (`appButton`) means primary. */
  readonly appButton = input<ButtonVariant | ''>('');
  /** Stretch to the container width (mobile primary actions). */
  readonly block = input(false);

  protected readonly classes = computed(() => {
    const variant = this.appButton() || 'primary';
    return `btn btn--${variant}${this.block() ? ' btn--block' : ''}`;
  });
}
