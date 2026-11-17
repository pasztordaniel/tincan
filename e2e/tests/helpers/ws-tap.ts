import type { Page } from '@playwright/test';

/**
 * Sits between a page and the real relay (Playwright `routeWebSocket`, forwarding everything) so a
 * spec can see, corrupt or re-deliver the `frame` events the page receives. Test-only.
 *
 * Wire format: engine.io text packet `4` (message) + socket.io packet `2` (event) + JSON, e.g.
 * `42["frame",{"v":1,"seq":3,"iv":"...","ct":"..."}]` (server to client events carry no ack id).
 */
export class FrameTap {
  /** Raw packets of every `frame` event delivered to the page, in order (genuine ones only). */
  readonly delivered: string[] = [];
  /** Flip a byte in the ciphertext of every frame while true. */
  tamper = false;

  private toPage?: (data: string) => void;

  static async install(page: Page): Promise<FrameTap> {
    const tap = new FrameTap();
    await page.routeWebSocket(/\/socket\.io\//, (ws) => {
      const server = ws.connectToServer();
      tap.toPage = (data) => ws.send(data);
      ws.onMessage((message) => server.send(message));
      server.onMessage((message) => {
        if (typeof message !== 'string' || !isFramePacket(message)) {
          ws.send(message);
          return;
        }
        if (tap.tamper) {
          ws.send(flipCiphertextByte(message));
        } else {
          tap.delivered.push(message);
          ws.send(message);
        }
      });
    });
    return tap;
  }

  /** Delivers a previously delivered frame packet to the page again, byte for byte. */
  replay(index: number): void {
    const packet = this.delivered[index];
    if (!packet || !this.toPage) throw new Error(`no delivered frame at index ${index}`);
    this.toPage(packet);
  }
}

function isFramePacket(data: string): boolean {
  return data.startsWith('42["frame",');
}

/** Changes the first base64url character of `ct` to a different valid one: the first byte differs. */
function flipCiphertextByte(packet: string): string {
  const [event, frame] = JSON.parse(packet.slice(2)) as [string, { ct: string }];
  const first = frame.ct[0] === 'A' ? 'B' : 'A';
  return `42${JSON.stringify([event, { ...frame, ct: first + frame.ct.slice(1) }])}`;
}
