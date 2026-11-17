import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/** Status and headers of a raw engine.io handshake: 101 for an accepted WebSocket upgrade. */
export interface HandshakeResult {
  status: number;
  /** Body of a refused upgrade; engine.io answers every refusal with 400 and names the reason here. */
  body: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Sends one raw WebSocket upgrade (what the client sends) for the socket.io path to `httpServer`,
 * listening on an ephemeral loopback port if it is not yet, and reports the answer. An accepted
 * upgrade is closed at once.
 */
export async function wsHandshake(
  httpServer: Server,
  headers: Record<string, string> = {},
): Promise<HandshakeResult> {
  if (!httpServer.listening) {
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  }
  const { port } = httpServer.address() as AddressInfo;
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      host: '127.0.0.1',
      port,
      path: '/socket.io/?EIO=4&transport=websocket',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        ...headers,
      },
    });
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolve({ status: res.statusCode ?? 0, body: '', headers: res.headers });
    });
    req.on('response', (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}
