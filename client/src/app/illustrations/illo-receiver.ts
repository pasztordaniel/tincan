import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Placeholder art, swap freely. Receiver: one can, the string comes in from the left. */
@Component({
  selector: 'app-illo-receiver',
  template: `
    <svg
      viewBox="0 0 320 160"
      [attr.width]="width()"
      role="img"
      [attr.aria-label]="label()"
      focusable="false"
    >
      @for (x of cans; track x) {
        <g [attr.transform]="'translate(' + x + ' 0)'">
          <ellipse class="ground" cx="0" cy="124" rx="42" ry="7" />
          <path class="can__body" d="M-30 48V116A30 9 0 0 0 30 116V48Z" />
          <path class="can__label" d="M-30 70A30 9 0 0 0 30 70V92A30 9 0 0 1 -30 92Z" />
          <path class="can__ridge" d="M-30 60A30 9 0 0 0 30 60M-30 104A30 9 0 0 0 30 104" />
          <ellipse class="can__rim" cx="0" cy="48" rx="30" ry="9" />
          <ellipse class="can__mouth" cx="0" cy="48" rx="24" ry="6" />
        </g>
      }
      <path class="string" d="M0 100Q100 116 194 104" />
    </svg>
  `,
  styleUrl: './illustration.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IlloReceiver {
  /** Accessible description of the state; override when the context says more. */
  readonly label = input('A tin can, its string coming in from the left');
  /** Rendered width in px (height follows the 2:1 viewBox); never wider than the container. */
  readonly width = input(320);

  protected readonly cans = [224];
}
