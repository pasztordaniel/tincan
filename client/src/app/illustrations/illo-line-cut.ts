import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LEFT_CAN, RIGHT_CAN, CAN_PARTS, canTransform } from './can-pose';

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
          @for (part of canParts; track part.part) {
            <path [attr.class]="part.part" [attr.d]="part.d" />
          }
        </g>
      }
      <path class="string" d="M102.6 118C108 60 120 32 140 32C160 32 172 48 177 68" />
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
  protected readonly canParts = CAN_PARTS;
}
