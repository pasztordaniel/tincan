import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTincanServer } from '../src/app.js';

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
  });
});
