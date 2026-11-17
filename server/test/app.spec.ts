import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTincanServer, isAllowedOrigin } from '../src/app.js';
import { wsHandshake } from './ws-handshake.js';

describe('server app', () => {
  let clientDir: string;

  beforeAll(() => {
    // A fake client build keeps this test independent of whether `ng build` has run.
    clientDir = mkdtempSync(join(tmpdir(), 'tincan-client-'));
    writeFileSync(join(clientDir, 'index.html'), '<!doctype html><title>tincan</title>');
  });

  afterAll(() => {
    rmSync(clientDir, { recursive: true, force: true });
  });

  it('GET /healthz returns 200 without a client build', async () => {
    const { app } = createTincanServer();
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', app: 'tincan' });
  });

  it('GET / serves the client index.html', async () => {
    const { app } = createTincanServer({ clientDir });
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>tincan</title>');
  });

  it('falls back to index.html for client routes but 404s missing files', async () => {
    const { app } = createTincanServer({ clientDir });
    const route = await request(app).get('/r/some-session');
    expect(route.status).toBe(200);
    expect(route.text).toContain('<title>tincan</title>');

    const missing = await request(app).get('/missing.js');
    expect(missing.status).toBe(404);
    expect(missing.text).toBe('Not Found');
  });

  it('answers a malformed URL with a bare 400 that echoes nothing', async () => {
    const { app } = createTincanServer({ clientDir });
    const res = await request(app).get('/%E0%A4%A');
    expect(res.status).toBe(400);
    expect(res.text).toBe('Bad Request');
    expect(res.text).not.toContain('%E0');
    expect(res.text).not.toMatch(/\bat\s/);
  });
});

describe('socket.io origin check', () => {
  async function upgrade(headers: Record<string, string>) {
    const { httpServer, io } = createTincanServer();
    try {
      return await wsHandshake(httpServer, headers);
    } finally {
      await io.close();
    }
  }

  it('accepts a WebSocket handshake whose Origin matches Host', async () => {
    const res = await upgrade({ Host: 'tincan.test', Origin: 'http://tincan.test' });
    expect(res.status).toBe(101);
  });

  it('accepts an Origin-less WebSocket handshake (non-browser clients; tokens authorize, see T13-6)', async () => {
    const res = await upgrade({ Host: 'tincan.test' });
    expect(res.status).toBe(101);
  });

  it('rejects a WebSocket handshake from a foreign or opaque Origin', async () => {
    // engine.io refuses every upgrade with 400 and names the reason in the body.
    for (const origin of ['http://evil.test', 'null']) {
      const res = await upgrade({ Host: 'tincan.test', Origin: origin });
      expect(res).toMatchObject({ status: 400, body: 'Forbidden' });
    }
  });

  it('offers no long-polling transport, so an Origin-less cross-site GET opens nothing', async () => {
    const { httpServer, io } = createTincanServer();
    try {
      const noOrigin = await request(httpServer).get('/socket.io/?EIO=4&transport=polling');
      expect(noOrigin.status).toBe(400);
      expect(noOrigin.text).not.toContain('"sid"');
      const sameOrigin = await request(httpServer)
        .get('/socket.io/?EIO=4&transport=polling')
        .set('Host', 'tincan.test')
        .set('Origin', 'http://tincan.test');
      expect(sameOrigin.status).toBe(400);
      expect(sameOrigin.text).not.toContain('"sid"');
    } finally {
      await io.close();
    }
  });
});

describe('isAllowedOrigin', () => {
  it.each([
    ['same host and port', 'http://localhost:4200', 'localhost:4200', true],
    ['default port omitted on both', 'https://tincan.test', 'tincan.test', true],
    ['different port', 'http://localhost:4200', 'localhost:3000', false],
    ['different host', 'http://evil.test', 'tincan.test', false],
    ['opaque origin', 'null', 'tincan.test', false],
    ['missing Host', 'http://tincan.test', undefined, false],
    ['missing Origin (same-origin GET or non-browser client)', undefined, 'tincan.test', true],
  ] as const)('%s', (_name, origin, host, expected) => {
    expect(isAllowedOrigin(origin, host)).toBe(expected);
  });
});
