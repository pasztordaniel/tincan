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
      <path class="string" d="M102.6 118C108 60 120 32 140 32C150 32 159 37 166.3 44.2" />
      <path class="string" d="M177.3 57.4C194 79 210 147 241 145" />
      <path
        class="string string--fray"
        d="M166.3 44.2Q167.5 55 177.3 57.4M166.3 44.2Q177 46 177.3 57.4M166.3 44.2Q171 51 177.3 57.4M171.5 49.5L177 43.5M172 51.5L166 56"
      />
      <path class="mark-fill" d="M198 10L215 38H181Z" />
      <path class="mark-knock" d="M198 19V28M198 32V33" />
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
