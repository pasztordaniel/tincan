import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LEFT_CAN, RIGHT_CAN, CAN_PARTS, canTransform } from './can-pose';

/** Placeholder art, swap freely. Idle warning: open scissors approach the string, not cutting yet. */
@Component({
  selector: 'app-illo-line-snip',
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
      <path class="string" d="M102.6 118C108 60 120 32 140 32C190 32 206 150 241 145" />
      <!-- Open scissors closing in on the string, blades still clear of it. -->
      <g class="snip">
        <path class="mark" d="M212 50L195.2 56.3M212 50L204.3 66.3" />
        <path class="mark" d="M212 50L221.4 46.5M212 50L216.3 41" />
        <circle class="mark" cx="227.9" cy="44" r="6" />
        <circle class="mark" cx="219.3" cy="34.6" r="6" />
        <circle class="mark-fill" cx="212" cy="50" r="2" />
      </g>
    </svg>
  `,
  styleUrl: './illustration.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IlloLineSnip {
  /** Accessible description of the state; override when the context says more. */
  readonly label = input(
    'Open scissors closing in on the string between two tin cans: the line is about to be cut',
  );
  /** Rendered width in px (height follows the 2:1 viewBox); never wider than the container. */
  readonly width = input(320);

  protected readonly cans = [LEFT_CAN, RIGHT_CAN];
  protected readonly transform = canTransform;
  protected readonly canParts = CAN_PARTS;
}
