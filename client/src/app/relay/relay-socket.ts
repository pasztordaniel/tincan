import { InjectionToken } from '@angular/core';
import type { ClientToServerEvents, ServerToClientEvents } from '@tincan/shared';
import { io, type Socket } from 'socket.io-client';

export type TincanSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Creates the (not yet connected) socket. Injectable so tests can hand in a fake.
 *
 * - `websocket` only: no long-polling fallback, so there is one connection per tab and a resume
 *   never races a lingering polling request of the old transport.
 * - socket.io's own reconnection stays on (the only reconnect logic we use); the service bounds it with
 *   the server's grace period. Offline emits are never buffered, see `RelayService.sendFrame`.
 */
export const RELAY_SOCKET_FACTORY = new InjectionToken<() => TincanSocket>('RELAY_SOCKET_FACTORY', {
  providedIn: 'root',
  factory: () => () =>
    io({
      autoConnect: false,
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      reconnectionAttempts: Infinity,
    }),
});
