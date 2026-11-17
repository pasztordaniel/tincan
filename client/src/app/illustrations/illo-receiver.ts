import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RIGHT_CAN, CAN_PARTS, canTransform } from './can-pose';

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
      @if (live()) {
        <path
          class="string"
          d="M0 72C40 42 96 30 120 32C132 29 136 18 126 16 C116 14 114 30 130 34C180 44 200 150 241 145"
        />
      } @else {
        <path class="string" d="M0 72C40 42 90 28 128 32C180 38 200 150 241 145" />
      }
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
  /**
   * The line is live: only then does the string carry its cursive "e" loop. Waiting and every
   * trouble state draw a plain arc.
   */
  readonly live = input(true);

  protected readonly cans = [RIGHT_CAN];
  protected readonly transform = canTransform;
  protected readonly canParts = CAN_PARTS;
}
