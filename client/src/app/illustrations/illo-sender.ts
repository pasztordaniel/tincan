import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  input,
  type OnChanges,
  type SimpleChanges,
  viewChild,
} from '@angular/core';
import { LEFT_CAN, CAN_PARTS, canTransform } from './can-pose';
import { StringPulse } from './string-pulse';

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
      @if (snip()) {
        <!-- About to be cut: the plain line starts to sag and open scissors close in near the edge;
             each half is one blade plus the opposite handle, and they snap twice on mount. -->
        <path class="string" d="M120.6 118C160 132 240 152 320 138" />
        <g class="snip">
          <g class="snip-blade snip-blade--a">
            <path class="mark" d="M294 122L277.2 128.3M294 122L303.4 118.5" />
            <circle class="mark" cx="309.9" cy="116" r="6" />
          </g>
          <g class="snip-blade snip-blade--b">
            <path class="mark" d="M294 122L286.3 138.3M294 122L298.3 113" />
            <circle class="mark" cx="301.3" cy="106.6" r="6" />
          </g>
          <circle class="mark-fill" cx="294" cy="122" r="2" />
        </g>
      } @else {
        <!-- The line is open: the string always carries its cursive "e" loop; dim while waiting. -->
        <path
          #wire
          class="string"
          [class.string--live]="live()"
          [class.string--waiting]="!live()"
          pathLength="1"
          d="M120.6 118C170 118 240 116 262 104C280 94 284 50 262 36C244 26 220 36 216 56C212 78 232 92 262 94C285 95 305 90 320 86"
        />
        @if (live()) {
          <path
            #pulse
            class="pulse"
            pathLength="1"
            d="M120.6 118C170 118 240 116 262 104C280 94 284 50 262 36C244 26 220 36 216 56C212 78 232 92 262 94C285 95 305 90 320 86"
          />
        }
      }
      <path class="waves anim-hum" d="M30 94Q24 107 30 120M18 86Q8 107 18 128" />
    </svg>
  `,
  styleUrl: './illustration.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IlloSender implements OnChanges {
  /** Accessible description of the state; override when the context says more. */
  readonly label = input('Your tin can, its string running off to the right');
  /** Rendered width in px (height follows the 2:1 viewBox); never wider than the container. */
  readonly width = input(320);
  /** The other can is on the line: the string draws in, sways briefly and carries the pulses. */
  readonly live = input(true);
  /** Idle, about to be cut: a plain sagging line with open scissors near the edge, no loop. */
  readonly snip = input(false);
  /** Any change (the text that was just sent) sends a pulse along the live string. */
  readonly pulse = input<unknown>(undefined);

  protected readonly cans = [SENDER_CAN];
  protected readonly transform = canTransform;
  protected readonly canParts = CAN_PARTS;

  private readonly pulsePath = viewChild<ElementRef<SVGPathElement>>('pulse');
  private readonly livePath = viewChild<ElementRef<SVGPathElement>>('wire');

  private readonly pulser = new StringPulse();

  ngOnChanges(changes: SimpleChanges): void {
    const change = changes['pulse'];
    if (change && !change.firstChange) {
      this.pulser.fire(this.pulsePath()?.nativeElement, this.livePath()?.nativeElement);
    }
  }
}
