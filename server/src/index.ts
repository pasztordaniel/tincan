import { fileURLToPath } from 'node:url';
import { APP_NAME } from '@tincan/shared';
import { createTincanServer } from './app.js';
import { parsePort } from './config.js';

const SHUTDOWN_TIMEOUT_MS = 5_000;

const port = parsePort(process.env['PORT']);
// Works from both src/ (tsx) and dist/ (node): each is one level below server/.
const clientDir = fileURLToPath(new URL('../../client/dist/client/browser', import.meta.url));

const { httpServer, io } = createTincanServer({ clientDir });

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
  // io.close() disconnects every socket and closes the underlying HTTP server.
  void io.close(() => process.exit(0));
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
