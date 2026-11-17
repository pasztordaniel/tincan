# T18 — Receiver link as a QR code

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| dev | T08 | in-review | feat/T18-qr-code |

## Goal
The sender can show the receiver link as a QR code, so a phone held next to them can open it. Generated locally
in the browser, hidden by default because it carries the decryption key.

## Acceptance
- A "Show QR code" toggle (real button, `aria-expanded`, `aria-controls`) near the link on the sender screen,
  with the hint "Anyone who scans this can read your messages."
- The QR is hidden by default and removed once the receiver connects, and when the session ends or is cut.
- No network request, no remote service, no CSP change; inline SVG from template bindings (no `innerHTML`,
  no `bypassSecurityTrust*`). Error correction M, quiet zone of 4 modules, dark on light in dark mode too,
  about 224 px, fits 360 px. `role="img"` with an `aria-label`.
- ADR for the new runtime dependency; `/design` shows the open state.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
- dev: claimed
- dev: implemented. `ui/qr-code` (`QrCode`: payload to one SVG path via `qrcode-generator`, level M, 4-module quiet
  zone) and `ui/qr-panel` (`QrPanel`: toggle, hint, closed by default). `SenderPage` renders the panel next to the link
  card only while the state is `waiting`, so connect, idle, reconnect, end and a missing link all destroy it (and its
  open state). Tokens `--qr-dark` / `--qr-light` are not overridden in dark mode. Library choice and alternatives:
  [ADR 0008](../decisions/0008-qr-code-generator.md). `/design` has a "QR code open" figure.
- dev: tests. Unit: `qr-code.spec.ts` (drawn modules equal an independent encoding of the payload, quiet zone,
  role/label, no image element), `qr-panel.spec.ts` (closed by default, aria wiring, toggle, payload is the exact
  link), `sender-page.spec.ts` (hidden by default, payload equals the link, hides on connected/idle/reconnecting/ended
  and without a link, closed again afterwards), `design-page.spec.ts`. E2E `e2e/tests/qr.spec.ts`: hidden by default,
  opening makes no request, a screenshot of the QR is decoded with `jsqr` and equals the exact link, hides when
  the receiver picks up; dark mode at 360 px keeps black on white and fits.
- dev: open question for review. The QR is only on the sender screen, not in the "thread created" dialog on home,
  which also shows the link card.
- security: pass, no blocking findings. Supply chain: `qrcode-generator@2.0.4` is pinned by the lockfile integrity hash,
  registry signature verified, single maintainer, no SLSA provenance, no install scripts, no dependencies; the
  published `dist/qrcode.mjs` is byte-identical to upstream at the release's gitHead; `npm audit` is clean. The bundled
  code has no network, eval, DOM, storage or global access (its unused `create*Tag`/`createDataURL` string builders ship
  in `main` but are never called). Rendering: `[attr.d]`/`[attr.viewBox]` bindings only, no `innerHTML`,
  `bypassSecurityTrust*` or `data:` image; CSP and Trusted Types unchanged, zero violations on `/s` with the QR open
  and on `/design`. Independent decode (jsQR on Playwright screenshots of a production build, outside the repo): the
  element and full-page screenshots decode to exactly the receiver link at 1280 light and 360 dark (QR version 6).
  Exposure: hidden by default, no request on open, gone on hide, on receiver connect and after the receiver leaves
  (state reconnecting); key not in title, URL, storage, console or the aria-label; `/design` uses a dummy key, the
  home dialog has no QR. Recommendations (non-blocking): decode the screenshot in `e2e/tests/qr.spec.ts` with `jsqr` +
  `pngjs` as e2e devDependencies (both dependency-free) instead of re-encoding with the same library, which is
  circular; optionally auto-close the open QR after a short time while waiting, to limit shoulder-surfing and
  screen-recording exposure.
- dev: applied the review. E2E now decodes `svg.screenshot()` (`jsqr` + `pngjs`, e2e devDependencies only; `qrcode-generator` removed from e2e) at 1280 light and 360 dark. The payload is UTF-8 encoded before it reaches the library (it kept only the low byte of each UTF-16 unit), with a unit test on a non-ASCII string. Accepted residual risk: an opened QR stays open while the line is waiting, no auto-close, since the link card already shows the key as text.
- qa: pass. Report: [T18 test report](../testing/T18.md). Decoded the QR from screenshots and opened it in a second context (gate, pick-up, text arrives); hides on connect, receiver leaving, own reconnect, idle, end, no link; no request, no CSP violation; verify green, qr spec 10/10. One low finding: at a 180 px viewport (360 px at 200% zoom) the 224 px QR overflows horizontally.
- dev: applied review nits. Hand-written UTF-8 byte string in the unit test (and a check that a naive `addData(text)` differs), ADR size note, comment on `make()` limits, `open.update`, a dedicated `sender__qr` class, request count rechecked after decoding, and QA D1 fixed (`max-width: 100%`; the sender, link card and QR panel grids use `minmax(0, 1fr)` columns so nothing forces the page wider; e2e at 200 px).
