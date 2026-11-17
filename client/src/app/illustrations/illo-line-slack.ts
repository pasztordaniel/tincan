import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LEFT_CAN, RIGHT_CAN, canTransform } from './can-pose';

/** Placeholder art, swap freely. Reconnecting: the string goes slack. */
@Component({
  selector: 'app-illo-line-slack',
  template: `
    <svg
      viewBox="0 0 320 160"
      [attr.width]="width()"
      role="img"
      [attr.aria-label]="label()"
      focusable="false"
    >
      @for (can of cans; track can.x) {
        <ellipse
          class="ground"
          [attr.cx]="can.x"
          [attr.cy]="can.ground"
          [attr.rx]="44 * can.scale"
          ry="5"
        />
        <g [attr.transform]="transform(can)">
          <path class="can__body" d="M-35 -26H35A8 26 0 0 1 35 26H-35Z" />
          <path class="can__label" d="M-9 -26H9A8 26 0 0 0 9 26H-9A8 26 0 0 1 -9 -26Z" />
          <path class="can__ridge" d="M-20 -26A8 26 0 0 0 -20 26M20 -26A8 26 0 0 0 20 26" />
          <ellipse class="can__rim" cx="-35" cy="0" rx="8" ry="26" />
          <ellipse class="can__mouth" cx="-35" cy="0" rx="5.5" ry="21" />
          <path class="can__inside" d="M-37 -12A4 14 0 0 0 -37 12" />
          <circle class="can__knot" cx="43" cy="0" r="3" />
        </g>
      }
      <path
        class="string anim-sway"
        d="M102.6 118C110 138 122 148 132 146C144 143 148 132 138 130 C128 128 126 144 142 148C180 156 220 158 241 145"
      />
    </svg>
  `,
  styleUrl: './illustration.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IlloLineSlack {
  /** Accessible description of the state; override when the context says more. */
  readonly label = input('The string between two tin cans hangs slack: reconnecting');
  /** Rendered width in px (height follows the 2:1 viewBox); never wider than the container. */
  readonly width = input(320);

  protected readonly cans = [LEFT_CAN, RIGHT_CAN];
  protected readonly transform = canTransform;
}
