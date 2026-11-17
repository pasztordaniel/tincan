import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  input,
  type OnChanges,
  type SimpleChanges,
  viewChild,
} from '@angular/core';
import { RIGHT_CAN, CAN_PARTS, canTransform } from './can-pose';
import { StringPulse } from './string-pulse';

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
        <!-- Picked up: the can wobbles once when the line goes live. -->
        <g [class.can-wobble]="live()">
          <g [attr.transform]="transform(can)">
            @for (part of canParts; track part.part) {
              <path [attr.class]="part.part" [attr.d]="part.d" />
            }
          </g>
        </g>
      }
      <!-- Mirrors the sender: in level from the left edge, the cursive "e" loop, then low into the can. -->
      <path
        #wire
        class="string"
        [class.string--live]="live()"
        [class.string--after-tail]="live()"
        [class.string--waiting]="!live()"
        pathLength="1"
        d="M0 100C30 100 76.6 122 99.6 121C129.6 119 149.6 105 145.6 83C141.6 63 117.6 53 99.6 63C77.6 77 81.6 121 99.6 131C121.6 143 191.6 145 241 145"
      />
      @if (live()) {
        <path
          #pulse
          class="pulse"
          pathLength="1"
          d="M0 100C30 100 76.6 122 99.6 121C129.6 119 149.6 105 145.6 83C141.6 63 117.6 53 99.6 63C77.6 77 81.6 121 99.6 131C121.6 143 191.6 145 241 145"
        />
      }
    </svg>
    <!-- Full-bleed hero only: the string reaches in from the viewport's left edge to the art's (x 0,
         y 100), so a sender window placed to the left continues the same line. -->
    <span
      #tail
      class="tail tail--left"
      [class.tail--live]="live()"
      [class.tail--waiting]="!live()"
      aria-hidden="true"
    ></span>
  `,
  styleUrl: './illustration.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IlloReceiver implements OnChanges {
  /** Accessible description of the state; override when the context says more. */
  readonly label = input('A tin can, its string coming in from the left');
  /** Rendered width in px (height follows the 2:1 viewBox); never wider than the container. */
  readonly width = input(320);
  /** The line is live: the string draws in, sways briefly and carries the pulses; dim otherwise. */
  readonly live = input(true);
  /** Any change (the text that just arrived) sends a pulse along the live string, towards the can. */
  readonly pulse = input<unknown>(undefined);

  protected readonly cans = [RIGHT_CAN];
  protected readonly transform = canTransform;
  protected readonly canParts = CAN_PARTS;

  private readonly pulsePath = viewChild<ElementRef<SVGPathElement>>('pulse');
  private readonly livePath = viewChild<ElementRef<SVGPathElement>>('wire');
  private readonly tail = viewChild<ElementRef<HTMLElement>>('tail');

  private readonly pulser = new StringPulse();

  ngOnChanges(changes: SimpleChanges): void {
    const change = changes['pulse'];
    if (change && !change.firstChange) {
      this.pulser.fire(
        this.pulsePath()?.nativeElement,
        this.livePath()?.nativeElement,
        this.tail()?.nativeElement,
      );
    }
  }
}
