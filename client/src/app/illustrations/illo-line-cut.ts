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
      <!-- On mount the scissors snap shut once and the two ends spring apart (see illustration.scss). -->
      <path class="string cut-end cut-end--left" d="M102.6 118C118.8 125 141.9 134.5 166.7 140.9" />
      <path class="string cut-end cut-end--right" d="M241 145C223.5 149.2 204 148.3 184.8 144.8" />
      <g class="cut-blade cut-blade--a">
        <path class="mark" d="M175.7 121L165.7 143M175.7 121L183.7 103" />
        <circle class="mark" cx="186.7" cy="95" r="8" />
      </g>
      <g class="cut-blade cut-blade--b">
        <path class="mark" d="M175.7 121L185.7 143M175.7 121L167.7 103" />
        <circle class="mark" cx="164.7" cy="95" r="8" />
      </g>
      <circle class="mark-fill" cx="175.7" cy="121" r="2.5" />
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
