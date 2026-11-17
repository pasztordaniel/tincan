# 0005 — Padding instead of decoy messages

**Context.** Idea: send fake frames so someone holding a stolen key reads messages that were never sent.

**Decision.** No decoys. Anything the real receiver uses to tell real from fake is also available to a key holder
(same link, public code) — that is security through obscurity. Instead, hide metadata from parties *without* the key:
size-bucket padding, debounce, and typing/heartbeat frames padded identically to content.

**Consequences.** Constant-rate cover traffic (hiding activity timing entirely) is left as future work; its bandwidth
and battery cost weren't justified here.
