import { existsSync } from 'node:fs';
import {
  createServer,
  STATUS_CODES,
  type IncomingMessage,
  type Server as HttpServer,
} from 'node:http';
import { extname, join } from 'node:path';
import express, { type ErrorRequestHandler, type Express } from 'express';
import { Server as SocketServer } from 'socket.io';
import { APP_NAME } from '@tincan/shared';

export interface AppOptions {
  /** Directory holding the built Angular app (`index.html` + assets). Optional so the API runs without a client build. */
  clientDir?: string;
}

export interface TincanServer {
  app: Express;
  httpServer: HttpServer;
  io: SocketServer;
}

/**
 * Decides whether a socket.io handshake may proceed, based on its `Origin` and `Host` headers.
 *
 * A missing Origin is allowed: browsers may omit it on same-origin GETs (socket.io's first polling
 * request). Cross-site pages can also send Origin-less no-cors GETs (e.g. an <img> pointing at the
 * polling URL), which open an engine.io handshake, but they cannot read the returned sid, so they
 * can never complete the socket.io connect. Therefore a completed handshake is NOT proof of same
 * origin; session authorisation (T05) relies on tokens. Every WebSocket handshake carries Origin.
 * Non-browser clients can forge any header; this check defends against cross-site pages only.
 */
export function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined) return true;
  if (!host) return false;
  try {
    // URL.host drops default ports, so normalise the Host header the same way before comparing.
    const originHost = new URL(origin).host;
    const requestHost = new URL(`http://${host}`).host;
    return originHost === requestHost;
  } catch {
    // Includes the opaque origin "null" (sandboxed iframes, file://), which never matches.
    return false;
  }
}

function sendStatus(res: express.Response, status: number): void {
  res
    .status(status)
    .type('text/plain')
    .send(STATUS_CODES[status] ?? 'Error');
}

export function createTincanServer(options: AppOptions = {}): TincanServer {
  const app = express();
  app.disable('x-powered-by');

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', app: APP_NAME });
  });

  const { clientDir } = options;
  if (clientDir && existsSync(join(clientDir, 'index.html'))) {
    app.use(express.static(clientDir, { index: 'index.html' }));
    // SPA fallback: client routes (e.g. /r/<id>) get index.html; anything that looks like a
    // file (has an extension) and was not found above stays a 404 instead of returning HTML.
    app.get('/{*path}', (req, res, next) => {
      if (extname(req.path)) {
        next();
        return;
      }
      res.sendFile('index.html', { root: clientDir });
    });
  }

  // Express's defaults echo the request path ("Cannot GET /...") and, outside production, the
  // stack trace; these replacements return a bare status and log nothing taken from the request.
  app.use((_req, res) => {
    sendStatus(res, 404);
  });
  const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
    if (res.headersSent) {
      req.socket.destroy();
      return;
    }
    const status = (err as { status?: unknown } | null)?.status;
    sendStatus(res, typeof status === 'number' && status >= 400 && status < 600 ? status : 500);
  };
  app.use(errorHandler);

  const httpServer = createServer(app);
  const io = new SocketServer(httpServer, {
    // The client bundles socket.io-client itself; no need to serve /socket.io/socket.io.js.
    serveClient: false,
    // No CORS headers are set, but WebSocket handshakes are not covered by CORS at all, so
    // cross-site pages are rejected here. In dev the Angular proxy keeps the original Host
    // (no changeOrigin), so the browser's Origin still matches.
    allowRequest: (req: IncomingMessage, callback) => {
      callback(null, isAllowedOrigin(req.headers.origin, req.headers.host));
    },
  });

  io.on('connection', () => {
    // Placeholder: session handlers arrive with T05. Intentionally logs nothing.
  });

  return { app, httpServer, io };
}
