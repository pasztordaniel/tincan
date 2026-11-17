import { existsSync, readFileSync } from 'node:fs';
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
import { BASE_HEADERS, securityHeaders, sendIndex, setStaticHeaders } from './headers.js';

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

/** Checks the decoded path too, so `/%2eenv` cannot slip past. Undecodable paths are left to the 400 handler. */
function hasDotSegment(path: string): boolean {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // keep the raw path
  }
  return [path, decoded].some((p) => p.split(/[/\\]/).some((segment) => segment.startsWith('.')));
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
  // First, so that every response below (static, fallback, 404, errors) carries the headers.
  app.use(securityHeaders());

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', app: APP_NAME });
  });

  const { clientDir } = options;
  if (clientDir && existsSync(join(clientDir, 'index.html'))) {
    // Read once: index.html is a template whose CSP nonce is filled in per response.
    const indexTemplate = readFileSync(join(clientDir, 'index.html'), 'utf8');
    // Dotfiles and dot-directories (.git, .env, ...) are never served, nor answered with the SPA.
    app.use((req, res, next) => {
      if (hasDotSegment(req.path)) {
        sendStatus(res, 404);
        return;
      }
      next();
    });
    app.get(['/', '/index.html'], (_req, res) => {
      sendIndex(res, indexTemplate);
    });
    // `index: false`: "/" is handled above so the nonce is always injected.
    app.use(
      express.static(clientDir, { index: false, dotfiles: 'deny', setHeaders: setStaticHeaders }),
    );
    // SPA fallback: client routes (e.g. /r/<id>) get index.html; anything that looks like a
    // file (has an extension) and was not found above stays a 404 instead of returning HTML.
    app.get('/{*path}', (req, res, next) => {
      if (extname(req.path)) {
        next();
        return;
      }
      sendIndex(res, indexTemplate);
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

  // socket.io answers its own paths before Express sees them, so add the headers here too (not
  // the CSP: those responses are not documents).
  io.engine.on('headers', (headers: Record<string, string>) => {
    // engine.io already sets its own `Cache-Control: no-store`; do not duplicate it.
    for (const [name, value] of Object.entries(BASE_HEADERS)) {
      if (name !== 'Cache-Control') headers[name] = value;
    }
  });

  io.on('connection', () => {
    // Placeholder: session handlers arrive with T05. Intentionally logs nothing.
  });

  return { app, httpServer, io };
}
