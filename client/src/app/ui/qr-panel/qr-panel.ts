import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { ButtonDirective } from '../button/button';
import { QrCode } from '../qr-code/qr-code';

let nextId = 0;

/**
 * "Show QR code" toggle for the receiver link, closed by default: the code carries the decryption key,
 * so anyone with a camera in view could scan it. The owner hides it by not rendering this component
 * (the sender page does that once the line is no longer waiting).
 */
@Component({
  selector: 'app-qr-panel',
  imports: [QrCode, ButtonDirective],
  template: `
    <div class="qrp">
      <button
        type="button"
        appButton="secondary"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="regionId"
        [attr.aria-describedby]="hintId"
        (click)="open.set(!open())"
      >
        {{ open() ? 'Hide QR code' : 'Show QR code' }}
      </button>
      <p class="qrp__hint" [id]="hintId">Anyone who scans this can read your messages.</p>
      <div [id]="regionId">
        @if (open()) {
          <app-qr-code [payload]="link()" />
        }
      </div>
    </div>
  `,
  styles: `
    .qrp {
      display: grid;
      justify-items: start;
      gap: var(--space-2);
    }
    .qrp__hint {
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrPanel {
  /** The full receiver link, key included. */
  readonly link = input.required<string>();
  readonly open = model(false);

  private readonly uid = 'qr-panel-' + nextId++;
  protected readonly regionId = this.uid + '-region';
  protected readonly hintId = this.uid + '-hint';
}
