import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import qrcode from 'qrcode-generator';

/** Quiet zone in modules; the QR spec asks for 4, and scanners are less forgiving without it. */
export const QR_QUIET_ZONE = 4;

export interface QrShape {
  /** Modules per side, quiet zone included. */
  size: number;
  /** One path of horizontal runs of dark modules, in module units. */
  path: string;
}

/**
 * Encodes `payload` (byte mode, error correction M) and describes it as one SVG path. Pure and local:
 * no canvas, no image, no network. Exported for the tests.
 */
export function qrShape(payload: string): QrShape {
  // Type 0 picks the smallest version that fits. Level M: the receiver link is long (it holds the key),
  // so a lower level keeps the module grid coarse enough to scan from a phone held beside the screen.
  // make() throws past the version-40 capacity; the link (about 90 characters) is bounded far below it.
  const qr = qrcode(0, 'M');
  // The library keeps only the low byte of each UTF-16 unit. Hand it the UTF-8 bytes as a Latin-1 string,
  // so non-ASCII text is encoded as UTF-8 (what scanners expect) instead of being silently truncated.
  qr.addData(String.fromCharCode(...new TextEncoder().encode(payload)), 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  let path = '';
  for (let row = 0; row < count; row++) {
    let col = 0;
    while (col < count) {
      if (!qr.isDark(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < count && qr.isDark(row, col)) col++;
      path += `M${start + QR_QUIET_ZONE} ${row + QR_QUIET_ZONE}h${col - start}v1h-${col - start}z`;
    }
  }
  return { size: count + 2 * QR_QUIET_ZONE, path };
}

/**
 * A QR code as inline SVG built from template bindings: no `innerHTML`, no `bypassSecurityTrust*`, no
 * `data:` image, so it needs nothing from the CSP. Dark modules on a light ground in every theme, because
 * scanners expect dark-on-light.
 */
@Component({
  selector: 'app-qr-code',
  template: `
    <svg
      class="qr"
      role="img"
      [attr.aria-label]="label()"
      [attr.viewBox]="'0 0 ' + shape().size + ' ' + shape().size"
      shape-rendering="crispEdges"
    >
      <rect class="qr__light" width="100%" height="100%" />
      <path class="qr__dark" [attr.d]="shape().path" />
    </svg>
  `,
  styles: `
    :host {
      display: block;
      max-width: 100%;
    }
    .qr {
      display: block;
      width: min(100%, 14rem);
      max-width: 100%;
      height: auto;
      aspect-ratio: 1;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-md);
    }
    .qr__light {
      fill: var(--qr-light);
    }
    .qr__dark {
      fill: var(--qr-dark);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrCode {
  /** The exact text to encode. */
  readonly payload = input.required<string>();
  readonly label = input('QR code for the receiver link');

  protected readonly shape = computed(() => qrShape(this.payload()));
}
