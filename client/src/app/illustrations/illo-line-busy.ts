import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LEFT_CAN, RIGHT_CAN, CAN_PARTS, canTransform } from './can-pose';

/** Placeholder art, swap freely. Line busy: a second string knotted onto the line. */
@Component({
  selector: 'app-illo-line-busy',
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
      <path class="string" d="M102.6 118C135 132 195 156 241 145" />
      <!-- On mount the second string draws in and ties its knot onto the first (see illustration.scss). -->
      <path class="string-alt knot-strand" pathLength="1" d="M146 74Q184 98 193 141" />
      <circle class="string-alt knot-loop" pathLength="1" cx="197" cy="146" r="5.5" />
      <path class="string-alt knot-tails" d="M202.5 149L211 154M191.5 149L185 155" />
    </svg>
  `,
  styleUrl: './illustration.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IlloLineBusy {
  /** Accessible description of the state; override when the context says more. */
  readonly label = input(
    'A second string knotted onto the line: someone else is already listening',
  );
  /** Rendered width in px (height follows the 2:1 viewBox); never wider than the container. */
  readonly width = input(320);

  protected readonly cans = [LEFT_CAN, RIGHT_CAN];
  protected readonly transform = canTransform;
  protected readonly canParts = CAN_PARTS;
}
