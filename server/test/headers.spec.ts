import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTincanServer } from '../src/app.js';
import { BASE_HEADERS, buildCsp } from '../src/headers.js';

const INDEX =
  '<!doctype html><title>tincan</title><app-root ngCspNonce="__CSP_NONCE__"></app-root>';

/** Asserts the headers every response must carry, except Cache-Control and the nonce part of the CSP. */
function expectBaseHeaders(headers: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(BASE_HEADERS)) {
    if (name === 'Cache-Control') continue;
    expect(headers[name.toLowerCase()], name).toBe(value);
  }
  expect(headers['x-powered-by']).toBeUndefined();
}

describe('security headers', () => {
  let clientDir: string;

  beforeAll(() => {
    clientDir = mkdtempSync(join(tmpdir(), 'tincan-headers-'));
    writeFileSync(join(clientDir, 'index.html'), INDEX);
    writeFileSync(join(clientDir, 'main-ABCD1234.js'), 'console.log(1)');
    writeFileSync(join(clientDir, 'favicon.ico'), 'x');
    writeFileSync(join(clientDir, '.env'), 'SECRET=1');
    mkdirSync(join(clientDir, '.git'));
    writeFileSync(join(clientDir, '.git', 'config'), 'secret');
  });

  afterAll(() => {
    rmSync(clientDir, { recursive: true, force: true });
  });

  it('has the expected static values', () => {
    expect(BASE_HEADERS['Referrer-Policy']).toBe('no-referrer');
    expect(BASE_HEADERS['X-Content-Type-Options']).toBe('nosniff');
    expect(BASE_HEADERS['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(BASE_HEADERS['Cross-Origin-Resource-Policy']).toBe('same-origin');
    expect(BASE_HEADERS['X-Frame-Options']).toBe('DENY');
    for (const feature of ['camera', 'microphone', 'geolocation']) {
      expect(BASE_HEADERS['Permissions-Policy']).toContain(`${feature}=()`);
    }
  });

  it('builds a CSP without unsafe-inline and with a nonce only for styles', () => {
    const csp = buildCsp('abc=');
    expect(csp).not.toContain('unsafe');
    expect(csp.split('; ')).toEqual([
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'nonce-abc='",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "base-uri 'self'",
      "form-action 'none'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "require-trusted-types-for 'script'",
      'trusted-types angular angular#bundler',
    ]);
    expect(buildCsp()).toContain("style-src 'self';");
  });

  it.each(['/', '/index.html', '/r/abc'])(
    '%s: all headers, no-store, nonce in header and HTML',
    async (path) => {
      const { app } = createTincanServer({ clientDir });
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      expectBaseHeaders(res.headers);
      expect(res.headers['cache-control']).toBe('no-store');
      const nonce = /'nonce-([^']+)'/.exec(String(res.headers['content-security-policy']))?.[1];
      expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
      expect(res.headers['content-security-policy']).toBe(buildCsp(nonce));
      expect(res.text).toContain(`ngCspNonce="${nonce}"`);
      expect(res.text).not.toContain('__CSP_NONCE__');
    },
  );

  it('uses a fresh nonce per response', async () => {
    const { app } = createTincanServer({ clientDir });
    const a = await request(app).get('/');
    const b = await request(app).get('/');
    expect(a.headers['content-security-policy']).not.toBe(b.headers['content-security-policy']);
  });

  it('hashed assets: all headers, immutable cache, nonce-less CSP', async () => {
    const { app } = createTincanServer({ clientDir });
    const res = await request(app).get('/main-ABCD1234.js');
    expect(res.status).toBe(200);
    expectBaseHeaders(res.headers);
    expect(res.headers['content-security-policy']).toBe(buildCsp());
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('unhashed assets stay no-store', async () => {
    const { app } = createTincanServer({ clientDir });
    const res = await request(app).get('/favicon.ico');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('404 and error responses carry the headers too', async () => {
    const { app } = createTincanServer({ clientDir });
    const missing = await request(app).get('/missing.js');
    expect(missing.status).toBe(404);
    expectBaseHeaders(missing.headers);
    expect(missing.headers['content-security-policy']).toBe(buildCsp());
    expect(missing.headers['cache-control']).toBe('no-store');

    const bad = await request(app).get('/%E0%A4%A');
    expect(bad.status).toBe(400);
    expectBaseHeaders(bad.headers);

    const bare = await request(createTincanServer().app).get('/nope');
    expect(bare.status).toBe(404);
    expectBaseHeaders(bare.headers);
  });

  it('healthz carries the headers', async () => {
    const { app } = createTincanServer();
    expectBaseHeaders((await request(app).get('/healthz')).headers);
  });

  it('sets HSTS only for secure requests', async () => {
    const { app } = createTincanServer({ clientDir });
    expect((await request(app).get('/')).headers['strict-transport-security']).toBeUndefined();
    const spoofedHttp = await request(app).get('/').set('X-Forwarded-Proto', 'http');
    expect(spoofedHttp.headers['strict-transport-security']).toBeUndefined();
    const secure = await request(app).get('/').set('X-Forwarded-Proto', 'https');
    expect(secure.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
  });

  it('never serves dotfiles or dot-directories, nor answers them with the SPA', async () => {
    const { app } = createTincanServer({ clientDir });
    for (const path of [
      '/.env',
      '/.git/config',
      '/.git',
      '/.well-known/x',
      '/r/.hidden',
      '/%2e%65nv',
    ]) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(404);
      expect(res.text, path).toBe('Not Found');
    }
  });

  it('adds the base headers to socket.io polling responses', async () => {
    const { httpServer, io } = createTincanServer({ clientDir });
    try {
      const res = await request(httpServer).get('/socket.io/?EIO=4&transport=polling');
      expect(res.status).toBe(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
      expect(res.headers['cache-control']).toBe('no-store');
    } finally {
      await io.close();
    }
  });
});
