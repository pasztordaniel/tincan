import { fileURLToPath } from 'node:url';
import { APP_NAME } from '@tincan/shared';
import { createTincanServer } from './app.js';

const port = Number(process.env['PORT'] ?? 3000);
// Works from both src/ (tsx) and dist/ (node): each is one level below server/.
const clientDir = fileURLToPath(new URL('../../client/dist/client/browser', import.meta.url));

const { httpServer } = createTincanServer({ clientDir });

httpServer.listen(port, () => {
  console.log(`${APP_NAME} server listening on http://localhost:${port}`);
});
