import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LEFT_CAN, CAN_PARTS, canTransform } from './can-pose';

/** The left can, nudged right to leave room for the sound waves at its mouth. */
const SENDER_CAN = { ...LEFT_CAN, x: 78 };

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
          d="M120.6 118C126 70 134 36 148 32C160 29 164 18 154 16 C144 14 142 30 158 34C210 42 270 64 320 90"
        />
      } @else {
        <path class="string" d="M120.6 118C126 60 138 32 158 32C210 34 270 64 320 90" />
      }
      <path class="waves anim-hum" d="M30 94Q24 107 30 120M18 86Q8 107 18 128" />
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
  /**
   * The line is live: only then does the string carry its cursive "e" loop. Waiting and every
   * trouble state draw a plain arc.
   */
  readonly live = input(true);

  protected readonly cans = [SENDER_CAN];
  protected readonly transform = canTransform;
  protected readonly canParts = CAN_PARTS;
}
