import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Placeholder art, swap freely. Sender: one can, the string leaves to the right. */
@Component({
  selector: 'app-illo-sender',
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
      <path class="string" d="M126 104Q220 116 320 100" />
      <path class="waves anim-hum" d="M84 30Q96 20 108 30M76 18Q96 2 116 18" />
    </svg>
  `,
  styleUrl: './illustration.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IlloSender {
  /** Accessible description of the state; override when the context says more. */
  readonly label = input('Your tin can, its string running off to the right');
  /** Rendered width in px (height follows the 2:1 viewBox); never wider than the container. */
  readonly width = input(320);

  protected readonly cans = [96];
}
