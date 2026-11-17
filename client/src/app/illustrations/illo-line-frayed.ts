import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LEFT_CAN, RIGHT_CAN, CAN_PARTS, canTransform } from './can-pose';

/** Placeholder art, swap freely. Integrity warning: the string is frayed in the middle. */
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
          @for (part of canParts; track part.part) {
            <path [attr.class]="part.part" [attr.d]="part.d" />
          }
        </g>
      }
      <!-- Unravelling at the middle of the arc: the strands split apart and two have snapped. -->
      <path class="string" d="M102.6 118C118.2 124.7 140.1 133.7 163.7 140.1" />
      <path class="string" d="M177.2 143.4C198.9 148 221.2 149.7 241 145" />
      <path
        class="string string--fray fray-spread"
        d="M163.7 140.1Q168 127 177.2 143.4M163.7 140.1Q172 156 177.2 143.4M163.7 140.1Q170.5 140 177.2 143.4M167.5 134L171 125M173 149L169.5 158"
      />
      <g class="mark-pop">
        <path class="mark-fill" d="M170 92L187 120H153Z" />
        <path class="mark-knock" d="M170 101V110M170 114V115" />
      </g>
    </svg>
  `,
  styleUrl: './illustration.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IlloLineFrayed {
  /** Accessible description of the state; override when the context says more. */
  readonly label = input('A frayed string between two tin cans: something tampered with the line');
  /** Rendered width in px (height follows the 2:1 viewBox); never wider than the container. */
  readonly width = input(320);

  protected readonly cans = [LEFT_CAN, RIGHT_CAN];
  protected readonly transform = canTransform;
  protected readonly canParts = CAN_PARTS;
}
