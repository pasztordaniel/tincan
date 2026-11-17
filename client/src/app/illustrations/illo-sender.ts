import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LEFT_CAN, canTransform } from './can-pose';

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
        d="M120.6 118C126 70 134 36 148 32C160 29 164 18 154 16 C144 14 142 30 158 34C210 42 270 64 320 90"
      />
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

  protected readonly cans = [SENDER_CAN];
  protected readonly transform = canTransform;
}
