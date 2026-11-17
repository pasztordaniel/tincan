# 0008 — `qrcode-generator` for the receiver-link QR code

**Context.** The sender can show the receiver link as a QR code so a phone held next to them can open it
(T18). The QR must be generated in the browser: no network request, no remote service, nothing that loosens the
CSP (`img-src 'self' data:` allows data images, but we do not need one), no `innerHTML`, no
`bypassSecurityTrust*` (AGENTS.md, non-negotiables 2 and 3). The payload is the whole link, key included.

Options:
1. `qrcode-generator` 2.0.x: MIT, no dependencies, one file (about 20 KB minified, tree-shaken into the client
   bundle), ships TypeScript types, exposes the module matrix (`getModuleCount`, `isDark`), and the algorithm
   has been stable for years (the maintainer still publishes releases).
2. `qrcode`: MIT, but pulls `dijkstrajs`, `pngjs` and `yargs` (a CLI), and its browser build is larger; most of
   that surface is unused here.
3. Hand-written encoder: no dependency, but Reed-Solomon, masking and format bits are easy to get subtly wrong
   and a wrong QR fails silently. Not worth owning.

**Decision.** Option 1, added to `client` as a runtime dependency (`^2.0.4`, exact version fixed by
`package-lock.json`, like every other dependency) and, in `e2e` only, `jsqr` and `pngjs` as dev dependencies (the spec decodes a screenshot of the
rendered QR and compares it with the link; nothing ships to users). We use only the matrix: `QrCode` turns it into one SVG `<path>` bound with
`[attr.d]`, so the output is plain Angular template bindings (no `createSvgTag`/`createImgTag`, which return
HTML strings). Byte mode, error correction M, quiet zone of 4 modules, dark modules on a light ground in every
theme (`--qr-dark` / `--qr-light`).

**Consequences.**
- The QR is a key-exposure surface: anyone who can see the screen can scan the key. It is closed by default,
  opened by an explicit toggle with a warning, and removed from the DOM as soon as the line is no longer
  waiting (receiver connected, idle, reconnecting, ended) or the session is gone.
- The library never touches the network, the DOM or storage; it runs under Trusted Types and the current CSP
  unchanged (the `/design` CSP e2e check renders an open QR).
- A dependency addition is security surface (docs/workflow.md): it needs a security review. Updates go through
  the usual lockfile review; the library has no install scripts and no transitive packages.
