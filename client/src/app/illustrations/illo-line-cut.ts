import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LEFT_CAN, RIGHT_CAN, canTransform } from './can-pose';

/** Placeholder art, swap freely. Ended: scissors cut the string. */
@Component({
  selector: 'app-illo-line-cut',
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
        class="string"
        d="M102.6 118C108 70 116 36 130 32C142 29 146 18 136 16 C126 14 124 30 140 34C160 38 172 48 177 68"
      />
      <path class="string" d="M241 145C214 150 200 116 197 78" />
      <path class="mark" d="M187 56L177 78M187 56L197 78" />
      <path class="mark" d="M187 56L179 38M187 56L195 38" />
      <circle class="mark" cx="176" cy="30" r="8" />
      <circle class="mark" cx="198" cy="30" r="8" />
      <circle class="mark-fill" cx="187" cy="56" r="2.5" />
    </svg>
  `,
  styleUrl: './illustration.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IlloLineCut {
  /** Accessible description of the state; override when the context says more. */
  readonly label = input('Scissors cutting the string between two tin cans: the line is cut');
  /** Rendered width in px (height follows the 2:1 viewBox); never wider than the container. */
  readonly width = input(320);

  protected readonly cans = [LEFT_CAN, RIGHT_CAN];
  protected readonly transform = canTransform;
}
