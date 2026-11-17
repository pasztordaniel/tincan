import { existsSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import { extname, join } from 'node:path';
import express, { type Express } from 'express';
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

  const httpServer = createServer(app);
  // Same-origin only (no CORS); in dev the Angular proxy makes socket.io same-origin too.
  const io = new SocketServer(httpServer);

  io.on('connection', () => {
    // Placeholder: session handlers arrive with T05. Intentionally logs nothing.
  });

  return { app, httpServer, io };
}
