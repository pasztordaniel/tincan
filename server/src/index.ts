import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_NAME } from '@tincan/shared';
import { createTincanServer } from './app.js';
import { missingClientBuild, parsePort, portWarning } from './config.js';

const SHUTDOWN_TIMEOUT_MS = 5_000;

const port = parsePort(process.env['PORT']);
const badPort = portWarning(process.env['PORT']);
if (badPort) console.warn(`${APP_NAME}: ${badPort}`);

// Works from both src/ (tsx) and dist/ (node): each is one level below server/.
const clientDir = fileURLToPath(new URL('../../client/dist/client/browser', import.meta.url));
if (!existsSync(join(clientDir, 'index.html'))) {
  if (missingClientBuild(process.env['NODE_ENV']) === 'fail') {
    console.error(`${APP_NAME} server failed to start: client build missing (run npm run build)`);
    process.exit(1);
  }
  console.warn(`${APP_NAME}: no client build found; serving only /healthz and socket.io`);
}

const { httpServer, io, relay } = createTincanServer({ clientDir });

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  const reason =
    err.code === 'EADDRINUSE'
      ? `port ${port} is already in use (set PORT to use another one)`
      : err.code === 'EACCES'
        ? `no permission to listen on port ${port}`
        : err.message;
  console.error(`${APP_NAME} server failed to start: ${reason}`);
  process.exit(1);
});

httpServer.listen(port, () => {
  console.log(`${APP_NAME} server listening on http://localhost:${port}`);
});

function shutdown(): void {
  // Connections that refuse to close must not keep the process alive. A second signal hits
  // Node's default handler (listeners are `once`) and exits immediately.
  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
  // Tell both parties of every session why it ended before their sockets close.
  relay.close();
  // io.close() disconnects every socket and closes the underlying HTTP server.
  void io.close(() => process.exit(0));
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
