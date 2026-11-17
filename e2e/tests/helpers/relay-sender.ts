/**
 * A bare-bones sender for specs that need a real session without driving the sender UI: speaks the
 * socket.io v4 wire format over Node's built-in WebSocket. Test-only; it never sees any key.
 */
export class RelaySender {
  /** `peer` states the relay reported, in order. */
  readonly peers: string[] = [];
  sessionId = '';

  private ws!: WebSocket;
  private nextAck = 1;
  private readonly acks = new Map<number, (payload: unknown) => void>();

  static async create(baseURL: string): Promise<RelaySender> {
    const sender = new RelaySender();
    const url = new URL('/socket.io/', baseURL);
    url.protocol = 'ws:';
    url.search = 'EIO=4&transport=websocket';
    sender.ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      sender.ws.addEventListener('error', () => reject(new Error('relay socket error')));
      sender.ws.addEventListener('message', (event) => {
        const data = String(event.data);
        if (data === '2')
          sender.ws.send('3'); // engine.io ping -> pong
        else if (data.startsWith('0'))
          sender.ws.send('40'); // engine open -> connect namespace
        else if (data.startsWith('40')) resolve();
        else sender.onPacket(data);
      });
    });
    const result = (await sender.emit('session:create')) as { ok: boolean; sessionId: string };
    if (!result.ok) throw new Error('create failed');
    sender.sessionId = result.sessionId;
    return sender;
  }

  private onPacket(data: string): void {
    const ack = /^43(\d+)(.*)$/s.exec(data);
    if (ack) {
      const [first] = JSON.parse(ack[2]!) as unknown[];
      this.acks.get(Number(ack[1]))?.(first);
      return;
    }
    if (data.startsWith('42')) {
      const [event, payload] = JSON.parse(data.slice(2)) as [string, { state?: string }];
      if (event === 'peer' && payload.state) this.peers.push(payload.state);
    }
  }

  private emit(event: string): Promise<unknown> {
    const id = this.nextAck++;
    return new Promise((resolve) => {
      this.acks.set(id, resolve);
      this.ws.send(`42${id}${JSON.stringify([event])}`);
    });
  }

  close(): void {
    this.ws.close();
  }
}

/** A well-formed key (43 base64url chars, canonical). Its value is irrelevant for the gate specs. */
export const SAMPLE_KEY = 'A'.repeat(43);
