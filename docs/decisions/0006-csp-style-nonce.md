# 0006 — Per-response style nonce instead of `'unsafe-inline'`

**Context.** The CSP must forbid inline script (`script-src 'self'`) and, ideally, inline style too. Angular's
production build can meet the first by turning off `inlineCritical` (beasties adds an `onload` handler to a
`<link>`). The second is harder: components with styles get them injected at runtime as `<style>` elements, which
`style-src 'self'` blocks.

Options for styles:
1. `'unsafe-inline'`: simple, but lets injected markup restyle the page (e.g. fake UI over the decrypted text).
2. Angular `security.autoCsp`: generates hashes for the *inline scripts* in `index.html` (and a `strict-dynamic`
   policy). It does not cover the `<style>` elements Angular creates at runtime, so it does not solve this problem
   and would still need a style exception.
3. A nonce: the server puts a fresh random value in the `style-src` header and in `<app-root ngCspNonce="...">`;
   Angular stamps it on every `<style>` it injects.

**Decision.** Option 3. `client/src/index.html` carries the placeholder `__CSP_NONCE__`; the server reads the file once
at startup and, per response, replaces it with 128 random bits (base64) and sends `style-src 'self' 'nonce-...'`.
Responses that are not documents (assets, 404s, socket.io) get `style-src 'self'`. `index.html` and the SPA fallback are
`Cache-Control: no-store`, so a nonce is never reused from a cache. Fonts (`font-src 'self'`) and `<link>` stylesheets
(`'self'`) need no nonce, so a self-hosted font and a theme toggle that switches classes or CSS variables work as is.
Anything that sets `style="..."` attributes in templates would be blocked (`style-src` covers attributes); use classes
or bindings such as `[style.width]`, which go through the CSSOM and are allowed.

**Consequences.**
- `index.html` is served by a handler, not `express.static`; a build that drops `ngCspNonce` from `index.html` breaks
  styles under the CSP, which the e2e CSP spec catches only once a component has styles (verified manually).
- `ng serve` has no CSP and the placeholder stays a literal there.
- `base-uri` is `'self'`, not `'none'`: `<base href="/">` is needed for relative asset URLs on deep links like `/r/<id>`
  and `'none'` blocks it (found by the e2e spec).
- `require-trusted-types-for 'script'` with `trusted-types angular angular#bundler` is enabled and the app runs
  under it; any new dependency that writes HTML or creates another policy will fail loudly.
