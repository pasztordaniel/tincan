import { existsSync, readFileSync } from 'node:fs';
import {
  createServer,
  STATUS_CODES,
  type IncomingMessage,
  type Server as HttpServer,
} from 'node:http';
import { extname, join, posix } from 'node:path';
import express, { type ErrorRequestHandler, type Express } from 'express';
import { Server as SocketServer } from 'socket.io';
import { APP_NAME, MAX_MESSAGE_BYTES } from '@tincan/shared';
import { BASE_HEADERS, securityHeaders, sendIndex, setStaticHeaders } from './headers.js';
import { DEFAULT_RELAY_OPTIONS, type RelayOptions } from './relay/options.js';
import { attachRelay, type Relay, type RelayServer } from './relay/relay.js';

export interface AppOptions {
  /** Directory holding the built Angular app (`index.html` + assets). Optional so the API runs without a client build. */
  clientDir?: string;
  /** Relay timing overrides (tests only); production uses the protocol constants. */
  relay?: Partial<RelayOptions>;
}

export interface TincanServer {
  app: Express;
  httpServer: HttpServer;
  io: RelayServer;
  relay: Relay;
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

/** Decodes like express.static does; undecodable paths stay raw and are left to its 400 handling. */
function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** Checks the raw and the decoded path, so `/%2eenv` cannot slip past. */
function hasDotSegment(path: string, decoded: string): boolean {
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
    app.use((req, res, next) => {
      const decoded = decodePath(req.path);
      // Dotfiles and dot-directories (.git, .env, ...) are never served, nor answered with the SPA.
      if (hasDotSegment(req.path, decoded)) {
        sendStatus(res, 404);
        return;
      }
      // Every spelling of index.html (`/%69ndex.html`, `//index.html`, ...) goes through the
      // template, so express.static never serves the raw file with its placeholder and no nonce.
      const isGet = req.method === 'GET' || req.method === 'HEAD';
      if (isGet && (req.path === '/' || posix.basename(decoded).toLowerCase() === 'index.html')) {
        sendIndex(res, indexTemplate);
        return;
      }
      next();
    });
    // `index: false`: "/" and index.html are handled above so the nonce is always injected.
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
  const timing = { ...DEFAULT_RELAY_OPTIONS, ...options.relay };
  const io: RelayServer = new SocketServer(httpServer, {
    // Also the WebSocket maxPayload: larger messages close the connection before they are parsed.
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
    // A connection that never joins the namespace is closed as fast as an unbound socket (relay).
    connectTimeout: timing.unboundTimeoutMs,
    // Notices a half-open connection within 15 s instead of socket.io's 45 s (see the defaults).
    pingInterval: timing.pingIntervalMs,
    pingTimeout: timing.pingTimeoutMs,
    // The client bundles socket.io-client itself; no need to serve /socket.io/socket.io.js.
    serveClient: false,
    // No CORS headers are set, but WebSocket handshakes are not covered by CORS at all, so
    // cross-site pages are rejected here. In dev the Angular proxy keeps the original Host
    // (no changeOrigin), so the browser's Origin still matches.
    allowRequest: (req: IncomingMessage, callback) => {
      callback(null, isAllowedOrigin(req.headers.origin, req.headers.host));
    },
  });

  // socket.io answers its own paths before Express sees them, so add the base headers here too
  // (not the CSP: those responses are not documents). A listener prepended after socket.io has
  // attached runs first for every request, including engine.io's own 400/403 error responses,
  // which skip its `headers` event; engine.io's writeHead merges with headers set here.
  httpServer.prependListener('request', (_req, res) => {
    for (const [name, value] of Object.entries(BASE_HEADERS)) res.setHeader(name, value);
  });

  const relay = attachRelay(io, options.relay);

  return { app, httpServer, io, relay };
}
