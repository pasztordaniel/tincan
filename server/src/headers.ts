import { randomBytes } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';

/** Placeholder in the client's index.html (`<app-root ngCspNonce="...">`), replaced per response. */
export const NONCE_PLACEHOLDER = '__CSP_NONCE__';

const HSTS_VALUE = 'max-age=31536000; includeSubDomains';

/**
 * Content-Security-Policy. Everything is denied unless listed.
 *
 * - `style-src` allows a per-response nonce (see ADR 0006) because Angular injects component styles
 *   as `<style>` elements at runtime; there is no `'unsafe-inline'`. Without a nonce (assets, 404s,
 *   API responses) only same-origin stylesheets are allowed.
 * - `connect-src 'self'` also covers same-origin `ws:`/`wss:` in current browsers (CSP3).
 * - `base-uri 'self'`, not `'none'`: index.html needs `<base href="/">` so that relative asset URLs
 *   also resolve on deep links like /r/<id>; `'none'` blocks it and the app does not load.
 * - `trusted-types` names the two policies Angular creates; `require-trusted-types-for` makes
 *   DOM XSS sinks (innerHTML, script src, eval-like) reject plain strings.
 */
export function buildCsp(nonce?: string): string {
  const style = nonce ? `'self' 'nonce-${nonce}'` : "'self'";
  return [
    "default-src 'none'",
    "script-src 'self'",
    `style-src ${style}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "require-trusted-types-for 'script'",
    'trusted-types angular angular#bundler',
  ].join('; ');
}

/** Headers that do not depend on the request. Also applied to socket.io's own responses. */
export const BASE_HEADERS: Readonly<Record<string, string>> = {
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy':
    'accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), ' +
    'magnetometer=(), microphone=(), midi=(), payment=(), usb=(), xr-spatial-tracking=()',
  // Legacy equivalent of CSP frame-ancestors for browsers that predate it.
  'X-Frame-Options': 'DENY',
  // Safe default; only hashed assets opt in to long caching (see `setStaticHeaders`).
  'Cache-Control': 'no-store',
};

/**
 * True when the client reached us over TLS, directly or through a TLS-terminating proxy.
 * `X-Forwarded-Proto` is trusted unconditionally on purpose: a client that forges it over plain
 * HTTP only makes us send HSTS, which browsers ignore on insecure connections.
 */
export function isSecureRequest(req: Request): boolean {
  if (req.secure) return true;
  const forwarded = req.headers['x-forwarded-proto'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first?.toLowerCase() === 'https';
}

/** Applies the security headers to every response. Mount before anything that can respond. */
export function securityHeaders(): RequestHandler {
  return (req, res, next) => {
    for (const [name, value] of Object.entries(BASE_HEADERS)) res.setHeader(name, value);
    res.setHeader('Content-Security-Policy', buildCsp());
    if (isSecureRequest(req)) res.setHeader('Strict-Transport-Security', HSTS_VALUE);
    next();
  };
}

/** Sends index.html with a fresh CSP nonce in both the header and the `ngCspNonce` attribute. */
export function sendIndex(res: Response, template: string): void {
  const nonce = randomBytes(16).toString('base64');
  res.setHeader('Content-Security-Policy', buildCsp(nonce));
  res.type('html').send(template.replaceAll(NONCE_PLACEHOLDER, nonce));
}

/** Angular names hashed output `name-XXXXXXXX.ext` (8 chars of A-Z0-9); safe to cache forever. */
const HASHED_ASSET = /-[A-Z0-9]{8}\.[a-z0-9]+$/;

export function setStaticHeaders(res: Response, path: string): void {
  if (HASHED_ASSET.test(path)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}
