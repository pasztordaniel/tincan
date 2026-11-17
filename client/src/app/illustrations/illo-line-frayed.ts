import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LEFT_CAN, RIGHT_CAN, canTransform } from './can-pose';

/** Placeholder art, swap freely. Integrity warning: the string is tangled and frayed. */
@Component({
  selector: 'app-illo-line-frayed',
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
      <path class="string" d="M102.6 118C108 70 116 38 128 33" />
      <path
        class="string"
        d="M128 33C134 24 146 22 144 32C142 42 130 36 136 26C142 16 156 22 150 32C147 38 142 31 152 34"
      />
      <path class="string" d="M152 34C200 44 206 150 241 145" />
      <path class="string" d="M128 33L121 30M128 33L123 40M152 34L159 29M152 34L158 41" />
      <path class="mark-fill" d="M198 10L215 38H181Z" />
      <path class="mark-knock" d="M198 19V28M198 32V33" />
    </svg>
  `,
  styleUrl: './illustration.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IlloLineFrayed {
  /** Accessible description of the state; override when the context says more. */
  readonly label = input(
    'A tangled, frayed string between two tin cans: something tampered with the line',
  );
  /** Rendered width in px (height follows the 2:1 viewBox); never wider than the container. */
  readonly width = input(320);

  protected readonly cans = [LEFT_CAN, RIGHT_CAN];
  protected readonly transform = canTransform;
}
