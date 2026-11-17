import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LEFT_CAN, RIGHT_CAN, CAN_PARTS, canTransform } from './can-pose';

/** Placeholder art, swap freely. Home: two cans, one string. */
@Component({
  selector: 'app-illo-home',
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
      <path
        class="string"
        d="M102.6 118C108 70 116 36 130 32C142 29 146 18 136 16 C126 14 124 30 140 34C200 44 206 150 241 145"
      />
    </svg>
  `,
  styleUrl: './illustration.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IlloHome {
  /** Accessible description of the state; override when the context says more. */
  readonly label = input('Two tin cans joined by a string');
  /** Rendered width in px (height follows the 2:1 viewBox); never wider than the container. */
  readonly width = input(320);

  protected readonly cans = [LEFT_CAN, RIGHT_CAN];
  protected readonly transform = canTransform;
  protected readonly canParts = CAN_PARTS;
}
